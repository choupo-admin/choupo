# `parameters/partition/` — octanol-water partition records (phase-2 reclassification)

PRIVATE tier (`data/tmp/`, gitignored).  Created **2026-07-24** by
`agent:partition` as part of the arity-correct reclassification: a logKow /
logP / logD is the partition of a **given chemical form at a given T and pH**
between two solvents — **arity 3** (`solute` + `octanol` + `water`), a SYSTEM
property.  It is therefore **not** an intrinsic component field, and per
`RECORD_SPEC.md` ("zero usable science may live only in a comment") it may not
stay as a comment line inside `components/*.candidate.dat` either.

Every value below is transcribed **verbatim** from the family ledgers
(`data/tmp/*_SOURCES.md`) and/or the component comment lines.  Nothing was
converted, averaged, reconciled or invented.  `logP` (neutral form) and `logD`
(a stated pH) are **never merged** — they are different quantities and get
different records.

The component files were **not modified** — this phase only *emits* the
reclassified records.

**Temperature caveat, all 34 records:** none of the sources restates the
temperature for a partition coefficient.  Each record carries the conventional
`298.15 K` with an explicit in-file comment saying the 25 °C convention is
*assumed*, not sourced.  Pressure is likewise annotated as assumed ambient.

---

## Records emitted — 34 (33 compounds; sulfamethoxazole carries two)

### status `candidate` — measured + primary-cited (24)

| # | compound | property | value | form / pH | primary |
|---|---|---|---|---|---|
| 1 | caffeine | logKow | −0.07 | neutral | Hansch, Leo & Hoekman, *Exploring QSAR*, ACS 1995, p.44 (via PubChem HSDB) |
| 2 | carbamazepine | logKow | 2.45 | neutral | Dal Pozzo et al., *Int. J. Pharm.* 50 (1989) 97-101 |
| 3 | ibuprofen | logKow | 3.97 | neutral | Avdeef, *J. Pharm. Sci.* 82 (1993) 183-190 |
| 4 | diclofenac | logKow | 4.51 | neutral | Avdeef (1997) |
| 5 | naproxen | logKow | 3.18 | neutral | Hansch, Leo & Hoekman 1995, p.121 |
| 6 | ketoprofen | logKow | 3.12 | neutral | Sangster, LOGKOW Databank (1993) |
| 7 | sulfamethoxazole | logKow | 0.89 | neutral | HSDB CID 5329 (concurs Radjenović et al., *Water Res.* 42 (2008) 3601) |
| 8 | sulfamethoxazole | **logD** | −1.54 | **anion, pH 8** | Bizi & El Bachra, *Molecules* 26 (2021) 7318 |
| 9 | trimethoprim | logKow | 0.91 | neutral | HSDB CID 5578 |
| 10 | primidone | logKow | 0.91 | neutral | HSDB CID 4909 |
| 11 | atenolol | logKow | 0.16 | neutral free base | HSDB CID 2249 |
| 12 | estradiol | logKow | 4.01 | neutral | Hansch, Leo & Hoekman 1995 (LogP DB) |
| 13 | estrone | logKow | 3.13 | neutral | Hansch, Leo & Hoekman 1995 |
| 14 | ethinylestradiol | logKow | 3.67 | neutral | Hansch, Leo & Hoekman 1995 |
| 15 | estriol | logKow | 2.45 | neutral | Hansch, Leo & Hoekman 1995 |
| 16 | testosterone | logKow | 3.32 | non-ionizable | Hansch, Leo & Hoekman 1995 |
| 17 | progesterone | logKow | 3.87 | non-ionizable | Hansch, Leo & Hoekman 1995 |
| 18 | bisphenolA | logKow | 3.32 | neutral | Hansch, Leo & Hoekman 1995; also ILO-WHO ICSC (CC-BY) |
| 19 | urea | logKow | −2.11 | non-ionizable | Hansch, Leo & Hoekman 1995, p.3 |
| 20 | acrylamide | logKow | −0.67 | non-ionizable | Hansch, Leo & Hoekman 1995, p.6 |
| 21 | NDMA | logKow | −0.57 | non-ionizable | Hansch, Leo & Hoekman 1995, p.5 |
| 22 | atrazine | logKow | 2.61 | neutral | Hansch, Leo & Hoekman 1995, p.48 |
| 23 | simazine | logKow | 2.18 | neutral | Hansch, Leo & Hoekman 1995, p.34 |
| 24 | diuron | logKow | 2.68 | non-ionizable | Hansch, Leo & Hoekman 1995, p.56 |

