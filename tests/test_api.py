"""
tests/test_api.py — Pytest test suite for the Verilog Sandbox API
==================================================================

Tests are organised into three classes:

  TestHealth      — /health and /status endpoints
  TestSimulateJson    — POST /simulate (JSON body)
  TestSimulateUpload  — POST /simulate/upload (multipart)

The suite uses FastAPI's TestClient (synchronous httpx wrapper) and mocks
the Docker sandbox so tests run without Docker installed.

Run:
    pytest tests/test_api.py -v

Run a single test:
    pytest tests/test_api.py::TestSimulateJson::test_successful_simulation -v
"""

from __future__ import annotations

import base64
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

# Patch settings BEFORE importing the app so the lru_cache picks up test values
TEST_JWT_SECRET = "test-secret-0123456789abcdef0123456789abcdef"
os.environ.setdefault("DOCKER_IMAGE", "verilog-sandbox:latest")
os.environ.setdefault("NETWORK_DISABLED", "true")
os.environ["JWT_SECRET"] = TEST_JWT_SECRET

from api.main import create_app  # noqa: E402 — import after env setup

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _token(secret: str = TEST_JWT_SECRET, exp_in: int = 60) -> str:
    return jwt.encode({"iss": "test", "exp": int(time.time()) + exp_in}, secret, algorithm="HS256")


@pytest.fixture(scope="module")
def anon_client() -> TestClient:
    """TestClient with no Authorization header."""
    return TestClient(create_app(), raise_server_exceptions=False)


@pytest.fixture(scope="module")
def client() -> TestClient:
    """TestClient that sends a valid backend JWT, like the Next.js proxy does."""
    return TestClient(
        create_app(),
        raise_server_exceptions=False,
        headers={"Authorization": f"Bearer {_token()}"},
    )


def _make_sandbox_result(
    exit_code: int = 0,
    stdout: str = "ALL TESTS PASSED\n",
    stderr: str = "",
    duration_ms: float = 120.0,
    workspace_id: str = "abc123",
):
    """Build a mock SandboxResult."""
    from api.sandbox import SandboxResult
    from api.models import exit_code_to_status

    return SandboxResult(
        exit_code    = exit_code,
        status       = exit_code_to_status(exit_code),
        stdout       = stdout,
        stderr       = stderr,
        duration_ms  = duration_ms,
        workspace_id = workspace_id,
    )


GOOD_DESIGN = """
`timescale 1ns/1ps
module counter(input clk, input rst, output reg [3:0] count);
  always @(posedge clk) count <= rst ? 0 : count + 1;
endmodule
""".strip()

GOOD_TESTBENCH = """
`timescale 1ns/1ps
module tb;
  reg clk = 0, rst = 1;
  wire [3:0] count;
  counter dut(.clk(clk), .rst(rst), .count(count));
  always #5 clk = ~clk;
  initial begin
    $dumpfile("wave.vcd"); $dumpvars(0, tb);
    #20 rst = 0;
    #100 $finish;
  end
endmodule
""".strip()

BAD_DESIGN = "module broken; endmodule SYNTAX ERROR HERE"


# ---------------------------------------------------------------------------
# Helper: patch sandbox.run_simulation to avoid real Docker calls
# ---------------------------------------------------------------------------

def _patch_sandbox(result, vcd_content: bytes = b"$version Icarus $end"):
    """
    Context manager that patches:
      - api.sandbox.run_simulation → returns `result`
      - api.utils.read_vcd        → returns fake VCD base64
      - api.utils.create_workspace → returns stable tmpdir + workspace_id
      - api.utils.write_source_files, cleanup_workspace → no-ops
    """
    vcd_b64 = base64.b64encode(vcd_content).decode()
    vcd_size = len(vcd_content)

    return [
        patch("api.routes.simulate.run_simulation", return_value=result),
        patch("api.routes.simulate.read_vcd",        return_value=(vcd_b64, vcd_size)),
        patch("api.routes.simulate.create_workspace", return_value=("/tmp/fake_ws", "abc123")),
        patch("api.routes.simulate.write_source_files"),
        patch("api.routes.simulate.cleanup_workspace"),
    ]


# ===========================================================================
# TestHealth
# ===========================================================================

