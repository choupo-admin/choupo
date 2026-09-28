# thirdParty/chemsep — ChemSep Database (two licences, read them apart)

A **third-party property-data source**, kept separate from Choupo's GPL-3.0
code and carrying its own licence + attribution (see `NOTICE`).  It is **not** a
runtime dependency: Choupo's solver never reads from here.  An **offline
curation importer** (`bin/curate/chemsep_to_choupo.py`) converts selected
records into Choupo `.dat` form, staged in `data/local/` for human review.

## Licence — the grant has a scope (read 2026-09-28)

ChemSep LITE ships its own licence file, `help/chemsep.lic` (ChemSep LITE
8.50, `lite.zip` sha256 `69640c709f51ef89341ff1596b4fea4a37d9de774f4fac041934c0413958573c`,
downloaded from www.chemsep.org).  Verbatim:

> "Use of the ChemSep Pure Component Property Databank (and ONLY the ChemSep
> Pure Component Property Databank) is governed by the Artistic License of
> the Perl Foundation."

> "Sublicense of SOFTWARE to another party is not permitted."

So there are two answers, not one:

| what | licence | may Choupo ship values from it? |
|---|---|---|
| `pcd/chemsep1.xml`, `chemsep2.xml` — the pure-component databank | Artistic-2.0 | yes, per value, cited (`check_source_licence` ACCEPTED_DATABANK) |
| `ipd/*.ipd` — binary interaction parameters (NRTL, UNIQUAC, Wilson, PR, SRK, ...) | the ChemSep LITE licence (no sublicence); the files' own headers say `DECHEMA NRTL at P=1atm`, `DECHEMA UNIQUAC at P=1atm` | **no** — LOCAL ONLY, your own install, `data/local/parameters/` (`check_source_licence` EXCLUDED_TABLES) |

The `.ipd` verdict is not a technicality.  DECHEMA transcription is on the
curation protocol's NEVER list, and a second licence stacked on top of it
(no sublicence) removes any argument that ChemSep's redistribution cleared
it.  The earlier sentence on this card ("binary pairs | Artistic-2.0") was
false, and so was the NOTICE's "component properties + binary interaction
parameters" under Artistic-2.0; both are corrected here.  The `thermo` Python
package's copy of the same tables is its own card:
[`thirdParty/thermo-ipdb/`](../thermo-ipdb/README.md).

**Found while reading it, and NOT settled here:** the UNIFAC group tables
(`ipd/*.gct`) sit under the same LITE licence.  The tree's
`data/standards/parameters/UNIFAC/{groups,interactions}.dat` were imported
from a `.gct` and their headers call the source "the ChemSep database
(Artistic-2.0)".  The VALUES are Hansen, Rasmussen, Fredenslund, Schiller &
Gmehling, Ind. Eng. Chem. Res. 30 (1991) 2352 -- a journal table, cited as
the primary, which is the project's normal route -- but the Artistic-2.0
attribution in those headers does not match the licence text above.  That
correction touches shipped records and is reserved for Vítor.

## What goes here (you provide the files)
| File | What | Required for |
|---|---|---|
| `chemsep1.xml` | ChemSep pure-component database | component constants |
| `*.ipd` | binary interaction parameter sets (NRTL / UNIQUAC / Wilson) | binary pairs (LOCAL ONLY -- see the licence table above) |
| `pcd/Artistic_license_2_0.txt` | licence text shipped with this exact databank | provenance hygiene |

Get them from the free ChemSep distribution (https://www.chemsep.org/).
**Do not** commit large raw databases unless intended; the
importer reads them from here and writes the curated subset to `data/local/`.

## Workflow (curate → review → promote)
```
1. drop chemsep1.xml (+ *.ipd) into this folder
2. python3 bin/curate/chemsep_to_choupo.py --dry-run --components-only
   python3 bin/curate/chemsep_to_choupo.py --components-only
      -> data/local/components/          (NEW component .dat, provenance-tagged)
      -> data/local/_chemsep_review/     (COLLISIONS: existing curated file kept)
      -> data/local/parameters/{NRTL,UNIQUAC,Wilson}/  (binary pairs; LOCAL ONLY --
                                                   the runtime reads this home and
                                                   announces each pair [local] UNVERIFIED)
      -> data/local/CHEMSEP-IMPORT.md    (counts + per-record provenance + reports)
3. a human reviews the staged .dat
4. ONLY then promote reviewed COMPONENT files into data/standards/  (a
   deliberate act).  A staged .ipd PAIR is never promoted: its licence
   forbids it (the table above)
```

`--refresh-standards` rewrites records THIS TOOL wrote into
`data/standards/components` -- they carry its `importedBy` marker, and a
hand-curated record is never touched either way.  Off by default: the
committee tree is not a scratch area, so a re-import that adds a field has to
ask for it out loud.

## What is already here, and what is not

The **UNIFAC main-group interaction table is already imported**
(`data/standards/parameters/UNIFAC/interactions.dat`, 1166 directed pairs from
a ChemSep `.gct`), so most binary systems need no fitted pair at all: 245
catalogue components carry UNIFAC groups, giving 29 890 binary combinations
the engine can price predictively.  What the `.ipd` files add is FITTED
NRTL / UNIQUAC / Wilson pairs -- to YOUR private tier only (the licence table
above).  The public catalogue grows its fitted pairs another way: Choupo
regresses them itself to measurements located through the ThermoML archive
(C16; `docs/design/binary-pairs-from-open-measurements.md`), and `ls
data/standards/parameters/NRTL/` is the count.  They are not always better
than UNIFAC -- the methanol + water case shows a held-out set where UNIFAC
is closer.

Note that 30 of the 210 directed main-group pairs in play are missing from
the published table itself (Hansen 1991 does not report every combination).
The engine ANNOUNCES that rather than silently taking a = 0; see
`bin/curate/check_unifac_gaps.py`.  No `.ipd` file fixes those -- they are a
gap in the literature.

## Rules (enforced by the importer)
- Never writes to `data/standards/`; never overwrites an existing curated file.
- Deduplicates chemical identities by CAS before considering the filename;
  same-name/different-CAS collisions are isolated under `_chemsep_review/`.
- Converts ChemSep critical pressure from Pa to Choupo's catalogue unit (bar)
  and emits an explicit Ambrose-Walton estimate when Tc/Pc/omega are present.
- Emits ONLY values present in the source — missing properties are skipped and
  reported, never fabricated.
- Every value carries `provenance { origin "ChemSep"; license "Artistic-2.0";
  sourceFile; ... reviewed false; }`.
- Unit conversions are reported; any non-trivial edit is marked `modified true`.
- EXCLUDED sources are refused outright: DIPPR, NIST WebBook/SRD, Aspen/HYSYS/
  PRO-II/UniSim databanks, or any record whose licence is unclear.