Row 8 is a **logD**, deliberately a separate record from row 7's logKow for the
same compound — the two are different quantities and were never merged.

### status `flagged` — computed / estimated / unpinned / physically ill-defined (10)

| # | compound | property | value | origin | why flagged |
|---|---|---|---|---|---|
| 25 | glyphosate | logKow | −3.40 | measured | Sangster **evaluated** database, but glyphosate is a polyprotic zwitterion (pKa 2.0/2.6/5.6/10.6, net ≈ −2 at pH 7): a single neutral-form logKow is only nominally defined, and the same compilation reports a −4…−1 spread. |
| 26 | metformin | logKow | −1.43 | measured | **No primary pinned.** Widely-quoted free-base value; PubChem has only the computed XLogP3 (−0.5). Also physically beside the point — metformin is a permanent cation (pKa 12.4) at every process pH. |
| 27 | gemfibrozil | logKow | 4.77 | **estimated** | Radjenović 2008 Table 1 attributes it to **Syracuse KOWWIN**, a fragment QSAR *estimator*. HMDB predicts 3.4 — 1.4 log units apart. |
| 28 | iopromide | logKow | −2.05 | **estimated** | HMDB **computed** value; no open experimental logP exists. |
| 29 | PFOA | logKow | 6.3 | measured | ILO-WHO ICSC #1613 (CC-BY), but logKow is **ill-defined for a perfluoroalkyl surfactant** — PFOA is anionic (pKa −0.5, Goss 2007), adsorbs at the interface and aggregates. |
| 30 | PFBA | logKow | 1.05 | **estimated** | ITRC labels it an **estimate**; same surfactant caveat as PFOA. |
| 31 | sorbitol | XLogP3 | −3.1 | **estimated** | PubChem **computed** descriptor, not a measurement. |
| 32 | mannitol | XLogP3 | −3.1 | **estimated** | PubChem computed descriptor. Identical to sorbitol's — XLogP3 cannot tell the two diastereomers apart, which is itself the argument against using it as data. |
| 33 | xylitol | XLogP3 | −2.5 | **estimated** | PubChem computed descriptor. |
| 34 | erythritol | XLogP3 | −2.3 | **estimated** | PubChem computed descriptor. |

`property` is written as `XLogP3` (not `logKow`) for records 31-34 so the
prediction can never be mistaken for a measured partition coefficient.

**Measured vs estimated:** 27 `origin measured` · 7 `origin estimated`
(gemfibrozil, iopromide, PFBA, sorbitol, mannitol, xylitol, erythritol).

---

## Deliberately NOT emitted

| compound / value | why |
|---|---|
| **PFOS** logKow | The source (ATSDR 2021) states **"not applicable (ionic surfactant)"** — that is the absence of a datum, not a datum. No empty record. |
| **PFBS** logKow | Same: "not applicable (ionic surfactant)". |
| **ibuprofen** `logD(pH7) ~ 1.0` | An unattributed parenthetical aside in the component comment, no primary, no stated method. A logD is a measurement, not a note — recording it would manufacture a datum. |
| **atenolol** implied logD(pH7) | Only mentioned qualitatively ("~2.5 log units lower") as reasoning, never as a value. |
| the 9 amino acids (glycine, alanine, serine, valine, glutamicAcid, lysine, arginine, phenylalanine, taurine) | No logKow/logP/logD anywhere in their files or in `aminoacids_SOURCES.md`. Correctly so — these are zwitterions whose NF/RO behaviour is speciation-driven; partition is not the descriptor. |
| nPropanol, limonene, alphaPinene, HMF, furfurylAlcohol, gammaValerolactone, levulinicAcid | No partition datum in file or ledger (they were curated for the VLE/Joback leg, not the membrane-solute leg). |
| the 6 sugars (fructose, galactose, xylose, arabinose, lactose, trehalose) | No logKow/XLogP recorded for any of them. |
| glycine…/all others' `logKoc` (PFBS 1.2-2.7) | **Organic-carbon** partition — a different system (soil organic matter, not octanol). Out of this family's scope; belongs in its own record type if ever needed. |

