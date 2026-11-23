"""layout/dev_run.py — run one design through the same flow as app.py but keep the ORFS work dir, for calibrating
checks and capturing real reports (developer tool, not used by the service).

  python3 dev_run.py OUT_DIR design.v TOP CLOCK PERIOD_NS [IMAGE]
"""
import pathlib
import subprocess
import sys

import flow

out, src, top, clock, period = pathlib.Path(sys.argv[1]).resolve(), sys.argv[2], sys.argv[3], sys.argv[4], float(sys.argv[5])
image = sys.argv[6] if len(sys.argv) > 6 else "openroad/orfs@sha256:d64a1e6edb83726c4816e2ae2144fbd5691f7b67403db0e86789cb30a2763d06"
plat = "sky130hd"
out.mkdir(parents=True, exist_ok=True)
(out / "design.v").write_text(pathlib.Path(src).read_text())
(out / "constraint.sdc").write_text(flow.sdc(clock, period))


def make(target: str, log: str) -> int:
    return subprocess.run(["docker", "run", "--rm", "--network", "none", "--user", "1000:1000", "-v", f"{out}:/work", image,
                           "bash", "-c", "cd /OpenROAD-flow-scripts/flow && source ../env.sh >/dev/null 2>&1; "
                           f"make DESIGN_CONFIG=/work/config.mk WORK_HOME=/work/run {target} > /work/{log} 2>&1"]).returncode


(out / "config.mk").write_text(flow.config_mk(top, plat))
print("synth", make("synth", "synth.log"))
stat = out / "run" / "reports" / plat / top / "base" / "synth_stat.txt"
core = flow.die_for_area((flow.synth_area(stat.read_text()) if stat.exists() else None) or 1.0)[0]
(out / "config.mk").write_text(flow.config_mk(top, plat, core, 0.6))
print("flow", make("", "flow0.log"))
print(flow.read_results(out / "run", plat, top))
