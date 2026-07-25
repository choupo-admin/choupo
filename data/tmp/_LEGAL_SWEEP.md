# `_LEGAL_SWEEP.md` — excluded-source audit of the whole staging tree

**Written 2026-07-24 by `agent:henry` (phase 4). REPORT ONLY — no component,
speciation, solubility or partition file was edited by this pass.** Private tier
(`data/tmp/`, gitignored).

> **Snapshot caveat.** The sweep was machine-run on **2026-07-24** while other
> phase-4 passes were concurrently editing `components/`,
> `parameters/solubility/` and `chemistry/`. Every line quoted below was read
> live from the file at sweep time; a record another agent has since re-marked
> may already be fixed. **Re-run the sweep before acting on the counts.** The
> classification logic is reproducible: an excluded source named anywhere in a
> record, joined to the nearest enclosing block's `status` and `licence`.

Scope: every `.dat` under `components/`, `parameters/`, `chemistry/`,
`evidence/` and `redundant-in-local/` — **283 record files**, machine-swept for
the sources `CLAUDE.md` §10 excludes from the public tier *regardless of
copyleft*:

* **NonCommercial**: DrugBank (CC BY-NC 4.0), CAS Common Chemistry
* **no-grant / all-rights-reserved**: NIST SRD/WebBook, CRC Handbook, Merck
  Index, DIPPR, Yaws, Engineering Toolbox, REFPROP, BCPC Pesticide Manual,
  LOGKOW Databank
* plus the subtler rule: a NIST WebBook **average of N determinations** is the
  aggregator's *arrangement*, not a bare fact, even though each input is.

## Headline

| | |
|---|---|
| record files with at least one excluded-source hit | **91 / 283** |
| of those, carrying a `rightsPending` marking somewhere | 36 |
| of those, carrying **no** `rightsPending` marking anywhere | **55** |
| **MIS-MARKED** — an excluded source is the *cited source of a retained value*, yet the record still reads as promotable | **38** |
| excluded-source **numbers quoted verbatim** inside otherwise-fine records | 8 |
| correctly marked (`rightsPending`, or `[FLAG -- AGGREGATE]`, or WebBook used only as a declared finding aid with the primary re-cited) | 45 |
| `evidence/` and `redundant-in-local/` | **clean — zero hits** |
| DIPPR · Yaws · Engineering Toolbox · REFPROP · CAS Common Chemistry | **zero hits anywhere in the records** |

The aggregate rule is the one thing the corpus got **completely right**: all
five NIST "average of N" values are marked `[FLAG -- AGGREGATE]` *and*
`status flagged`. **Zero mis-marked aggregates.**

---

# 1. THE FINDING THAT MATTERS — mis-marked values

An excluded source is the **cited source of a value that is retained**, and the
record does **not** say so in a machine-readable way. Split by how badly it
reads as promotable.

## 1a. Status `candidate` — reads as fully promotable (10 records)

