# Curation backlog — estimated `dHf_298` records with known primaries

**Status: SURVEY for Vítor's curation.  No `.dat` was modified.**
Promotion of any value is a curation act (primary review) and his alone.

Date: 2026-08-02.  Method: every `provenance { dHf_298 { origin
estimated; method "Joback"; } }` in `data/standards/components/`
(45 records), cross-referenced against corpus consumers; deviations
quoted only where the primary value is well established.

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
* **`neopentane`**: −155,280 vs measured **−168,050** (Prosen &
  Rossini 1945) — ~13 kJ; the `process05` tutorial already overlays
  the measured value case-locally, so promoting the standard record
  would also let that overlay retire.
* **`cyclopropane`**: −12,110 vs measured **+53,300** — a ~65 kJ error
  and the wrong SIGN: ring strain is the textbook failure mode of
  group additivity.  The worst suspected outlier in the tree.

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
