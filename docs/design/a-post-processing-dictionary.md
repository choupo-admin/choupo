# A post-processing dictionary — the plots and tables a case asks for

*2026-10-24, DEV.md 4c C147 (approved: "Avança como achares melhor") and its
first witness, the NanoFiltran paper as ONE case (C148's landing note:
Vítor, "Não multipliques casos!  Faz um caso único!  Com um
pós-processamento para gerar os plots adequados", and "Um pós-processamento
não gera os gráficos e tabelas que são precisos para este artigo?").*

## 1. What was measured before anything was built

* A props op published NUMBERS keyed by word (`diagnostics()`), optionally a
  CSV it wrote itself (`profile pore_N350.csv;`), and nothing else.  A plot of
  the pore needed a reader who knew the file name and its header — a second
  reader of a format nobody declared.
* The GUI's Plot workspace drew a CSV by SNIFFING its header
  (`CsvAutoPlot`): the shape was guessed, the series were whatever columns
  the file had, and the units were nowhere.
* A unit publishes ONE `UnitProfile` (`SimulationResult::profiles`, one per
  unit; `check_internal_states` arm (f) records that two kinds on one unit
  have no live case).
* The NanoFiltran paper had become THREE cases (code to code, Fig. 3,
  Table 2) because each comparison needed its own golden; the tables the
  paper prints lived as hand-written text in the propsDict headers, held to
  the run by `check_nanofiltran_paper` arm (d).

## 2. The decision, in one sentence

**A case DECLARES the plots and tables it wants over what the run
PUBLISHES; the engine resolves every name, holds every unit, computes every
difference and writes the numbers; the GUI draws them and computes
nothing.**

## 3. The grammar (`system/postProcessDict`)

The name is Vítor's (`postProcessDict`, 2026-10-24; the first cut was
called `plotDict`, renamed before it landed): it holds plots AND tables,
because a table here is a plot's numbers set out in rows and both are read
the same way.  `postDict` was not reused: it is the SIZING and COSTING pass
of choupoSolve, a computation that adds numbers to the result, where this
dictionary only arranges published ones.

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

plots
(
    {
        name    fig3_dye4;                       // the file postProcessing/postProcessDict/fig3_dye4.csv
        title   "Fig. 3: ...";
        xAxis   { label "feed chloride, c_Cl"; unit "mol/m3"; scale linear; }
        yAxis   { label "R_obs"; unit "-"; scale linear; }      // linear | log
        series
        (
            //  across operations: one point per op, two diagnostics
            { name choupoNa; label "Na+ Choupo"; ops ( dye4_p1 ... dye4_p5 ); x c_bulk_Cl_p1; y Robs_Na_p1; }
            //  an op's published table (core/PublishedTable.H), rows kept by select
            { name pore;     label "Choupo";     op N350; table pore; select { point 1; } x x_um; y psi_V; }
            //  a reference file, rows kept by select (a number or a word)
            { name expNa;    label "experiment"; reference bmFig3; select { dye_molm3 4; ion Na; } x cCl_molm3; y Robs_exp; yError dRobs; style markers; }
            //  a difference of two series declared BEFORE it, at their common x
            { name d;        label "Choupo - experiment"; difference ( choupoNa expNa ); relative no; }
        );
    }
);

