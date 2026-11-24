"""layout/test_flow.py: checks for layout/flow.py (python layout/test_flow.py, or pytest)."""
import flow

COUNTER = """// counter
module counter (input clk, input rst, input en, output reg [7:0] q);
  always @(posedge clk) if (rst) q <= 0; else if (en) q <= q + 1;
endmodule"""


def bad(v, top="counter", clock="clk", p=10, plat="sky130hd"):
    return flow.check_request(v, top, clock, p, plat)


def test_request_checks():
    assert bad(COUNTER) == []
    assert flow.guess_clock(COUNTER, "counter") == "clk"
    assert flow.ports("module m #(parameter W=8) (a, b, c); endmodule", "m") == ["a", "b", "c"]
    assert any("include" in e for e in bad('`include "x.v"\n' + COUNTER))
    assert any("$readmemh" in e for e in bad(COUNTER.replace("endmodule", 'initial $readmemh("/etc/passwd", q);\nendmodule')))
    assert bad("// `include in a comment is fine\n" + COUNTER) == []
    assert any("no module" in e for e in bad(COUNTER, top="nope"))
    assert any("identifier" in e for e in bad(COUNTER, top="x; touch y"))
    assert any("no port" in e for e in bad(COUNTER, clock="clk2"))
    assert any("period" in e for e in bad(COUNTER, p=0.1))
    assert any("process" in e for e in bad(COUNTER, plat="tsmc5"))
    assert any("KB" in e for e in bad(COUNTER + " " * 100_001))


def test_ids_and_config():
    a = flow.job_id(COUNTER, "counter", "clk", 10, "sky130hd", "img@1")
    assert a == flow.job_id(COUNTER, "counter", "clk", 10.0, "sky130hd", "img@1") and a.isalnum() and len(a) == 24
    assert a != flow.job_id(COUNTER, "counter", "clk", 10, "sky130hd", "img@2"), "a new tool image is a new job"
    assert flow.die_for_area(339) == (80, 100), "small designs get the power-grid minimum"
    assert flow.die_for_area(20_000)[0] == 240
    cfg = flow.config_mk("counter", "sky130hd", 80)
    assert "DIE_AREA = 0 0 100 100" in cfg and "CORE_AREA = 10 10 90 90" in cfg
    assert "[get_ports clk]" in flow.sdc("clk", 10) and "delete_from_list" in flow.sdc("clk", 10)
    assert "get_ports" not in flow.sdc(None, 5).splitlines()[0], "combinational: a virtual clock"


def test_reports_and_errors():
    import pathlib, tempfile
    with tempfile.TemporaryDirectory() as t:
        rep, log = pathlib.Path(t, "reports/sky130hd/c/base"), pathlib.Path(t, "logs/sky130hd/c/base")
        rep.mkdir(parents=True); log.mkdir(parents=True)
        (log / "6_report.log").write_text("Design area 503 um^2 8% utilization.\n")
        (rep / "synth_stat.txt").write_text("      37  339.075       37  339.075 cells\n")
        (rep / "6_finish.rpt").write_text("wns max -1.26\ntns max -56.04\nworst slack max -1.26\n")
        r = flow.read_results(pathlib.Path(t), "sky130hd", "c")
        assert (r["area_um2"], r["utilization_pct"], r["cells"], r["wns_ns"], r["tns_ns"], r["slack_ns"]) == (503, 8, 37, -1.26, -56.04, -1.26), r
        (rep / "6_finish.rpt").write_text("wns max 0.00\ntns max 0.00\nworst slack max 8.95\n")   # met: wns clamps at 0
        assert flow.read_results(pathlib.Path(t), "sky130hd", "c")["slack_ns"] == 8.95
        # no route or LEC log yet: the checks read as not run, never as clean
        r = flow.read_results(pathlib.Path(t), "sky130hd", "c")
        assert (r["drc_violations"], r["antenna_violations"], r["lec"]) == (None, None, None), r
        # lines as written by the pinned ORFS image (counter run on the layout server, 2026-11-23)
        (log / "5_2_route.log").write_text("[INFO DRT-0199]   Number of violations = 1.\n[INFO ANT-0002] Found 3 net violations.\n"
                                           "[INFO DRT-0199]   Number of violations = 0.\n[INFO ANT-0002] Found 0 net violations.\n")
        (log / "6_final_lec_check.log").write_text("[2026-11-23 16:10:36.597] [miter_logger] [info] Circuits are IDENTICAL\n")
        (rep / "synth_stat.txt").write_text("      172 1.46E+03      172 1.46E+03 cells\n")
        r = flow.read_results(pathlib.Path(t), "sky130hd", "c")
        assert (r["drc_violations"], r["antenna_violations"], r["lec"], r["cells"]) == (0, 0, True, 172), r
        (log / "6_final_lec_check.log").write_text("[info] Circuits are NOT IDENTICAL\n")
        assert flow.read_results(pathlib.Path(t), "sky130hd", "c")["lec"] is False
    assert flow.worst_slack("OpenROAD v\nworst slack max -0.785\nworst slack min 0.352\n") == {"setup": -0.785, "hold": 0.352}
    assert flow.worst_slack("[ERROR ORD-2010] no technology has been read.\n") is None
    # logic_area.tcl output on the 4-bit counter layout (server, 2026-11-24)
    assert flow.logic_area("OpenROAD v\nlogic area 236.477 cells 25\n") == 236.477
    assert flow.logic_area("[ERROR ORD-0002] x\n") is None
    # KLayout DRC/LVS lines from the calibration runs (clean counter, then a broken copy)
    assert flow.read_klayout("    1.3s Total violations: 0\n", "INFO : Congratulations! Netlists match.\n") == {"drc_deck_violations": 0, "lvs": True}
    assert flow.read_klayout("    1.4s Total violations: 3\n", "ERROR : Netlists don't match\n") == {"drc_deck_violations": 3, "lvs": False}
    assert flow.read_klayout("", "make: klayout: No such file or directory\n") == {"drc_deck_violations": None, "lvs": None}
    assert flow.synth_area("   Chip area for module '\\counter': 339.075200\n") == 339.0752
    assert "power grid" in flow.explain("[ERROR PDN-0185] Insufficient width")
    assert flow.explain("ERROR: syntax error, unexpected TOK_ID").startswith("Synthesis failed")
    assert flow.recovery("[ERROR PDN-0185] x", 80, 0.6) == (120, 0.6)
    assert flow.recovery("[ERROR GRT-0116] x", 100, 0.6) == (130, 0.5)
    assert flow.recovery("something else", 80, 0.6) is None


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("layout flow: ok")