| file | quantity | offending source | current `status` / `licence` | verdict |
|---|---|---|---|---|
| `parameters/partition/ketoprofen-octanol-water.candidate.dat` | logKow 3.12 | **LOGKOW Databank (Sangster 1993) AND DrugBank** (`"...; via PubChem DrugBank"`) | `candidate` / `"facts, primary-cited"` | **MIS-MARKED — double offender.** Two excluded sources and neither is named as such |
| `chemistry/aqueousSpeciation/atenolol-pKa1.candidate.dat` | pKa | **DrugBank** (co-cited with HSDB) | `candidate` / `"facts, primary-cited (HSDB, US NLM -- public domain)"` | **MIS-MARKED.** The licence string claims public domain while the citation names DrugBank |
| `chemistry/aqueousSpeciation/trimethoprim-pKa1.candidate.dat` | pKa | **DrugBank** (co-cited with HSDB) | `candidate` / same PD claim | **MIS-MARKED**, identical pattern |
| `chemistry/aqueousSpeciation/metformin-pKa2.candidate.dat` | pKa | **DrugBank** (co-cited with HSDB) | `candidate` / same PD claim | **MIS-MARKED** — and see §1b: `metformin-pKa1`, with the *identical citation string*, is `flagged`. Two steps of one equilibrium ladder disagree with each other |
| `chemistry/aqueousSpeciation/glyphosate-pKa1.candidate.dat` | alternative pKa 2.34 | **BCPC e-Pesticide Manual 15th ed.** | `candidate` / — | **MIS-MARKED.** BCPC *numbers* are stored verbatim in a comment inside a `candidate` record |
| `chemistry/aqueousSpeciation/glyphosate-pKa2.candidate.dat` | alternative pKa 5.73 | idem | `candidate` / — | **MIS-MARKED** |
| `chemistry/aqueousSpeciation/glyphosate-pKa3.candidate.dat` | alternative pKa 10.2 | idem | `candidate` / — | **MIS-MARKED** |
| `chemistry/aqueousSpeciation/glyphosate-pKa4.candidate.dat` | the same 3-step set | idem | `candidate` / — | **MIS-MARKED** |
| `parameters/partition/diclofenac-octanol-water.candidate.dat` | logKow 4.51 | route `"via PubChem DrugBank/HSDB"` | `candidate` / `"facts, primary-cited"` | **lower severity** — the primary *is* named (Avdeef 1997), DrugBank is only the retrieval route. But the primary citation is incomplete (no journal/volume/page), so the route is currently the only verifiable thing in the record |
| `parameters/partition/carbamazepine-octanol-water.candidate.dat` | cross-check 2.77 | **DrugBank** | `candidate` / — | **lower severity** — the value (2.45, Dal Pozzo 1989) is clean; a DrugBank number rides along in a comment |

The glyphosate four are also a `RECORD_SPEC.md` violation in their own right:
usable science (three pKa digits) living only in a comment.

## 1b. Status `flagged` with an open `licence` — legally under-marked (28 records)

`flagged` is the corpus's **quality** mark; `rightsPending` is its **legal**
mark. These 28 carry the quality mark for a *legal* defect and simultaneously
assert `licence "facts, primary-cited"` — so a promotion script keyed on
`licence` would pass them.

| files | quantity | offending source | verdict |
|---|---|---|---|
| **22 amino-acid pKa records**: `alanine-pKa1/2`, `arginine-pKa1/2/R`, `glutamicAcid-pKa1/2/R`, `glycine-pKa1/2`, `lysine-pKa1/2/R`, `phenylalanine-pKa1/2`, `serine-pKa1/2/R`, `taurine-pKa1/2`, `valine-pKa1/2` (all in `chemistry/aqueousSpeciation/`) | pKa | **CRC Handbook 84th ed.** (co-cited with Lehninger, *Principles of Biochemistry* — also a copyrighted textbook) | **MIS-MARKED.** Each file *does* carry an in-comment `// LEGAL:` note saying the lineage is paywalled and must be re-pinned — but `status` says `flagged` and `licence` says `"facts, primary-cited"`. The single biggest block in the sweep, and it is the whole amino-acid speciation capability |
| `parameters/solubility/atrazine-water.candidate.dat` | aqueous solubility | **Yalkowsky, *Handbook of Aqueous Solubility Data*, 2nd ed., CRC 2010, p.152** | **MIS-MARKED** — mitigated: the record *does* name a primary lineage (Ward & Weber), so it is re-citable |
| `parameters/solubility/caffeine-water.candidate.dat` | aqueous solubility | **Yalkowsky, He & Jain, CRC 2010** | **MIS-MARKED** — no primary named |
| `parameters/solubility/naproxen-water.candidate.dat` | aqueous solubility | **Yalkowsky & He, CRC 2003, p.962** | **MIS-MARKED** — no primary named |
| `parameters/partition/glyphosate-octanol-water.candidate.dat` | logKow −3.40 | **Sangster, LOGKOW evaluated database** | **MIS-MARKED** — flagged only for the zwitterion physics, not for the source |
| `chemistry/aqueousSpeciation/metformin-pKa1.candidate.dat` | pKa | **DrugBank** | **MIS-MARKED** — and inconsistent with `metformin-pKa2` (§1a), same citation string, `candidate` |
| `components/trimethoprim.candidate.dat` (`meltingPoint` block) | Tfus range 472.15–476.15 K | **DrugBank** (+ HMDB) | **MIS-MARKED** — `status flagged` for "the measuring primary is not pinned", `licence "facts, primary-cited"`; DrugBank's NC licence is not mentioned |