tables
(
    //  a SERIES table: one row per x value, the columns are series
    {
        name    table2_grid;
        title   "...";
        x       { label "nodes N"; unit "-"; }
        columns ( <series> ... );                // a column may declare `unit`
    }
    //  a ROWS table: one row per record, the columns are quantities
    {
        name    table2_N350;
        title   "...";
        columns ( { name Na; label "permeate Na+"; unit "mol/m3"; } ... );
        rows
        (
            { name paper;  label "Table 2"; reference nfStiff; select { stage paper; } cells { Na Na_molm3; } }
            { name choupo; label "Choupo";  op N350; cells { Na c_perm_Na_p1; } }
            { name diff;   label "Choupo against Table 2"; difference ( choupo paper ); relative yes; }
        );
    }
);
```

`style lines|markers|linesMarkers` is optional on a series (the role decides
otherwise: an experiment is drawn as markers with its error bars, a
reference dashed, a computed series as a line).

## 4. What is refused, and when

TWO PHASES, so a typo does not cost the run it guards.  BEFORE the
operations (`postProcessDict::Reader`): the grammar; a reference file that is
missing, outside `constant/`, without a citation, or whose `units {}` names
a column it lacks; an operation the propsDict does not declare; a series
naming no source or two; a difference of a series not declared before it;
two items of one name (they would write one file); a key nothing reads
(`dictAudit`, refused here rather than warned: a new dictionary owes no
corpus a tolerance).  AFTER them (`evaluate`): a diagnostic, table or table
column the operation did not publish — the refusal LISTS what it did
publish; a unit the source publishes that disagrees with the declared one
(units are compared as words; nothing is converted); a reference row whose
`select` keeps no record, or more than one in a rows table; a non-positive
value on a log axis; an x value twice in a series table.

The unit of a diagnostic is the op's to publish
(`PropertyOperation::diagnosticUnit`); where it publishes none, the axis's
declared unit is taken as the author's statement, said on the console and
recorded (`unitPublished false`) in the sidecar.

## 5. What is written, and where the GUI reads it

`postProcessing/postProcessDict/<name>.csv` and `<name>.json` — the folder named
after the dictionary that declared it, so a file can be traced to its
declaration, and kept apart from `postProcessing/<report>/<instant>/` (the
CHT-faithful report tree).  REGENERATED WHOLE every run, and REMOVED when
the case declares no postProcessDict: a derivative view must not outlive its
declaration (the `design/` rule).  Gitignored with every `postProcessing/`.

* a plot: `series,x,y,yError` (one row per point, the series by name);
* a series table: `x,<column>...` (empty where a column has no value);
* a rows table: `row,<column>...`;

numbers to 12 significant figures (the machine channel's).  The `.json`
sidecar — titles, axes, units, each series' role, style, and its SOURCE in
words — is the same object the result JSON carries in its top-level
`postProcessing` block, and the console prints every table.

The GUI (`gui/src/case/postProcessing.ts`, `ui/plotting/PostProcessingView.tsx`)
reads the block for the description and the harvested CSV for the numbers;
the Plot workspace lists the items under **Post-processing**.  It formats a
relative difference as a percentage and offers the CSV for export; it
computes nothing else.

## 6. The generalisation path (not built)

The reader takes a `Publication` per producer: a name, a type word,
diagnostics with units, and `PublishedTable`s.  choupoProps fills one per
op.  For choupoSolve the producer is a UNIT: its KPIs are the diagnostics,
and its `UnitProfile` is one published table.  What a unit cannot do today
is publish MORE THAN ONE named table — the spiral-wound module's march
along its elements and the solved pore at each station are two.  The path:
`UnitOperation::publishedTables()` beside `profile()`, `SimulationResult`
carrying them per unit, `Flowsheet` filling `postProcessDict::Publication`s, and
choupoSolve's main calling the same `Reader` after the solve.  An outer
driver's sweep is a third producer (its points table is the sweep CSV).
None of it is migrated here: this slice moves no unit.

## 7. The witness: the NanoFiltran paper in one case

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
diagnostics published since C142/C145 and never pinned) and 39 `csv` rows
pinning the differences the postProcessDict computes — the only numbers it writes
that are not a projection of something already pinned.

Its postProcessDict generates: `table2_N350` (Table 2 at N = 350 accounted for one
change at a time, NanoFiltran as received → corrected, beside Choupo, with
relative differences), `table2_grid` and `gridStudy_Na` / `gridStudy_iterations`
(the grid study: permeate Na+ and iterations against N), `fig4_concentration`
and `fig4_potential` (Choupo's pore at N = 350 against NanoFiltran corrected
and as received), `fig3_dye4` / `fig3_dye37` and their tables (R_obs against
c_Cl: experiment with reading errors, Choupo, NanoFiltran), and
`codeToCode_exampleIdeal` / `codeToCode` (part A).

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

## 8. What is NOT done, said plainly

* choupoSolve, choupoBatch, choupoCtrl, choupoSemiContinuous read no
  postProcessDict (section 6).
* Units are compared as words; `mol/m3` and `mol/m^3` are different units
  to this reader, and nothing converts.
* `polarisation01_geraldes_afonso_table1` (a different paper, Geraldes &
  Afonso 2007) keeps its header table; it has no postProcessDict.
* The interior of Choupo's pore profile is not compared with NanoFiltran's
  node by node (the grids differ); its faces are, by
  `check_nanofiltran_paper` arm (c).
* The propsDict header tables of parts B and C stay, held to the run by
  `check_nanofiltran_paper` arm (d): they are now a transcript of what the
  postProcessDict generates, and could be retired in favour of a pointer — a
  decision for whoever next edits the case, recorded here.

## 9. Gate

`bin/curate/check_postprocessing.py`: (a) the reference files are their
sources' export; (b) every declared item is produced, the sidecar equals the
block, nothing else is in the folder; (c) every one of ~9000 written numbers
recomputed from the source the dict names, by the gate's OWN reading of the
postProcessDict; (d) the tables meet the golden's 59 anchors; (e) 13 refusals fire
by name; (f) a stale file and an undeclared view are removed.  Four by-hand
sabotages in its docstring — one survived every arm but one (S2: a
disarmed unknown-diagnostic refusal is invisible to every arm that reads
the SHIPPED dict, because the shipped dict names nothing unpublished; only
the probe sees it).
