# Contract K3 (several named parameter sets per pair): moved goldens

No golden row moved, and none was re-recorded.  No golden was added either: the
witness is a gate probe (`check_record_form`, arm pair-sets), not a shipped case.

Why nothing can move: a pair record with one unnamed `parameters` block is
returned by `pairsets::resolve` as the very same dictionary (the set `default`);
the `set` field of a pair resolution stays empty for it, so the resolved view,
the identity hash of the package, the `[builder]` line and the result JSON
print exactly what they printed before.  The proof is the scope run in the
slice report (every case that reads an NRTL, UNIQUAC or Wilson pair).