That the three CRC/Yalkowsky solubility records sit at `flagged` while the nine
Merck-Index solubility records in the *same directory* sit at `rightsPending`
is an internal inconsistency inside one family, not a judgement call.

## 1c. Excluded-source numbers quoted verbatim inside otherwise-fine records (8)

The value is sourced elsewhere and correctly; an excluded source's **number**
still travels in a `crossCheck {}` or a comment. Low severity — but if the file
is ever promoted, the string goes with it.

| file | quoted number | source | host block status |
|---|---|---|---|
| `components/gemfibrozil.candidate.dat` | Tfus 58–61 °C | DrugBank | `flagged` |
| `components/atenolol.candidate.dat` | Tfus 158–160 °C | DrugBank | `flagged` |
| `components/metformin.candidate.dat` | 223–226 °C (`withheldStatement`) | DrugBank/HMDB | `flagged` — **correct handling**, the value is explicitly withheld |
| `parameters/solubility/acrylamide-water.candidate.dat` | 371 g/L @ 20 °C | CRC Handbook 95th ed. | `flagged` (value itself is ICSC, CC-BY — clean) |
| `parameters/partition/carbamazepine-octanol-water.candidate.dat` | logKow 2.77 | DrugBank | `candidate` (also §1a) |
| `chemistry/aqueousSpeciation/glyphosate-pKa1..4` | 2.34 / 5.73 / 10.2 | BCPC | `candidate` (also §1a) |

---

# 2. Correctly marked — no action (45 records)

| pattern | n | why it is correct |
|---|---|---|
| `status rightsPending` + an explicit legal comment | 36 files | Merck Index (17), CRC/Weast/Lide (8), BCPC (8), LOGKOW/Sangster (4), DrugBank (1: `estradiol-pKa1`, the flagship finding of phase 3), NIST/TRC (1) |
| **NIST aggregates** — `[FLAG -- AGGREGATE]` + `status flagged` | 5 values / 3 files | `nPropanol` `Pc` (avg of 12), `Tb` (avg of 127), `dHf_298` (avg of 7); `limonene` `Tb` (avg of 18); `alphaPinene` `Tb` (avg of 14). Each names the aggregation in the citation string and declares itself not citable. **This is the model treatment.** |
| **WebBook as a declared finding aid**, value re-cited to a named primary | 5 files (`urea`, `acrylamide`, `lysine`, `phenylalanine`, `taurine`) | `route "... used only as a finding aid -- a no-grant compilation, the value is re-cited to the primary"`, with the primary named (Kabo 1990, Andersson & Matsuo 1993, …). Exactly what §10's "cite the PRIMARY, never the aggregator's arrangement" asks for |
| WebBook named only in a `blockedBy` / gap note, **no value taken** | 6 files (`NDMA`, `arginine`, `lactose`, `erythritol`, `sorbitol`, `furfurylAlcohol`) | an absence statement, not a datum |
| `nPropanol` `Tc` 536.71 | 1 | the WebBook *named* its primary (Ambrose & Townsend 1963); the average was **replaced** by it. The right fix, done |

---

# 3. Adjacent exposures — NOT on the brief's list, flagged for a decision

These are **not** currently excluded by `CLAUDE.md` §10. They are raised because
they are structurally the same kind of source as ones that are. **None of them
should be acted on without Vítor's ruling.**