---

## Disagreements between a component file and its family ledger

None on the partition side. Every logKow/logD number in
`components/*.candidate.dat` matches its `*_SOURCES.md` entry digit-for-digit.

What *does* disagree is **between sources for the same compound** — recorded
inside each `.dat` as a comment, never merged or averaged:

- carbamazepine 2.45 (Dal Pozzo) vs DrugBank 2.77
- diclofenac 4.51 (Avdeef) vs HMDB 3.9
- gemfibrozil 4.77 (KOWWIN) vs HMDB 3.4
- trimethoprim 0.91 (HSDB expt) vs HMDB 0.6 (predicted)
- primidone 0.91 (HSDB expt) vs HMDB 1.6 (predicted)
- metformin −1.43 (unpinned expt) vs XLogP3 −0.5 (computed)
- glyphosate −3.40 (Sangster evaluated) vs a −4…−1 reported range

---

# PHASE 6 (2026-07-24) — the rights ruling applied, and the coverage gaps tested

Two things happened to this directory in phase 6: a **rights ruling from the project
advisor** that invalidates the largest single source behind these records, and a
**coverage-gap sweep** that found almost nothing addable. The ruling dominates, so it
comes first.

## 6.1 THE RULING — `Exploring QSAR` is not a redistributable source

> **Hansch, Leo & Hoekman, *Exploring QSAR* (ACS 1995) is NOT a redistributable source.**
> It is a protected ACS monograph that, in this use, functions as a compilation/databank.
> Neither its values nor the table's selection/arrangement may be the source of record.
> It may be used ONLY as a bibliographic lead, and only via the full chain: (1) identify
> the PRIMARY it cites for that compound; (2) obtain and read that primary independently;
> (3) confirm IN the primary the value, its definition, T, pH / chemical form and units;
> (4) cite the PRIMARY — never Hansch; (5) if the primary is not identifiable or its
> rights are incompatible, DELETE the value and leave a structured absence.
> Until that chain is complete, the record is `rightsPending`.
>
> **The same rule applies to HMDB** where it is the sole value source: a public page plus
> a citation obligation is not a GPL-compatible redistribution licence, and there are
> public references to academic/non-commercial use. HMDB is a **locator**, not a canonical
> source.

**Phase 2's claim of "rightsPending = 0" on the partition side was not factual. It is
corrected here.** No value was deleted except where the ruling's step (5) required it;
values are retained in this private tier for internal evaluation only, at
`rightsPending`, and are **not promotable**.

## 6.2 Per-value audit — every status change

The ruling asks for: old source · primary identified · primary read · new status.

### (a) Hansch-backed — 15 records, `candidate` → `rightsPending`

