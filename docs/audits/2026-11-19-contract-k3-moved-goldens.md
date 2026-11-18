# Contract K3 (several named parameter sets per pair): moved goldens

No golden row moved, and none was re-recorded.  The only new golden is the
witness case's own (`tutorials/props/molecular/pairSets01_butanol_water_two_sets`,
recorded with `bin/runTests --record`, first record).

Why nothing can move: a pair record with one unnamed `parameters` block is
returned by `pairsets::resolve` as the very same dictionary (the set `default`);
the `set` field of a pair resolution stays empty for it, so the resolved view,
the identity hash of the package, the `[builder]` line and the result JSON
print exactly what they printed before.  The proof is the scope run in the
slice report (every case that reads an NRTL, UNIQUAC or Wilson pair).
