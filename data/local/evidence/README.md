# data/local/evidence/ — your private measured datasets (never public)

ONE flat folder of dataset files, **gitignored** like the rest of
`data/local/`.  What goes here is EVIDENCE: measured values a model is
compared against or fitted to — a binary VLE study, a vapour-pressure
series, heat capacities — in the dataset grammar Choupo already uses
(`bin/choupo-thermoml extract-vle` writes it; every
`tutorials/props/curation/*/constant/experiments/*.dat` is an example):

```
property     binaryVLE.T_bubble;
system       ( methanol water );          // or:  component methanol;
pressure     101.32 kPa;                  // a held condition, or a column
provenance   { source measured; reviewStatus ...; citation "..."; doi "..."; sha256 "..."; }
uncertainty  { T_bubble { kind ...; level 95; unit K; values ( ... ); } }
columns      ( { name x[methanol]; unit -; } { name T_bubble; unit K; } )
data         ( ... );
```

Record: `docs/design/evidence-as-a-first-class-object.md` section 7
(DEV.md 4c C117).  The rules, each stated there:

* **The filename is the dataset's id.**  A corrected transcription is a
  NEW file, never an edit — a fit's dossier cites the data block's
  `sha256`, so a dataset can never change under a fit that used it.
* **The subject is read from the file** (`system ( a b )` or
  `component x;`), never from a folder: there are no sub-folders here.
* **The ROLE a dataset plays — fit or held-out validation — is NOT a
  property of the dataset.**  It is declared in the operation that
  consumes it (`evidence ( { dataset ...; role fit; } )`), and a `role`
  key inside a dataset file is refused by `check_evidence_records`.
* **Nothing here is promoted automatically.**  Promotion to
  `data/standards/` is a human act (`bin/curate/promote-from-dossier`),
  and the licence question (redistribution rights) is asked THEN.

## Where it shows up

The Property Explorer's **Evidence** view (`?workspace=explore&view=surfaces&
components=methanol,water&lens=evidence`) lists every dataset whose
subject is the selected pair, from three tiers: this folder (the dev GUI,
`bin/runGui`, bundles it through `gui/scripts/localCataloguePlugin.ts`;
the hosted site never sees it), the bundled tutorials' own
`constant/experiments/`, and the open case's `constant/experiments/`.
Beside them it lists every parameter record for the pair in any tier
(`data/standards/parameters/`, `data/local/parameters/`, the open case's
`constant/parameters/`) as a distinct candidate, runs `choupoProps` once
per candidate at the MEASURED conditions, and draws residuals.  It fits
nothing.

## To try it with the methanol + water witness

Copy the two studies the `curate04` tutorial carries (doi
10.1016/j.jct.2009.11.020 and 10.1021/je200341c) here:

```
cp tutorials/props/curation/curate04_nrtl_methanol_water/constant/experiments/*.dat data/local/evidence/
bin/runGui     # then open the Explorer on methanol + water, lens "evidence"
```

They are already visible from the tutorial tier without this step; the
copy only exercises the local tier.  No test depends on anything in this
folder: the GUI tests and `check_evidence_records` read the tutorials.
