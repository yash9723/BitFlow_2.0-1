"""
tests/test_style.py — Verible style lint and formatting (api/routes/style.py).

Parsing tests always run; the endpoint tests need verible-verilog-lint/-format on PATH
(Dockerfile.api and the CI api job install the pinned release).
"""

from __future__ import annotations

import os
import shutil
import time

import jwt
import pytest
from fastapi.testclient import TestClient

TEST_JWT_SECRET = "test-secret-0123456789abcdef0123456789abcdef"
os.environ["JWT_SECRET"] = TEST_JWT_SECRET

from api.main import create_app  # noqa: E402
from api.routes.style import parse_lint  # noqa: E402

needs_verible = pytest.mark.skipif(
    not (shutil.which("verible-verilog-lint") and shutil.which("verible-verilog-format")),
    reason="Verible not installed",
)

SAMPLE = """\
design.v:6:3-8: Use 'always_comb' instead of 'always @*'. [Style: combinational-logic] [always-comb]
design.v:1:8-15: Signal name does not conform to lower_snake_case. [Style: signal-conventions] [signal-name-style]
tb.v:3:12: syntax error at token ";"
some unrelated banner line
"""

# A latch-prone combinational block, an always @* and a missing default case.
STYLE_BAD = """\
module bad(input [1:0] sel, input a, output reg y);
  always @* begin
    case (sel)
      2'd0: y = a;
      2'd1: y = ~a;
    endcase
  end
endmodule
"""

UGLY = "module   m(input a,output y);assign y=a;endmodule\n"


@pytest.fixture(scope="module")
def client() -> TestClient:
    token = jwt.encode({"iss": "test", "exp": int(time.time()) + 60}, TEST_JWT_SECRET, algorithm="HS256")
    return TestClient(create_app(), raise_server_exceptions=False, headers={"Authorization": f"Bearer {token}"})


class TestParse:
    def test_rules_and_ranges(self):
        issues = parse_lint(SAMPLE)
        assert [i["rule"] for i in issues] == ["always-comb", "signal-name-style", "syntax"]
        first = issues[0]
        assert (first["file"], first["line"], first["col"], first["endCol"]) == ("design.v", 6, 3, 8)
        assert first["message"] == "Use 'always_comb' instead of 'always @*'."
        assert first["severity"] == "warning"

    def test_syntax_errors_are_errors(self):
        syntax = parse_lint(SAMPLE)[2]
        assert syntax["severity"] == "error" and syntax["endCol"] is None and syntax["file"] == "tb.v"

    def test_formatter_prefix(self):
        issues = parse_lint('d.v: d.v:1:10: syntax error at token ";"\nd.v:1:12-20: syntax error at token "endmodule"\n')
        assert [(i["line"], i["col"]) for i in issues] == [(1, 10), (1, 12)]

    def test_ignores_noise(self):
        assert parse_lint("") == []
        assert parse_lint("Verible lint done\n") == []


class TestEndpoints:
    def test_needs_a_token(self):
        anon = TestClient(create_app(), raise_server_exceptions=False)
        assert anon.post("/style/lint", json={"files": [{"name": "design.v", "content": UGLY}]}).status_code in (401, 403)

    def test_rejects_unsafe_file_names(self, client):
        for name in ("../etc/passwd.v", "design.exe", "a b.v", "--lint_fatal.v", "..v"):
            r = client.post("/style/lint", json={"files": [{"name": name, "content": UGLY}]})
            assert r.status_code == 200 and r.json()["ok"] is False, name

    @needs_verible
    def test_lint_finds_style_issues(self, client):
        r = client.post("/style/lint", json={"files": [{"name": "design.v", "content": STYLE_BAD}]})
        assert r.status_code == 200
        rules = {i["rule"] for i in r.json()["issues"]}
        assert {"always-comb", "case-missing-default"} <= rules
        assert "module-filename" not in rules, "turned off in api/verible.rules"

    @needs_verible
    def test_lint_reports_syntax_errors(self, client):
        r = client.post("/style/lint", json={"files": [{"name": "design.v", "content": "module m(; endmodule\n"}]})
        assert any(i["severity"] == "error" for i in r.json()["issues"])

    @needs_verible
    def test_format_is_idempotent(self, client):
        once = client.post("/style/format", json={"source": UGLY}).json()
        assert once["ok"] and once["formatted"] != UGLY
        twice = client.post("/style/format", json={"source": once["formatted"]}).json()
        assert twice["formatted"] == once["formatted"]

    @needs_verible
    def test_format_refuses_broken_code(self, client):
        r = client.post("/style/format", json={"source": "module m(; endmodule\n"}).json()
        assert r["ok"] is False and "syntax" in r["error"].lower()
