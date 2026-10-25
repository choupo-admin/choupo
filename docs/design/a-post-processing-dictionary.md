# A props run's views — every operation's defaults, and the ones a propsDict declares

*2026-10-24, DEV.md 4c C147 (approved: "Avança como achares melhor") and its
first witness, the NanoFiltran paper as ONE case (C148's landing note:
Vítor, "Não multipliques casos!  Faz um caso único!  Com um
pós-processamento para gerar os plots adequados", and "Um pós-processamento
não gera os gráficos e tabelas que são precisos para este artigo?"); the
place and the shape DECIDED the same day by Vítor, DEV.md 4c C149 (its
DESIGN paragraph).  The file keeps the name of the first cut so the links to
it hold; what it records is the design that landed.*

## 1. What was measured before anything was built

* A props op published NUMBERS keyed by word (`diagnostics()`), optionally a
  CSV it wrote itself (`profile pore_N350.csv;`), and nothing else.  A plot of
  the pore needed a reader who knew the file name and its header — a second
  reader of a format nobody declared.
* The GUI's Plot workspace drew a CSV by SNIFFING its header
  (`CsvAutoPlot`): the shape was guessed, the series were whatever columns
  the file had, and the units were nowhere.  The props Results opened on a
  list of raw KPIs.
* A unit publishes ONE `UnitProfile` (`SimulationResult::profiles`, one per
  unit; `check_internal_states` arm (f) records that two kinds on one unit
  have no live case).
* The NanoFiltran paper had become THREE cases (code to code, Fig. 3,
  Table 2) because each comparison needed its own golden; the tables the
  paper prints lived as hand-written text in the propsDict headers, held to
  the run by `check_nanofiltran_paper` arm (d).

## 2. The decision, in one sentence

**Every operation publishes its DEFAULT views with nothing declared, a case
adds the views its paper needs in the SAME propsDict, over what the run
PUBLISHES; the engine resolves every name, holds every unit, computes every
difference and writes the numbers; the GUI's review screen draws them and
computes nothing.**

### Why in the propsDict, and not a dictionary of its own

The first cut was a separate `system/postProcessDict` (named `plotDict` before
that).  Vítor ruled it out the same day (C149): the views are ABOUT the
operations, so they live beside them, and a case that declares nothing must
still be read as figures — which only DEFAULTS can give.  The precedents
weighed: `controlDict`'s `reports {}` (declared presentation, but of a
flowsheet's balances, not of an op's numbers), `system/postDict` (the sizing
and costing PASS — a computation that adds numbers, where a view only arranges
published ones), `fitParameters`' own `output {}`/`experimental` blocks in the
propsDict (the op's presentation kept with the op), and `outerDict`'s drivers
(a second dictionary because it drives MANY passes — a view drives none).

## 3. The defaults

| op | default views |
|---|---|
| any fit that publishes a `fitPoints` table and `fit.<p>.value` diagnostics (`fitParameters`, both its isotherm and its bubble-point branches) | `parity` (fitted against measured, one unit, the line fitted = measured), `residuals` (fitted − measured against the first abscissa), `parameters` (value, standard error, 95 % half-width; each row in its own unit, labelled by its path where the op keys it by index) |
| `fitParameters`, isotherm | `isotherm` (the data of every temperature as markers, the fitted surface through them as lines) |
| `poreTransport` | `rejection` (R_obs of every ion against J_v, where the op ran ≥ 2 points); `pore` and `potential` (the ions and ψ across the pore at its last point, where it writes its profile) |
| `polarisationIndex` | `gamma` (Γ of every ion row by row), `rejection` (observed 1 − C_p/C_b as markers, real 1 − C_p/C_m as lines), `rows` (the dataset with the model's wall) |

The generic fit defaults have ONE home (`genericDefaultViews` in
`src/postProcessing/views/Views.cpp`), so every fit earns the same three
whatever it fits; an op's own (`PropertyOperation::defaultViews`) are written
in the very grammar of section 4, and the result block carries each op's
declarations as text (`defaults`), so a reader sees the entries that drew its
figures.  The parameter row's label is the op's (`diagnosticLabel`): a
`fitParameters` bubble fit keys its parameters `fit.0`, `fit.1`, … and names
them by the path it varied.

## 4. The grammar (`views ( ... )` and `references ( ... )` in the propsDict)

Both lists sit at the top level of the propsDict, after `operations`.

```
references
(
    {
        name      nfStiff;                       // a word
        file      "constant/reference/nanofiltran_stiff.csv";   // under constant/ ONLY
        role      reference;                     // reference | experiment
        citation  "NanoFiltran (Geraldes & Alves 2008) ...";    // REQUIRED
        units     { Na_molm3 "mol/m3"; dPsi_m_V "V"; }          // every column read
    }
);

views
(
    //  THE SHORTHAND: one source, one x, a list of y -- one series per y
    { name gamma_Na; type series; op table1; table rows; x C_b_Cl_molm3; y ( Gamma_Na Gamma_Cl ); }

    //  THE LONG FORM
    {
        name    fig3_dye4;                       // postProcessing/case/fig3_dye4.csv
        type    series;                          // series | profile | parity | residuals | table
        title   "Fig. 3: ...";                   // optional: else built from the series
        xAxis   { label "feed chloride, c_Cl"; unit "mol/m3"; scale linear; }  // optional;
        yAxis   { label "R_obs"; unit "-"; scale linear; }   // unit = the series' published
        series
        (
            //  across operations: one point per op, two diagnostics
            { name choupoNa; label "Na+ Choupo"; ops ( dye4_p1 ... dye4_p5 ); x c_bulk_Cl_p1; y Robs_Na_p1; }
            //  an op's published table (core/PublishedTable.H), rows kept by select
            { name pore;     label "Choupo";     op N350; table pore; select { point 1; } x x_um; y psi_V; }
            //  a difference of two series declared BEFORE it, at their common x
            { name d;        label "Choupo - experiment"; difference ( choupoNa expNa ); relative no; }
        );
        //  the data set over the model: series in the long form
        overlay ( { name expNa; label "experiment"; reference bmFig3; select { dye_molm3 4; ion Na; } x cCl_molm3; y Robs_exp; yError dRobs; style markers; } );
    }

    //  a SERIES table: one row per x value, the columns are series
    { name table2_grid; type table; x { label "nodes N"; unit "-"; } columns ( <series> ... ); }
    //  a ROWS table: one row per record, the columns are quantities
    {
        name    table2_N350;
        type    table;
        columns ( { name Na; label "permeate Na+"; unit "mol/m3"; } ... );   // or a row's own `unit`
        rows
        (
            { name paper;  label "Table 2"; reference nfStiff; select { stage paper; } cells { Na Na_molm3; } }
            { name choupo; label "Choupo";  op N350; cells { Na c_perm_Na_p1; } }
            { name diff;   label "Choupo against Table 2"; difference ( choupo paper ); relative yes; }
        );
    }
);
```

`style lines|markers|linesMarkers` and `group <word>` (series of one group
share a colour: one ion across sources) are optional; otherwise the role
decides (an experiment is markers with its error bars, a reference dashed, a
computed series a line).  A `parity` view holds its x and y to ONE unit.

A view's FOLDER is its top-level `op`; else the ONE operation every series or
row draws from, alone (so `polarisation01`'s per-series `op table1` views
land in `table1/`); else `case/` (a view across operations or beside a
reference).  A declared view of a default's name in the same folder REPLACES
it, said once on the console.

## 5. What is refused, and when

TWO PHASES, so a typo does not cost the run it guards.  BEFORE the
operations (`views::Reader`): the grammar; `type` missing or unknown; a
reference file that is missing, outside `constant/`, without a citation, or
whose `units {}` names a column it lacks; an operation the propsDict does not
declare; a series naming no source or two; the shorthand and `series` both;
a difference of a series not declared before it; two views of one name in one
folder (they would write one file); a key nothing reads (`dictAudit`, refused
here rather than warned: the grammar owes no corpus a tolerance).  AFTER them
(`evaluate`): a diagnostic, table or table column the operation did not
publish — the refusal LISTS what it did publish; a unit the source publishes
that disagrees with the declared one (units are compared as words; nothing is
converted); a parity view whose two units differ; a reference row whose
`select` keeps no record, or more than one in a rows table; a non-positive
value on a log axis; an x value twice in a series table.

The unit of a diagnostic is the op's to publish
(`PropertyOperation::diagnosticUnit`); where it publishes none, the axis's
declared unit is taken as the author's statement, said on the console and
recorded (`unitPublished false`) in the sidecar.  An isotherm fit's `rms` is a
loading only where the fit is unweighted (σ = 1 mol/kg); weighted, the op
publishes it as a pure number.

## 6. What is written, and where the GUI reads it

`postProcessing/<op>/<view>.csv` and `.json` (`postProcessing/case/` for a
case-level view), listed in `postProcessing/views.index`.  Every file the
last run listed is removed before the next writes — and nothing else, so a
file the author keeps under `postProcessing/` survives; a view must not
outlive its declaration (the `design/` rule).  Gitignored with every
`postProcessing/`.

* a plot: `series,x,y,yError` (one row per point, the series by name);
* a series table: `x,<column>...` (empty where a column has no value);
* a rows table: `row,<column>...`;

numbers to 12 significant figures (the machine channel's).  The `.json`
sidecar — titles, axes, units, each series' role, style, group and its SOURCE
in words, the view's folder, origin and type — is the same object the result
JSON carries in its top-level `postProcessing` block, and the console prints
every table.

**The review screen** (`gui/src/ui/ReviewScreen.tsx`, the landing of a
props-only case) reads top to bottom: a VERDICT STRIP (one row per declared
operation: what it did — its schema's own first sentence —, its curation
verdict, its point count, its AAD against data, its held-out AAD; an empty
cell where the run published none: `gui/src/case/reviewScreen.ts`); the
FIGURES (the declared views first, then each op's defaults, op by op;
`ui/plotting/ViewFigure.tsx`: data as markers, models as lines, legends
naming the source, PNG / SVG / CSV export, the sources of every number one
click below); the PARAMETERS and tables; and an AUDIT, collapsed, holding the
whole former surface — the raw KPIs, the decision ledger, the thermo
readiness and every operation's own panel.  The thermo readiness is on the
screen itself only where the case CREATES or ESTIMATES a component
(`estimateComponent`, `vaporPressureFit`, `heatCapacityFit`).  A flowsheet
case's props surface is unchanged.  A verdict's colour has one table,
`CURATION_COLOUR`, held to the engine by `check_verdict_parity`.

## 7. The generalisation path (not built)

The reader takes a `Publication` per producer: a name, a type word,
diagnostics with units and labels, `PublishedTable`s and its default views.
choupoProps fills one per op.  For choupoSolve the producer is a UNIT: its
KPIs are the diagnostics, and its `UnitProfile` is one published table; the
views would live in the flowsheetDict beside the units, as they live beside
the operations here.  What a unit cannot do today is publish MORE THAN ONE
named table — the spiral-wound module's march along its elements and the
solved pore at each station are two.  The path:
`UnitOperation::publishedTables()` and `defaultViews()` beside `profile()`,
`SimulationResult` carrying them per unit, `Flowsheet` filling
`views::Publication`s, and choupoSolve's main calling the same `Reader`
after the solve.  One collision to settle first: choupoSolve's
`reportsLayout postProcessing;` already writes `postProcessing/<report>/<instant>/`,
so a unit named like a report would share a folder.  An outer driver's sweep
is a further producer (its points table is the sweep CSV).  None of it is
migrated here: this slice moves no unit.

## 8. The witnesses

**The NanoFiltran paper in one case.**
`tutorials/props/membrane/nanofiltran_geraldesAlves2008` = parts A (code to
code on NanoFiltran's matrix; the former `nanofiltran01_dspmde_reference`),
B (section 4.1, Fig. 3 against Bowen & Mohammad's measurements; the former
`nanofiltran03_bowen_mohammad_ca30`) and C (section 4.2, Table 2 and Fig. 4;
the former `nanofiltran02_paper_stiff_case`).  The op names were already
distinct, so the merge renamed nothing.

MEASURED, not argued: the three old cases run with origin/main's binary and
the merged case with this branch's publish 463 diagnostics BIT-IDENTICAL
(worst relative difference 0, none missing), and `pore_N350.csv` is
byte-identical.  The golden carries the three old goldens' 444 rows VERBATIM
(values, tolerances, claims, comments), plus 151 rows appended by
`--record-append` (112 newly published: `c_bulk_<ion>_p<p>`, the abscissa of
Fig. 3, and `poreNodes_p<p>`, the abscissa of the grid study; 39 part-A
diagnostics published since C142/C145 and never pinned) and 40 `csv` rows
pinning the differences the views compute — the only numbers they write that
are not a projection of something already pinned.

Its declared views: `table2_N350` (Table 2 at N = 350 accounted for one change
at a time, NanoFiltran as received → corrected, beside Choupo, with relative
differences), `table2_grid` and `gridStudy_Na` / `gridStudy_iterations` (the
grid study: permeate Na+ and iterations against N), `fig4_concentration` and
`fig4_potential` (Choupo's pore at N = 350 against NanoFiltran corrected and
as received), `fig3_dye4` / `fig3_dye37` and their tables (R_obs against
c_Cl: experiment with reading errors, Choupo, NanoFiltran), and
`codeToCode_exampleIdeal` / `codeToCode` (part A); its defaults: the
rejection against J_v of the four part-A benches and N350's pore.

NanoFiltran's numbers reach the case as REFERENCE files under
`constant/reference/`, EXPORTED from their one home in
`bin/curate/nanofiltran/` (paper.tsv, reference.tsv, and the new
fig4_profiles.tsv — every node of the two N = 350 profiles, written by
`regenerate_paper.py --write`, which regenerated paper.tsv byte-identical)
by `export_case.py`, whose `--check` the gate runs.  Each file carries the
paper's citation and says its numbers are facts (`check_source_licence`,
ACCEPTED_PAPER_FACTS).  The digitiser's default output moved to the merged
case; it was RERUN on the paper (Vítor's copy, kept out of the tree), and
its CSV is identical to the committed one in every number — only its own
hash line moved.

**`polarisation01_geraldes_afonso_table1`** (Geraldes & Afonso 2007): its op's
defaults (Γ, observed and real rejection, the rows) and four declared views
splitting the same rows by dye level against the feed chloride (the paper's
Fig. 7, open symbols); 20 `csv` rows pin the real rejections, the only
numbers they write that are neither a pinned diagnostic nor an input.

**`isotherm02_fit_jaschik`** (four isotherm fits): the generic fit defaults and
the isotherm, with nothing declared.

## 9. What is NOT done, said plainly

* choupoSolve, choupoBatch, choupoCtrl, choupoSemiContinuous publish no views
  (section 7).
* Defaults exist for the three op families above; every other props op
  publishes none yet, and the review screen shows its verdict row and its
  own panel in the Audit.
* Units are compared as words; `mol/m3` and `mol/m^3` are different units
  to this reader, and nothing converts.
* A fit's model value is not recomputed by the gate point by point (it is the
  op's evaluation); the gate ties it to the op's own published `rms`.
* The paper's own Γ values (Geraldes & Afonso 2007, Fig. 7) are not in the
  tree, so polarisation01 draws Choupo's Γ against Table 1's measured inputs,
  never against the paper's model.
* The interior of Choupo's pore profile is not compared with NanoFiltran's
  node by node (the grids differ); its faces are, by
  `check_nanofiltran_paper` arm (c).
* The propsDict header tables of parts B and C stay, held to the run by
  `check_nanofiltran_paper` arm (d): they are now a transcript of what the
  views generate, and could be retired in favour of a pointer — a decision
  for whoever next edits the case, recorded here.
* An operation named `case` would share `postProcessing/case/` with the
  case-level views; no case does, and nothing refuses it yet.

## 10. Gate

`bin/curate/check_postprocessing.py`, on three witnesses: (a) the reference
files are their sources' export; (b) every view — each op's defaults, then the
declared ones — is produced, the sidecar equals the block, the index equals
the files, nothing else is in `postProcessing/`; (c) every one of ~13 600
written numbers recomputed from the source the view names, by the gate's OWN
reading of the propsDict and of the defaults the block carries; (d) the
tables meet the golden's 59 anchors; (e) 14 refusals fire by name; (f) a
listed stale file goes, an author's own file stays, a declared view replaces
a default aloud, a case without views keeps only its defaults; (g) a fit's
parity, residuals and isotherm are one table whose rms is the op's own.  Six
by-hand sabotages on the views engine in its docstring (S2 and S6 are caught
by one arm each — a probe, because no shipped declaration exercises them),
and four on the first cut's engine:

* S1  the difference written b − a → (c) on every difference column and row;
* S2  the unknown-diagnostic refusal disarmed → (e) only;
* S3  the stale-file removal dropped → (f);
* S4  one cell of `constant/reference/nanofiltran_stiff.csv` hand-edited →
  (a), and (c) did NOT (it recomputes from the file as it stands) — which is
  why (a) exists.