| compound | value | old source | primary identified | primary read | new status |
|---|---|---|---|---|---|
| caffeine | −0.07 | Hansch p.44, via PubChem/HSDB | no | no | rightsPending |
| naproxen | 3.18 | Hansch p.121, via PubChem/HSDB | no | no | rightsPending |
| estradiol | 4.01 | Hansch LogP DB, via CID 5757/HSDB | no | no | rightsPending |
| estrone | 3.13 | Hansch LogP DB, via CID 5870/HSDB | no | no | rightsPending |
| ethinylestradiol | 3.67 | Hansch LogP DB, via CID 5991/HSDB | no | no | rightsPending |
| estriol | 2.45 | Hansch LogP DB, via CID 5756/HSDB | no | no | rightsPending |
| testosterone | 3.32 | Hansch LogP DB, via CID 6013/HSDB | no | no | rightsPending |
| progesterone | 3.87 | Hansch LogP DB, via CID 5994/HSDB | no | no | rightsPending |
| bisphenolA | 3.32 | Hansch LogP DB (+ ILO-WHO ICSC) | no | no | rightsPending |
| urea | −2.11 | Hansch p.3, via PubChem/HSDB | no | no | rightsPending |
| acrylamide | −0.67 | Hansch p.6, via PubChem/HSDB | no | no | rightsPending |
| NDMA | −0.57 | Hansch p.5, via PubChem/HSDB | no | no | rightsPending |
| atrazine | 2.61 | Hansch p.48, via PubChem/HSDB | no | no | rightsPending |
| simazine | 2.18 | Hansch p.34, via PubChem/HSDB | no | no | rightsPending |
| diuron | 2.68 | Hansch p.56, via PubChem/HSDB | no | no | rightsPending |

**Primary identified = "no" for all fifteen.** The values reached this tier through a
PubChem/HSDB re-quote of the monograph, and that re-quote does not surface the
determination the monograph itself cites. There is no shortcut: the chain has to start
at step (1) for each compound.

### (b) Other excluded / unverifiable sources — 4 records

| compound | value | old source | why | primary identified | primary read | old → new |
|---|---|---|---|---|---|---|
| ketoprofen | 3.12 | Sangster **LOGKOW Databank** (1993), via PubChem **DrugBank** | both ends excluded (LOGKOW named in the phase-4 exclusion list; DrugBank CC BY-NC) | no | no | **candidate → rightsPending** |
| glyphosate | −3.40 | Sangster LOGKOW evaluated DB | excluded compilation | no | no | **flagged → rightsPending** |
| diclofenac | 4.51 | "Avdeef, A. (1997)", via PubChem DrugBank/HSDB | the citation has no journal/volume/pages — it cannot be located, so it cannot have been read; route is CC BY-NC | **no** | no | **candidate → rightsPending** |
| iopromide | −2.05 | **HMDB computed logP** — sole source | ruling: HMDB is a locator; and there is no primary to re-route to because the number was HMDB's own *prediction* | no (none exists) | n/a | **flagged → rightsPending, VALUE DELETED** |

**ketoprofen also carried a false corroboration.** Phase 2 wrote that the value was
*"corroborated independently at 3.12 by Hidalgo et al., Membranes 13 (2023) 868, Table 3"*.
Phase 6 read that paper (PMC10673372, CC BY): **Table 3 is a compiled property table
attributed to the paper's own refs [25]–[27]** — Hidalgo measured flux and rejection, not
log Kow. The claim is withdrawn in the record. *An open-access re-quote of a
non-redistributable compilation launders nothing.*

**iopromide is the only value DELETED** (ruling step 5). The file is kept as a
**structured absence** — `value {}` deliberately empty, with an `absence {}` block naming
the deleted number, its origin, why it went, and an instruction not to reinstate a
prediction. Deleting it silently would have looked like an oversight; leaving it would
have kept a prediction dressed as data.

### (c) Verification audit beyond the ruling — 2 records, `candidate` → `flagged`

Phase 6 works to "a value is `measured` only if you saw the primary report it". Two
records have **clean rights and a complete, locatable citation** but were never opened:

| compound | value | source | primary identified | primary read | old → new |
|---|---|---|---|---|---|
| ibuprofen | 3.97 | Avdeef, *J. Pharm. Sci.* 82 (1993) 183–190; via PubChem/HSDB | **YES** | no | candidate → flagged |
| carbamazepine | 2.45 | Dal Pozzo et al., *Int. J. Pharm.* 50 (1989) 97–101; via PubChem/HSDB | **YES** | no | candidate → flagged |

