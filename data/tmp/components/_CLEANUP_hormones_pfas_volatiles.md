# `components/` cleanup -- hormones / EDCs, PFAS, volatiles (phase 3)

**Written 2026-07-24 by `agent:component-cleanup`.  Private staging tier
(`data/tmp/`, gitignored).  Envelope + ARITY rule:
[`../RECORD_SPEC.md`](../RECORD_SPEC.md).**

Scope: the 18 files listed below, and nothing else.  No other component, no
`_sources/`, no `data/standards/`, no C++, no tutorials, no promotion, no
commits.

## What phase 3 is

Phase 2 lifted every arity >= 2 datum out of the component comments into
arity-correct homes, but was **read-only on `components/`** -- so for a day the
same numbers existed in two places.  Phase 3 makes the component agree: it
**removes** what moved, leaves a **one-line pointer** (home + recordId, never a
number), and keeps **only arity-1 intrinsic** science, restructured so that
*zero usable science lives only in a prose comment*.

Field schema mirrors `data/standards/components/ethanol.dat`: engine keys as
bare SI scalars (`Tc`, `Pc`, `omega`, `Tb`, `HvapTb`, `Vliq`,
`vaporPressure {}`, `idealGasHeatCapacity {}`, `standardThermochemistry {}` with
`referenceState`), each carrying unit + state + origin + primary in its
annotation, plus a `provenance {}` block per file.

## Conventions introduced (and why)

| construct | why it exists |
|---|---|
| `TfusRange ( lo hi )` | a melting *range* is what several sources report; collapsing it to a midpoint would invent a number |
| `solidPolymorphs { formLow{} formHigh{} }` | ethinylestradiol has **two** reported melting ranges; neither may be promoted to "the" melting point |
| `fusionData { determinations ( ... ) }` | two disagreeing melting determinations kept side by side (levulinic acid) instead of averaged |
| `vaporizationEnthalpy {}` | dvapH data that is **not at Tb** -- the key `HvapTb` was being used for near-ambient values in four files |
| `vaporPressureData { model singlePoint }` | one measured (T,P) pair is not an Antoine set and must not be fitted into one |
| `boilingPointReduced { T; P }` | a reduced-pressure bp is not a normal bp |
| `crossCheck {}` | a corroborating number quoted, never merged (ledger convention) |
| `stateAt298` | the pure substance's physical state, where `role` alone would mislead |
| `pcSaft { <setName> { ... } }` | a **pure** PC-SAFT set is arity 1, so it belongs in the component -- as a named set with variant + provenance + status, exactly like `cosmo {}` |
| `[FLAG -- AGGREGATE]` | the value is a database *average over N tabulated values*: the aggregator's arrangement, no primary |

## Two rules applied throughout

1. **Aggregate != primary.**  `CLAUDE.md` section 10 excludes NIST SRD/WebBook
   as a no-grant source, and section 10 also says *cite the PRIMARY source per
   value, never the aggregator's arrangement*.  So a WebBook entry that **names
   its primary** (Ambrose & Sprake 1970, Hawkins & Armstrong 1954, Stull 1947)
   is kept and re-cited to that primary; a WebBook **"average of N values"** is
   marked `[FLAG -- AGGREGATE]`, kept so the number is not lost, and declared
   not citable.  This downgraded 6 values across 4 files (see section 4).
2. **A derivative is never stored beside its inputs.**  Molar volumes computed
   as MW/rho were dropped (the density is kept); a derived ideal-gas formation
   enthalpy was dropped in favour of the measured liquid datum it came from.

---

# 1. Per file

## 1.1 Hormones / EDCs (7 files)

### `estradiol.candidate.dat`
* **Removed** (re-homed phase 2, pointer only): D_aq + Stokes radius ->
  `diffusion-estradiol-water`; logKow -> `estradiol-octanol-water`; aqueous
  solubility (both the HSDB and the Shareef 2006 values) -> `estradiol-water`;
  phenolic pKa -> `estradiol-pKa1`; COSMO cavity -> `lvpp-estradiol`.  Melting
  point retained (arity 1).  Le Bas Vb dropped -- it is an input of the
  Wilke-Chang estimate and lives inside the diffusion record.
* **Kept**: identity (+ `inchiKeySkeleton`, flagged as a 14-char skeleton, not a
  full InChIKey), MW, role, `Tfus 451.65 K` with provenance.