| source | n | why it is raised |
|---|---|---|
| **Hansch, Leo & Hoekman, *Exploring QSAR*, ACS 1995** | **15 records, ALL `status candidate`** — `acrylamide`, `atrazine`, `bisphenolA`, `caffeine`, `diuron`, `estradiol`, `estriol`, `estrone`, `ethinylestradiol`, `naproxen`, `NDMA`, `progesterone`, `simazine`, `testosterone`, `urea` (all `parameters/partition/`) | a copyrighted ACS monograph whose *tables* are the source — structurally identical to the LOGKOW Databank, which **is** excluded. Mitigation: most cite `"; via PubChem HSDB"`, and HSDB is US NLM public domain, so the retrieval route is clean and Hansch is the primary attribution. **But this is 15 values lifted from one copyrighted table** — the systematic-extraction pattern (EU sui generis) that `RECORD_SPEC.md` warns about. It is the single largest concentration of one source in the whole tree, and it is the *only* backing for the entire hormone/EDC partition capability |
| **HMDB** (Human Metabolome Database) | 4 records where it is the **sole** value source: `components/trehalose` (Tfus), `components/gemfibrozil` (Tfus), `parameters/partition/iopromide-octanol-water` (computed logP), `parameters/solubility/carbamazepine-water` | same laboratory and same licensing family as DrugBank; HMDB's terms restrict commercial redistribution. Several records label it `"HMDB (public)"`. **Verify the current HMDB licence** — if it is NC, these four join §1 and `components/trimethoprim` gains a second offending co-source |
| **Poling, Prausnitz & O'Connell** tabulation | `nPropanol` `omega`, `idealGasHeatCapacity` | copyrighted textbook compilation; already `flagged` with `"copyrighted compilation, no primary"` — correctly handled, listed for completeness |
| **Majer & Svoboda (1985)** evaluated compilation | `nPropanol` `HvapTb` | already `[FLAG -- EVALUATED COMPILATION]` — correct |
| **Lehninger, *Principles of Biochemistry*** | co-cited on all 22 amino-acid pKa | a copyrighted textbook standing beside CRC in §1b |
| **Aldrich catalogue (1990)** | `gammaValerolactone`, `levulinicAcid` `Tb` | a vendor catalogue, reached *via* the WebBook; already `[FLAG -- VENDOR SOURCE]` |
| **"standard handbook value"**, unnamed | `furfurylAlcohol` `Tb` 443 K | an unnamed handbook cannot have its licence checked at all. `[FLAG -- NO PRIMARY]` — correct as far as it goes |
| **ChemicalBook** | `galactose`, `arabinose` | commercial aggregator; already `rightsPending` |
| **ITRC** | `parameters/soilPartition/PFBS-soilOrganicCarbon-water` (created by this pass) | published for free public use, but the redistribution grant was **not verified**; flagged in the record's own `licence` field |

---

# 4. Counts per source

Distinct record files carrying at least one hit (a file can appear under more
than one source).

| source | files | correctly marked | **MIS-MARKED** | quoted-number only |
|---|---:|---:|---:|---:|
| CRC Handbook family (CRC, Weast, Lide, Yalkowsky/CRC) | 34 | 8 | **25** | 1 |
| Merck Index | 17 | 17 | 0 | 0 |
| NIST WebBook / SRD | 17 | 17 | **0** | 0 |
| DrugBank | 13 | 1 | **7** | 3 |
| BCPC Pesticide Manual | 12 | 8 | **4** | 0 |
| LOGKOW Databank (Sangster) | 6 | 4 | **2** | 0 |
| DIPPR | 0 | — | — | — |
| Yaws | 0 | — | — | — |
| Engineering Toolbox | 0 | — | — | — |
| REFPROP | 0 | — | — | — |
| CAS Common Chemistry | 0 | — | — | — |
| **distinct files, all sources** | **91** | 45 | **38** | 8 |

