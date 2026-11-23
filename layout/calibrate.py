"""layout/calibrate.py — run reference designs through app.run_job (the real job runner) and print each one's
time and check results, to calibrate the sign-off checks before learners see them (developer tool).

  JOBS_DIR=... LIBS_DIR=... ORFS_IMAGE=... python calibrate.py [gcd.v]
"""
import json
import sys
import time

import app
import flow

DESIGNS = {
    "add8": ("module add8(input [7:0] a, input [7:0] b, output [8:0] s);\n  assign s = a + b;\nendmodule\n", "add8", None, 10.0),
    "mul16": ("module mul16(input clk, input [15:0] a, input [15:0] b, output reg [31:0] p);\n"
              "  reg [15:0] ra, rb;\n  always @(posedge clk) begin ra <= a; rb <= b; p <= ra * rb; end\nendmodule\n", "mul16", "clk", 20.0),
}
if len(sys.argv) > 1:
    DESIGNS["gcd"] = (open(sys.argv[1]).read(), "gcd", "clk", 10.0)

for name, (src, top, clock, period) in DESIGNS.items():
    jid = f"cal-{name}"
    d = app.JOBS / jid
    d.mkdir(parents=True, exist_ok=True)
    (d / "design.v").write_text(src)
    (d / "constraint.sdc").write_text(flow.sdc(clock, period))
    (d / "request.json").write_text(json.dumps({"top": top, "clock": clock, "period_ns": period, "platform": "sky130hd", "user": "cal"}))
    app.write_status(jid, id=jid, state="queued")
    t0 = time.time()
    app.run_job(jid)
    s = app.read_status(jid)
    r = s.get("results") or {}
    keys = ("cells", "area_um2", "slack_ns", "drc_violations", "antenna_violations", "lec", "drc_deck_violations", "lvs", "corners")
    print(json.dumps({"design": name, "state": s["state"], "message": s.get("message"), "wall_s": round(time.time() - t0, 1),
                      **{k: r.get(k) for k in keys}}))
