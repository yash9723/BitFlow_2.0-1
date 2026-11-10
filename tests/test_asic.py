"""
tests/test_asic.py — POST /asic (api/routes/asic.py): Sky130 area, static timing, power and
gate-level simulation.

Parsing tests always run; the end-to-end tests need yosys, OpenSTA, iverilog and the Sky130
library from api/install_sky130.sh (Dockerfile.api, the CI ASIC job).
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
from api.routes.asic import (  # noqa: E402
    CELLS, LIB, comparable, netlist_ports, parse_path, parse_power, pick_clock, sim_passed,
    summarize_cells, tb_parameters, vcd_activity, with_parameters,
)

needs_asic = pytest.mark.skipif(
    not (shutil.which("yosys") and shutil.which("sta") and shutil.which("iverilog") and os.path.exists(LIB) and os.path.exists(CELLS)),
    reason="yosys, OpenSTA, iverilog and the Sky130 library (api/install_sky130.sh) needed",
)

# ── Parsing ────────────────────────────────────────────────────────────────────

SETUP_REPORT = """\
Startpoint: _20_ (rising edge-triggered flip-flop clocked by clk)
Endpoint: _23_ (rising edge-triggered flip-flop clocked by clk)
Path Group: clk
Path Type: max

Fanout    Delay     Time   Description
----------------------------------------------------------------
         0.000    0.000   clock clk (rise edge)
         0.000    0.000   clock network delay (ideal)
         0.000    0.000 ^ _20_/CLK (sky130_fd_sc_hd__dfxtp_1)
         0.372    0.372 ^ _20_/Q (sky130_fd_sc_hd__dfxtp_1)
    3                     q[0] (net)
         0.246    0.619 ^ _15_/X (sky130_fd_sc_hd__and4_1)
    1                     _04_ (net)
         0.003    0.622 v _23_/D (sky130_fd_sc_hd__dfxtp_1)
                  0.622   data arrival time

        10.000   10.000   clock clk (rise edge)
         0.000   10.000   clock network delay (ideal)
                 10.000 ^ _23_/CLK (sky130_fd_sc_hd__dfxtp_1)
        -0.117    9.883   library setup time
                  9.883   data required time
----------------------------------------------------------------
                  9.883   data required time
                 -0.622   data arrival time
----------------------------------------------------------------
                  9.261   slack (MET)
"""

POWER_REPORT = """\
Group                  Internal  Switching    Leakage      Total
                          Power      Power      Power      Power
