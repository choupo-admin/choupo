# SUMMARY — data/tmp staging (phases A-D closed, 2026-07-24)

57 candidate components, **225 structured records** in arity-correct homes, all in
the PRIVATE gitignored tier.  Nothing promoted, no C++/reader/standards/tutorials
touched.  Read `CAPABILITY_MATRIX.md` for the per-compound view.

## Records by type (225)
| type | home | n |
|---|---|---|
| acidDissociation | chemistry/aqueousSpeciation | 59 |
| diffusionCoefficient | parameters/transport/diffusion | 41 |
| solubility | parameters/solubility | 38 |
| partitionCoefficient | parameters/partition | 34 |
| cosmoSurface (evidence) | evidence/lvpp-* | 33 |
| isoelectricPoint (derived) | chemistry/aqueousSpeciation | 9 |
| partialMolarVolume | parameters/volume | 6 |
| hydrodynamicRadius (measured) | parameters/transport/diffusion | 2 |
| henrysLawConstant | parameters/henry | 2 |
| organicCarbonPartition | parameters/soilPartition | 1 |

Status across all records: **55 candidate · 169 flagged · 1 unverified**.

> **CORRECTION 2026-07-24 — `rightsPending 0` was NOT factual.**  The advisor ruled
> that `Exploring QSAR` (Hansch, Leo & Hoekman, ACS 1995) is a protected monograph
> acting as a compilation: neither its 15 values nor its table's selection/arrangement
> may be the source of record.  It may be used ONLY as a bibliographic lead, and a
> record is cleared only after the cited PRIMARY has been obtained, READ, and its
> value/definition/T/pH-form/units confirmed — the record then cites the primary,
> never Hansch.  **Until that chain completes, those 15 records revert to
> `rightsPending`.**  The same applies to the 4 records whose sole source is HMDB:
> a public page plus a citation obligation is not a GPL-compatible redistribution
> licence.  So the legal gate is **NOT closed** — re-routing is in progress.

## PHASE D — rights clearance (the legal blocker is CLOSED)
`status rightsPending` across every record and component: **21 -> 0**.
Actions: 6 re-routed to a legally clear source at the same value, 3 REPLACED
(the open primary reported a *different* number), 48 numbers DELETED with a
structured absence, 19 reclassified (they were declared gaps mislabelled as legal
blockers -- PC-SAFT placeholders holding no number at all).

**Re-routing changed the physics, not just the licence:**
- `estradiol` pKa: the stated route (Lewis & Archer, Steroids 34 (1979) 485) reports
  **10.71**, not the DrugBank 10.46 that was in the file. The CC BY-NC value is
  demoted to `crossCheck{}`.
- `atrazine` pKa 1.60 -> **1.68** (ATSDR Table 4-2, US public domain).
- `diuron` solubility 37.4 -> **42 mg/L**; `simazine` T 20 -> 22 C and lost a
  "pH 7" framing that came from the withdrawn source.
- `nPropanol` and `alphaPinene` Tb re-routed by DERIVATION from the primary Antoine
  set already in the file -- same value, legally clean, no new source needed.

**The honest cost:** 48 numbers were deleted rather than shipped illegally --
the 8 sugar/polyol aqueous solubilities (Merck Index only), 4 NSAID pKa
(Sangster/LOGKOW), 9 handbook densities and every molar volume derived from them
("a derivative cannot outlive its datum"), 7 melting points, 6 specific rotations.
Every deletion carries `blockedBy` + `action` + a `droppedValue` audit line.

