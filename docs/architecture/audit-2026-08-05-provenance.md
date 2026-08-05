# Audit: invariant I3 (provenance) swept across the catalogue — 2026-08-05

> **STATUS: EVIDENCE.**  Third read-only fleet audit under
> [`development-governance.md`](development-governance.md).  Coverage: ~75
> records read in full, plus a field-level automated sweep of **all 792 files
> under `data/standards/`** and the 2,683 `constant/` records under
> `tutorials/`.  Findings below re-verified by the architect.

**Invariant I3** — *every value carries its provenance, and an estimate is
never dressed as a measurement.*

The catalogue is **mostly compliant**, and the audit correctly declined to
report several things that look wrong and are not: Joback records, PHREEQC
public-domain chemistry, and the "IST re-citation pending" tags are all
honestly labelled.

---

## P1 — LICENCE EXPOSURE.  This outranks everything else on this page.

**Six shipped data records cite a source on the project's own NEVER list.**

`docs/ai/curation-protocol.md:131` reads:

> *NEVER (no-grant or NonCommercial — **do not enter their numbers, even
> cited**): NIST SRD / WebBook, DIPPR, Yaws, CRC (as a product), direct
> DECHEMA / DDBST transcription, CAS Common Chemistry.*

Verified by sweep — the records, not the policy documents:

| record | citation |
|---|---|
| `components/H3PO4.dat:33,47` | `dHf_298 … [CRC; NBS printings -1279.0]`, and `origin literature; method "dHf_298: CRC Handbook…"` |
| `components/methylAcetate.dat:8` | `Primary data: NIST WebBook / DIPPR-class compilations` |
| `components/ethyleneOxide.dat` | NEVER-list citation |
| `components/cyclopentane.dat` | NEVER-list citation |
| `parameters/NRTL/ethanol-water.dat` | NEVER-list citation |
| `parameters/SRK/N2-CH4.dat` | *"DECHEMA Chemistry Data Series Vol. VI (1982) — the standard kij compilation"* |

This is not a provenance defect. **The public tree underwent a deliberate legal
scrub precisely to remove third-party databank values**, and these survived it.
`methylAcetate.dat` compounds it by labelling an aggregator *"Primary data"* —
the exact inversion I3 forbids.

Two of the eight sweep hits (`parameters/README.md`,
`parameters/electrolyte/PROVENANCE.md`) are policy prose naming the standards,
not values. Those are correct and stay.

**This is a release blocker for 2608.** A value that must not be redistributed
does not become redistributable by being cited.

## P2 — Six validity windows are inverted or empty

Swept all 247 components:

```
neon.dat:42            Trange (30  27)      krypton.dat:42        Trange (121 120)
Xe.dat:42              Trange (166 165)     D2.dat:42             Trange (24  24)
OrthoDeuterium.dat:42  Trange (24  24)      ParaDeuterium.dat:42  Trange (24  24)
```

All six are `liquidHeatCapacity`, each under a comment claiming a real fit
(*"fitted to CoolProp saturated-liquid cp"*) with a 4-term polynomial. An
inverted or degenerate interval is not a validity statement: the I4
extrapolation announcement is either dead or always firing. The user sees a
cubic liquid-Cp with a declared domain that cannot be satisfied.

## P3 — A membrane record's numbers contradict its own provenance, 40×

`assets/NF270.dat`. Header lines 21–23 state the values chosen to reproduce the
cited datasheet; lines 42–44 ship different ones:

| solute | documented | shipped | |
|---|---|---|---|
| NaCl | ~2e-6 m/s | **5.0e-6** | 2.5× |
| MgSO4 | ~5e-8 m/s | 5.0e-8 | agrees |
| glucose | ~2e-7 m/s | **8.0e-6** | **40×** |

Glucose is shipped *more* permeable than NaCl, which is backwards for a loose
NF membrane that rejects glucose better than salt — and the inline comment
`// R_obs ~ 50 %` asserts a rejection the shipped number cannot produce. The
sibling `SW30HR.dat` is internally consistent, so this is not a house style.

## P4 — Seventeen aqueous species carry thermochemistry with no citation

`species/{Zn,Al,BOH4,Cd,CuI,CuII,FeII,FeIII,H3BO3,H4SiO4,HS,HTart,MnII,NH4,NO2,Pb,Tart}.dat`
carry `hfAq` / `sAq` / `cpAq` with no `source`, `citation` or `origin` anywhere
in the file — under a header that says *"citations ride"*. Nothing rode. The
compliant siblings (`Cl.dat`, `Na.dat`) carry
`source "Criss & Cobble, JACS 86 (1964) 5390, Table II"`.

