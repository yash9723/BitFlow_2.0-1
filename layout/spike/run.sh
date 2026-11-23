#!/bin/sh
# Spike: SDF from OpenSTA, then Icarus on the routed netlist with SkyWater's timing models (LambdaPDK copy).
#   run.sh WORK_DIR(with run/results/sky130hd/counter/base) MODELS_DIR(hd.v primitives.v) HALF_NS WIDTH
set -e
W=$1; M=$2; HALF=$3; WIDTH=$4
R=$W/run/results/sky130hd/counter/base
S=$(cd "$(dirname "$0")" && pwd)
docker run --rm --network none --user 1000:1000 -v "$R":/r -v "$S":/s:ro -e RESULTS=/r -e OUT=/r/6_final.sdf \
  -e LIB=/OpenROAD-flow-scripts/flow/platforms/sky130hd/lib/sky130_fd_sc_hd__tt_025C_1v80.lib bitflow/orfs-klayout:1 \
  bash -c 'source /OpenROAD-flow-scripts/env.sh >/dev/null 2>&1; openroad -no_init -no_splash -exit /s/sdf.tcl 2>&1 | grep -iE "wrote|error|warn" | head -5'
# Icarus from Ubuntu in a throwaway container (spike only)
docker run --rm -v "$R":/r -v "$S":/s:ro -v "$M":/m:ro -w /r ubuntu:26.04 bash -c "
  apt-get update -qq >/dev/null && apt-get install -y -qq iverilog >/dev/null 2>&1; iverilog -V 2>&1 | head -1
  iverilog -g2012 -gspecify -DHALF=$HALF -DW=$WIDTH -o /tmp/sim /m/primitives.v /m/hd.v /r/6_final.v /s/tb_counter.v 2>&1 | grep -v -i 'warning: .*timescale' | head -8
  timeout 120 vvp -n /tmp/sim 2>&1 | grep -vE '^\s*$' | head -40"
