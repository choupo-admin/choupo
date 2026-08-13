# CLAUDE.md -- Choupo case: steady/acetone02_luyben_reactor

You are helping AUTHOR this Choupo **case** (the dicts under `system/`,
`constant/` and `0/`), NOT editing the C++ engine.

Programme record:
[`docs/design/acetone-ipa-reference-case.md`](../../../../docs/design/acetone-ipa-reference-case.md).
Sibling: `tutorials/props/compare/acetone01_ipa_water_azeotrope` (the
thermodynamics of the same plant, measured).

## Intent (this case) -- keep this updated as the project develops

- **Goal:** the first PROCESS slice of Luyben's acetone flowsheet. One unit,
  chosen because its answer does not depend on the mixture thermodynamics:
  at 623 K everything is vapour and no activity model is consulted. What is
  exercised is stoichiometry, the elements-datum heat of reaction, and the
  energy balance.

- **The feed is derived from the paper's own stream table** (arithmetic in the
  `flowsheetDict` header) and closes on Luyben's stated total to 0.02 % and on
  his stated conversion to 0.0 %. Two independent checks on a hand
  transcription.

### What it found, measured 2026-08-12

**1. The stoichiometry closes exactly.** Rout matches Luyben's four mole
fractions to five figures. This is *not* validation and the golden says so:
the feed was derived from that same table, so the agreement verifies the
stoichiometry and the transcription, not the model. Anchoring it would be the
LiCl circularity.

**2. The heat of reaction is 22.5 % below the paper's.**

| | value |
|---|---|
| Luyben (2011), stated | **62.9 kJ/mol** |
| Choupo, derived from formation data | **48.72 kJ/mol** |

Choupo never reads a `dH_rxn` key — it derives the heat from each species'
own `standardThermochemistry`, and **isopropanol's is a Joback estimate**
(`dHf_298 = −262.76 kJ/mol`) because Choupo has no curated isopropanol.
Acetone's and hydrogen's are curated. So the whole 14.2 kJ/mol gap is carried
by one estimated number, and it propagates straight into a furnace duty.

*This is the multi-scale point the sibling case makes on the VLE side, on the
energy axis instead: an approximation made at the component level is still
alive several units later.* A curated isopropanol would close most of it.

**No `anchor` row was authored for the 62.9**, deliberately. An anchor whose
band cannot admit the observed value would put the suite in the red, and the
rule is *report, never tune*. The disagreement is reported here and in the
programme record; it becomes an anchor the day isopropanol is curated.

**3. AN ENGINE DEFECT, found by the first-law report, reproduced — and FIXED
on 2026-08-13.  Both states are kept, because the sequence is the record.**

*What the run used to raise:*

> `ENERGY balance, unit 'reactor': dH = 1442.4 kW vs declared items 470.5 kW
> (306.6 % closure) — An UNEXPLAINED first-law residual`

`conversionReactor` reported `Q_kW` = **the reaction enthalpy alone**
(extent × ΔH_rxn = 34.767 kmol/h × 48.7173 kJ/mol = 470.49 kW, exact) while
declaring an **outlet temperature**. The heat needed to bring the feed to that
temperature was simply absent. It was reproduced by sweeping the inlet
temperature and watching the declared duty *not move*:

| T_in | vf_in | Q declared | ΔH of the streams | residual |
|---|---|---|---|---|
| 389 K | 0.00 | 470.49 kW | 1442.44 kW | 971.95 kW |
| 420 K | 0.00 | 470.49 kW | 1357.40 kW | 886.92 kW |
| 450 K | 0.00 | 470.49 kW | 1266.26 kW | 795.78 kW |

**A duty that is invariant to the inlet state is not a duty.** Everywhere else
in this engine `Q_kW` on a unit means the heat crossing its boundary.

*What it is now.* `Q_kW` is the first law over the unit,
Σn_out·h(T_out) − Σn_in·h(T_in), published beside its two exact parts:

> `dH_rxn = 48.7 kJ/mol -> duty Q = 840.3 kW  (net added)`
> `  = reaction 470.5 kW at 623.00 K + sensible 369.8 kW heating the feed from 389.00 K`

The split is Hess's law and is exact, not an apportionment. Against Luyben's
reactor duty of **0.960 MW** this case now reads **0.840 MW — 87.5 %**, where
it read **49 %** before. Nothing was tuned; a term that belonged in the sum
was put in it.

**Only one case in the corpus moved**, and that is the check on the change:
every other reactor is fed at its own temperature, where the new term is
identically zero, so their numbers are byte-identical. `tutorials/plant/hda`
moved from −1338 kW to **+18723 kW**, which is not a regression but the same
defect at plant scale — its flowsheet has no feed preheater, so the reactor
itself is heating 2122 kmol/h from 330 K to 900 K, and the old number hid a
20 MW furnace load.

*What is still open, and it is now NAMED rather than lumped.* The residual did
not go to zero — it went from 972 kW to **602 kW** — and the run says why, at
the site:

> `[rating] the duty above is priced on the IDEAL-GAS rung (this reactor is
> gas-basis and emits vf = 1) while this inlet arrives at vf = 0.00 — the
> sensible term omits its latent heat`

That is checkable rather than asserted: 602.18 kW over 57.82 kmol/h is
**37.5 kJ/mol**, against a feed whose components carry ΔH_vap of 38.6
(isopropanol) and ~40.6 (water) kJ/mol at their boiling points. **The residual
is the vaporisation of the feed**, to the accuracy the arithmetic allows.

Closing it means deciding what a gas-basis reactor should do with a liquid
inlet — price the latent heat itself, or refuse the inlet — and that is a
question about the unit's phase contract, not about its duty. It is left
open, announced, and no longer inside a number.

- **Pending / in curation:**
  - a curated `isopropanol` in `data/standards/` (would close most of the
    ΔH_rxn gap) — Vítor's call, curation is reserved;
  - the gas-basis reactor's LIQUID INLET (§3): the duty is now the first
    law on the ideal-gas rung and the remaining 602 kW residual is the
    feed's latent heat, announced at its site and not yet priced;
  - the reactor's SIZE: Luyben specifies 450 tubes and a 624 K jacket, but the
    design record has no tube dimensions, so a `pfr` on his kinetics cannot be
    dimensioned from what is in hand. The kinetics are transcribed in the
    record and deliberately unused here.
