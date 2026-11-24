# layout/logic_area.tcl — area of the design's own cells in the finished layout: every instance except physical-only
# ones (fill, spacer, well tap, decap, antenna diode). ORFS's "Design area" counts those too, and on a small design
# they dominate (an AND gate: ~6 µm² of logic in ~114 µm²). Resizing and buffers added by the flow do count.
#   env: RESULTS (dir with 6_final.odb). Prints "logic area <um2> cells <n>".
read_db $::env(RESULTS)/6_final.odb
set block [ord::get_db_block]
set dbu [[ord::get_db_tech] getDbUnitsPerMicron]
set area 0.0
set n 0
foreach inst [$block getInsts] {
  set m [$inst getMaster]
  set type [$m getType]
  if {[string match "CORE_SPACER" $type] || [string match "CORE_WELLTAP" $type] || [string match "CORE_ANTENNACELL" $type] || [string match "ENDCAP*" $type]} { continue }
  if {[regexp {__(fill|decap|tapvpwrvgnd|diode|fakediode|lpflow_decapkapwr)} [$m getName]]} { continue }
  set area [expr {$area + double([$m getWidth]) * [$m getHeight] / ($dbu * $dbu)}]
  incr n
}
puts [format "logic area %.3f cells %d" $area $n]