**These two are the cheapest fixes in the directory** — one reading of a named paper
promotes each to `candidate` with T and chemical form confirmed rather than assumed. Do
them before chasing any new data.

### (d) HMDB as a comparison, not a source — 4 records, status unchanged

gemfibrozil, primidone, trimethoprim, atenolol each *mention* an HMDB value as a
disagreement. HMDB is not their value source, so nothing changes — but the comparison is
**demoted to non-evidential**: an HMDB number may no longer be read as independent
evidence either way. In every case it is also a *computed* value, so quoting it as a
"disagreement" overstated it twice.

*(Note on scope: the ruling anticipated ~4 HMDB sole-source records. On inspection there
is exactly **one** — iopromide. The other HMDB appearances are comparison lines, handled
as above. Reported rather than quietly reconciled.)*

### (e) Survivors — 5 records still `candidate`

| compound | property | source | why it survives |
|---|---|---|---|
| sulfamethoxazole | logKow 0.89 | HSDB CID 5329 (+ Radjenović 2008 concurrence) | HSDB is a **US-government public-domain** work |
| sulfamethoxazole | **logD −1.54 @ pH 8** | Bizi & El Bachra, *Molecules* 26 (2021) 7318 | **open-access primary determination** — the strongest record here |
| trimethoprim | logKow 0.91 | HSDB CID 5578 | public domain |
| primidone | logKow 0.91 | HSDB CID 4909 | public domain |
| atenolol | logKow 0.16 | HSDB CID 2249 | public domain |

The four HSDB records now carry an explicit caveat: **rights are clean, provenance depth
is not.** HSDB is itself a compilation; it labels these experimental but the underlying
determination has not been traced. Only the Bizi & El Bachra logD rests on a primary the
project may both use and read.

### (f) Roll-up

| status | phase 2 | phase 6 |
|---|---|---|
| `candidate` | 24 | **5** |
| `flagged` | 10 | **10** |
| `rightsPending` | **0 (claimed)** | **19** |
| records | 34 | 34 (one now valueless) |

**The hormone/EDC partition capability is gone.** All six steroid/EDC records —
estradiol, estrone, estriol, ethinylestradiol, testosterone, progesterone — plus
bisphenolA were Hansch-backed and are now `rightsPending`. There is **no usable
octanol-water partition datum for any hormone in this tier.** Nothing survives, nothing
was deleted, everything is pending re-routing.

**Cheapest re-route lead:** bisphenolA's record also names the **ILO-WHO International
Chemical Safety Card** (redistributable). Phase 6 tried to fetch ICSC card 0634 and got
HTTP 403 — **the card was not read**, so it is not cited. A curator with access should
read it and re-point. Note an ICSC is itself a safety compilation: it would justify
`flagged`, not `candidate`.

## 6.3 Coverage gaps — tested, and mostly real

24 of 57 compounds had no partition record. Phase 6 tested the two the brief named.

### Polyols (sorbitol / mannitol / xylitol / erythritol) — no measured logKow found

These four carry PubChem **XLogP3 predictions**, correctly written as
`property XLogP3` rather than `logKow`. The brief asked whether a measured value exists
for any. **None was found**, and phase 6's judgement is that this is a **real absence,
not a failed search**: a polyol partitions overwhelmingly into water (logKow ≈ −2 to −3),
so the octanol-phase concentration in a shake-flask sits at or below detection. The
measurement is close to *unperformable* by the standard method, and the values circulating
in the literature appear to be fragment-QSAR estimates of the same family as XLogP3 itself.

`property XLogP3` is retained. Do not substitute another prediction under a better name.