----------------------------------------------------------------
Sequential           3.4800e-05 1.0100e-06 3.3800e-11 3.5900e-05  92.5%
Combinational        2.3900e-06 5.3500e-07 2.3000e-11 2.9200e-06   7.5%
Macro                0.0000e+00 0.0000e+00 0.0000e+00 0.0000e+00   0.0%
Pad                  0.0000e+00 0.0000e+00 0.0000e+00 0.0000e+00   0.0%
----------------------------------------------------------------
Total                3.7200e-05 1.5500e-06 5.6800e-11 3.8800e-05 100.0%
"""


def test_parse_path():
    p = parse_path(SETUP_REPORT)
    assert (p["startpoint"], p["endpoint"]) == ("_20_", "_23_")
    assert [s["pin"] for s in p["stages"]] == ["_20_/CLK", "_20_/Q", "_15_/X", "_23_/D"], "the capture clock is not a stage"
    assert p["stages"][1] == {"pin": "_20_/Q", "cell": "dfxtp_1", "edge": "rise", "delay": 0.372, "arrival": 0.372, "net": "q[0]"}
    assert p["stages"][3]["edge"] == "fall"
    assert (p["arrival"], p["slack"], p["met"]) == (0.622, 9.261, True)
    violated = parse_path(SETUP_REPORT.replace("9.261   slack (MET)", "-0.120   slack (VIOLATED)"))
    assert (violated["slack"], violated["met"]) == (-0.12, False)
    assert parse_path("No paths found.") is None


def test_parse_path_ports():
    p = parse_path("Startpoint: a (input port clocked by clk)\nEndpoint: y (output port clocked by clk)\n"
                   "         0.000    0.000 ^ a (in)\n         0.120    0.120 v y (out)\n          0.120   data arrival time\n")
    assert [s["cell"] for s in p["stages"]] == ["input port", "output port"]


def test_parse_power():
    p = parse_power(POWER_REPORT)
    assert p == {"internal": 3.72e-05, "switching": 1.55e-06, "leakage": 5.68e-11, "total": 3.88e-05,
                 "sequential": 3.59e-05, "combinational": 2.92e-06}
    assert parse_power("Error: no liberty") is None


def test_netlist_ports_and_clock():
    top, ports = netlist_ports("module counter4(clk, rst, q);\n  input clk;\n  wire clk;\n  input rst;\n  output [3:0] q;\nendmodule\n")
    assert top == "counter4"
    assert ports == {"clk": {"dir": "input", "width": 1}, "rst": {"dir": "input", "width": 1}, "q": {"dir": "output", "width": 4}}
    assert pick_clock(ports, None) == "clk"
    assert pick_clock(ports, "rst") == "rst"
    assert pick_clock(ports, "q") is None, "an output is not a clock"
    assert pick_clock({"a": {"dir": "input", "width": 1}}, None) is None, "combinational: no clock"
    assert pick_clock({"sys_clk_50": {"dir": "input", "width": 1}}, None) == "sys_clk_50"


def test_summarize_cells():
    s = summarize_cells({"modules": {"\\top": {"area": 138.8832, "num_cells_by_type": {
        "sky130_fd_sc_hd__dfxtp_1": 4, "sky130_fd_sc_hd__dlxtp_1": 1, "sky130_fd_sc_hd__nand2_1": 6, "sky130_fd_sc_hd__edfxtp_1": 1}}}})
    assert (s["areaUm2"], s["cells"], s["registers"]) == (138.88, 12, 6)
    assert list(s["byType"])[0] == "nand2_1"


VCD = """\
$timescale 1ns $end
$scope module tb $end
$var reg 1 ! a $end
$var reg 2 # b [1:0] $end
$scope module dut $end
$var wire 1 $ a $end
$var wire 2 % b [1:0] $end
$upscope $end
$upscope $end
$enddefinitions $end
#0
0$
b00 %
#10
1$
b1 %
#20
0$
b10 %
#40
"""


def test_vcd_activity():
    act = vcd_activity(VCD, {"a": 1, "b": 2}, 10.0)
    # 40 ns at 10 ns a period = 4 periods. a: 2 transitions, high 10 of 40 ns.
    assert act["a"] == {"activity": 0.5, "duty": 0.25}
    # b[0]: 0 -> 1 -> 0 (2 transitions, high 10 ns); b[1]: 0 -> 1 (1 transition, high 20 ns).
    assert act["b"] == {"activity": round(3 / 2 / 4, 4), "duty": round(30 / 2 / 40, 4)}
    assert vcd_activity(VCD.replace("1ns", "10ns"), {"a": 1}, 100.0)["a"]["activity"] == 0.5, "timescale is respected"
    assert vcd_activity("", {"a": 1}, 10.0) == {}
    assert vcd_activity(VCD, {"nope": 1}, 10.0) == {}


def test_tb_parameters():
    design = "module sub(input a); endmodule\nmodule counter #(parameter WIDTH = 8, parameter STEP = 1) (input clk);\nendmodule\n"
    tb = "module tb; // counter #(.WIDTH(99)) old (\n counter #( .WIDTH(4), .STEP(8'h02), .NAME(\"x\") ) dut (.clk(clk)); endmodule"
    assert tb_parameters(design, tb) == ("counter", {"WIDTH": 4, "STEP": 2}), "comments ignored, non-numbers left at default"
    assert tb_parameters(design, "module tb; counter dut(.clk(clk)); endmodule") == (None, {})
    assert tb_parameters(design, "") == (None, {})
    gates = "module counter(clk, q);\n  input clk;\nendmodule\n"
    assert with_parameters(gates, {"WIDTH": 4}) == "module counter(clk, q);\n  parameter WIDTH = 4;\n  input clk;\nendmodule\n"
    assert with_parameters(gates, {}) == gates


def test_sim_helpers():
    assert sim_passed(0, "ALL TESTS PASSED")
    assert not sim_passed(0, "FAIL q=3\nALL TESTS PASSED")
    assert not sim_passed(1, "")
    assert comparable("VCD info: dumpfile x\nq=3\ntb.v:9: $finish called at 50 (1s)\n") == ["q=3"]


# ── End to end ─────────────────────────────────────────────────────────────────

COUNTER = """\
module counter4 (input clk, input rst, input en, output reg [3:0] q);
  always @(posedge clk) if (rst) q <= 4'd0; else if (en) q <= q + 4'd1;
