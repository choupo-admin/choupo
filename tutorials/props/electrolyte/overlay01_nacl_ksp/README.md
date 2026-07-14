# overlay01 — partial deep-merge of one Ksp datum

A case recalibrates ONLY the halite equilibrium `logK25` (1.60 here) to its own
value, via a case-local `constant/components/NaCl.dat` declaring `overlayOf NaCl;`.

The reader **deep-merges** this delta over the standard `components/NaCl.dat`:
only `solidPhases.halite.equilibrium.logK25` is replaced; `dH`, the
`dissolutionReaction`, the `calorimetric` anchor and the `crystal` block all
still resolve from the standard record. The run prints the provenance:

```
[overlay] NaCl: deep-merge of 1 leaf(s) from caseOverlay .../constant/components/NaCl.dat
          (all other values from standard .../data/standards/components/NaCl.dat):
          solidPhases.halite.equilibrium.logK25
```

This is the roadmap Phase A acceptance test: a case ships ONLY its deltas, never
a second competing complete record, and per-value provenance (tier + file) is
preserved.