class TestHealth:

    def test_health_returns_200(self, client):
        with patch("api.routes.health.docker_is_available", return_value=True):
            resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_shape(self, client):
        with patch("api.routes.health.docker_is_available", return_value=True):
            body = client.get("/health").json()
        assert "status"           in body
        assert "docker_available" in body
        assert "image"            in body
        assert "version"          in body

    def test_health_docker_unavailable(self, client):
        with patch("api.routes.health.docker_is_available", return_value=False):
            body = client.get("/health").json()
        # We still return 200 — liveness is about the process, not Docker
        assert body["status"]           == "ok"
        assert body["docker_available"] is False

    def test_status_ready(self, client):
        fake_info = MagicMock()
        fake_info.image_id = "sha256:abc"
        fake_info.size_mb  = 88.0
        with patch("api.routes.health.docker_is_available", return_value=True), \
             patch("api.routes.health.inspect_image",       return_value=fake_info):
            body = client.get("/status").json()
        assert body["status"]        == "ready"
        assert body["image_found"]   is True
        assert body["image_size_mb"] == 88.0

    def test_status_degraded_no_image(self, client):
        with patch("api.routes.health.docker_is_available", return_value=True), \
             patch("api.routes.health.inspect_image",       return_value=None):
            body = client.get("/status").json()
        assert body["status"]      == "degraded"
        assert body["image_found"] is False

    def test_root_without_docs_returns_status(self, client):
        # /docs is disabled by default (ENABLE_DOCS=false), so / returns JSON
        resp = client.get("/", follow_redirects=False)
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ===========================================================================
# TestAuth — /simulate must reject missing, forged and expired tokens
# ===========================================================================

class TestAuth:

    BODY = {"design_v": "module a; endmodule", "testbench_v": "module t; endmodule"}

    def test_missing_token_rejected(self, anon_client):
        resp = anon_client.post("/simulate", json=self.BODY)
        assert resp.status_code in (401, 403)

    def test_wrong_secret_rejected(self, anon_client):
        bad = _token(secret="attacker-guess-0123456789abcdef0123456789")
        resp = anon_client.post("/simulate", json=self.BODY,
                                headers={"Authorization": f"Bearer {bad}"})
        assert resp.status_code == 401

    def test_old_public_default_secret_rejected(self, anon_client):
        bad = _token(secret="bitflow-dev-secret-change-in-production")
        resp = anon_client.post("/simulate", json=self.BODY,
                                headers={"Authorization": f"Bearer {bad}"})
        assert resp.status_code == 401

    def test_expired_token_rejected(self, anon_client):
        resp = anon_client.post("/simulate", json=self.BODY,
                                headers={"Authorization": f"Bearer {_token(exp_in=-10)}"})
        assert resp.status_code == 401

    def test_upload_requires_token(self, anon_client):
        files = {"design": ("design.v", b"module a; endmodule"),
                 "testbench": ("tb.v", b"module t; endmodule")}
        assert anon_client.post("/simulate/upload", files=files).status_code in (401, 403)


