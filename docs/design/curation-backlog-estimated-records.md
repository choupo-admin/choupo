# Curation backlog — estimated `dHf_298` records with known primaries

**Status: SURVEY for Vítor's curation.  No `.dat` was modified** (except
the two he authorised 2026-08-02: `fluorine` P0 definition fix and the
`neopentane` promotion, both committed b10dc211 with review-trail notes).
Promotion of any remaining value is a curation act (primary review) and
his alone.

Date: 2026-08-02; **ring-class survey (his 5c ruling: "prioridade alta,
investigar a classe inteira") added 2026-08-03 — see the section below
P2.**  Method: every `provenance { dHf_298 { origin estimated; method
"Joback"; } }` in `data/standards/components/` (45 records),
cross-referenced against corpus consumers; deviations quoted only where
the primary value is well established.

---

## P0 — a category error, not an estimate

| component | record says | truth | note |
|---|---|---|---|
| `fluorine` (formula **F2**) | dHf_298 = −435,550 J/mol [Joback] | **0 by definition** — an element in its standard state | Joback applied to a diatomic element; `s_298 219.402` is then DERIVED from the wrong dHf (the third-law value for F₂ is ≈ 202.79 J/(mol·K), CODATA).  Unused by any tutorial today, so no golden is wrong — but any future F₂ energy balance would be off by 435 kJ/mol.  The guide's own elements-datum section states the definition this record violates. |

## P1 — corpus consumers exist (the default energyBalance now reads these)

Five estimated records are loaded by at least one steady case each
(none reacting, so the private-zero cancellation currently hides the
error in `h_out − h_in`; the default energyBalance still carries the
number):

| component | Joback dHf [J/mol] | measured (NIST/Prosen-Rossini) | Δ | consumer |
|---|---|---|---|---|
| `isoButane` | −131,170 | ≈ −134,200 | ~3 kJ | 1 case |
| `nNonane` | −229,090 | ≈ −228,300 | <1 kJ | 1 case |
| `nDecane` | −249,730 | ≈ −249,500 | <1 kJ | 1 case |
| `nUndecane` | −270,370 | ≈ −270,300 | <1 kJ | 1 case |
| `oXylene` | +16,610 | ≈ +19,100 | ~2.5 kJ | 1 case |

Straight-chain alkanes are Joback's good case (<1 kJ) — low urgency;
they are listed for completeness, not alarm.

## P2 — isomer blindness (pedagogically the most interesting)

Joback sees only the group multiset, so isomers collapse to one number:

* **the three xylenes** (`oXylene`, `mXylene`, `pXylene`) all carry
  **+16,610**; the measured values differ (o ≈ +19.1, m ≈ +17.3,
  p ≈ +18.0 kJ/mol, Prosen & Rossini via NIST) — the same isomer trap
  the NASA-import guard documents, which is exactly why the importer
  deliberately left these carrying their honest Joback tags.
* **`cis2Butene` = `trans2Butene` = −8,670**; measured: cis ≈ −7.1,
  trans ≈ −11.4 kJ/mol — the cis/trans energy difference is real
  chemistry the estimate cannot see.
* **`neopentane`**: PROMOTED 2026-08-02 (b10dc211, his 5b ruling) —
  the standard record now carries the measured −168,050 (Prosen &
  Rossini 1945); the `process05` case-local overlay can retire at
  Vítor's convenience (it now duplicates the standard value).
* **`cyclopropane`**: −12,110 vs measured **+53,300** — a ~65 kJ error
  and the wrong SIGN: ring strain is the textbook failure mode of
  group additivity.  The worst suspected outlier in the tree.

## THE RING CLASS — whole-class survey (Vítor's 5c ruling, 2026-08-03)

**Why a class and not two compounds.**  Joback's method carries ring
GROUPS (the `r`-prefixed saturated-ring atoms and the ring-ether/-ketone/
-NH/-sulfide families of Table 2-2 — all 41 groups are in
`data/standards/parameters/Joback.dat`) but **no ring-SIZE strain
correction**: the group values average the strain of the fitting set
(dominated by 5- and 6-membered rings), so a 3- or 4-membered ring is
systematically wrong by roughly its excess strain energy.  The textbook
strain ladder (Anslyn & Dougherty; values ~): cyclopropane ≈ 115,
cyclobutane ≈ 110, cyclopentane ≈ 26, cyclohexane ≈ 0 kJ/mol.  The
record deviations below follow that ladder exactly — the error is the
physics the method cannot see, not a transcription slip.

**Every ring-bearing record in `data/standards/components/` (name +
formula sweep), with its dHf_298 status:**

| compound | ring | record dHf [J/mol] | measured (primary) | Δ | verdict |
|---|---|---|---|---|---|
| `cyclopropane` | 3C | −12,110 [Joback] | **+53,300** (Knowlton & Rossini, J. Res. NBS 43 (1949) 113; NIST WebBook) | **~65 kJ, WRONG SIGN** | promote — worst in tree (already P2) |
| `ethyleneOxide` | 3 (C₂O, oxirane) | −123,470 [Joback] | **−52,630** (NIST WebBook ideal-gas) | **~71 kJ** | promote (already P3, now class-priority) |
| `RC318` (perfluorocyclobutane, c-C₄F₈) | 4C | −1,628,190 [Joback] | ≈ **−1,543,000** (JANAF class; needs per-value primary confirmation — fluorine thermochemistry compilations disagree at the ~10 kJ level) | **~85 kJ** | promote after primary confirmation — ring strain AND per-fluorine group error stack |
| `cyclopentane` | 5C | −65,710 [Joback] | **−76,400** (Prosen & Rossini 1945; NIST) | ~11 kJ | promote (moderate — the 5-ring residual strain) |
| `cyclohexane` | 6C | −123,299 [**measured**, NASA-TM4513] | (is the primary) | — | CONTROL — the strain-free ring, already curated |

No other saturated-ring record exists in the standards tier (the
aromatics — benzene/toluene/xylenes/ethylBenzene/styrene — are a
different Joback family, parameterised on aromatic rings themselves;
their known defect is the ISOMER blindness of P2, not strain).

**Corpus impact: zero.**  None of the five is loaded by any tutorial
(swept 2026-08-03) — promoting any of them moves no golden.  The risk
is entirely forward-looking: the first future case that burns, epoxidises
or refrigerates with these records inherits errors up to 85 kJ/mol.

**The estimate lake** (`data/groupEstimative/`, 28,447 records): a
name-pattern sweep (`cyclo|oxir|oxet|epox|furan|dioxan|pyran|lactone`)
matches ≈ 3,589 records — the same generator, the same missing strain
term, so the same class risk.  The lake's contract already labels every
value an estimate (that tier is honest by construction); no per-compound
action there, but any PROMOTION out of the lake for a 3-/4-membered ring
must go through a measured primary, never the Joback number.

**Priority within the class — EXECUTED 2026-08-03** under the ratified
second-opinion review (order kept: sign-error compounds first):

* `ethyleneOxide` **PROMOTED** — measured −52,630 J/mol (Pell & Pilcher
  1965 via NIST WebBook); dGf derived, cross-checks literature −13.1.
* `cyclopropane` **PROMOTED** — measured +53,300 J/mol (Knowlton &
  Rossini 1949); dGf derived, cross-checks literature ~104.5.
* `cyclopentane` **PROMOTED** — measured −76,400 J/mol (Prosen &
  Rossini via NIST); derived dGf inside the 38.8–39.6 literature band.
* `RC318` **NOT promoted** — the best compiled value (≈ −1,543,000
  J/mol, JANAF-class) is recorded ON the record as a structured
  `bestCompiledValue { status compiled; promotionBlockedBy
  primarySourceUnresolved; }` marker; the Joback estimate stays the
  honestly-labelled active value.  The primary-source-per-value rule is
  not broken for a plausible number.

All four carry `FOR REVIEW` trails; final ratification of the digits is
Vítor's, as with fluorine/neopentane (b10dc211).

**CLASS QUALITY RULE (ratified 2026-08-03):** a cyclic compound whose
thermochemistry materially depends on ring strain is NEVER considered
validated merely because a Joback estimate passes a general tolerance
defined for acyclic compounds — the 3-/4-ring members of any future
import must arrive with a measured primary or wear the estimate label.

## P3 — the remainder (no consumers; primaries exist but need per-value review)

`isohexane` (2-methylpentane, measured ≈ −174.6), `isoButene`
(≈ −17.1), `propyne` (≈ +184.9 — the Joback +186,650 is close),
`cyclopentane` (≈ −76.4 vs −65,710 — ~11 kJ), `ethylBenzene`
(≈ +29.9 — close), `diethylEther` (≈ −252.1), `dimethylEther`
(≈ −184.1 vs −216,830 — ~33 kJ, worth checking), `ethyleneOxide`
(≈ −52.6 vs −123,470 — ~71 kJ, ANOTHER ring-strain suspect),
the five biodiesel methyl esters (`methylPalmitate/Stearate/Oleate/
Linoleate/Linolenate` — TRC/NIST condensed-phase primaries exist;
conversion to ideal-gas needs Hvap), and the 17 refrigerants
(`R11`–`RC318`, `hfe143m`, `novec649` — JANAF / Rodgers compilations
carry measured values for most of the classics; the newer HFOs may
genuinely lack primaries, in which case the honest Joback tag stays).

## Suggested procedure (Vítor's, when he takes any of these)

1. P0 `fluorine`: set dHf_298 = 0 exactly, s_298 = 202.79 (CODATA),
   provenance `origin definition` / `origin measured` — no estimate
   involved.
2. For each promotion: primary citation per value (never an
   aggregator), `origin measured`, and delete the structured
   Joback provenance block; `runTests` guards the (currently zero)
   golden impact.
3. The ring-strain suspects (`cyclopropane`, `ethyleneOxide`) first —
   largest absolute error; the xylene/butene isomer sets next
   (pedagogical value); alkanes last (already <1 kJ).

Nothing in this file changes engine behaviour; it is a to-review list.