endmodule
"""

COUNTER_TB = """\
`timescale 1ns/1ps
module tb;
  reg clk = 0, rst = 1, en = 0; wire [3:0] q;
  counter4 dut (.clk(clk), .rst(rst), .en(en), .q(q));
  always #5 clk = ~clk;
  initial begin
    $dumpfile("wave.vcd"); $dumpvars(0, tb);
    @(negedge clk) rst = 0; en = 1;
    repeat (6) @(negedge clk);
    $display("q=%0d", q);
    if (q !== 4'd6) $display("FAIL"); else $display("ALL TESTS PASSED");
    $finish;
  end
endmodule
"""


@pytest.fixture(scope="module")
def client() -> TestClient:
    token = jwt.encode({"iss": "test", "exp": int(time.time()) + 300}, TEST_JWT_SECRET, algorithm="HS256")
    return TestClient(create_app(), raise_server_exceptions=False, headers={"Authorization": f"Bearer {token}"})


def _asic(client, **body):
    r = client.post("/asic", json=body)
    assert r.status_code == 200, r.text
    return r.json()


@needs_asic
def test_counter_area_timing_power(client):
    r = _asic(client, design_v=COUNTER, period_ns=10)
    assert r["ok"], r
    assert r["top"] == "counter4" and r["registers"] == 4 and r["areaUm2"] > 50
    t = r["timing"]
    assert t["clock"] == "clk" and t["setup"]["met"] and t["hold"]["met"]
    assert t["setup"]["stages"][0]["pin"].endswith("/CLK"), "a register-to-register path starts at a clock pin"
    assert 100 < t["fmaxMhz"] < 3000
    assert r["power"]["total"] > 0 and r["power"]["activitySource"] == "default"
    assert "sky130_fd_sc_hd__dfxtp_1" in r["netlist"] or "sky130_fd_sc_hd__dfrtp_1" in r["netlist"]
    # Chip X-ray: the gates as Yosys JSON, named like the netlist and the timing path's pins
    gates = r["gates"]["modules"]["counter4"]
    names = set(gates["cells"])
    assert len(names) == r["cells"]
    path_cells = {s["pin"].split("/")[0] for s in t["setup"]["stages"] if "/" in s["pin"]}
    assert path_cells and path_cells <= names, (path_cells, sorted(names)[:10])
    srcs = [n["attributes"].get("src", "") for n in gates["netnames"].values()] + [c["attributes"].get("src", "") for c in gates["cells"].values()]
    assert any("design.v:" in s for s in srcs), "some source locations survive mapping"


@needs_asic
def test_metrics_area_matches_asic(client):
    """The area leaderboard's score (POST /metrics) is the same mapping /asic reports."""
    r = client.post("/metrics", json={"design_v": COUNTER})
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["ok"] and m["gates"] > 0
    assert m["areaUm2"] == _asic(client, design_v=COUNTER, period_ns=10)["areaUm2"]


@needs_asic
def test_too_fast_clock_violates(client):
    t = _asic(client, design_v=COUNTER, period_ns=0.5)["timing"]
    assert not t["setup"]["met"] and t["setup"]["slack"] < 0 and t["wnsNs"] < 0
    fast = _asic(client, design_v=COUNTER, period_ns=10)["timing"]["fmaxMhz"]
    assert abs(t["fmaxMhz"] - fast) / fast < 0.5, "Fmax depends on the design, not on the period asked for"


@needs_asic
def test_combinational_delay(client):
    r = _asic(client, design_v="module add8(input [7:0] a, input [7:0] b, output [8:0] s); assign s = a + b; endmodule")
    assert r["ok"] and r["registers"] == 0
    t = r["timing"]
    assert t["clock"] is None and t["fmaxMhz"] is None and t["delayNs"] > 0.1
    assert t["setup"]["startKind"].startswith("input port") and t["setup"]["endKind"].startswith("output port")


@needs_asic
def test_latch_maps_to_a_latch_cell(client):
    r = _asic(client, design_v="module l(input g, input d, output reg q); always @(*) if (g) q = d; endmodule")
    assert r["ok"], r
    assert r["byType"].get("dlxtp_1") == 1


@needs_asic
def test_gate_level_simulation_and_activity(client):
    r = _asic(client, design_v=COUNTER, testbench_v=COUNTER_TB, period_ns=10)
    g = r["gls"]
    assert g["rtl"]["passed"] and g["gates"]["passed"] and g["sameOutput"], g
    assert r["power"]["activitySource"] == "simulation"
    assert r["power"]["activity"]["en"]["duty"] > 0.5, "en is high for most of the run"


@needs_asic
def test_gate_level_catches_initial_value(client):
    # `reg q = 0` works in simulation, but silicon has no initial values: the gates start at X.
    design = "module c(input clk, output reg [3:0] q = 0); always @(posedge clk) q <= q + 1; endmodule"
    tb = ("module tb; reg clk = 0; wire [3:0] q; c dut(.clk(clk), .q(q)); always #5 clk = ~clk;\n"
          "initial begin #32; if (q !== 4'd3) $display(\"FAIL q=%b\", q); else $display(\"ALL TESTS PASSED\"); $finish; end endmodule")
    g = _asic(client, design_v=design, testbench_v=tb)["gls"]
    assert g["rtl"]["passed"] and not g["gates"]["passed"] and not g["sameOutput"], g


@needs_asic
def test_testbench_parameters_set_the_configuration(client):
    design = ("module counter #(parameter WIDTH = 16) (input clk, input rst, output reg [WIDTH-1:0] count);\n"
              "  always @(posedge clk) if (rst) count <= 0; else count <= count + 1'b1;\nendmodule\n")
    tb = ("module tb; reg clk = 0, rst = 1; wire [3:0] count; counter #(.WIDTH(4)) dut (.clk(clk), .rst(rst), .count(count));\n"
          "always #5 clk = ~clk; initial begin @(negedge clk) rst = 0; repeat (5) @(negedge clk);\n"
          "if (count !== 4'd5) $display(\"FAIL %0d\", count); else $display(\"ALL TESTS PASSED\"); $finish; end endmodule")
    r = _asic(client, design_v=design, testbench_v=tb)
    assert r["parameters"] == {"WIDTH": 4} and r["registers"] == 4, "built at the testbench's width, not the default 16"
    assert r["gls"]["gates"]["passed"] and r["gls"]["sameOutput"], r["gls"]
    assert _asic(client, design_v=design)["registers"] == 16


@needs_asic
def test_errors(client):
    assert "not a 1-bit input" in _asic(client, design_v=COUNTER, clock="en2")["error"]
    assert not _asic(client, design_v="module broken(input a output y); endmodule")["ok"]
    g = _asic(client, design_v=COUNTER, testbench_v="module tb; nope u(); endmodule")["gls"]
    assert "doesn't compile with the RTL design" in g["error"]