## Solubility: the polymorph question, answered where it could be
Solid phase RESOLVED for 8 of 38 -- carbamazepine **dihydrate**, caffeine **hydrate**,
lactose **alpha-monohydrate**, trehalose **dihydrate** (the last two prove the
component files' "anhydrous" declaration wrong), mannitol **beta**, PFOS/PFBS the
**potassium salt** (participants corrected, records renamed), PFBA **no solid at all**
(mp -17.5 C -> re-typed as liquid-liquid).  A three-tier `phaseBasis` vocabulary was
introduced (`statedBySource` / `inferredFromPhaseStability` / `notEstablished`) in
which an INFERRED phase never promotes a digit.  Only 2 records reached `candidate`.

## New homes created
`parameters/henry/` (PFOA, PFBA -- ATSDR public domain, flagged on PHYSICS: they are
neutral-acid constants while the anion dominates at process pH) and
`parameters/soilPartition/` (PFBS logKoc -- not an octanol-water partition; the second
phase is heterogeneous soil organic matter, so it could not honestly share that home).

## Capability roll-up (what the data can actually support)
| capability | candidate | flagged | none |
|---|---|---|---|
| aqueous membrane transport | 10 | 31 | 16 |
| speciation (pKa) | 10 | 28 | 19 |
| octanol-water partition | 23 | 10 | 24 |
| aqueous solubility (SLE) | 1 | 32 | 24 |
| partial molar volume | 3 | 3 | 51 |
| Henry / soil partition | 0 | 3 | 54 |

- **identity**: **FIXED 2026-07-24** — 56 / 57 now carry the FULL InChIKey
  (batch PubChem re-fetch by CID; declared formula cross-checked against PubChem
  for all 57: **0 divergences**).  The one remaining is `fructose`, whose
  anomer/tautomer is genuinely unresolved (beta-D-fructopyranose in the crystal vs a
  furanose/pyranose/open-chain equilibrium in water) and is left flagged rather than
  papered over.  Key-based joins are now safe except for that one.
- **pure thermochemistry**: 22 / 57 carry a real phase-declared datum.
- **gamma-phi (Antoine + Tc + Pc + omega)**: **0 of 57 complete** (phase 7). The uniform
  blocker is Pc + omega -- unavailable from any OPEN primary (paywalled Steele-Chirico,
  Ambrose-Townsend); nPropanol's Pc is only a NIST average (barred). My earlier
  "nPropanol COMPLETE" was WRONG.
- **PC-SAFT**: exactly **1** transportable-shaped set (nPropanol, Gross & Sadowski
  2002) and even that has FLAGged combining rules / objective function / data range
  / site conventions.  17 files carry a NAMED SET BLOCK, but the other 16 are
  flagged/rightsPending placeholders, not parameters.  18 rightsPending, 38 flagged.
- **COSMO-SAC**: 33 raw surfaces staged as EVIDENCE, **0 deployable profiles** —
  and phase E now proves that is the RIGHT answer, on measured grounds
  (`COSMO_VALIDATION_STUDY.md`).  The averaging tooling was built and CONTROLLED:
  the NIST reference `.cosmo` turned out to be the source file of Choupo's own
  shipped VT-2005 ethanol, and the script reproduces that shipped profile to
  **0.10 % integrated deviation** — so the tool IS the VT-2005 pipeline and every
  other difference is a property of the DATA.  Measured on a 15-compound panel:
  LVPP profiles would **load into the C++ without complaint** (area conserved to
  machine precision, correctly normalised) — *that is the danger* — yet
  **<sigma^2> is lower for all 15 by 5-41 % (mean -20.4 %)**, HB-active area ~22 %
  smaller, and profile shape deviates **170x to 580x the control**.  No `r_av`
  reconciles them (per-compound fitted values span 19x; CS2 has no solution).
  Consequence, verified to 4.4e-09 against `choupoProps`: swapping the set alone
  moves gamma by -11.9 % (water/ethanol), **-64.4 %** (gamma-inf water in n-hexane,
  1052 -> 375) and **-79.4 %** for water in acetone, where **the sign of G^E flips**.
  NOTE: the earlier "+6.1 % area" justification was an ETHYLENE ACCIDENT — area
  differs by only -0.6..+6.6 % with no consistent sign.  The real basis is sigma^2,
  shape and the gamma consequence.  An `LVPP` set is generatable but must NEVER
  carry `variant "2002"`; it needs its own runtime variant, which for CS25 means a
  NEW `ActivityModel` subclass the current `sigmaProfile ( 51 values );` grammar
  cannot even express.
- **legal**: **0 records remain `rightsPending`** (was 31/57 touched). 38 mis-marked
  values found by the legal sweep were re-routed, replaced or deleted.

## Deterministic audit — CLEAN
Brace balance, ASCII-only, `recordType`/`status`/`participants`/`provenance` present
on every record, and **zero dangling pointers** from a component to a non-existent
`recordId`.  (35 "recordId != filename" hits are naming-order/`evidence/<id>/metadata.dat`
false positives, verified.)

## What the audit CAUGHT (the real yield of this phase)
Data defects that would have silently poisoned results:
- `HvapTb` misused in 5 volatiles (values far from Tb); limonene's ideal-gas dHf was
  a STORED DERIVATIVE (arity-1 violation); levulinicAcid `Tfus` was an INVENTED
  midpoint of a 1897 and a 1906 value.
- alanine asserted THREE conflicting speciation sets; caffeine was missing an entire
  dissociation step; serine carried two Cp; lysine Cp is a physical outlier.
- erythritol's dHf is cited to a paper about LIQUID polyols but used as the
  crystalline datum (same trap that produced the xylitol defect).
- erythritol's "measured radius" was for concentrated droplets, not infinite dilution;
  galactose/arabinose/trehalose D_aq were analogue surrogates presented as measured.
- metformin's melting point is the HYDROCHLORIDE's, the record is the free base;
  PFOS/PFBS solubility is the potassium SALT; PFBA is a LIQUID at 25 C (not an SLE);
  NDMA `role nonvolatile` contradicts its own bp ~152 C.
- atrazine carried an uncited Stokes radius and an uncited "NF270 rejection 81-98 %"
  (a membrane+solute+conditions RESULT masquerading as a property).
Legal defects:
- estradiol's pKa came only from DrugBank (**CC BY-NC**) — excluded by CLAUDE.md.
- several retained values were NIST WebBook **averages of N** — that is the
  aggregator's ARRANGEMENT, not a fact → `[FLAG -- AGGREGATE]`; CRC-traced values
  → `rightsPending`.

## Known structural gaps
- `parameters/henry/` and `parameters/soilPartition/` now EXIST (created phase D).
- **`role` vocabulary gap (ENGINE, not data)** — `role` is a closed 4-word enum;
  `nonvolatile`/`radical` set **K = 0 with no warning** in both K-value paths, and
  `role solute` computes K = H(T)/P yet the constructor still DEMANDS an Antoine set
  (validation stricter than the physics).  `limonene`, which declares the honest role,
  is currently **unloadable**.  52/57 declare `nonvolatile`, 14 admitting in prose it
  is a "case role, not the physics".  Proposal in `_ROLE_VOCABULARY_GAP.md`.
- **Hansch, Leo & Hoekman, *Exploring QSAR* (ACS 1995)** backs 15 `candidate`
  partition records and is the ONLY support for the whole hormone/EDC partition
  capability.  It is a copyrighted monograph structurally like the excluded LOGKOW
  Databank.  **Needs Vitor's ruling** — excluding it collapses that capability.

## Promotion verdict
**Promote NOTHING yet**, but the two hardest gates are now closed:
- identity **CLOSED** (56/57 full InChIKeys, formula-verified, 0 divergences);
- legal **PARTLY closed** — 21 original `rightsPending` were cleared, but 15
  Hansch-backed + 4 HMDB-backed records REOPEN as `rightsPending` until each cited
  primary is independently obtained and read (advisor ruling).  This gates the whole
  hormone/EDC partition capability.

Remaining, in order:
1. **Hansch ruling** (Vitor) — gates 15 partition records incl. all hormone/EDC.
2. **solubility**: only 2/38 reached `candidate`; 30 still have no established solid
   phase.  This is a literature problem, not a transcription one.
3. **PC-SAFT**: the single set is still not transportable.
4. **COSMO**: ANSWERED (phase E).  Tooling built + externally controlled; the LVPP
   set is generatable but incompatible with `cosmoSAC2002` on measured grounds.
   Shipping it would silently change gamma by up to 79 % and flip the sign of G^E.
   The `flagged` ruling STANDS, now on a decisive basis.  A real `LVPP` capability
   is an ENGINE decision (new variant + new ActivityModel subclass), yours to make.
5. **`role` vocabulary** — an ENGINE change, deliberately not made here.
6. `fructose` anomer unresolved.


## ADVISOR RULINGS APPLIED — 2026-07-24
1. **Hansch / HMDB**: bibliographic lead only; a record is cleared only after the
   PRIMARY is obtained, read and confirmed (value, definition, T, pH/chemical form,
   units) and cites that primary.  Unfinished ones revert to `rightsPending`.
2. **`role`**: the finding is confirmed but must NOT be fixed with a 5th enum value —
   that would be "a curation state disguised as a physical role", the new parking lot
   for gaps.  It is registered as a **runtime P0 for the first gate AFTER `data/tmp`
   closes**; no C++ was touched.  The architectural fix is to separate three axes —
   *intrinsic phase evidence* | *case phase declaration* | *equilibrium route*
   (Raoult/Psat | EOS | Henry(pair) | chemical equilibrium | excluded) — with the
   Henry route requiring the Henry pair and NOT Antoine, and missing data refusing
   LOUDLY instead of yielding `K = 0`.
   **Applied here**: all 57 `role` declarations were withdrawn and replaced by a
   structured `phaseBehaviour {}` + an explicit `intendedCaseUse`.  3 files
   (PFBA, PFOA, furfurylAlcohol) are marked `contradictsStagedRole yes` — their own
   contents prove the staged `nonvolatile` false.
3. **COSMO-SAC / LVPP**: closed for runtime, preserved as research.  All 33 evidence
   records now carry `status incompatibleWithCosmoSAC2002` + an `incompatibilityBasis`
   block with the measured numbers.  No 51-point profile was written into any
   component and no runtime variant was created.  A real LVPP capability is a later
   MODEL project (its own formulation, regressions and goldens), not a DB-enrichment
   task — and the class must not be chosen before the mathematical contract is written.
   For now: **VT2005-only**.

---

# FINAL COUNTS — advisor's 5-category vocabulary (2026-07-24)

228 records.  A record is `verified` only when its status is `candidate` AND its
origin is `measured`; `derived` when the value is computed from another datum;
`flagged` when present with a stated defect; `rightsPending` when its source is not
redistributable; `absent` when the number was deliberately deleted and replaced by a
structured absence.

| category | n |
|---|---|
| verified | **32** |
| derived | 8 |
| flagged | **154** |
| rightsPending | **19** |
| absent | 15 |

## Audit — CLEAN
0 structural defects (braces/ASCII) · 0 dangling pointers · 0 records without
`provenance` · 0 records without declared `participants` (arity) · 57 per-component
dossiers regenerated.

## The advisor's 5-item closing order — done
1. **Hansch / HMDB reopened**: partition `candidate` 24 -> 5, 19 records back to
   `rightsPending`.  The primary was **not identifiable for any of the 15** Hansch
   values.  **The hormone/EDC partition capability is gone** — all six steroids plus
   bisphenolA rested on it.
2. **False `role`s removed**: all 57 withdrawn, replaced by structured
   `phaseBehaviour {}` + `intendedCaseUse`; 3 (PFBA, PFOA, furfurylAlcohol) marked
   `contradictsStagedRole yes` by their own contents.  Runtime P0 documented; no C++.
3. **COSMO LVPP**: 33 evidence records at `status incompatibleWithCosmoSAC2002` with
   the measured basis attached.  No profile in any component, no runtime variant.
4. **Audit re-run**: above.
5. **Counts**: above.

## Status-vocabulary unified
Rights blockage is now encoded in `status`, not only in `licence` — the two
directories had diverged and a rights-blocked record must never sit at a status that
reads clean.  9 speciation records were promoted to `rightsPending`; **1
(`estradiol-pKa1`) was reverted** — its excluded source (DrugBank) appears ONLY inside
a demoted `crossCheck {}`, and a demoted comparison must not contaminate the datum's
status.  Its own datum is Lewis & Archer, primary-cited.

## What phase 6 actually bought (beyond 3 new numbers)
Only 3 records improved (caffeine D measured; mannitol + sorbitol pKa — the first two
of 70 speciation records to state an IONIC STRENGTH).  The yield was elsewhere:
- **Four dead routes invalidated.**  Uedaira 1969 is titled *Xylose and Maltose* and
  can never supply galactose/arabinose; Kimura 1990 rules sorbitol out; taurine is a
  sulfonic zwitterion absent from every alpha-amino-acid set it was pointed at; and
  the seven hormone/BPA "routes" are membrane-rejection papers whose D values are
  **themselves Wilke-Chang estimates** — transcribing them would have laundered an
  estimate into a measurement.
- **A false corroboration withdrawn.**  An earlier pass claimed ketoprofen's logKow
  was "independently corroborated" by an open-access paper; that paper's table is
  compiled from its own references.  An open re-quote of a closed compilation
  launders nothing.
- **PFOA was wrong three ways at once**: marked `measured` while citing a
  COMPUTATIONAL estimate, with the wrong volume/year/pages, and the author had
  published a correction withdrawing the very value in use.  Demoted; "the previous
  confidence was unearned".
- **Method mismatch made explicit**: diclofenac/naproxen fed a McGowan V_x to
  Wilke-Chang, which is defined on a Le Bas Vb.  Direction of the bias is stated
  (D biased HIGH); the magnitude deliberately is NOT — quantifying it would require
  inventing a volume.
- The one new measurement (caffeine, 0.769e-9) sits ABOVE the range previously
  carried: a midpoint would have been ~15 % low.  Refusing to invent one was right.

---

# PHASE 7 (2026-07-25) — verification track hit an INFRASTRUCTURE wall

Four agents worked the `flagged` records whose action already named a primary
("identification is not verification"). Record-level counts are UNCHANGED
(verified 32 · flagged 154 · rightsPending 19 · absent 15) — and that is the honest
result: on 2026-07-25 every paywalled publisher (ACS, RSC, Elsevier/JBC) returned
HTTP 403, Internet Archive was blocked, and the web-search budget was exhausted, so
**almost nothing could be READ, hence almost nothing could be promoted.**

**What the OPEN-reachable agents still bought (corrections + citation-hardening):**
- **erythritol**: the feared liquid-vs-crystal phase trap DOES NOT EXIST — the
  -885.2 kJ/mol IS the crystalline solid (Parks & Manchester 1952, solid combustion);
  it is `derived` (Hess), not measured. My earlier defect claim was wrong.
- **lysine Cp "outlier"**: physically WRONG of me — L-lysine has a second-order phase
  transition at 298.15 K that elevates Cp (Pokorny 2023, open). A high Cp is expected.
- **nPropanol is NOT "complete"** (my earlier claim): no legal Pc/omega exists open.
- **mannitol** dHf re-pointed thesis -> peer-reviewed JACS 1946 (-1337.5 -> -1337.2).
- **arabinose** dHf primary resolved (Desai & Wilhoit 1970, -1058 -> -1057.9);
  enantiomer question answered (dfH is enantiomer-invariant).
- **alphaPinene/GVL/nPropanol** dHf(liq) filled from combustion primaries; many
  citations upgraded aggregate -> primary; alphaPinene dHf corrected from a wrong
  "~-32" prose to -16.4 kJ/mol.
- Retrieval LEADS made precise so the effort is not re-spent: Nozaki & Tanford 1967
  (open, amino-acid side-chain pKa at stated I), Mendes 2024 FPE (carbamazepine +
  atenolol + acetaminophen in one read), the NBS-via-DOI pipeline confirmed readable.

**The structural finding:** the remaining verification of the 154 flagged records is
now gated on PUBLISHER ACCESS, not effort. The two agents with open sources CORRECTED
me and filled values; the two facing paywalls (amino-acid pKa, diffusion/volume)
returned 0 promotions and correctly refused to fabricate. Spending more effort against
paywalled primaries yields citation-hardening, not new `candidate`s. The amino-acid
ionic-strength hole (still only 2/70 records state I) needs Nozaki & Tanford 1967 and
the JBC series via an institutional mirror this environment does not have.
