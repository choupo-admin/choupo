# Data-licensing review — 2026-08-11

**Status: findings recorded, two decisions OPEN and owned by Vítor Geraldes.**
Commissioned before the 2026-08-31 release, after two apparent contradictions
between `NOTICE` and the shipped tree were noticed during the documentation
consolidation.  The brief was to research primary licensing sources rather than
to reason from what other simulators ship.

Scope note, stated up front because it bounds two conclusions: the session's
egress proxy blocked `chemsep.org`, `dechema.de`, `nist.gov`, `ddbst.com`,
`eur-lex.europa.eu` and `pubs.acs.org`.  Claims resting on those hosts are
marked **[secondary]** — they come from search summaries of the primary pages,
not the pages themselves.  Everything about the *repository* is direct evidence
and was re-verified by hand against the working tree and `origin/main`.

---

## 1. ChemSep / UNIFAC — **BLOCKING, and the largest exposure**

### The finding

`NOTICE` said, of the ChemSep-imported values: *"the published release does
**NOT** redistribute these values.  They are simply NOT shipped."*

They are shipped.  Verified directly:

```
$ git ls-tree -r --name-only origin/main | grep -c parameters/UNIFAC/
16
```

Two files in `data/standards/parameters/UNIFAC/` (`groups.dat`, 111 subgroups;
`interactions.dat`, 1 166 directed main-group pairs) plus fourteen sealed
mirrors inside seven tutorial cases, byte-identical apart from the importer's
`// [imported] origin ...` line.

They are **copied, not derived**.  `bin/curate/unifac_gct_to_choupo.py` reads
`thirdParty/chemsep/ipd/unifacrq.gct` and `unifacvl.gct`; the only
transformation is name sanitisation (parentheses → `_`).  The values are
unaltered.

Three documents in the tree state three incompatible positions about the same
files, and no gate reads any of them:

| document | says |
|---|---|
| `NOTICE` (before today) | not shipped |
| the files' own headers | shipped under ChemSep's Artistic-2.0 |
| `data/standards/parameters/README.md` | UNIQUAC came from ChemSep too (it did not) |

### The licensing position

**(1) What ChemSep actually licenses.**  Every attribution that could be read
verbatim attaches Artistic-2.0 to ChemSep's **pure-component database
specifically**, never to the group-contribution or interaction-parameter files:

* `kpatvt/sim21` `LICENSE` — *"ChemSep v8.1 pure component data — Copyright (c)
  Harry Kooijman and Ross Taylor (2018). Distributed under terms of
  http://www.perlfoundation.org/artistic_license_2_0"*
  (https://github.com/kpatvt/sim21/blob/master/LICENSE)
* `DanWBR/dwsim` — *"DWSIM uses the Standard Compound Database from ChemSep
  LITE … under the Perl Artistic License v2"* (https://github.com/DanWBR/dwsim)
* `juliacheme/PhysProps.jl` — same scope, *"used in an unmodified form"*
  (https://github.com/juliacheme/PhysProps.jl)
* **the load-bearing one**, `Nukleon84/OpenFMSL` — *"The pure component database
  is included in OpenFMSL according to the Artistic License.  **The binary
  interaction parameter databases can be obtained from an installation of
  ChemSep Lite.**"* (https://github.com/Nukleon84/OpenFMSL)

A project that shipped one and pointedly did not ship the other drew exactly
the line this repository crossed.  `chemsep.org/program/distribution.html`
states ChemSep LITE *"may be used for any purpose"* **[secondary]** — a *use*
grant with no redistribution language, and not a named licence.

**(2) Redistribution.**  For the pure-component database: apparently yes.  For
the `.gct` / `.ipd` files actually imported here: **not established.**  Choupo's
own `thirdParty/chemsep/NOTICE` concedes the scope of its evidence and then
exceeds it — its "factual basis" is about the *pure-component* database.

**(3) Attribution.**  Artistic-2.0 §§4–5 require the copyright notice and the
licence to accompany redistribution.  `thirdParty/chemsep/pcd/Artistic_license_2_0.txt`
is tracked, but nothing under `data/standards/` or in the seven sealed cases
points at it, and `NOTICE` had *retired* the Artistic-2.0 attribution.  So the
shipped tables carry a bare copyright line, no licence text, and a project
NOTICE that denied their existence.  **If Artistic-2.0 does cover them we are
out of compliance with it; if it does not, we have no grant at all.**  Both
branches are bad, which is what makes this the priority item.

**(4) GPL.**  Not the problem.  Artistic-2.0 is FSF-listed GPL-compatible
(https://www.gnu.org/licenses/license-list.html); mere aggregation is fine.  The
problem is upstream — whether a grant exists at all.

**(5) The citation is also incomplete.**  The shipped table carries 53 main
groups including `OCOO` (carbonate), `Sulfones`, `Morpholine`, `ACRY`, `ClCC`,
`CClF`, and `interactions.dat` ends with a distinct trailing block of ten
`OCOO` pairs — the shape of a base table with later revisions accreted onto it.
Hansen *et al.*, *IECR* **30** (1991) 2352–2355 is a four-page Revision-5 note;
the carbonate parameters are documented in the later literature (Balslev &
Abildskov, *IECR* **41** (2002) 2047) **[secondary — the ACS and DDBST pages
were egress-blocked, so the 1991 main-group count could not be read directly]**.
This matters *because* "these numbers are in a journal paper anyone may re-key"
is precisely the defence one would want, and for part of this table it is not
currently available.

### Why no gate caught it

`bin/curate/check_source_licence.py` — built on 2026-08-05 for exactly this
class of exposure — has no ChemSep pattern:

```python
ENCUMBERED = re.compile(r'\b(CRC\s+Handbook|NIST\s+WebBook|NIST\s+SRD|DIPPR|Yaws|'
                        r'CAS\s+Common\s+Chemistry|DDBST|Dortmund\s+Data\s+Bank)\b', re.I)
DECHEMA    = re.compile(r'\bDECHEMA\b', re.I)
```

The UNIFAC banners say "ChemSep" and "Gmehling", never "DECHEMA" or "DDBST", so
they pass silently.  `grep -rln hemsep bin/curate/check_*.py` returns nothing.
The 2026-08-05 provenance audit swept all 792 records and does not mention these
files, because its search terms were the NEVER-list and **ChemSep was on the
permitted list — the exposure hid inside the exception**.

That is the transferable lesson, and it is a sharper version of one this project
already knows: a gate that screens for a list of forbidden names cannot see a
source that was once approved and whose approval was never re-examined.  *An
allowlist entry is a claim, and an unchecked claim rots exactly like a hardcoded
count.*

### Recommendation

I recommend, in descending order of safety, and **this is Vítor's decision
because every option touches scientific data**:

1. **Demote (recommended for 2026-08-31).**  Move both files to `data/local/`
   (gitignored) — which is what `docs/ai/curation-protocol.md:125` already
   prescribes for ChemSep imports, and what the bulk NRTL/UNIQUAC scrub already
   did.  Remove the fourteen sealed mirrors.  The seven affected cases either
   declare the requirement and refuse without it, or leave the release.  This
   makes `NOTICE` true immediately, at a known and bounded cost.
2. **Re-derive from primaries (the right long-term answer, not a release
   action).**  Re-key the table from Hansen 1991 and from the separately
   published later groups, each value carrying the paper it came from.  This
   will surface the post-1991 groups that currently have no citation — itself a
   finding worth having — and it is real curation work, not a header edit.
3. **Keep only against a written grant.**  Ask Kooijman & Taylor directly
   whether Artistic-2.0 covers the `.gct` / `.ipd` files, keep the reply, and
   then restore the attribution *properly*: licence text referenced from each
   file and from `NOTICE`, copyright preserved, changes stated.  Do not do this
   on the strength of downstream projects' README lines.

Whichever is chosen, add ChemSep to the gate so the answer is enforced rather
than remembered.  I have deliberately **not** added it yet: doing so would fail
`runTests` on the current tree, and a gate that fails is a decision about the
data, not a documentation fix.

### What I changed today, and what I did not

Changed (documentary only): `NOTICE` no longer denies shipping what it ships.
It states the fact, credits what the files credit, explicitly does **not**
assert that the Artistic-2.0 grant reaches them, and points here.  A false
denial protects nobody and hides the question from the one person who could
answer it.

Not changed: no data file was moved, deleted or edited.

---

## 2. DDBST group assignments in `data/groupEstimative/` — **undisclosed, ~28 800 rows**

`NOTICE` said that tier carries *"zero third-party numeric values"*, and listed
DDBST among sources *"Excluded by policy (not bundled)"*.

`data/groupEstimative/SOURCES.md` says otherwise, in its own words:

> ### Molecular groups (`unifac`, `modfac`, `psrk`)
> - Source: DDBST published group assignments bundled in `thermo`
>   (`DDBST UNIFAC assignments.tsv`), keyed by InChIKey.

Verified as a verbatim copy, not a re-derivation: Choupo's row for InChIKey
`XMLSXPIVAXONDL-UHFFFAOYSA-N` carries `modfac = 1:2 2:3 6:1 19:1 70:1`, matching
the corresponding `thermo` line group-for-group in the same order.  28 568
tracked files plus an 18 MB `compounds.csv`.

The distinction that matters: the tier's *properties* genuinely are Choupo's own
Joback / Lee-Kesler estimates, exactly as claimed.  It is three *columns* — the
group assignments — that are third-party.  So the sentence was true of what its
author was thinking about and false as written.

**Recommendation.**  This is the cheapest of the open items and I recommend
disclosure rather than removal: state in `NOTICE` and `SOURCES.md` that those
three columns are DDBST-published assignments redistributed via the MIT-licensed
`thermo` package, and amend the exclusion line.  I have done the `NOTICE` half
today, since it is purely documentary.  Two things remain for you:

* confirm with Caleb Bell what grant `thermo` redistributes that TSV under —
  `thermo`'s `LICENSE.txt` is a plain MIT text that does not distinguish code
  from bundled data (https://github.com/CalebBell/thermo/blob/master/LICENSE.txt);
* decide whether to re-derive the assignments from structure with Choupo's own
  fragmenter, which would remove the question entirely.

---

## 3. DECHEMA — **`NOTICE` wrong by two files, both already pinned**

**The law, and the asymmetry that decides it.**  The Chemistry Data Series
carries an all-rights-reserved notice **[secondary]**.  Whether that binds the
*numbers* differs by regime, and Choupo is an EU/Portuguese project:

* **US** — *Feist v. Rural Telephone*, 499 U.S. 340 (1991): facts are not
  copyrightable, "sweat of the brow" is rejected, and *"the copyright does not
  extend to the facts contained in the compilation"*
  (https://supreme.justia.com/cases/federal/us/499/340/).  A single regressed
  NRTL pair is very hard to reach.
* **EU** — Directive 96/9/EC creates a **sui generis database right**,
  independent of copyright, where there is substantial investment in
  *obtaining, verifying or presenting* the contents (Art. 7), for 15 years
  (Art. 10) (https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex:31996L0009).
  Transposed in Portugal by **Decreto-Lei n.º 122/2000, de 4 de julho**
  (https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2000-124444219).
  Narrowed by *British Horseracing Board v. William Hill*, C-203/02 (2004):
  investment in **creating** data does not count, only in **obtaining**
  pre-existing data
  (https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A62002CJ0203).

**The BHB distinction cuts both ways, and the direction is the single most
important thing in this document.**  A table of *fitted* parameters is data the
compiler created — weak.  But a *compilation* whose investment lies in
obtaining those parameters from the scattered literature and presenting them is
the counting kind — strong.  So the EU analysis does **not** rescue a bulk copy
of a compilation even where every individual number is a fact and US law would
shrug.  This is why "another simulator ships it" is not an argument, and why
item 1 above is graded blocking rather than cosmetic.

**In the tree**, two records, both already carrying pins:

* `parameters/NRTL/ethanol-water.dat` — `citation "Gmehling & Onken, DECHEMA
  Chemistry Data Series Vol. I Part 1, ethanol-water VLE-IG bank"`, `author
  "Curated from DECHEMA by V. Geraldes, 2026"`.  A genuine transcription, and
  `debt_registry.py` already says so.  **Recommendation:** move to
  `data/local/`, or replace the four parameters with a Choupo regression
  against published ethanol–water Txy data (`origin regressed`, fit data
  shipped).  The consuming tutorial's golden moves — that is the honest cost,
  and it is why this is yours and not mine.
* `parameters/SRK/N2-CH4.dat` — Knapp, Döring, Oellrich, Plöcker & Prausnitz,
  DECHEMA Chemistry Data Series Vol. VI (1982).  A **named-author monograph**,
  i.e. a publication that happens to appear in the series, not a databank
  arrangement.  `debt_registry.py` flags it "BORDERLINE, awaiting a ruling".  I
  agree it is borderline.  **Recommendation:** rule it explicitly as a
  monograph citation and drop the phrase "the standard kij compilation" from
  its header, which is what makes it read as a databank pull.  No value moves.

---

## 4. NIST — **`NOTICE` right in policy, wrong by one record**

NIST Standard Reference Data is the statutory exception to "US government works
are public domain": the Standard Reference Data Act, **15 U.S.C. § 290e**,
empowers the Secretary of Commerce to secure copyright in SRD, and the Chemistry
WebBook **is SRD 69**, carrying *"© 2026 by the U.S. Secretary of Commerce on
behalf of the United States of America. All rights reserved."*
(https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications)
**[secondary]**.  Non-SRD NIST works fall under 17 U.S.C. § 105 — which is why
`usnistgov/COSMOSAC` is genuinely free and Choupo's COSMO-SAC handling is fine.

One violation: `components/methylAcetate.dat` — *"Primary data: NIST WebBook /
DIPPR-class compilations"* — both a no-grant source and the aggregator-as-primary
inversion.  Already pinned.  **Recommendation:** do what the pin says —
re-source from primaries (Pöpken/Steinigeweg/Gmehling *IECR* **40** (2001) 1566
is already cited in the same header for other fields) or demote to
`data/local/`.  Values move, so goldens move.

Two records are **correct and must not be touched**: `ethyleneOxide.dat` and
`cyclopentane.dat` cite real journal primaries (Pell & Pilcher 1965; Prosen &
Rossini) with NIST named only as the access route.  *Via* is not *from*.

---

## 5. CRC — **`NOTICE` right in policy, wrong by one record**

Taylor & Francis / CRC Press, all rights reserved, reuse via the Copyright
Clearance Center **[secondary]**.  Under *Feist* the individual constants are
facts; under the EU database right the compilation is plausibly protected.
Either way it is a no-grant source for our purposes.

One record: `components/H3PO4.dat` copies `dHf_298 = -1284.4 kJ/mol` from CRC,
and **its own header records that the primary it names (Wagman *et al.*, NBS
Tables 1982) gives −1279.0**.  Already pinned.  **Recommendation:** adopt the
Wagman/NBS value the record already cites, re-record the affected goldens, drop
the CRC clause.  One pin is currently carrying both a licence exposure and a
numerical disagreement, which is one pin too few.

---

## 6. Clean, and worth stating

* **Sander Henry's-law constants (205 pairs)** — CC-BY 3.0, redistributed via
  MIT-licensed `thermo`, with the CC-BY-required CHANGES statement present in
  each header.  Exemplary; the model for the rest of the tree.
* **The three shipped UNIQUAC pairs** — Pöpken, Götze & Gmehling, *IECR* **39**
  (2000) 2601, Table 3.  A primary journal table.  `parameters/README.md` said
  they came from ChemSep; that was false and is corrected today.  A stale
  provenance claim that makes CLEAN data look encumbered is as much a defect as
  the reverse, and harder to notice because nobody audits in that direction.
* **CoolProp-derived correlations**, **PubChem**, **Wikidata**, **COSMO-SAC
  reference code** — as `NOTICE` describes them.

---

## 7. Two dangling pointers in the legal surface itself

* `THIRD_PARTY_NOTICES` is referenced (by `CLAUDE.md`'s language rule, among
  others) and **does not exist**.  What exists is `LICENSES/README.md`, a
  19-line licence *map* whose data clause is a pointer, not a manifest.
* `NOTICE` deferred its *"definitive per-file enumeration"* to a **"snapshot
  allowlist gate" that does not exist** — `grep -rn allowlist bin/` finds only
  `check_doctrine.py`'s unrelated allowlist.  The document's own escape hatch
  was a dangling pointer, which is how the ChemSep paragraph could stay wrong
  without anything to contradict it.  Removed today with the paragraph.

Both are the same defect as the permanently-green `check_true_ions` and the
hand-compiled counts: **a check that cannot run must not pass**, and a document
that names its own verifier must be verified against whether that verifier
exists.

---

## Summary table

| item | `NOTICE` said | tree contains | status |
|---|---|---|---|
| ChemSep UNIFAC tables | not shipped | shipped ×16, tracked, verbatim from `.gct` | **OPEN — blocking, Vítor's decision** |
| DDBST group assignments | "zero third-party numeric values" | 3 columns × ~28 800 rows, verbatim | **OPEN — disclosure done, grant unconfirmed** |
| DECHEMA NRTL ethanol-water | excluded | 1 transcription, pinned | remedy known, moves a golden |
| DECHEMA SRK N2-CH4 | excluded | 1 named monograph, pinned | needs an explicit ruling; no value moves |
| CRC H3PO4 | excluded | 1 copied value, pinned | remedy known, moves a golden |
| NIST methylAcetate | excluded | 1 aggregator-as-primary, pinned | remedy known, moves a golden |
| NIST ethyleneOxide / cyclopentane | — | primary *via* NIST | **correct, leave alone** |
| Sander Henry (205 files) | CC-BY 3.0 via `thermo` | matches, CHANGES stated | **correct** |
| shipped UNIQUAC pairs | — | Pöpken 2000 Table 3 | **correct; README corrected today** |
| `THIRD_PARTY_NOTICES` | referenced | absent | create, or stop referencing |
| "snapshot allowlist gate" | authoritative enumeration | does not exist | removed today |

The four pinned items are a curation backlog with an owner: one file each,
known, tracked.  The ChemSep-UNIFAC and DDBST findings are different in kind —
undisclosed, unpinned, invisible to every gate, and orders of magnitude larger.

**Deliberately left unresolved rather than resolved favourably:** whether
ChemSep's Artistic-2.0 grant reaches the `.gct` / `.ipd` files, and how much of
the shipped 53-main-group table is actually in Hansen 1991.  Both are answerable
with a ChemSep distribution licence file and a copy of the 1991 paper, neither
of which this review could reach.  Resolving them by assumption would convert
*unsourced* into *falsely sourced*, which no reader and no gate can detect —
and a visible gap is strictly better than an invisible falsehood.

---

## 8. Upstream verification, as instructed (2026-08-11, second pass)

Ruling received: *verify the upstream ChemSep licence scope before removal;
Artistic-2.0 itself is acceptable and GPL-compatible, so the unresolved issue is
scope, not compatibility.*  Agreed on the law — §1's GPL paragraph already said
compatibility was not the problem.  Here is what the verification found.

### 8.1 The upstream archive is NOT in this repository, by design

```
$ find thirdParty/chemsep
thirdParty/chemsep/pcd/Artistic_license_2_0.txt
thirdParty/chemsep/NOTICE
thirdParty/chemsep/README.md
thirdParty/chemsep/.gitignore
```

No `chemsep1.xml`, no `ipd/`, no `.gct`.  `thirdParty/chemsep/.gitignore`
excludes exactly the files the importer reads (`ipd/`, `*.gct`, `*.ipd`,
`chemsep1.xml`).  So **the licence-bearing artefact cannot be inspected from
this checkout** — the import sources are user-supplied and were never committed.
`chemsep.org` and `www.chemsep.org` are both blocked by this environment's
egress proxy, so the distribution's own terms could not be read externally
either.

**That absence is not evidence against the licence.**  It is a fact about the
container, and a real ChemSep install settles it in minutes (§8.4).

### 8.2 Three internal documents scope Artistic-2.0 to the pure-component database

Evidence independent of the missing archive, and all three point the same way:

* **`thirdParty/chemsep/README.md` enumerates the drop-point contents** —
  `chemsep1.xml` (pure-component database), `*.ipd` (binary interaction
  parameters), and the licence text.  **`.gct` is not listed.**  `grep -c gct`
  over both README and NOTICE returns **0**.  Choupo's own documentation of this
  import never contemplated the group-contribution tables.
* **`thirdParty/chemsep/NOTICE` states its "Factual basis"** as: *the "ChemSep
  pure-component database" is published crediting Kooijman & Taylor under
  Artistic License 2.0.*  That is a scope statement about the pure-component
  database; the GCT files are a different artefact.
* **The licence copy present carries no ChemSep attribution at all.**
  `grep -ic "chemsep\|kooijman\|taylor"` over `pcd/Artistic_license_2_0.txt`
  returns **0**; it is the canonical 75-line Perl Foundation text.  Choupo's own
  NOTICE had said to use *either* the copy shipping with ChemSep *or* the
  canonical text — so the file's presence does **not** establish that the
  ChemSep distribution shipped a licence with the database.  The one artefact
  that would have carried the chain turns out to prove nothing.

### 8.3 The import also bypassed its own review pipeline

Separate from the licence question, and worth ruling on independently.
`thirdParty/chemsep/README.md` documents the discipline: the importer *"never
writes to `data/standards/`"*, stages to `data/proposed/` for human review, and
promotion is *"a deliberate act"*; every value carries `provenance { origin
"ChemSep"; license "Artistic-2.0"; ... reviewed false; }`.

The two shipped UNIFAC files sit directly in `data/standards/parameters/UNIFAC/`
and carry **no provenance block at all** (`grep -c provenance` → 0 on both) —
only a comment banner.  `data/proposed/` was itself retired in 2026-07-13.  So
the tables entered the curated catalogue without the review step the ChemSep
import was designed around, which is why no reviewer ever put the scope
question.  **That block is owed whichever way the licence question goes.**

### 8.4 What to check in a real ChemSep install — the minimal test

1. Is there a `LICENSE` / `COPYING` / `Artistic*` file at the **top level of the
   distribution**, or only inside a `pcd/` (pure-component data) subdirectory?
   A licence scoped to `pcd/` is the negative answer.
2. Are `unifacrq.gct` / `unifacvl.gct` (or the GCD binaries they mirror)
   **inside the same directory tree that licence governs**?  Artistic-2.0
   defines the "Package" as the collection the Copyright Holder distributes, so
   physical containment under the licensed tree is the question that matters.
3. Do the `.gct` files carry their **own header, copyright line, or narrower
   per-file terms**?
4. Does any accompanying README/manual state terms for the **group-contribution
   data** specifically, as distinct from the component databank?

If (1) and (2) are both yes and (3) shows no narrower term, the chain closes and
§5's KEEP branch applies.

### 8.5 Two couplings that change the cost of both rulings

Found while measuring the blast radius; both were unknown when the rulings were
written.

* **`groups.dat` is a RUNTIME dependency, not shelf data.**
  `src/thermo/activityCoefficient/UNIFAC.cpp:59` resolves
  `parameters/UNIFAC/groups.dat` on every UNIFAC construction.  Demoting the
  tables to `data/local/` therefore does not merely break seven tutorials — it
  makes a **registered activity model refuse** unless the user has a local
  install.  That is coherent with the two-tier precedence (`local` fills gaps)
  and is how the bulk NRTL/UNIQUAC scrub already behaves, but it is an
  engine-visible capability change and should be decided as one.
* **The DDBST assignments are already in `data/standards/`.**  Fifty-three
  curated components carry a `groups { unifac ( ... ) }` list annotated *"added
  from data/groupEstimative (UNIFAC decomposition; vocab-checked vs
  groups.dat)"*.  So "stop shipping the bulk table" is not confined to
  `compounds.csv`: it reaches the curated catalogue, and the vocabulary those
  lists are checked against is `groups.dat` — the ChemSep file whose fate is
  still open.  Resolving DDBST first would mean redoing it after the ChemSep
  answer.

  One mitigating fact, and it is the route out: each of those files also carries
  a `joback ( ... )` list produced by **Choupo's own RDKit fragmentation from
  SMILES**, and it is the joback fragmentation that produced every estimated
  NUMBER in the tier.  28 445 files carry `joback`, 28 285 carry `unifac`.  So
  the tier's numerical content does not depend on the DDBST column, and
  independent regeneration from structure is bounded work rather than a rebuild.

### 8.6 Recommendation, revised

**ChemSep/UNIFAC: HOLD, and do not demote on the strength of a container
artefact.**  The chain cannot be shown from here, but the reason is that the
archive was deliberately never committed — not that a check was run and failed.
Run §8.4 against a real install first.  If it closes: KEEP, with explicit
third-party Artistic-2.0 attribution, the licence text referenced from the files
and from `NOTICE`, and the mechanical conversion documented — plus §8.3's
missing provenance block either way.

**DDBST assignments: DO NOT execute the removal yet**, notwithstanding the
ruling — not because the ruling is wrong, but because §8.5 shows its scope is
larger than it appeared and is entangled with the open ChemSep question.  The
sequence that avoids doing it twice is: settle ChemSep → regenerate the 53
standards-tree `unifac` lists from Choupo's own fragmenter → then drop the DDBST
columns from `compounds.csv` and the estimation tier.  Nothing is redistributed
meanwhile that was not redistributed yesterday, and today's `NOTICE` disclosure
is already live.

**No data file has been moved, edited or deleted.  No engine physics touched.**

---

## 9. Rulings received (2026-08-11) — the standing position

Recorded here so the four decisions have one home, and so a later reader is not
left reconstructing them from message history.

**R1 — ChemSep / UNIFAC: HOLD removal.**  Do not demote or delete.  External
checking confirms ChemSep officially documents UNIFAC group-contribution data
files as part of its distributed property-data machinery, but no definitive
public statement proves those specific GCD/GCT files are covered by
Artistic-2.0.  **The unresolved issue is licence SCOPE, not GPL
compatibility** — Artistic-2.0 is FSF-listed as GPL-compatible and that half is
settled.  When the real upstream distribution is available, run the §8.4 test:
top-level licence/COPYING → are the GCD/GCT files inside that licensed package
→ any narrower per-file terms → any README specifically governing the
group-contribution data.  If the chain is explicit, KEEP with proper
third-party attribution and preserved licence terms.  If it cannot be
demonstrated, demotion to `data/local/` remains the conservative option.

**R2 — DDBST assignments: legally unresolved / high-risk, and NOT to be
migrated now.**  `thermo`'s MIT licence does not solve it: an MIT licence on a
repository cannot grant rights in third-party database material the packager
did not itself have authority to relicense, and current DDBST terms explicitly
restrict systematic retrieval used to build a database or compilation unless
authorised.  Treat the ~28 800-row group-assignment dataset accordingly.

*The intended later direction*, recorded now and deliberately not opened:
replace redistributed DDBST-derived assignments, where possible, with group
assignments **generated by Choupo itself from molecular structure / SMILES**.
What makes this a bounded curation-and-legal slice rather than an emergency
engine change is the fact established in §8.5 — the tier's numerical estimates
do not depend on the DDBST `unifac` column.  Every number in it was produced by
the `joback` fragmentation, which is Choupo's own RDKit output from SMILES
(28 445 files carry `joback`; 28 285 carry `unifac`).  So the assignments can be
regenerated without any value moving.

Sequence, when it is opened: settle R1 → regenerate the 53 standards-tree
`unifac` lists from Choupo's own fragmenter → then drop the DDBST columns from
`compounds.csv` and the estimation tier.  Doing it in the other order means
doing it twice, because those 53 lists are vocab-checked against `groups.dat`,
whose own fate is R1's question.

**R3 — `ProcessStream::demandDriven`: leave it as a NAMED GAP.**  The flag is
read by the Flowsheet write-back and has no live producer; the only thing that
ever raised it was `state saturatedVapour` with no `F`, which went with the
retired `streams {}` block.  The frozen engine is not to be touched, and the
documentation states the limitation accurately rather than dropping the
paragraph — a reader who finds the flag in the source is entitled to know it
cannot be true.  Restoring the feature means giving the `0/` grammar its own way
to declare the intent, which is a design act, not a rename.

**R4 — provenance applies to documentation claims.**  The release-count
incident (§ `verification-and-validation.md` §7 E2) is preserved for the paper's
evidence dossier: *a number is only stale relative to the source of truth it is
supposed to mirror.*  Provenance is not a discipline for scientific values
alone; it governs what the project says about itself on the same terms.

**Not covered by any of the above, and still open:** the four pinned
single-record citations (§3–§5), which are a curation backlog with an owner —
one file each, three of them moving a value and therefore a golden.