Contradicts two written contracts: `data/standards/README.md` (*"explicit
provenance metadata in each file"*) and `parameters/electrolyte/PROVENANCE.md:11`.
The provenance was almost certainly lost in the 2026-07-18 monolith split, and
**nothing announced the loss** — which is itself an I5 violation.

## P5 — `assets/carbonSteel.dat` has six design numbers and no source field

Twelve lines, no `Sources` block, while all three siblings have one. It is the
**reference material against which every costing `F_M` is normalised**, and its
title claims ASME SA-516 Gr. 70, so `sigma_y 140 MPa @ 250 °C` reads as a
code-derived allowable. It may equally be a round assertion; the record cannot
tell you.

## P6 — Machine-readable validity wider than the fit, twice

`hitecSalt.dat`: header *"Cp: range 426–776 K"*, field `Trange (415 810)`.
`dowthermA.dat`: header *"good to ~5 % across 373–673 K"*, field
`Trange (285 670)`. The comment is the honest number; the field the engine
reads is the wrong one, so the extrapolation warning stays silent where it
should fire.

## Suspected — recorded, not acted on

`dH 0;` on 16 mineral dissolution equilibria (likely an *absent* PHREEQC
`-delta_h` written as a numeric zero, making solubility T-independent — could
not verify, no cached reference in-tree); **67 components carrying
`PROPOSAL TIER -- UNVERIFIED` in a tree whose README declares it "VERIFIED tier
only"** (no engine-side flag found, loader not read closely); `flueGas.dat`
using an `origin standard` outside the documented enum; a mol%/wt% mix-up in
`hitecSalt.dat`'s MW arithmetic; `Acetate.dat` header-only citation.

**The 67 UNVERIFIED-in-a-VERIFIED-tree item should be promoted to a confirmed
finding as soon as someone reads the loader.** If they load silently, the
tier boundary is decorative.

## Actions

| id | action | |
|---|---|---|
| **AP1** | Replace or remove the six NEVER-list-sourced values; re-derive from the primary (H3PO4's own header names Wagman/NBS 1982). Extend `check_cosmo_scrub` to refuse a NEVER-list citation anywhere under `data/standards/`. | **release blocker** |
| **AP2** | Read the loader and settle the 67 `PROPOSAL TIER -- UNVERIFIED` records: promote, demote to `data/local/`, or flag at load. | **release blocker if silent** |
| **AP3** | A gate refusing `Trange` with `hi <= lo`. Fix the six; re-fit or narrow. | |
| **AP4** | Reconcile `NF270.dat` — decide which set reproduces the datasheet, and make the other agree. | |
| **AP5** | Restore citations to the 17 species records from the pre-split monolith. | |
| **AP6** | `carbonSteel.dat` gains a `Sources` block, or says it is an assertion. | |
| **AP7** | Machine-readable validity matches the header, or the header is removed. | |

**AP1 and AP2 gate the 2608 release.  The rest are quality.**

---

## Closure, 2026-08-05 — five acted on, two open, and one wrong count

| id | outcome |
|---|---|
| **AP1** | done — `check_source_licence` distinguishes a route (`via`) from an authority; 4 pinned, 2 innocent records cleared |
| **AP2** | done — `reviewStatus` parsed and ANNOUNCED, 67 records migrated, 5 sealed cases re-imported, `check_review_status` fires from a sealed case |
| **AP3** | done, and **larger than stated** — see below |
| **AP4** | **OPEN — needs Vítor.** Gated and pinned, not decided |
| **AP5** | done — `check_species_citation`, and the count was **eighteen, not seventeen** |
| **AP6/AP7** | not yet acted on |

### AP3 was a symptom; the defect was one layer down

The action asked for "a gate refusing `Trange` with `hi <= lo`". Writing it
found that `PolynomialCp` — the most common heat-capacity model in the corpus
— **assigned `Tmin_`/`Tmax_` in its constructor and never read them again**.
The window was parsed and discarded, so invariant I4 was unimplemented on that
path entirely.

That is why the six inverted windows did no visible harm: nothing looked at
them. **Harmless-because-unchecked is not safety.** And the first sweep after
the fix found two corpus cases already extrapolating in silence
(`crystalliser09`, `solidDryer01_sugar`) — neither a bug, since extrapolation
is legitimate, but nobody was being told.

### AP5: the list was already short on the day it was written

The action named seventeen uncited species. `check_species_citation` found
**eighteen** on its first run — `Acetate.dat`. A hand-compiled list of
violations is itself a hand-maintained derived fact, which is the arity sin in
audit form. **The gate recounts; the list remembers.**

### What was deliberately NOT done

Three values were left alone, and in each case writing something would have
been worse than the gap:

- **AP1's four pinned records** — a substitute datum must come from a primary,
  and `H3PO4`'s own header records that the primary gives a *different* number
  from the shipped one, so fixing it is a value change that moves a golden.
- **AP4's NF270** — the header says what the values were *chosen to
  reproduce*, not what was measured, and the shipped numbers may have been
  tuned for the teaching case. Picking a side without the data sheet is a
  guess wearing a citation.
- **AP5's eighteen citations** — inventing a plausible reference converts
  *unsourced* into *falsely sourced*, and the second is undetectable by a
  reader or a gate.

**A visible gap is strictly better than an invisible falsehood.** Every one of
these is pinned, and every pin list is a curation work-list that fails if a
name is removed without the record being fixed.

### The coverage limits, stated

`check_record_self_consistency` compares **1 of 12** asset records — the rest
document no comparable number in a parseable form, and sabotaging `SW30HR`
did *not* fail the gate. That limit was found by sabotage, not assumed away,
and the gate's own OK line reports it: the other eleven are **unchecked, not
clean**.