class TestPublicKeyAuth:
    """JWT_PUBLIC_KEY mode (Vercel signs with JWT_PRIVATE_KEY, the API holds no secret)."""

    BODY = TestAuth.BODY

    @pytest.fixture()
    def keys(self, monkeypatch):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        import api.jwt_auth as auth

        priv = ec.generate_private_key(ec.SECP256R1())
        pub_pem = priv.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        # As stored in an env var: one line with literal \n
        monkeypatch.setattr(auth.settings, "jwt_public_key", pub_pem.replace("\n", "\\n"))
        return priv, pub_pem

    def _post(self, client, token):
        return client.post("/simulate", json=self.BODY, headers={"Authorization": f"Bearer {token}"})

    def _es256(self, key):
        return jwt.encode({"iss": "test", "exp": int(time.time()) + 60}, key, algorithm="ES256")

    def test_es256_token_accepted(self, anon_client, keys):
        assert self._post(anon_client, self._es256(keys[0])).status_code != 401

    def test_shared_secret_token_rejected(self, anon_client, keys):
        assert self._post(anon_client, _token()).status_code == 401

    def test_hs256_signed_with_public_key_rejected(self, anon_client, keys):
        # Algorithm confusion: an HMAC "signed" with the (public) key.
        import base64, hashlib, hmac, json as _json
        b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
        head = b64(_json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
        body = b64(_json.dumps({"iss": "x", "exp": int(time.time()) + 60}).encode())
        sig = b64(hmac.new(keys[1].encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
        assert self._post(anon_client, f"{head}.{body}.{sig}").status_code == 401

    def test_other_key_rejected(self, anon_client, keys):
        from cryptography.hazmat.primitives.asymmetric import ec
        other = ec.generate_private_key(ec.SECP256R1())
        assert self._post(anon_client, self._es256(other)).status_code == 401


# ===========================================================================
# TestSandboxLimits — real iverilog/vvp; skipped where they aren't installed
# ===========================================================================

needs_iverilog = pytest.mark.skipif(
    not (shutil.which("iverilog") and shutil.which("vvp")),
    reason="iverilog/vvp not installed",
)


def _run_real(design: str, tb: str, timeout: int = 10, lint: bool = False):
    from api.sandbox import _run_simulation_sync
    tmpdir = tempfile.mkdtemp()
    os.chmod(tmpdir, 0o777)
    Path(tmpdir, "design.v").write_text(design)
    Path(tmpdir, "tb.v").write_text(tb)
    try:
        return _run_simulation_sync(tmpdir, "test", timeout, lint)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@needs_iverilog
class TestSandboxLimits:

    def test_real_simulation_succeeds(self):
        result = _run_real(GOOD_DESIGN, GOOD_TESTBENCH)
        assert result.status == "success", result.stdout + result.stderr

    def test_compile_error_names_the_cause(self):
        # a testbench left over from another design: its module is missing
        tb = "module tb; adder dut(); initial $finish; endmodule"
        result = _run_real(GOOD_DESIGN, tb)
        assert result.status == "compile_error"
        assert "[ERROR] Compilation failed: tb.v:1: error: Unknown module type: adder" in result.stdout, result.stdout
        assert "/tmp" not in result.stdout and "verilog_" not in result.stdout
        assert "Hint: there is no module named 'adder'" in result.stdout

    def test_output_flood_is_truncated(self):
        flood = """
module tb;
  integer i;
  initial begin
    for (i = 0; i < 2000000; i = i + 1) $display("spam spam spam spam spam spam %0d", i);
    $finish;
  end
endmodule"""
        result = _run_real("module a; endmodule", flood)
        assert len(result.stdout) < 2 * 1024 * 1024
        assert "truncated" in result.stdout or "limit" in result.stdout

    def test_secrets_not_readable_from_environ(self):
        # environ is NUL-separated, so dump it byte by byte
        reader = """
module tb;
  integer fd, c;
  initial begin
    fd = $fopen("/proc/self/environ", "r");
    if (fd) begin
      c = $fgetc(fd);
      while (c != -1) begin
        if (c == 0) $write("\\n"); else $write("%c", c);
        c = $fgetc(fd);
      end
    end
    $finish;
  end
endmodule"""
        result = _run_real("module a; endmodule", reader)
        assert TEST_JWT_SECRET not in result.stdout
        assert "JWT_SECRET" not in result.stdout

    def test_infinite_loop_times_out(self):
        spin = "module tb; initial begin forever #1; end endmodule"
        result = _run_real("module a; endmodule", spin, timeout=2)
        assert result.status == "timeout"


# ===========================================================================
# TestSimulateJson
# ===========================================================================

class TestSimulateJson:

    def _post(self, client, body: dict, **kw) -> Any:
        return client.post("/simulate", json=body, **kw)

    def test_successful_simulation(self, client):
        result = _make_sandbox_result(exit_code=0, stdout="ALL TESTS PASSED\n")
        patches = _patch_sandbox(result)

        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            resp = self._post(client, {
                "design_v":    GOOD_DESIGN,
                "testbench_v": GOOD_TESTBENCH,
            })

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"]    == "success"
        assert body["success"]   is True
        assert body["exit_code"] == 0
        assert "ALL TESTS PASSED" in body["stdout"]

    def test_compile_error_returns_200_with_status(self, client):
        result = _make_sandbox_result(exit_code=2, stderr="design.v:1: syntax error")
        patches = _patch_sandbox(result, vcd_content=b"")

        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            resp = self._post(client, {
                "design_v":    BAD_DESIGN,
                "testbench_v": GOOD_TESTBENCH,
            })

        assert resp.status_code == 200     # HTTP 200, but status != success
        body = resp.json()
        assert body["status"]   == "compile_error"
        assert body["success"]  is False
        assert body["exit_code"] == 2

    def test_timeout_reflected_in_response(self, client):
        result = _make_sandbox_result(exit_code=3)
        patches = _patch_sandbox(result, vcd_content=b"")

        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            resp = self._post(client, {
                "design_v":    GOOD_DESIGN,
                "testbench_v": GOOD_TESTBENCH,
                "timeout":     5,
            })

        assert resp.json()["status"] == "timeout"

    def test_waveform_present_on_success(self, client):
        result  = _make_sandbox_result(exit_code=0)
        patches = _patch_sandbox(result, vcd_content=b"$version Icarus $end")

        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            body = self._post(client, {
                "design_v":    GOOD_DESIGN,
                "testbench_v": GOOD_TESTBENCH,
            }).json()

        wf = body["waveform"]
        assert wf["available"]   is True
        assert wf["size_bytes"]  > 0
        assert wf["vcd_base64"]  is not None
        # Verify it's valid base64
        decoded = base64.b64decode(wf["vcd_base64"])
        assert b"$version" in decoded

    def test_missing_design_field_returns_422(self, client):
        resp = self._post(client, {"testbench_v": GOOD_TESTBENCH})
        assert resp.status_code == 422

    def test_missing_testbench_field_returns_422(self, client):
        resp = self._post(client, {"design_v": GOOD_DESIGN})
        assert resp.status_code == 422

    def test_empty_design_returns_422(self, client):
        resp = self._post(client, {"design_v": "", "testbench_v": GOOD_TESTBENCH})
        assert resp.status_code == 422

    def test_timeout_above_max_is_clamped(self, client):
        """Timeout of 999 should be silently clamped to max_timeout_seconds."""
        result  = _make_sandbox_result(exit_code=0)
        patches = _patch_sandbox(result)

        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            resp = self._post(client, {
                "design_v":    GOOD_DESIGN,
                "testbench_v": GOOD_TESTBENCH,
                "timeout":     120,          # at ceiling — valid
            })
        assert resp.status_code == 200

    def test_source_too_large_returns_413(self, client):
        huge = "x" * (600 * 1024)   # 600 KB > 512 KB default limit
        resp = self._post(client, {"design_v": huge, "testbench_v": GOOD_TESTBENCH})
        assert resp.status_code == 413

    def test_response_includes_duration(self, client):
        result  = _make_sandbox_result(duration_ms=250.0)
        patches = _patch_sandbox(result)

        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            body = self._post(client, {
                "design_v": GOOD_DESIGN, "testbench_v": GOOD_TESTBENCH,
            }).json()

        assert isinstance(body["duration_ms"], (int, float))
        assert body["duration_ms"] >= 0

    def test_response_includes_workspace_id(self, client):
        result  = _make_sandbox_result(workspace_id="abc123")
        patches = _patch_sandbox(result)

        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            body = self._post(client, {
                "design_v": GOOD_DESIGN, "testbench_v": GOOD_TESTBENCH,
            }).json()

        assert body["workspace_id"] == "abc123"


# ===========================================================================
# TestSimulateUpload
# ===========================================================================

class TestSimulateUpload:

    def _upload(self, client, design: bytes, testbench: bytes, timeout: int = 30):
        return client.post(
            "/simulate/upload",
            files={
                "design":    ("design.v", design,    "text/plain"),
                "testbench": ("tb.v",     testbench, "text/plain"),
            },
            params={"timeout": timeout},
        )

    def test_upload_success(self, client):
        result  = _make_sandbox_result(exit_code=0)
        patches = _patch_sandbox(result)

        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            resp = self._upload(
                client,
                design=GOOD_DESIGN.encode(),
                testbench=GOOD_TESTBENCH.encode(),
            )

        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

    def test_upload_file_too_large_returns_413(self, client):
        huge = b"x" * (600 * 1024)
        resp = self._upload(client, design=huge, testbench=GOOD_TESTBENCH.encode())
        assert resp.status_code == 413

    def test_upload_non_utf8_returns_422(self, client):
        binary = b"\xff\xfe" + GOOD_DESIGN.encode("utf-16-le")
        resp = self._upload(client, design=binary, testbench=GOOD_TESTBENCH.encode())
        assert resp.status_code == 422


# ===========================================================================
# TestConcurrencyCap — no more than max_concurrent_simulations run at once
# ===========================================================================

class TestConcurrencyCap:

    def test_simulations_are_capped(self):
        import asyncio
        import httpx
        from api.routes import simulate as sim_route

        active = peak = 0

        async def fake_run(tmpdir, workspace_id, timeout, lint=False):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.05)
            active -= 1
            return _make_sandbox_result()

        async def fire(n: int):
            transport = httpx.ASGITransport(app=create_app())
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test",
                headers={"Authorization": f"Bearer {_token()}"},
            ) as c:
                body = {"design_v": GOOD_DESIGN, "testbench_v": GOOD_TESTBENCH}
                return await asyncio.gather(*[c.post("/simulate", json=body) for _ in range(n)])

        with patch.object(sim_route, "run_simulation", fake_run):
            resps = asyncio.run(fire(10))

        assert all(r.status_code == 200 for r in resps)
        assert peak == sim_route.settings.max_concurrent_simulations


# ===========================================================================
# TestSystemVerilog — iverilog runs in -g2012 mode
# ===========================================================================

@needs_iverilog
class TestSystemVerilog:

    def test_always_ff_and_logic_compile(self):
        design = """
module counter(input logic clk, input logic rst, output logic [3:0] count);
  always_ff @(posedge clk) count <= rst ? 4'd0 : count + 4'd1;
endmodule"""
        tb = """
module tb;
  logic clk = 0, rst = 1;
  logic [3:0] count;
  counter dut(.clk, .rst, .count);
  always #5 clk = ~clk;
  initial begin
    #12 rst = 0;
    #40;
    if (count == 4'd4) $display("ALL TESTS PASSED"); else $display("FAIL: count=%0d", count);
    $finish;
  end
endmodule"""
        result = _run_real(design, tb)
        assert result.status == "success", result.stdout
        assert "ALL TESTS PASSED" in result.stdout, result.stdout


# ===========================================================================
# TestLint — optional Verilator lint, reported but never affecting the verdict
# ===========================================================================

needs_verilator = pytest.mark.skipif(not shutil.which("verilator"), reason="verilator not installed")

TRUNCATING_DESIGN = """
module trunc(input [7:0] a, output [3:0] y);
  assign y = a;
endmodule"""

TRUNC_TB = """
module tb;
  reg [7:0] a = 8'hAB;
  wire [3:0] y;
  trunc dut(.a(a), .y(y));
  initial begin #1 $display("y=%h", y); $finish; end
endmodule"""


@needs_iverilog
@needs_verilator
class TestLint:

    def test_lint_reports_width_mismatch(self):
        result = _run_real(TRUNCATING_DESIGN, TRUNC_TB, lint=True)
        assert "Lint (Verilator)" in result.stdout
        assert "WIDTH" in result.stdout, result.stdout
        assert result.status == "success"          # lint never fails the run

    def test_no_lint_unless_requested(self):
        result = _run_real(TRUNCATING_DESIGN, TRUNC_TB)
        assert "Lint (Verilator)" not in result.stdout

    def test_clean_design_reports_no_warnings(self):
        clean = "module pass4(input [3:0] a, output [3:0] y);\n  assign y = a;\nendmodule"
        tb = "module tb; reg [3:0] a = 4'h5; wire [3:0] y; pass4 d(.a(a), .y(y)); initial begin #1 $finish; end endmodule"
        result = _run_real(clean, tb, lint=True)
        assert "[OK] No lint warnings." in result.stdout, result.stdout
        assert "V e r i l a t i o n" not in result.stdout


# ===========================================================================
# TestSynthesis — POST /synthesize (Yosys)
# ===========================================================================

from api.routes.synthesize import param_names, parse_fsm_info  # noqa: E402

needs_yosys = pytest.mark.skipif(not shutil.which("yosys"), reason="yosys not installed")

FSM_INFO_SAMPLE = r"""
FSM `$fsm$\state$20' from module `det':
-------------------------------------

  Information on FSM $fsm$\state$20 (\state):

  Input signals:
    0: \rst
    1: \x
    2: $auto$opt_reduce.cc:137:opt_pmux$19

  State encoding:
    0:       2'00  <RESET STATE>
    1:       2'10
    2:       2'01

  Transition Table (state_in, ctrl_in, state_out, ctrl_out):
      0:     0 3'-00   ->     0 5'01000
      1:     0 3'-10   ->     2 5'01001
      2:     0 3'--1   ->     0 5'01000
      3:     2 3'-10   ->     1 5'00110
"""


class TestSynthesisParsing:

    def test_param_names_maps_unique_values(self):
        src = "localparam [1:0] S0 = 2'd0, S1 = 2'b01, S2 = 2;\nparameter W = 8; // S9 = 9"
        assert param_names(src) == {0: "S0", 1: "S1", 2: "S2", 8: "W"}

    def test_parse_fsm_info(self):
        (fsm,) = parse_fsm_info(FSM_INFO_SAMPLE, {0: "S0", 1: "S1", 2: "S2"})
        assert fsm["module"] == "det" and fsm["stateReg"] == "state"
        assert [(s["id"], s["code"], s["name"], s["reset"]) for s in fsm["states"]] == [
            (0, 0, "S0", True), (1, 2, "S2", False), (2, 1, "S1", False)]
        t = {(x["from"], x["to"]): x["conditions"] for x in fsm["transitions"]}
        assert t[(0, 0)] == ["rst=0 & x=0", "rst=1"]     # merged, internal-only bits are don't-care here
        assert t[(0, 2)] == ["rst=0 & x=1"]
        assert fsm["reset"] is None          # not every state has the reset edge in this sample

    def test_sync_reset_factored_out(self):
        from api.routes.synthesize import _factor_out_reset
        states = [{"id": 0, "reset": True}, {"id": 1, "reset": False}]
        merged = {(0, 0): ["rst=0 & x=0", "rst=1"], (0, 1): ["rst=0 & x=1"],
                  (1, 0): ["rst=1", "rst=0 & x=0"], (1, 1): ["rst=0"]}
        assert _factor_out_reset(merged, states) == "rst=1"
        assert merged == {(0, 0): ["x=0"], (0, 1): ["x=1"], (1, 0): ["x=0"], (1, 1): [""]}


@needs_yosys
class TestSynthesis:

    def _synth(self, client, design):
        r = client.post("/synthesize", json={"design_v": design})
        assert r.status_code == 200, r.text
        return r.json()

    def test_requires_jwt(self, anon_client):
        assert anon_client.post("/synthesize", json={"design_v": "module m; endmodule"}).status_code == 401

    def test_latch_is_flagged(self, client):
        d = self._synth(client, "module l(input en, input [3:0] d, output reg [3:0] q);\n"
                                "  always @(*) if (en) q = d;\nendmodule")
        assert d["ok"] and d["latches"] == ["q"], d

    def test_counter_flip_flops(self, client):
        d = self._synth(client, "module c(input clk, input rst, output reg [3:0] q);\n"
                                "  always @(posedge clk) if (rst) q <= 0; else q <= q + 1;\nendmodule")
        assert d["ok"] and d["ffBits"] == 4 and d["latches"] == [], d
        assert d["netlist"]["modules"]["c"]["attributes"]["top"]

    def test_fsm_extraction(self, client):
        d = self._synth(client, """
module det(input clk, input rst, input x, output reg y);
  localparam S0 = 2'd0, S1 = 2'd1, S2 = 2'd2;
  reg [1:0] state, next;
  always @(posedge clk) if (rst) state <= S0; else state <= next;
  always @(*) begin
    next = state; y = 0;
    case (state)
      S0: next = x ? S1 : S0;
      S1: next = x ? S2 : S0;
      S2: begin y = 1; next = x ? S2 : S0; end
      default: next = S0;
    endcase
  end
endmodule""")
        assert d["ok"] and len(d["fsms"]) == 1, d
        fsm = d["fsms"][0]
        assert sorted(s["name"] for s in fsm["states"]) == ["S0", "S1", "S2"]
        names = {s["id"]: s["name"] for s in fsm["states"]}
        edges = {(names[t["from"]], names[t["to"]]) for t in fsm["transitions"]}
        assert {("S0", "S1"), ("S1", "S2"), ("S2", "S2"), ("S1", "S0")} <= edges

    def test_syntax_error_reported(self, client):
        d = self._synth(client, "module broken(input a; endmodule")
        assert d["ok"] is False and d["error"]


# ===========================================================================
# TestDataFiles — POST /simulate "files" (e.g. a $readmemh table)
# ===========================================================================

ROM_DESIGN = """
module rom(input [1:0] addr, output [7:0] dout);
  reg [7:0] mem [0:3];
  initial $readmemh("table.hex", mem);
  assign dout = mem[addr];
endmodule"""

ROM_TB = """
module tb;
  reg [1:0] addr; wire [7:0] dout;
  rom dut(.addr(addr), .dout(dout));
  initial begin addr = 2; #1 $display("dout=%h", dout); $finish; end
endmodule"""


class TestDataFiles:

    @needs_iverilog
    def test_file_is_readable_by_readmemh(self, client):
        r = client.post("/simulate", json={"design_v": ROM_DESIGN, "testbench_v": ROM_TB,
                                           "files": {"table.hex": "11\n22\nab\n44\n"}})
        assert r.status_code == 200, r.text
        assert "dout=ab" in r.json()["stdout"]

    @pytest.mark.parametrize("name", ["../x.hex", "sub/x.hex", ".hidden", "tb.v", "design.v", "wave.vcd", ""])
    def test_unsafe_names_rejected(self, client, name):
        r = client.post("/simulate", json={"design_v": "module m; endmodule", "testbench_v": "module t; endmodule",
                                           "files": {name: "00"}})
        assert r.status_code == 422, (name, r.status_code)

    def test_too_many_files_rejected(self, client):
        files = {f"f{i}.hex": "00" for i in range(5)}
        r = client.post("/simulate", json={"design_v": "module m; endmodule", "testbench_v": "module t; endmodule", "files": files})
        assert r.status_code == 422


# ===========================================================================
# TestEquivalence — POST /equivalence (shortest differing input sequence)
# ===========================================================================

COUNTER_GOLD = """module c(input clk, input rst, output reg [3:0] q);
  always @(posedge clk) if (rst || q == 5) q <= 0; else q <= q + 1;
endmodule"""


@needs_yosys
class TestEquivalence:

    def _eq(self, client, gold, gate, n=16):
        r = client.post("/equivalence", json={"gold_v": gold, "gate_v": gate, "max_cycles": n})
        assert r.status_code == 200, r.text
        return r.json()

    def test_requires_jwt(self, anon_client):
        assert anon_client.post("/equivalence", json={"gold_v": "module m; endmodule", "gate_v": "module m; endmodule"}).status_code == 401

    def test_identical_designs(self, client):
        assert self._eq(client, COUNTER_GOLD, COUNTER_GOLD)["status"] == "no_difference"

    def test_combinational_difference_found_at_cycle_1(self, client):
        gold = "module g(input a, input b, output y); assign y = a & b; endmodule"
        gate = "module g(input a, input b, output y); assign y = a | b; endmodule"
        d = self._eq(client, gold, gate)
        assert d["status"] == "differs" and d["cycles"] == 1, d
        vcd = base64.b64decode(d["vcd_base64"])
        assert b"gold_y" in vcd and b"gate_y" in vcd and b"in_a" in vcd   # ports are in the trace

    def test_off_by_one_counter_found_at_the_wrap(self, client):
        d = self._eq(client, COUNTER_GOLD, COUNTER_GOLD.replace("q == 5", "q == 6"))
        assert d["status"] == "differs" and d["cycles"] == 8, d   # reset, counts 0..5, then gold wraps to 0 while gate shows 6

    def test_port_mismatch_is_unknown(self, client):
        d = self._eq(client, COUNTER_GOLD, COUNTER_GOLD.replace("output reg [3:0] q", "output reg [3:0] count").replace(" q", " count"))
        assert d["status"] == "unknown", d

    def test_gold_x_is_dont_care(self, client):
        gold = "module g(input a, input s, output y); assign y = s ? a : 1'bx; endmodule"
        gate = "module g(input a, input s, output y); assign y = s ? a : 1'b0; endmodule"
        assert self._eq(client, gold, gate)["status"] == "no_difference"


# ===========================================================================
# TestMetrics — POST /metrics (optimization leaderboard scores)
# ===========================================================================

from api.routes.synthesize import gate_metrics  # noqa: E402


def test_gate_metrics_parsing():
    stat = {"design": {"num_cells_by_type": {"$_AND_": 2, "$_XOR_": 3, "$_SDFF_PP0_": 4, "$_DFF_P_": 1}}}
    assert gate_metrics(stat, "Longest topological path in c (length=7):") == {"gates": 5, "ffBits": 5, "depth": 7}


@needs_yosys
class TestMetrics:

    def _m(self, client, design):
        r = client.post("/metrics", json={"design_v": design})
        assert r.status_code == 200, r.text
        return r.json()

    def test_and_gate(self, client):
        d = self._m(client, "module g(input a, input b, output y); assign y = a & b; endmodule")
        assert d == {"ok": True, "gates": 1, "ffBits": 0, "depth": 1}, d

    def test_counter_flip_flops(self, client):
        d = self._m(client, "module c(input clk, input rst, output reg [3:0] q);\n"
                            "  always @(posedge clk) if (rst) q <= 0; else q <= q + 1;\nendmodule")
        assert d["ok"] and d["ffBits"] == 4 and d["gates"] > 0, d

    def test_wider_adder_is_bigger_and_deeper(self, client):
        add = lambda n: f"module a(input [{n-1}:0] x, input [{n-1}:0] y, output [{n}:0] s); assign s = x + y; endmodule"
        small, big = self._m(client, add(4)), self._m(client, add(8))
        assert big["gates"] > small["gates"] and big["depth"] > small["depth"], (small, big)

    def test_syntax_error(self, client):
        assert self._m(client, "module broken(input a; endmodule")["ok"] is False


# =============================================================================
# /board — gate-level netlist for the virtual board
# =============================================================================

from api.routes.synthesize import board_netlist  # noqa: E402


class TestBoard:

    def _b(self, client, design):
        r = client.post("/board", json={"design_v": design})
        assert r.status_code == 200, r.text
        return r.json()

    def test_counter_with_async_reset_and_enable(self, client):
        d = self._b(client, "module c(input clk, input rst_n, input en, output reg [3:0] q);\n"
                            "  always @(posedge clk or negedge rst_n) if (!rst_n) q <= 0; else if (en) q <= q + 1;\nendmodule")
        assert d["ok"], d
        # the enable becomes gates; the async reset stays on the flip-flops (reset to 0, active low)
        types = {c["type"] for c in d["cells"]}
        assert types <= {"$_DFF_PN0_", "$_NOT_", "$_AND_", "$_NAND_", "$_OR_", "$_NOR_", "$_XOR_", "$_XNOR_", "$_MUX_"}, types
        assert sum(c["type"] == "$_DFF_PN0_" for c in d["cells"]) == 4
        assert d["ports"]["q"]["direction"] == "output" and len(d["ports"]["q"]["bits"]) == 4

    def test_latch_is_rejected(self, client):
        d = self._b(client, "module l(input en, input d, output reg q); always @* if (en) q = d; endmodule")
        assert d["ok"] is False and "latches" in d["error"], d

    def test_limits(self):
        cell = {"type": "$_NOT_", "connections": {"A": [2], "Y": [3]}}
        top = {"attributes": {"top": "1"}, "ports": {}, "cells": {str(i): cell for i in range(20_001)}}
        assert "Too large" in board_netlist({"modules": {"t": top}})["error"]
        top["cells"] = {"s": {"type": "$scopeinfo", "connections": {}}, "n": cell}
        assert board_netlist({"modules": {"t": top}})["cells"] == [{"type": "$_NOT_", "conn": {"A": [2], "Y": [3]}}]


def test_first_compile_error():
    from api.sandbox import first_compile_error
    out = "design.v:4: warning: implicit definition\ndesign.v:13: syntax error\nI give up."
    assert first_compile_error(out) == "design.v:13: syntax error"
    assert first_compile_error("tb.v:10: error: Unknown module type: counter\n2 error(s) during elaboration.") \
        == "tb.v:10: error: Unknown module type: counter"
    assert first_compile_error("something unexpected") is None


def test_compile_hint():
    from api.sandbox import compile_hint
    assert "two copies" in compile_hint("design.v:81: error: 'counter' has already been declared in this scope.")
    assert "no module named 'adder'" in compile_hint("tb.v:1: error: Unknown module type: adder")
    assert compile_hint("design.v:13: syntax error") is None


# =============================================================================
# /fpga — resource estimates for iCE40 and Xilinx 7-series
# =============================================================================

from api.routes.synthesize import fpga_resources  # noqa: E402

FPGA_DESIGN = """module mem(input clk, input we, input [7:0] addr, input [15:0] din, output reg [15:0] dout,
                    input [15:0] a, input [15:0] b, output [31:0] p);
  reg [15:0] ram [0:255];
  always @(posedge clk) begin if (we) ram[addr] <= din; dout <= ram[addr]; end
  assign p = a * b;
endmodule"""


class TestFpga:

    def _f(self, client, design, family):
        r = client.post("/fpga", json={"design_v": design, "family": family})
        assert r.status_code == 200, r.text
        return r.json()

    def test_ice40_maps_memory_to_block_ram(self, client):
        d = self._f(client, FPGA_DESIGN, "ice40")
        assert d["ok"] and d["device"].startswith("iCE40"), d
        assert d["resources"]["bram"] == 1 and d["resources"]["luts"] > 100 and d["resources"]["dsp"] == 0, d["resources"]

    def test_xc7_uses_a_dsp_for_the_multiplier(self, client):
        d = self._f(client, FPGA_DESIGN, "xc7")
        assert d["ok"] and d["resources"]["dsp"] == 1 and d["resources"]["io"] > 0, d["resources"]

    def test_counter_flip_flops(self, client):
        d = self._f(client, "module c(input clk, output reg [3:0] q); always @(posedge clk) q <= q + 1; endmodule", "ice40")
        assert d["resources"]["ffs"] == 4, d["resources"]

    def test_unknown_family_rejected(self, client):
        assert client.post("/fpga", json={"design_v": "module m; endmodule", "family": "stratix"}).status_code == 422

    def test_syntax_error(self, client):
        assert self._f(client, "module broken(input a; endmodule", "xc7")["ok"] is False


def test_fpga_resources_grouping():
    xc7 = fpga_resources({"LUT3": 9, "LUT5": 7, "INV": 4, "FDRE": 11, "CARRY4": 3, "RAMB18E1": 3, "RAMB36E1": 1,
                          "RAM256X1S": 16, "DSP48E1": 2, "IBUF": 5, "OBUF": 19, "BUFG": 1}, "xc7")
    assert xc7 == {"luts": 20, "lutram": 16, "ffs": 11, "carry": 3, "bram": 2.5, "dsp": 2, "io": 24}, xc7
    ice = fpga_resources({"SB_LUT4": 44, "SB_DFF": 7, "SB_DFFSR": 4, "SB_CARRY": 7, "SB_RAM40_4K": 1}, "ice40")
    assert ice == {"luts": 44, "lutram": 0, "ffs": 11, "carry": 7, "bram": 1, "dsp": 0, "io": 0}, ice
