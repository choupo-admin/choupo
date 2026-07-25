# PC-SAFT — status inventory of the 57 staged candidates

Compiled 2026-07-24 by `agent:cosmo` from the eight family ledgers
(`../../*_SOURCES.md`).  Private staging tier (`data/tmp`, gitignored).
Envelope + status vocabulary: [`../../RECORD_SPEC.md`](../../RECORD_SPEC.md).

**No paywalled table was transcribed in producing this file.**  It records *what source
is pinned* and *whether the numbers are in hand* — nothing more.

## Ruling being implemented (advisor, accepted)

Do **not** systematically ingest paywalled parameter tables.  An isolated value may be a
fact, but systematic extraction of a compilation carries **EU sui generis database-right**
risk.  Pointers and values therefore stay in this private tier marked `rightsPending`.

A PC-SAFT set is **transportable only if it records**: variant · units · association scheme ·
combining rules · objective function · data range · conventions — *not just* m / σ / ε.
Five numbers with no protocol are not a parameter set; they are five numbers.

## Status vocabulary used here

| status | meaning |
|---|---|
| `candidate` | numbers **in hand**, single published primary, re-cited as a fact — usable after restructuring |
| `rightsPending` | a **specific paywalled table** is pinned as *the* source of the set; digits **not** in hand; extracting the table systematically is the risk the ruling names.  Stays private, never promoted as-is |
| `flagged` | **no published set identified** (or only a genre-level lead) — would need fitting, or a real citation first |

## Counts

| status | count |
|---|---|
| `candidate` (numbers in hand) | **1** |
| `rightsPending` (paywalled table pinned, numbers pointed at only) | **18** |
| `flagged` (no set published / no citation pinned) | **38** |
| **total candidates covered** | **57** |

Zero binary records (`kij`, cross-association) exist — none was pinned by any ledger.

## Where an adopted set actually belongs (ARITY)

A **pure-component** PC-SAFT set is **arity 1** → it belongs in
`../../components/<name>.candidate.dat` as a **named set** with variant + provenance,
exactly like a `cosmo {}` set.  This directory (`parameters/PCSAFT/`) is reserved by
`RECORD_SPEC.md` for **arity ≥ 2** records — `kij` and cross-association only.  This file is
a status ledger, not a home for pure sets.

---

## 1 — In hand (`candidate`) — 1 compound

| compound | source pinned | numbers | status |
|---|---|---|---|
| nPropanol | **Gross & Sadowski, *Ind. Eng. Chem. Res.* **41** (2002) 5510** (1-propanol) | **YES — in hand** | `candidate` |

The set (2B association): `m`, `σ`, `ε/k`, `ε^AB/k`, `κ^AB` — five values, re-cited as facts
to a single named primary, not lifted from a compilation.

**Defect — must be fixed in the component-cleanup phase:** the set currently lives in a
`//` COMMENT in `../../components/nPropanol.candidate.dat` (lines ~72-73).  *Zero usable
science may live only in a comment* (`RECORD_SPEC.md`).  It must become a **structured named
set** inside the component file, and — per the ruling — the restructured set must carry:

| slot | nPropanol today |
|---|---|
| variant | **missing** — must state PC-SAFT (Gross & Sadowski 2001 dispersion term), not "PC-SAFT" bare |
| units | partial — σ in Å, ε/k and ε^AB/k in K, m and κ^AB dimensionless; must be **explicit per value** |
| association scheme | **2B** — recorded |
| combining rules | **missing** — Berthelot-Lorentz for σ/ε + the Wolbach-Sandler rule for cross-association is the usual pairing, but the paper's own choice must be quoted, not assumed |
| objective function | **missing** — what was regressed (vapour pressure + saturated liquid density) and with what weighting |
| data range | **missing** — the T (and reduced-T) window of the fit; extrapolation outside it is on the user |
| conventions | **missing** — number of association sites and their assignment |

Until those slots are filled the set is **not transportable**, even though the numbers are
legitimately in hand.

---

## 2 — Paywalled table pinned, numbers NOT in hand (`rightsPending`) — 18 compounds

### Sugars — 5 (`../../sugars_SOURCES.md`)

Source pinned: **Held & Sadowski, "Modeling … aqueous sugar solutions with PC-SAFT",
*AIChE J.* **59** (2013) 4794-4805, Table 2** (13 fitted sugars).

| compound | numbers | status |
|---|---|---|
| fructose | pointed at only (Table 2) | `rightsPending` |
| galactose | pointed at only | `rightsPending` |
| xylose | pointed at only | `rightsPending` |
| lactose | pointed at only | `rightsPending` |
| trehalose | pointed at only | `rightsPending` |

The whole row-set of one table = the textbook sui generis case.  If a sugar is ever needed,
take **that one compound's** row with its own citation — never the table.

### Polyols — 3 (`../../polyols_SOURCES.md`)

Source pinned: **Carneiro, Held, Rodríguez, Sadowski & Macedo, *J. Phys. Chem. B* **117**
(2013) 9980** (m, σ, ε, ε_AB, κ_AB).

