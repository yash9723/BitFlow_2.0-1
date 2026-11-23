# Spike: write an SDF of the routed delays (typical corner) for gate-level timing simulation.
#   env: RESULTS (6_final.odb/.sdc/.spef), LIB, OUT
read_liberty $::env(LIB)
read_db $::env(RESULTS)/6_final.odb
read_sdc $::env(RESULTS)/6_final.sdc
read_spef $::env(RESULTS)/6_final.spef
write_sdf $::env(OUT)
puts "wrote $::env(OUT)"