(`ketoprofen-octanol-water` is counted once under DrugBank and once under
LOGKOW — it is a double offender. CAS Common Chemistry appears only in the
tier's own policy prose: `README.md`, `PROVENANCE.md`,
`chemistry/aqueousSpeciation/_LEDGER.md`.)

By family: **chemistry 39 files · components 32 · parameters 20**. The
speciation family carries the most exposure *and* the most mis-marking (30 of
its 39 hit files have no `rightsPending` anywhere).

---

# 5. Prioritised list — what must be re-routed or dropped before ANY promotion

**Gate rule for whoever owns promotion: no record whose `status` is `candidate`
may name an excluded source anywhere in the file — not in `citation`, not in a
`route`, not in a `crossCheck`, not in a comment. Today 10 do.**

| # | act | records | effort | why first |
|---|---|---|---|---|
| **1** | **Re-mark the 22 amino-acid pKa records `rightsPending`** (or re-pin to an open potentiometric primary) | 22 | mark = minutes; re-pin = a literature pass | Largest single block; it is the **entire** amino-acid speciation capability, and the files already contain the `// LEGAL:` note admitting it — only the machine-readable `status`/`licence` disagree. Cheapest possible correction of the largest exposure |
| **2** | **Re-mark or re-route the 10 `candidate` records in §1a** | 10 | low | These are the only ones that read as *fully promotable today*. `ketoprofen-octanol-water` is the easiest win in the sweep: the file already quotes an **open-access corroboration at the identical value** — Hidalgo et al., *Membranes* 13 (2023) 868, Table 3 — so re-citing to it deletes both offending sources at zero cost to the number |
| **3** | **Rule on the metformin inconsistency**, then apply it to both steps | 2 | trivial | `pKa1` `flagged` and `pKa2` `candidate` with the *same* citation string is a defect that would survive any review; it also signals the marking was applied per-file, not per-source |
| **4** | **Re-mark the 3 Yalkowsky/CRC solubility records `rightsPending`**; re-pin `atrazine-water` to its named lineage (Ward & Weber) | 3 | low | Restores consistency with the 9 Merck records in the same directory. Note: the solubility family already has **zero** `candidate` records for other reasons, so this blocks nothing new |
| **5** | **Verify the HMDB licence.** If NC → 4 sole-source records + `trimethoprim` move to `rightsPending` | 5 | one policy check | A single decision that either closes or opens a whole class. Cannot be deferred past promotion |
| **6** | **Rule on Hansch, Leo & Hoekman (ACS 1995)** — 15 `candidate` partition records | 15 | one policy check, then possibly a re-source campaign | The **largest latent exposure**. If it is ruled excluded, the hormone/EDC partition capability drops to zero `candidate` records overnight. Deciding it *before* anyone re-sources anything avoids wasted work |
| **7** | **Strip the quoted excluded-source numbers** (§1c) from records headed for promotion, keeping the *disagreement statement* without the digits | 8 | low | Preserves the scientific warning (two sources disagree) while removing the transcribed value |
| **8** | **Verify the ITRC grant** for `parameters/soilPartition/` | 1 | one check | The record is `flagged` and unconsumed by the engine, so it blocks nothing — but do not promote it on an unverified grant |
| **9** | **Decide the aggregate doctrine**: is a WebBook "average of N" a *quality* defect (`flagged`, today) or a *legal* one (`rightsPending`)? | 5 values | a ruling | The current marking is defensible and consistently applied. Raised only because `flagged` and `rightsPending` are being asked to carry two different meanings elsewhere in this report, and the two words should not blur |

**Bottom line.** Nothing in §1 is a *lost* value — every one of the 38
mis-marked records is either re-markable in place or re-citable to a named
primary, and one (`ketoprofen`) has its open replacement already written into
the file. The defect is **marking discipline**, not data: the corpus knew about
the problem (the `// LEGAL:` comments prove it) and recorded it in prose instead
of in `status`. That is the same failure mode `RECORD_SPEC.md` was written to
prevent — *zero usable science may live only in a comment* — applied to the
legal layer rather than the scientific one.
