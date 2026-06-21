# `h2o2_synthetic` — a SYNTHETIC H₂/O₂ skeletal mechanism (UNVERIFIED tier)

This is **not** a literature mechanism. It is a hand-authored, illustrative
chain-branching reaction set whose only job is to exercise Choupo's detailed-
kinetics machinery (modified-Arrhenius / third-body / fall-off rate forms and
the stiff Rosenbrock23 integrator) on a problem that actually *is* stiff.

## What is real and what is not

| part | status | source |
|---|---|---|
| species thermo (Cp, Hf, S of H2 O2 H O OH HO2 H2O2 water N2) | **REAL, curated** | `data/standards/components/*.dat`, each value individually cited |
| equilibrium / heat release / burned temperature | **REAL** (follows from the thermo) | as above |
| reaction rate constants (A, b, Ea) | **SYNTHETIC / ILLUSTRATIVE** | hand-chosen; **no published source** |
| the reaction *set* (which elementary steps) | textbook chain-branching skeleton | structure only, no rates |

The split is deliberate: **where the system ends up is curated physics; how fast
it gets there is illustrative.** A τ_ign computed with these rates is qualitative
only.

## Why not a real mechanism?

Every widely-used H₂/O₂ mechanism (GRI-Mech, USC-Mech, FFCM, Ó Conaire 2004,
Burke 2012, San Diego, …) is distributed *all-rights-reserved / cite-to-use* —
none grants redistribution. Choupo's data policy excludes no-grant sources
(same bucket as DIPPR / NIST-SRD), so none can be bundled. Transcribing one by
hand from a fetched copy risks both a licence breach and transcription error.
The honest interim is this clearly-labelled synthetic set; see `SOURCES.md`.

## To promote this to a real mechanism

Replace the rate constants in `reactions` with a curated literature set
(transcribed from the primary paper, cited per reaction), verify the ignition
delay against a reference (e.g. a shock-tube τ_ign correlation), then move the
file to `data/standards/mechanisms/` per the normal curation lifecycle. Until
then it stays here, in `data/proposed/`, where the solver flags it.

## Used by

`tutorials/batch/combustion/ignition01_h2o2` (and its RK4-fails sibling).