* **Fixed (the assigned defect)**: **no pKa value of any kind remains.**  The
  only determination ever staged (10.46 +/- 0.03) came **solely from DrugBank,
  CC BY-NC 4.0**, which `CLAUDE.md` excludes from the public tier regardless of
  copyleft.  It is held once, marked `rightsPending`, in
  `chemistry/aqueousSpeciation/estradiol-pKa1.candidate.dat`.  The component
  carries the pointer plus the named public-tier route: **Lewis & Archer,
  *Steroids* 34 (1979) 485**.
* **Still unresolved**: no crystal density, no polymorph, no formation datum, no
  Cp; no deployable COSMO set (protocol incompatibility, section 3).

### `estrone.candidate.dat`
* **Removed**: D_aq + radius -> `diffusion-estrone-water`; logKow ->
  `estrone-octanol-water`; solubility -> `estrone-water`; pKa (the loose
  "~10.3-10.8") -> `estrone-pKa1`; COSMO -> `lvpp-estrone`.  Derived molar
  volume dropped.
* **Kept**: identity, MW, role, `Tfus 533.35 K`, `solidDensity 1236 kg/m3`
  (25 degC), both with provenance.
* **Still unresolved**: crystal form unstated (so the solubility record cannot
  reach `candidate`); no formation datum; pKa has no pinned primary -- route is
  Lewis & Archer 1979 or Hurwitz & Liu, *J. Pharm. Sci.* 66 (1977) 624.

### `ethinylestradiol.candidate.dat`
* **Removed**: D_aq + radius -> `diffusion-ethinylestradiol-water`; logKow ->
  `ethinylestradiol-octanol-water`; solubility -> `ethinylestradiol-water`;
  pKa ("~10.4") -> `ethinylestradiol-pKa1`.
* **Kept / fixed**: the melting point was staged as *two* ranges (142-146 degC
  and a "polymorph 180-186 degC").  Both are now kept as
  `solidPolymorphs { formLow / formHigh }`; **no bare `Tfus`** exists, because
  choosing one would be choosing a solid phase nobody has identified.
* **Still unresolved**: which polymorph is ambient-stable -- the same gap that
  keeps its solubility record at `solidPhase unspecified`.  **Not in LVPP** at
  all, so it has no COSMO evidence record (the only estrogen in the set without
  one).

### `estriol.candidate.dat`
* **Removed**: D_aq + radius, logKow, solubility, pKa, COSMO -> the five
  `estriol-*` / `lvpp-estriol` records.  Derived molar volume dropped.
* **Kept**: `Tfus 561.15 K` -- now annotated **with decomposition** (the source
  says "288 degC, decomposes"), so it is a decomposition temperature, status
  `flagged`, not a clean fusion point; `solidDensity 1270 kg/m3`.
* **Still unresolved**: no formation datum; pKa unpinned (Lewis & Archer 1979).

### `testosterone.candidate.dat`
* **Removed**: D_aq + radius, logKow, solubility, COSMO -> the four records.
  The "pKa none (non-ionizable)" prose was **not** re-homed as a value: it is an
  absence statement and lives in the speciation ledger, section 6a.
* **Kept / fixed**: `TfusRange ( 426.15 430.15 )` -- a range, not a midpoint;
  the HMDB single 155 degC is quoted in the annotation as an unmerged
  corroboration.
* **Still unresolved**: no crystal density, no polymorph, no formation datum.

### `progesterone.candidate.dat`
* **Removed**: D_aq + radius, logKow, solubility, COSMO -> the four records;
  derived molar volume dropped.
* **Kept**: `Tfus 402.15 K`, `solidDensity 1166 kg/m3` -- the annotation now
  states the source's **23 degC** (not 25 degC) explicitly.
* **Still unresolved**: progesterone is known to be polymorphic and no form is
  stated; no formation datum.

### `bisphenolA.candidate.dat`
* **Removed**: D_aq + radius, logKow, solubility, **both** pKa steps
  (`bisphenolA-pKa1`, `bisphenolA-pKa2`), COSMO -> `lvpp-bisphenolA`; derived
  molar volume dropped.  The prose "neutral below ~pH 9, mono-/di-anionic above"
  was **deleted, not moved**: it is a consequence of the two pKa plus a pH.
