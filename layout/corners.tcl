# layout/corners.tcl — sign-off timing of the finished layout at one SkyWater corner (run once per corner: this
# OpenROAD build's OpenSTA has no multi-corner commands). OpenSTA on ORFS's 6_final netlist, SDC and SPEF.
#   env: RESULTS (dir with 6_final.v/.sdc/.spef), TOP, LIB (the corner's Liberty file)
# Prints OpenSTA's "worst slack max <ns>" (setup) and "worst slack min <ns>" (hold). The flow optimised at tt only and
# the SPEF is a single RC corner, so a failing ss/ff corner is a finding about the design, not a tool fault.
read_liberty $::env(LIB)
read_verilog $::env(RESULTS)/6_final.v
link_design $::env(TOP)
read_sdc $::env(RESULTS)/6_final.sdc
read_spef $::env(RESULTS)/6_final.spef
report_worst_slack -max -digits 3
report_worst_slack -min -digits 3
