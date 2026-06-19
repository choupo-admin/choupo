# `tutorials/props/` — the property bench (`choupoProps`)

`choupoProps` is the bench where a student **builds and decides the thermo
foundation** of a process *before* wiring a flowsheet: create a component,
see how a model tracks real data, test the data itself, fit parameters, and
carry a curated component file into the simulation.  It is the
glass-box answer to "click a method and hope" — every choice is made
from **visible evidence**, never a "recommended" badge.

The GUI (`gui/`) shows all of this in ONE props surface (a pill strip:
*Foundation / thermo-readiness* first, then *Comparison / Consistency /
Estimate / Fit / …*).  The dicts on disk are the source of truth; the GUI is a
runner + visualiser, not an editor.

## The journey

```
CREATE ──▶ SEE ──▶ TEST ──▶ FIT ──▶ PROMOTE ──▶ USE
```

| Step | What you do | Cases here |
|---|---|---|
| **CREATE** | Build a pure-component property set from molecular groups (Joback) and SEE its error vs a reference | `estimate_acetone`, `estimate_ethanol_benzene` |
| **SEE** | Overlay model curves on the **measured** data and pick the model that passes through the points | `compare_vle_etoh_water`, `compare_kinetics_order`, `compare_activity_etoh_water`, `compare_eos_co2`, `compare_visc_liquid_water` |
| **TEST** | Test the *data* for thermodynamic consistency before trusting any model fitted to it (Herington area + Gibbs-Duhem) | `compare_vle_etoh_water` (its `vleConsistency` op) |
| **FIT** | Levenberg-Marquardt regression of a model's parameters against your data, with identifiability stats | `old/fitNRTL01_ethanol_water` |
| **PROMOTE** | Write the estimate as a reviewable component `.dat` (`output { proposal auto; }`) → `constant/components/<name>.estimate-<date>.dat` | any `estimate_*` |
| **USE** | Promote the file (`mv … <name>.dat`) and run a solve on it | (see *Promote & use*, below) |

## Running a case

From the repo root:

```bash
./choupoProps tutorials/props/estimate/estimate_acetone          # CREATE: Joback estimate
./choupoProps tutorials/props/compare/compare_vle_etoh_water     # SEE + TEST: Txy overlay + consistency
./choupoProps tutorials/props/compare/compare_kinetics_order     # SEE: rate-law order vs data
```

A composite plant curates **per sector** — each sector has its own `propsDict`
and runs on its own (the `controlDict`/`thermoPackage` cascade UP the tree):

```bash
./choupoProps tutorials/plant/esterification2sector/REACTION    # sector 1 (kinetics)
./choupoProps tutorials/plant/esterification2sector/SEPARATION  # sector 2 (NRTL pair + consistency)
```

## Datasets (raw lab data)

Measured data lives in the case under `constant/experiments/<name>.dat` (a
plain-text dict, **not** a CSV) and is referenced by a comparison's
`experimental { … dataset "constant/experiments/<name>"; }` block.  The bench
echoes it back as `exp_<name>.csv` so the GUI overlays it as red points.

## Promote & use (CREATE → USE)

An `estimateComponent` op with `output { proposal auto; }` writes
`constant/components/<name>.estimate-<date>.dat` — a glass-box file with the
keys Joback gives **active** (MW, Tc, Pc, ω, Tb, HvapTb, Cp_ig → usable for the
EoS + energy balances) and the **gaps** it cannot (Vliq, vapour pressure,
`gibbsFormation.s_298`) as commented TODOs.  In the GUI, the *Estimate* pill
previews the file and offers a dated download.

Promotion is a deliberate act — the file's header prints the `mv`:

```bash
mv constant/components/<name>.estimate-<date>.dat  constant/components/<name>.dat
```

This overrides the component **for that case only**; the curated
`data/standards/` catalogue is FROZEN (committee-managed + audited) and the
bench refuses to write there.  An estimate is meant for a component the
catalogue LACKS; if it carries unfilled gaps, the engine says so loudly at load
(`[estimate]`, `[overlay]`, `[backfill]`), and a case that needs VLE/flash on a
gap-bearing estimate fails with a component-aware message telling you to fit
the missing vapour pressure (`vaporPressureFit`) first.

## `old/`

Pre-2026 single-model tutorials, kept as golden-master regression fodder and as
a reference for what the engine can do (it includes the canonical
`fitNRTL01_ethanol_water` fit case).  Not the guide on how to use the bench.

## Authoring

You should not hand-write a `propsDict`.  Describe the question in plain
language to an LLM; it consults `docs/ai/` + the cases here, writes the dicts,
runs `choupoProps`, and reports.  You inspect the GUI for the visual sanity
check and decide.  See `AGENTS.md` and `docs/ai/overview.md`.