* **Kept**: `TfusRange ( 429.15 431.15 )`, `solidDensity 1195 kg/m3`.
* **Still unresolved**: no formation datum -- and unlike the steroids this is a
  real gap, not an impossibility (BPA is a bulk industrial monomer).

## 1.2 PFAS (4 files)

### `PFOA.candidate.dat`
* **Removed**: pKa -> `PFOA-pKa1`; logKow -> `PFOA-octanol-water`; solubility
  (and the CMC note) -> `PFOA-water`; `chargeAtPH7` deleted as derived; derived
  molar volume dropped; **Henry's-law constant deleted** (arity 2, no home --
  section 2).
* **Kept**: `Tfus 327.45 K`, `Tb 461.15 K`, `solidDensity 1800 kg/m3` (correctly
  filed as a **solid** density, since 20 degC < Tfus), and the single measured
  vapour-pressure point as `vaporPressureData { model singlePoint }` with the
  mmHg -> Pa conversion shown and the source's own "extrapolated" caveat.
* **Fixed (the assigned defect)**: **no pKa remains in the component.**  The
  determinations span **more than three log units** (-0.5 Goss 2007; 1.30
  Kutsuna & Hori 2008; 2.80 Moody & Field 2000).  All three live in the one
  equilibrium record with its `alternativeDeterminations`; no consensus was
  manufactured here.