**The sharpest argument against using these numbers is now on the record.** Phase 6
*did* close the **speciation** gap for two of these four, from a primary read in full —
Thamsen, *Acta Chem. Scand.* 6 (1952) 270–284: **mannitol pK′ 13.50, sorbitol pK′ 13.57**
(18 °C, I = 0.015–0.05 M). A measurement **separates the diastereomers**. XLogP3 assigns
both the identical **−3.1**, because it cannot tell them apart at all. Cross-referenced
from each record to `../../chemistry/aqueousSpeciation/{mannitol,sorbitol}-pKa1.candidate.dat`.

### metformin — still unpinned, and still the wrong quantity

No primary found for the widely-quoted −1.43. Stays `flagged`. The phase-2 **physical**
objection dominates and is not fixable by better sourcing: metformin is a permanent
cation (pKa₂ = 12.4) at every process pH, so a neutral-form logKow is not the descriptor
that governs it. **Sharpened action: look for a measured logD(pH), not for this value's
primary.**

### PFOA / PFBA — speciation moved, partition did not

Phase 6 re-pointed the PFAS *speciation* records to Vierke, Berger & Cousins, *ES&T* 47
(2013) 11032–11039. That paper reports no partition coefficients, so these records are
unchanged. The phase-2 objection stands and is physical: **logKow is ill-defined for a
perfluoroalkyl surfactant**, which adsorbs at interfaces and self-associates, so the
shake-flask quantity is not the partition of a dissolved species at all. Consistency note
now in each record: PFOS and PFBS were deliberately *not* emitted in phase 2 because ATSDR
says "not applicable (ionic surfactant)"; the same reasoning arguably applies to PFOA and
PFBA, and the values survive only because a redistributable source (ILO-WHO ICSC, CC-BY)
prints them.

### Confirmed as having no meaningful partition datum (unchanged from phase 2)

- **The 9 amino acids** — zwitterions whose NF/RO behaviour is speciation-driven.
  Partition is not the descriptor. Correctly absent, not a gap.
- **PFOS, PFBS** — the source states "not applicable (ionic surfactant)". *That is the
  absence of a datum, not a datum.* No empty record.
- **The 6 sugars** — no logKow or XLogP recorded for any; same hydrophilicity argument as
  the polyols.
- **nPropanol, limonene, alphaPinene, HMF, furfurylAlcohol, gammaValerolactone,
  levulinicAcid** — curated for the VLE/Joback leg, not the membrane-solute leg. A gap by
  scope, not by chemistry; all seven are ordinary shake-flask compounds and would be
  fillable if a primary were read.

## 6.4 Genuinely unfillable from open sources (as of phase 6)

1. **All 15 Hansch values** — until each compound's primary is identified, obtained and
   read, one at a time. The whole hormone/EDC capability sits here.
2. **ketoprofen, glyphosate** — the LOGKOW Databank is an evaluated compilation that does
   not name its underlying reports.
3. **diclofenac** — the Avdeef 1997 reference is too incomplete to identify.
4. **iopromide** — no experimental value appears to exist; value deleted.
5. **The 4 polyols** — likely unperformable by shake-flask, not merely unperformed.
6. **metformin** — unpinned, and the wrong quantity in any case.

## 6.5 Follow-ups

1. **Two cheap wins first:** read Avdeef 1993 (ibuprofen) and Dal Pozzo 1989
   (carbamazepine). Both are named, complete, rights-clean citations; each promotes
   `flagged → candidate` for the cost of one reading.
2. **Fetch ILO-WHO ICSC 0634** (bisphenolA) — the one Hansch record with a redistributable
   alternative already named.
3. **Work the Hansch fifteen** compound by compound through the five-step chain. Start
   with the hormones, since that capability is now empty.
4. **Trace the HSDB four** (sulfamethoxazole, trimethoprim, primidone, atenolol) to their
   determinations — rights are fine, depth is not.
5. **Do not** re-import anything from Hansch, DrugBank, HMDB, the LOGKOW Databank, Merck,
   CRC, BCPC, or the CC BY-NC IUPAC digitisation. Every one of these was tried and
   excluded; the exclusions are recorded in the records themselves so the next pass does
   not spend the effort again.
