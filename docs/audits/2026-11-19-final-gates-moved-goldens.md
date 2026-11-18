# Final gates (2026-11-19): moved goldens

No golden row moved.  The five red gates of the integrated batch were repaired
in the gates and their probes (bin/choupo-import, bin/curate/golden_bands.py,
check_spray_dryer_solvents, check_transport_correlations, check_ed_batch,
check_review_status, check_view_matches_calls); no engine source, no case and
no `expected` file was touched.

What the ED gate's repair shows is a measured physical fact, not a moved row:
since the property door the stack turns ed03's diluate stream (175 kg/h of
water plus 0.1 mol/kg of ions) into 175.51 L/h, because the door prices the
solution at rho_water (1 + w) and the (1 + w) cancels.  The batch rig declares
175 L/h.  The 1000 kg/m3 constant the unit used to assume made the two equal by
construction; the gate now compares them at the same flow.