* **Still unresolved**: no Tc/Pc/omega (Joback has no perfluoro-carbon groups,
  so Choupo's own estimator is not a fallback); no formation datum; no Antoine;
  no D_aq record at all; `role nonvolatile` is a case role, contradicted by
  Tb = 461 K (flagged in-file).

### `PFOS.candidate.dat`
* **Removed**: pKa (a bound, "< 1.0") -> `PFOS-pKa1`; solubility -> `PFOS-water`;
  `chargeAtPH7` deleted as derived.
* **Fixed (the assigned defect), and it emptied the file**: the tabulated
  solubility **is the potassium salt**, and so are the melting point (">= 400
  degC") and the vapour pressure (2.48e-6 mmHg) that were staged here.  PFOS-K
  is a **different substance** from the acid this file names, so **none of them
  is carried in any form** -- the component no longer implies the acid's
  solubility, melting point or vapour pressure is known.  ATSDR reports "no
  data" for the free-acid density, so no molar volume is derivable either.
* **Kept**: identity only (name, formula, CAS, skeleton key, MW, role).
* **Still unresolved**: everything.  To close it, a curator needs free-**acid**
  data, or the catalogue must carry **PFOS-K as its own component with its own
  CAS**.  Also: no logKow may ever be written here -- the source says "not
  applicable (ionic surfactant)", which is an absence, not a datum.

### `PFBA.candidate.dat`
* **Removed**: pKa (class bound "< 1.6") -> `PFBA-pKa1`; logKow ->
  `PFBA-octanol-water`; solubility -> `PFBA-water`; COSMO -> `lvpp-PFBA`;
  `chargeAtPH7` deleted; **Henry's-law constant deleted** (section 2).
* **Fixed (the assigned defect)**: PFBA melts at **-17.5 degC** and boils at
  **121 degC**, so at 298 K the pure substance is a **liquid**.  The file now
  declares `stateAt298 liquid;`, files the 1.651 g/cm3 density as a **liquid**
  density -> `Vliq 1.296e-4 m3/mol` (an engine field, legitimate for a liquid),
  and states that the re-homed "water solubility" is a **liquid-liquid mutual
  solubility, not an SLE** (its record is marked `soluteState liquidSolute`).
  Nothing in the file now implies a crystalline solid.
* **Kept**: `Tfus 255.65 K`, `Tb 394.15 K`, `Vliq`, and the 44 mmHg @ 56 degC
  point as `vaporPressureData { model singlePoint }` with the conversion shown.
* **Still unresolved**: `role nonvolatile` is **physically wrong** for a
  substance boiling at 394 K; it is kept only because `volatile`/`solute` demand
  a `vaporPressure {}` block and no Antoine set is in hand.  Flagged in-file and
  here.  A Clausius-Clapeyron fit through Tb + the one point was deliberately
  **not** done (that would manufacture a correlation).

### `PFBS.candidate.dat`
* **Removed**: pKa (class bound) -> `PFBS-pKa1`; solubility -> `PFBS-water`;
  `chargeAtPH7` deleted; **logKoc deleted** (a range, and a different system --
  section 2).
* **Fixed (the assigned defect)**: as for PFOS, the tabulated solubility is the
  **potassium salt**; it is not carried here and the component no longer implies
  the acid's solubility is known.  ATSDR records **no** free-acid bulk
  properties at all.
* **Kept**: identity only.
* **Still unresolved**: everything; same remedy as PFOS (free-acid data, or
  PFBS-K as its own component).  No logKow may be written -- "not applicable
  (ionic surfactant)".

## 1.3 Volatiles / bio-based (7 files)

### `limonene.candidate.dat`
* **Removed**: COSMO material -> `lvpp-limonene` (evidence).  Nothing else was
  re-homed (no aqueous datum was ever staged for it).
* **Kept**: identity (full InChIKey **with** the R-(+) stereo layer, flagged --
  the racemate is a different substance for chiral properties),
  `Tb 450.0 K [FLAG -- AGGREGATE]`, `Vliq 1.620e-4 m3/mol`, and the five-point
  dvapH(T) table as `vaporizationEnthalpy { model tabulated }`,
  `status rightsPending` (Steele 2002 is paywalled).
* **Fixed**: (a) the stored **ideal-gas** `dHf_298 = -5.0 kJ/mol` was a
  **derivative computed on the spot** (liquid datum + dvapH(298)).  It is
  replaced by the **measured liquid** datum, `dHf_298 = -54520 J/mol` with
  `referenceState pureLiquid` (Hawkins & Eriksen 1954 via the Cox & Pilcher 1970
  reanalysis).  (b) `HvapTb = 40900` was **removed**: that is the 430 K point of
  the table, not a value at Tb = 450 K.
* **Fixed (the assigned defect)**: **no `cosmo {}` block**, for two independent
  reasons stated in-file -- the protocol incompatibility (section 3) **and** an
  unresolved identity: LVPP ships `LIMONENE.cosmo` (1433 segments, full atom)
  and `D-LIMONENE.cosmo`, a **legacy record** (629 segments, heavy-atom-only
  coordinates).  Which represents this substance has not been decided, and a
  legacy record must never be mixed into a release-v25 set.
* **Still unresolved**: Tc/Pc/omega (Steele 2002, paywalled); no Antoine, so
  `role volatile` is declared but unsupported; `standardThermochemistry` has
  **no `s_298`**, so the block is deliberately **not loadable as-is**; no Joback
  decomposition (ring-ene).

### `alphaPinene.candidate.dat`
* **Removed**: COSMO material -> `lvpp-alphaPinene` (evidence).
* **Kept**: `Tb 430.0 K [FLAG -- AGGREGATE]`, `Vliq 1.588e-4`, the Antoine set
  (Hawkins & Armstrong 1954, a named primary -> `status candidate`), and the two
  dvapH points as a `vaporizationEnthalpy` table.
* **Fixed**: the prose "dHf(liq) literature ~ -32 kJ/mol range" is **not**
  stored in any form -- a range is not a value.
* **Fixed (the assigned defect)**: **no `cosmo {}` block** -- protocol
  incompatibility **and** an unresolved **conformer**: LVPP ships the same
  substance twice, `ALPHA-PINENE.cosmo` (684.30 bohr2) and `A-PINENE.cosmo`
  (669.08 bohr2), **2.3 % apart in cavity area**.  A named set must declare
  which conformer it ships; nobody has chosen.
* **Still unresolved**: Tc/Pc/omega absent (and Joback is POOR for a bridged
  bicyclic, so Choupo's own estimator is not a legitimate fallback); no
  formation datum; **new contradiction** in the dvapH pair (section 5).

### `HMF.candidate.dat`
* **Removed**: nothing was re-homed (no aqueous datum staged; HMF is not in
  LVPP, so there is no evidence record either).
* **Kept / restructured**: `Tfus 308.5 K`; `fusionEnthalpy { dHfus 19800 }`;
  the 83.4 kJ/mol vaporisation value moved out of `HvapTb` into
  `vaporizationEnthalpy { model rangeAverage; temperatureRange (314 368) }`
  (HMF has no clean normal boiling point, so it cannot have an at-Tb value);
  the reduced-pressure bp as `boilingPointReduced { T 388.2; P 100 Pa }`.
* **Fixed**: the bare "rho ~1.24 g/cm3" is kept as `solidDensity 1240`, marked
  `origin unattributed / status flagged` -- **no source, no temperature, no
  crystal form** was ever staged for it.  The extrapolated liquid molar volume
  derived from it is not stored (a derivative of a flagged input).
* **Still unresolved**: `boilingPointReduced` is sourced to the **CRC Handbook
  (Weast 1989)**, a no-grant compilation `CLAUDE.md` excludes -- marked
  `rightsPending` (section 4).  No Tb/Tc/Pc/omega/Antoine/Cp; the formation
  datum exists in Verevkin et al. 2009 but was never transcribed.

### `furfurylAlcohol.candidate.dat`
* **Removed**: COSMO material -> `lvpp-furfurylAlcohol` (evidence).
* **Kept**: `Tb 443.0 K [FLAG -- NO PRIMARY]` ("standard handbook value"),
  `Vliq 8.70e-5`, and both dvapH determinations as a `vaporizationEnthalpy`
  table.
* **Fixed**: `HvapTb = 53600` **removed** -- it is the **319 K** point, and the
  old annotation "[near Tb]" was simply wrong (319 K is 124 K below Tb = 443 K).
* **Still unresolved**: Tc/Pc/omega (subscription TRC), no Antoine -> `role`
  had to stay `nonvolatile` although the substance is a volatile liquid; no
  formation datum; **new contradiction** in the dvapH pair (section 5).

### `gammaValerolactone.candidate.dat`
* **Removed**: COSMO material -> `lvpp-gammaValerolactone` (evidence).
* **Kept**: `Tb 480.7 K [FLAG -- VENDOR SOURCE]` (Aldrich catalogue 1990 via the
  WebBook entry), `Vliq 9.52e-5`, the Antoine set (Stull 1947, a named primary
  -> `candidate`), and the 276-350 K dvapH as `vaporizationEnthalpy`.
* **Fixed**: `HvapTb = 53900` **removed** -- 276-350 K is ~130 K below
  Tb = 480.7 K.
* **Still unresolved**: Tc/Pc/omega absent (omega is derivable from the Antoine
  set **once Tc/Pc exist** -- the route is stated, not taken); formation
  enthalpy exists in Emel'yanenko 2008 / Leitao 1990 but paywalled; no Joback
  (no lactone group).

### `levulinicAcid.candidate.dat`
* **Removed**: COSMO material -> `lvpp-levulinicAcid` (evidence).
* **Kept**: `Tb 518.7 K [FLAG -- VENDOR SOURCE]`, `Vliq 1.019e-4`, the Antoine
  set (Stull 1947 -> `candidate`), and the **clean** Joback group decomposition
  (the one compound here where Choupo's own estimator is a legitimate route).
* **Fixed (two)**: (a) `Tfus 308.0` was the **arithmetic midpoint of two
  determinations** (306 K Buechner 1906; 310 K Berthelot 1897) -- an invented
  number.  The bare key is gone; both determinations are kept in `fusionData`,
  unmerged, with `dHfus 9220 J/mol`.  (b) `HvapTb = 74400` **removed** -- it is
  the **390 K** value.
* **Still unresolved**: Tc/Pc/omega deliberately **not** estimated here (running
  `bin/estimate` is a curation act, not a file-tidying act); no formation datum;
  and the ledger-level gap the speciation pass called out -- **a carboxylic acid
  with no pKa staged at all**, the most consequential missing equilibrium in the
  whole staging set.

### `nPropanol.candidate.dat`
* **Removed**: COSMO material -> `lvpp-nPropanol` (evidence).  No aqueous datum
  was ever staged.
* **Kept**: identity + full InChIKey, Joback groups, `Tc`, `Pc`, `omega`, `Tb`,
  `HvapTb`, `Vliq`, `standardThermochemistry { dHf_298; s_298; referenceState
  idealGas }`, `vaporPressure { Antoine }`, `idealGasHeatCapacity`,
  `liquidHeatCapacity` -- the full ethanol.dat-shaped payload, the only complete
  one in this set.
* **Fixed (assigned defect 1) -- PC-SAFT is now a structured named set.**
  It was a `//` comment.  It is now
  `pcSaft { grossSadowski2002 { ... } }` carrying `variant PCSAFT`,
  `associationScheme 2B`, `m 2.9997`, `sigma 3.2522 A`, `epsilonOverK 233.40 K`,
  `epsilonAB_overK 2276.8 K`, `kappaAB 0.015268`, a full `provenance {}` block
  (Gross & Sadowski, *IECR* 41 (2002) 5510) and `status candidate`.  The four
  transportability slots that were never read from the paper --
  `combiningRules`, `objectiveFunction`, `dataRange`, `siteConventions` -- are
  written **FLAG**.  Nothing was guessed: the "usual" Lorentz-Berthelot +
  Wolbach-Sandler pairing is **deliberately not written in**.  The set is
  therefore in hand but **not transportable**.
* **Fixed (assigned defect 2) -- placeholders purged.**  Every "NIST avg" /
  "PRIMARY re-cite pending" is gone; each value now names a primary or says
  FLAG:
  | value | before | after |
  |---|---|---|
  | `Tc` | 536.9 (WebBook avg of 20) | **536.71**, Ambrose & Townsend (1963) -- the primary the file itself named.  **Value changed, -0.19 K, -0.04 %** |
  | `Pc` | 52.0 (WebBook avg of 12) | 52.0, `[FLAG -- AGGREGATE]`, no primary exists in the record |
  | `omega` | 0.620, "Poling/Reid [re-cite pending]" | 0.620, `[FLAG -- COMPILATION]`; the clean route (derive from Antoine + Tc + Pc) is stated, not taken |
  | `Tb` | 370.3 (WebBook avg of 127) | 370.3, `[FLAG -- AGGREGATE]`; route: the Ambrose & Sprake Antoine set brackets Tb, so it is an interpolation |
  | `HvapTb` | 41440, Majer & Svoboda | kept, `[FLAG -- EVALUATED COMPILATION]` |
  | `dHf_298` | -256000 (WebBook avg of 7) | kept, `[FLAG -- AGGREGATE]` |
  | `s_298` | 322.49, Chao 1986 | kept, `candidate`, full citation unresolved |
  | `idealGasHeatCapacity` | "Poling/Reid [re-cite pending]" | kept, `[FLAG]`; the Cp(298) check became a structured `crossCheck {}` |
  | `liquidHeatCapacity` | 144.0 "[re-cite pending] [FLAG]" | kept, `origin unattributed` -- **no source of any kind was ever staged** |
* **Still unresolved**: no `cosmo {}` block.  Unlike every other file here,
  nPropanol has a **legitimate route already identified**: 1-propanol **is in
  VT-2005** (Mullins et al., *IECR* 45 (2006) 4389), the very database Choupo's
  shipped `cosmoSAC2002` sets come from -- copying THAT set (area, volume and
  the 51-point profile, keyed on `BDERNNFJNOPAEC-UHFFFAOYSA-N`) is the correct
  curation act.  It was not done here: transcribing 51 floats is a curation act
  with a real fabrication risk.  The LVPP evidence record may **not** be used
  for it (section 3).

---

# 2. Removed from a component, and NO HOME EXISTS YET

These are arity >= 2 (or non-values) that phase 2 never claimed, so deleting
them outright would lose them and keeping them in the component would violate
the ARITY rule.  They are recorded **here**, verbatim with their citations, and
deleted from the component files.  **Do not re-add them to a component.**

| datum | value | source | why it has no home |
|---|---|---|---|
| PFOA Henry's-law constant | 0.362 Pa m3/mol | ATSDR (2021) Table 4-2 (US-gov, public domain) | solute + water = **arity 2**; no `parameters/henry/` directory exists in this staging tree |
| PFBA Henry's-law constant | 1.24 Pa m3/mol | ATSDR (2021) Table 4-2 | idem |
| PFBS log Koc | 1.2-2.7 ("high mobility") | ITRC, via `pfas_volatiles_SOURCES.md` | (a) a **range**, not a value; (b) organic-carbon partition = a **different system** (soil organic matter, not octanol), explicitly out of scope for `parameters/partition/` by that family's own ledger |

**Action for the curator:** emit `parameters/henry/<solute>-water.candidate.dat`
records for the two Henry constants (the staged set has more of them outside my
18 files -- check the other families before creating the directory), and decide
whether a `parameters/soilPartition/` record type is wanted at all.

---

# 3. COSMO: why not one deployable set in 18 files

Thirteen of these compounds have an LVPP evidence record
(`evidence/lvpp-<name>/metadata.dat`): estradiol, estriol, estrone,
testosterone, progesterone, bisphenolA, PFBA, limonene, alphaPinene,
furfurylAlcohol, gammaValerolactone, levulinicAcid, nPropanol.  **None** became
a `cosmo {}` block.  The reason cited in every file:

> The **LVPP QM protocol is incompatible with Choupo's VT-2005 `cosmoSAC2002`
> sets.**  Measured on the one compound present in both databases -- **ethylene:
> +6.1 % cavity area, +10.3 % cavity volume**.  Cavity area, volume *and* the
> sigma profile all depend on the QM protocol, the surface definition and the
> sigma-averaging convention, so a mixed paste is invalid before the profile is
> even discussed.

Five compounds (ethinylestradiol, HMF, PFOA, PFOS, PFBS) are not in LVPP at all.

Two further statements are carried where they apply:
* **Steroid surfaces are the neutral gas-phase tautomer, never the aqueous
  species** -- stated in all six steroid/EDC files that have an evidence record,
  and sharpened for testosterone and progesterone (keto, not enol; one chosen
  conformer).  The same statement is made for PFBA (neutral acid, never the
  perfluorobutanoate anion) and for levulinic acid (never the levulinate anion).
* **limonene and alphaPinene additionally have an unresolved identity /
  conformer problem** (legacy `D-LIMONENE.cosmo`; `ALPHA-PINENE` vs `A-PINENE`
  2.3 % apart) -- so even a validated `LVPP` variant would not settle them.

---

# 4. Values downgraded to FLAG in this pass (kept, not citable)

| file | value | reason |
|---|---|---|
| nPropanol | `Pc`, `Tb`, `dHf_298` | NIST WebBook **average of N values** -- the aggregator's arrangement, no primary; and WebBook is a no-grant source excluded by `CLAUDE.md` section 10 |
| nPropanol | `omega`, `idealGasHeatCapacity`, `liquidHeatCapacity` | copyrighted compilation with no primary re-cited / no source at all |
| nPropanol | `HvapTb` | evaluated compilation (Majer & Svoboda 1985), not a measurement report |
| limonene | `Tb` | WebBook average of 18 values |
| alphaPinene | `Tb` | WebBook average of 14 values |
| furfurylAlcohol | `Tb` | "standard handbook value"; the free aggregate is 430 +/- 70 K, useless as a check |
| gammaValerolactone, levulinicAcid | `Tb` | **Aldrich catalogue (1990)** -- a vendor catalogue, not a measurement report (both are corroborated in-file by their own Antoine validity limit) |
| HMF | `boilingPointReduced` | **CRC Handbook (Weast 1989)** -- a no-grant, all-rights-reserved compilation excluded by `CLAUDE.md` section 10; marked `rightsPending` |
| HMF | `solidDensity` | bare "~1.24 g/cm3", no source, no temperature, no crystal form |
| limonene | `vaporizationEnthalpy` table | Steele et al. 2002 is paywalled -> `rightsPending` |

Values that **kept** `candidate` status did so because a real primary is named
and re-cited: the Ambrose & Sprake (1970), Hawkins & Armstrong (1954) and Stull
(1947) Antoine sets; Ambrose & Townsend (1963) for nPropanol's Tc; the PubChem
experimental densities (US NIH, public domain); the HSDB / ATSDR melting points
and densities (US NLM / US-gov, public domain).

---

# 5. New contradictions found while cleaning

1. **`HvapTb` was systematically misused -- four files.**  limonene (value
   actually at 430 K, Tb = 450), furfurylAlcohol (319 K, Tb = 443),
   gammaValerolactone (276-350 K, Tb = 481), levulinicAcid (390 K, Tb = 519).
   In every case a near-ambient or off-Tb dvapH had been stored under a key that
   *means* "at the normal boiling point", and in two of them the annotation even
   claimed "[near Tb]" for a value 120-130 K away.  HMF was the worst: it has no
   normal boiling point at all, so an `HvapTb` for it cannot exist.  All five
   are now `vaporizationEnthalpy {}` blocks stating their real temperature, and
   **no value was extrapolated to Tb**.
2. **limonene's ideal-gas formation enthalpy was a stored derivative.**
   -5.0 kJ/mol was computed in the file itself as dHf(liq) + dvapH(298).  Two
   sources of truth for one datum, exactly the arity-1 sin; replaced by the
   measured liquid datum on `referenceState pureLiquid`.
3. **levulinicAcid's melting point was an invented midpoint** of two
   determinations 4 K apart (1897 and 1906!).  Neither has been checked against
   a modern DSC value.
4. **alphaPinene's two dvapH points are physically backwards**: 44.6 kJ/mol at
   298 K and 45.0 kJ/mol at 307 K -- dvapH must *decrease* with T.  They come
   from two different sources (An & Hu 1987 calorimetric; Stephenson &
   Malanowski 1987 compilation) and are not a data set.  Flagged in-file with an
   explicit "do not fit a slope through them".
5. **furfurylAlcohol's two dvapH determinations disagree by ~20 % over 21 K**
   (64.4 kJ/mol at 298 K, Landrieu 1929; 53.6 at 319 K, Stephenson & Malanowski
   1987) -- far beyond any physical slope.  Competing determinations, not a
   series.
6. **`role nonvolatile` is used as a CASE role, not a physical claim -- and for
   PFBA it is simply wrong.**  PFBA boils at 121 degC and PFOA at 188 degC; both
   carry the label only because the engine demands a `vaporPressure {}` block
   for `volatile`/`solute` and no Antoine set exists.  furfurylAlcohol (Tb =
   170 degC) is in the same position.  This is an **engine/vocabulary gap**, not
   a data gap: there is no role that says "a real volatile whose Antoine set we
   do not have".  Flagged in three files.
7. **Two `standardThermochemistry {}` blocks are deliberately not loadable.**
   limonene's carries `dHf_298` + `referenceState` but **no `s_298`**, which the
   engine requires.  Fabricating an entropy to make the file parse would be
   exactly the wrong trade; the gap is declared instead.
8. **The InChIKeys staged for the hormones/PFAS are 14-char skeletons, not full
   keys.**  Nine files were carrying e.g. `InChIKey VOXZDWNPVJITMN` as though it
   were a full 27-char key.  For stereo-rich substances (all six steroids) the
   skeleton discards exactly the layer that distinguishes them from their
   epimers.  Renamed `inchiKeySkeleton` with an explicit "do not join on this"
   note.  (limonene, levulinicAcid and nPropanol did carry full keys.)
9. **PFOS and PFBS reduce to identity-only files.**  Worth stating plainly: two
   of the four PFAS components now contain **no property datum at all**, because
   everything staged for them was potassium-salt data.  That is the correct
   result, and it means the PFAS teaching contrast (long-chain vs short-chain
   rejection) currently rests on PFOA and PFBA alone.

---

# 6. Follow-ups for the curator

1. Re-source **estradiol's pKa** from Lewis & Archer, *Steroids* 34 (1979) 485
   -- it is the only estrogen pKa in the set with a stated uncertainty, and the
   only thing blocking it is the DrugBank CC BY-NC route.
2. Decide the **PFOS-K / PFBS-K component question**: either curate free-acid
   data or add the potassium salts as their own components with their own CAS.
3. Emit **Henry's-law records** for PFOA and PFBA (section 2) once a
   `parameters/henry/` home is agreed.
4. Pin the **polymorph / crystal form** for the six solid EDCs -- it is what
   keeps four otherwise-good solubility records (Shareef et al. 2006) out of
   `candidate`.
5. Run **`bin/estimate levulinicAcid`** (clean Joback groups) and curate a
   **pKa** for it -- a carboxylic acid with no staged pKa.
6. Replace the eight **`[FLAG -- AGGREGATE]`** boiling/critical values with
   primaries, or drop them.
7. Copy the **VT-2005** `cosmoSAC2002` set for **1-propanol** into
   `nPropanol.candidate.dat` (the one legitimate COSMO route in these 18 files);
   read Gross & Sadowski (2002) for the four FLAGged PC-SAFT protocol slots.
8. Decide the **limonene** COSMO identity (full-atom vs legacy record) and the
   **alphaPinene** conformer before any `LVPP` variant is generated.
