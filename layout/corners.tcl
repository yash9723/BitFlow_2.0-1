# layout/corners.tcl — sign-off timing of the finished layout at three SkyWater corners.
# OpenSTA (inside openroad) on ORFS's 6_final netlist, SDC and extracted parasitics (SPEF).
#   env: RESULTS (dir with 6_final.v/.sdc/.spef), TOP, LIB_TT, LIB_SS, LIB_FF
# For each corner prints "corner <name>" then OpenSTA's setup (max) and hold (min) worst slack. The flow optimised at
# tt only and the SPEF is a single RC corner, so a failing ss/ff corner is a finding about the design, not a tool fault.
define_corners ss tt ff
read_liberty -corner ss $::env(LIB_SS)
read_liberty -corner tt $::env(LIB_TT)
read_liberty -corner ff $::env(LIB_FF)
read_verilog $::env(RESULTS)/6_final.v
link_design $::env(TOP)
read_sdc $::env(RESULTS)/6_final.sdc
read_spef $::env(RESULTS)/6_final.spef
foreach c {ss tt ff} {
  puts "corner $c"
  report_worst_slack -max -corner $c -digits 3
  report_worst_slack -min -corner $c -digits 3
}
