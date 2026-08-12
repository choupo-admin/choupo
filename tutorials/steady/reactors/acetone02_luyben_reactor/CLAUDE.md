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

**3. AN ENGINE DEFECT, found by the first-law report and reproduced.**

The run raises:

> `ENERGY balance, unit 'reactor': dH = 1442.4 kW vs declared items 470.5 kW
> (306.6 % closure) — An UNEXPLAINED first-law residual`

It is not a case error. `conversionReactor` reports `Q_kW` = **the reaction
enthalpy alone** (extent × ΔH_rxn = 34.767 kmol/h × 48.7173 kJ/mol =
470.49 kW, exact), while declaring an **outlet temperature**. The heat needed
to bring the feed from its inlet state to that temperature — sensible, and
here also latent — is simply absent from the declared duty.

Reproduced by sweeping the inlet temperature; the declared duty does not move:

| T_in | vf_in | Q declared | ΔH of the streams | residual |
|---|---|---|---|---|
| 389 K | 0.00 | 470.49 kW | 1442.44 kW | 971.95 kW |
| 420 K | 0.00 | 470.49 kW | 1357.40 kW | 886.92 kW |
| 450 K | 0.00 | 470.49 kW | 1266.26 kW | 795.78 kW |

A duty that is invariant to the inlet state is not a duty. Everywhere else in
this engine `Q_kW` on a unit means the heat crossing its boundary (that is
what the flash, the heater and the energy report all mean by it), so the
reactor is inconsistent with its own vocabulary — and the report is right to
alarm.

Why it was never seen: the existing corpus reactors either carry no formation
data (so no `Q` is reported at all — `chlorophenol01`) or are fed at the
reactor temperature, where the missing term is zero.

**NOT FIXED HERE.** Changing what a reactor's `Q_kW` means moves duties, and
possibly goldens, across every reacting case in the corpus. That is a
physics-affecting change and it is measured and reported before it is made.
The alarm is left standing and explained rather than silenced: a visible gap
is strictly better than an invisible falsehood.

- **Pending / in curation:**
  - a curated `isopropanol` in `data/standards/` (would close most of the
    ΔH_rxn gap) — Vítor's call, curation is reserved;
  - the `conversionReactor` duty defect above;
  - the reactor's SIZE: Luyben specifies 450 tubes and a 624 K jacket, but the
    design record has no tube dimensions, so a `pfr` on his kinetics cannot be
    dimensioned from what is in hand. The kinetics are transcribed in the
    record and deliberately unused here.
