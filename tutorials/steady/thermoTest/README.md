# thermoTest — one system, five thermophysical models

**System: {NaCl, CaSO₄, ethanol, water}.** The same four substances run through
five unit operations, each selecting a *different* property model. The point is
the architecture lesson: **a substance has no fixed "kind" — the `propertyPackage`
a case selects chooses how much of its physics to resolve** (see
[`docs/architecture/electrolyte-data-architecture.md`](../../../docs/architecture/electrolyte-data-architecture.md)).

Nothing here ships a case-local data copy: like OpenFOAM, a case *selects* from the
versioned standard catalogue (`package aqueousNaCl_pitzer;`) — the Choupo version
is the reproducibility guarantee, so the full self-contained snapshot is not needed.

| # | subcase | operation | model | the salt's role | key result |
|---|---------|-----------|-------|-----------------|------------|
| 1 | `steady/thermoTest/model1_lumped_evaporator` | evaporator | ideal | **lumped** (one molecule) | BPE = **2.11 K** (van't Hoff K_b·m) |
| 2 | `steady/thermoTest/model2_pitzer_evaporator` | evaporator | Pitzer | **dissociated** Na⁺+Cl⁻, aqueous ref | BPE = **5.07 K** (real a_w) |
| 3 | `steady/thermoTest/model3_enrtl_antisolvent_crystalliser` | antisolvent crystalliser | eNRTL | dissociated, **mixed solvent** (+ethanol) | yield ≈ **0.61**, NaCl crystals |
| 4 | `props/thermoTest/model4_speciation_scaling` | speciation + scaling scan | Pitzer-HMW (mandatory at I≈3) | **multi-ion broth** (shared Na,Cl,Ca,SO₄) | SI_gypsum≈0; gypsum scales at r≈0.035, halite at r≈0.50 |
| 5 | `steady/thermoTest/model5_nrtl_flash` | isothermal VLE flash | NRTL | **molecular** (no salt: water+ethanol) | V=38 kmol/h @ 353 K |

## The two lessons to read side by side

**Representation + non-ideality (models 1 vs 2).** *Same evaporator, same 3 mol/kg
brine.* model1 treats NaCl as **one lumped particle** (van't Hoff i=1) → BPE
2.11 K. model2 **dissociates** it (Na⁺+Cl⁻) *and* uses the real Pitzer water
activity → BPE 5.07 K. Read honestly, that jump combines **two** effects, and it
is worth separating them:
- *representation* (1 particle → 2 ions): the ideal van't Hoff BPE with ν=2 would
  be ≈ **4.2 K** (K_b·m·ν) — dissociation alone nearly doubles the ideal 2.11 K;
- *non-ideality* (ideal a_w → Pitzer a_w): Pitzer adds the rest, 4.2 → **5.07 K**.

So the package chooses both *how deep to resolve the salt* and *which activity
model*. (Choupo has no "dissociated-but-ideal" evaporator model to ship the
middle rung as its own case — the ≈4.2 K is the analytic van't Hoff value, quoted
so the two effects don't hide inside one number.)

**The salt dissolves, precipitates, and disappears into ions (models 2→3→4).**
- model 2: NaCl dissolved, one salt, activity (γ±, a_w, BPE).
- model 3: NaCl **precipitates** when ethanol (the antisolvent) drops the
  solubility — mixed-solvent eNRTL, a real crystalliser yield.
- model 4: add CaSO₄ and there are no salts any more, only the shared ion pool
  Na⁺/Cl⁻/Ca²⁺/SO₄²⁻ (+ the neutral pair CaSO₄aq). The engine reports saturation
  indices; concentrating the brine scales gypsum first (r≈0.035), then halite
  (r≈0.50). Pitzer-HMW is **mandatory** at I≈3 — the Davies law (valid only to
  I≈0.5) would report meaningless SI, so the model is declared, never defaulted.

model 5 is the same water + ethanol from model 3, now in their *own* role —
separated by distillation. The antisolvent has to be recovered somehow.

**model 6 (advanced, existing): the cross-method recycle.** The one seam these
five isolated cases do *not* exercise is a stream crossing a model boundary inside
a recycle. That is exactly what
[`tutorials/steady/crystallisation/crystalliser09_dignified`](../../crystallisation/crystalliser09_dignified/)
does: an antisolvent crystalliser on the **eNRTL** global package feeds a solvent-
recovery distillation carrying its **own NRTL** model (a per-unit `thermo{}`
override), and the recovered ethanol **recycles** back (Newton tear). It prints
the **model-boundary audit** — "H conserved; T is the model-dependent readout" —
which is where the architecture's central claim (reference lives in the method)
is actually put under load. Read that case once you have the five above.

## Run them

```bash
runCase tutorials/steady/thermoTest/model1_lumped_evaporator
runCase tutorials/steady/thermoTest/model2_pitzer_evaporator      # compare the BPE
runCase tutorials/steady/thermoTest/model3_enrtl_antisolvent_crystalliser
runCase tutorials/props/thermoTest/model4_speciation_scaling      # choupoProps
runCase tutorials/steady/thermoTest/model5_nrtl_flash
```

Each ships a golden `expected`; `bin/runTests` validates all five.