| compound | numbers | status |
|---|---|---|
| sorbitol | pointed at only | `rightsPending` |
| mannitol | pointed at only | `rightsPending` |
| xylitol | pointed at only | `rightsPending` |

### Amino acids — 8 (`../../aminoacids_SOURCES.md`)

| compound | source pinned | numbers | status |
|---|---|---|---|
| glycine | Cameretti & Sadowski, *Chem. Eng. Process.* **47** (2008) 1018 (neutral zwitterion, 2-site assoc.; fitted to densities + solubilities) | pointed at only | `rightsPending` |
| alanine | Cameretti & Sadowski 2008 | pointed at only | `rightsPending` |
| serine | Cameretti & Sadowski 2008 | pointed at only | `rightsPending` |
| valine | Cameretti & Sadowski 2008 | pointed at only | `rightsPending` |
| glutamicAcid | ePC-SAFT: Held, Cameretti & Sadowski, *Fluid Phase Equilib.* (2011) + follow-ups; Do, Wiśniewski et al. (ref 28 in arXiv 2509.06271) | pointed at only | `rightsPending` |
| lysine | same ePC-SAFT lineage | pointed at only | `rightsPending` |
| arginine | same ePC-SAFT lineage | pointed at only | `rightsPending` |
| phenylalanine | same ePC-SAFT lineage | pointed at only | `rightsPending` |

**Citation defect on the last four:** the pins are a volume-less *Fluid Phase Equilib.* (2011)
and *a reference inside a preprint* — neither is a resolvable citation.  Resolve to
author/journal/volume/year/pages **before** any of it is quoted, even privately.

**Physics caveat:** the amino acids are charged/zwitterionic in water; the ionic route is
**ePC-SAFT** (adds ion terms), a *different model* from the neutral PC-SAFT sets.  A set must
say which one it is — that is the `variant` slot doing its job.

### Pharma (analgesics/NSAIDs) — 2 (`../../pharma1_SOURCES.md`)

| compound | source pinned | numbers | status |
|---|---|---|---|
| ibuprofen | Rüther & Sadowski; Ferreira et al., *J. Supercrit. Fluids* (2022) | pointed at only | `rightsPending` |
| ketoprofen | Ferreira et al., *J. Supercrit. Fluids* (2022) | pointed at only | `rightsPending` |

---

## 3 — No published set identified (`flagged`) — 38 compounds

Nothing to extract, so no rights question arises: these need a **fit** (with the full
protocol recorded) or a real citation before they exist at all.

| family | compounds | note |
|---|---|---|
| sugars (1) | arabinose | **not** among the sugars fitted in Held & Sadowski 2013.  The ledger's "use xylose as a labelled surrogate" is a *modelling choice*, not a parameter set — it must never be filed as arabinose's own set |
| polyols (1) | erythritol | ledger says "Held & Sadowski framework — confirm erythritol fitted"; the fit is **unconfirmed**, so no source is pinned |
| amino acids (1) | taurine | no set in any of the three lineages |
| pesticides / small solutes (7) | urea, acrylamide, NDMA, atrazine, simazine, diuron, glyphosate | not attempted; **urea** has a genre-level lead only (published PC-SAFT/ePC-SAFT in the Held/Sadowski lineage) — no paper pinned |
| PFAS (4) | PFOA, PFOS, PFBA, PFBS | specialised PFAS-SAFT work exists; **no set adopted**.  Perfluoro chains are exactly where a generic set misleads |
| volatiles / bio-based (6) | limonene, alphaPinene, HMF, furfurylAlcohol, gammaValerolactone, levulinicAcid | no set pinned |
| pharma 1 (4) | caffeine, carbamazepine, diclofenac, naproxen | **carbamazepine** has a genre-level lead only ("cocrystal-solubility PC-SAFT studies exist") — no paper pinned |
| pharma 2 (7) | sulfamethoxazole, trimethoprim, metformin, gemfibrozil, primidone, atenolol, iopromide | none published open.  **metformin** is a permanent cation → would need **ePC-SAFT**, not PC-SAFT |
| hormones / EDCs (7) | estradiol, estrone, ethinylestradiol, estriol, testosterone, progesterone, bisphenolA | no published steroid sets; no open bisphenol-A set adopted |

---

## What must NOT happen next

- Do **not** open Held & Sadowski 2013 Table 2 (or Carneiro 2013, or Cameretti 2008) and
  transcribe the rows in bulk to clear the 18 `rightsPending` entries.  That is precisely the
  systematic extraction the ruling forbids.
- Do **not** promote a `rightsPending` pointer into `data/standards/` — the public tier
  redistributes no third-party databank values (`CLAUDE.md` §7).
- Do **not** file a surrogate (arabinose ← xylose) as a compound's own set.
- Do **not** file a pure set under `parameters/PCSAFT/` — that is the binary-record home
  (arity ≥ 2).  Pure sets are arity 1 and go in the component file.
