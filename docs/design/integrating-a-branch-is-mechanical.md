# Integrating a branch is mechanical, until it is not

*DEV.md 4c C122 item 1, 2026-10-20 (Vítor: "Avança 1 e 2", on the
commander's reflection).  Kind: ADR.  Status: built on
`claude/c122-integrate-tool`; the tool is `bin/integrate`, its usage is
`bin/integrate --help`.*

## 1. The hour

Integrating a general's branch into `main` cost the commander about an hour
per branch on 2026-10-20, and most of that hour was mechanical: make a
worktree, merge, find that `generated/caseManifest.json` conflicts because
both sides added a case, regenerate it by hand, discover that a guide PDF the
checkout had left NEWER than its sources was never rebuilt (plain `make`
calls it up to date -- paid for twice that day), build, decide which cases
and gates the diff can reach, run them, find that a gate's claim moved and
refresh the gate manifest, and only then judge whether the branch is ready.
Three of those steps went wrong in ways that cost more than their own time:

* **The scope variable was set by hand and meant nothing.**  The
  conservation gates read the suite's single-pass cache only when
  `CHOUPO_SUITE_OUTPUTS` names it AND `CHOUPO_SUITE_SCOPE=1`.  An explicit
  `bin/runTests <cases>` filled no cache at all, so there was no way to say
  "judge these cases" -- and `CHOUPO_SUITE_SCOPE=<a path>` satisfied neither
  half: every gate fell back to its standalone corpus sweep, twenty minutes
  each.
* **A `--help` started an hour of work.**  `gate_manifest.py` looked for
  `--check` and `--only` and treated anything else as "regenerate all 239
  gates".
* **A generated file was left stale on `main`.**  Measured while building
  this tool: `docs/propsGuide-operations.tex` at `main` does not describe the
  `phaseSplitScan` op that the wave-2 integration had landed, so
  `props_ops_reference.py --check` -- an arm of `bin/runTests` -- fails on
  `main` today.  The integration that landed the op regenerated the case
  manifest and the release inventory, the two files someone remembered, and
  not the third.

The last one is the argument for the slice.  The rule was never in doubt --
a generated file is REGENERATED, never transported or hand-merged
(`check_workspace_truth` has said so since 2026-08-15) -- but nothing in the
tree said WHICH files are generated or WHAT regenerates each.  The list lived
in a head.

## 2. What was built

1. **`bin/curate/generated_artefacts.py` -- the one home of that list.**
   Twenty entries owning 39 tracked files, each with its generator, the check
   that holds it fresh (or `None`), the phase it can run in (`pre`, `build`,
   `engine`, `node`, `pdf`, `gates`) and what a merge conflict in it means:
   `regenerate` (take main's side, run the generator) or `human` (a
   generated REGION inside hand-written text -- the bibliography of the
   Theory Guide, the components table's prose, the ammonia README's block --
   where taking one side would discard the other side's prose).  Its
   `--check` arm, wired into `bin/runTests` beside `case_manifest.py
   --check`, holds the list to the tree in both directions: every generator
   it names exists, every entry matches a tracked file, every tracked file
   under `generated/` and every file that DECLARES itself generated (`GENERATED
   by`, `DO NOT EDIT`) has exactly one owner.  `generated/modelsCatalogue.json`
   is listed with no generator, because it has none (`check_models_catalogue`
   arm 6) -- a conflict in it is a human's, and the list says so rather than
   leaving it out.
2. **`bin/runTests --scope <case|dir>...`** -- the named cases with the
   sweep's per-case checks, then the five conservation gates scoped to that
   pass.  It is `--fast` with the list given instead of declared; the two
   environment variables now have ONE writer (`bin/runTests`) and one reader
   (`bin/curate/suite_cache.py`), which also announces a scope variable set
   by hand without a cache or to anything but `1`.
3. **`gate_manifest.py` refuses an unknown argument** and prints its usage.
4. **`bin/integrate <branch>`**, the commander's tool, in eight steps --
   merge; resolve generated conflicts by regeneration and STOP on any other;
   regenerate the stale and re-check them; rebuild the touched guides with
   `make -B` and read each back with `pdftotext` for every case the merge
   adds; build; run the validation the diff REACHES; re-observe moved
   gate-manifest claims with `--only`; print one verdict.  It never pushes,
   never re-records a golden (moved rows are listed), never hand-merges and
   never launches a full regression.

## 3. Validation sized by reach, derived

CLAUDE.md §10 sizes validation by what a change can reach; the tool derives
that from the merge's diff against the base, using maps the tree already
keeps, and prints the plan before running it (`bin/integrate --plan` prints
it alone, touching nothing).

* **Cases.**  A touched case directory is in.  A touched C++ file is mapped
  through `generated/codeMap.json` (classes per header, the compiler's own
  include graph, the factory registries) to the factory KEYS it defines, and
  each key through `generated/caseManifest.json`'s indices to the cases that
  declare it; a key no index carries falls back to a word scan of the cases'
  own dicts -- the manifest's own method, with its own stated weakness
  (presence is evidence, absence is weak).  A `.cpp` is reached through its
  own types plus every includer of its header that registers one; a `.H`
  through every TU that includes it.  A data record is reached through the
  cases that name it.
* **Gates.**  Every `bin/curate/check_*.py` whose source names a touched file
  by path, file name, or (for `src/` and `bin/curate` modules) stem -- the
  derivation `bin/runTests --gui` uses for its own list, widened from `gui/`
  to every path.  A gate that reads the suite cache judges cases, so it runs
  inside `--scope`, unless its own source moved.
* **Tiers.**  `--gui` when `gui/` moved or when lines moved in a `src/` file
  an EduTool lesson cites by `file:line` (the 2026-09-27 trap: the lesson
  tests hold the citation to the line).  `--fast` when a factory
  registration or the build system moved.
* **Full sweep: never launched.**  A binary's `main`, a TU that registers no
  type and is included by others that register none, a data record more than
  150 cases name, a deleted source file whose reach the map can no longer
  read, or more than 150 cases in all: the verdict names the path and the
  reason and ends "BLOCKED on a decision that is Vítor's" (§0.4: a full
  regression needs a written reason and his authorisation).

## 4. Decisions, and what was rejected

* **The integration worktree is REUSED, not fresh per run.**  The brief said
  "a fresh worktree"; a fresh worktree means a cold build of 369 translation
  units, which at `-j2` on a shared machine is most of the hour this slice
  exists to remove.  The default worktree (`.claude/worktrees/integ-<slug>`)
  is created on first use and thereafter RESET to the base -- `git checkout
  -B` touches only the files that differ, so `make` rebuilds only what the
  merge moved -- and `git clean -ffdx` keeps only `build/`, `gui/node_modules/`
  and the root binary links.  The reset is REFUSED when the worktree is
  mid-merge, holds uncommitted work, or carries a commit on no remote that
  lacks the tool's own trailer (`Integrated-by: bin/integrate`): it discards
  only what it made.  `--worktree DIR` names any other place, which is how a
  genuinely fresh one is had.  *Rejected:* copying another worktree's build
  and touching the files that differ -- correct only if that build was fresh
  for its own HEAD, which this tool cannot prove.
* **A conflict is resolved by MAIN's side, committed with the merge, and
  regenerated in a commit of its own.**  Regenerating inside the conflicted
  merge would need the build first for half the generators; a stale generated
  file inside a merge commit that is immediately followed by its regeneration
  is the shape the commander's own integrations already had.
* **Freshness is a contract only where a check holds it.**  An entry with no
  check (the interim review dossier, the component aliases, the method-tools
  index) is regenerated on CONFLICT only.  *Rejected:* re-stamping every
  generated file on every integration -- measured, the interim dossier at
  `main` would move its own findings (an A-class comparison disappears), and
  a curation snapshot that changes because someone merged an unrelated
  branch is a number nobody asked for.
* **An engine artefact that fails its check is LISTED, not regenerated.**
  The `engine` entries (the SDEM validation chapters, the green-ammonia
  README's stage comparison) print numbers the engine computes into pages a
  reader trusts; regenerating them on a clean merge is a `--record` by
  another name.  The verdict lists the check's diff and says NOT READY.
  Measured, not supposed: see §6.
* **A regenerated artefact is RE-CHECKED.**  If it is still stale the run
  stops: either the generator does not write what its entry says, or the
  check holds a half regeneration cannot fix (`release_inventory --check`
  also refuses a corpus count hand-carried in prose).
* **The gate manifest is never regenerated whole** (an hour); the gates the
  branch re-observed, the gates new to the tree and the gates whose claim
  moved in the validation run are re-observed with `--only`.
* **The PDF read-back asks one question it can answer:** does each case the
  merge ADDS appear in a rebuilt guide's text (the Tutorials Guide lists every
  case).  *Rejected:* comparing rebuilt PDFs byte for byte with the committed
  ones -- pdflatex stamps its own dates, so a byte diff says nothing.
* **The list of generated files is a Python module, not a section of
  `bin/runTests`.**  The suite already runs each generator's `--check`, but
  as ten separate shell blocks; a list the tool can import is the one home,
  and the suite's blocks stay where they are.  *Not done:* replacing those
  blocks with a loop over the registry -- a change to the suite's own shape
  that this slice did not need.
* **It never pushes `main`.**  The verdict prints the exact `git push origin
  HEAD:main` for the commander to run; landing is a decision, not a step.

## 5. Limits, said plainly

* The case reach is CANDIDATES, not completeness: runtime dispatch reaches
  further than any include graph (a solver called through a base pointer),
  which is what the witness tier and the full sweep are for.  The tool does
  not run the witness tier on its own initiative.
* A `.cpp` whose own types are registered is attributed through them even
  when an unregistered TU includes its header; that includer is not counted
  as a shared path.  Generous elsewhere, this is the one place the rule
  narrows, and it is narrowed on purpose -- otherwise every unit operation
  included by the flowsheet would read as "full sweep".
* The gate derivation is textual: a gate that composes a path from pieces it
  does not spell out, or reads a whole directory without naming a file in
  it, is not reached.
* `generated_artefacts.py --check` finds a missing WHOLE-file entry (five
  by-hand sabotages, all caught: an owner dropped under `generated/`, two
  self-declared files left ownerless, a file claimed twice, a generator
  renamed away).  It cannot find a missing REGION entry -- a hand-written
  file with a generated block does not declare itself generated in its
  head.
* `check_closure_ledger_pinned` and `check_campaign_ledger_pinned` refuse a
  scoped pass that reaches none of their candidates (their rule for
  `--fast`).  The tool reads that refusal as NO SUBJECT and says so; a human
  running `bin/runTests --scope` by hand still sees it as a FAIL whose
  remedy names the fast set.
* A conflict in a generated REGION stops the run even when only the
  generated part conflicted; telling the two apart needs a merge driver per
  generator, and nobody has measured that it would be worth one.

## 6. Proof

The brief: re-integrate a branch that already landed and compare with what
landed.  `origin/claude/g6-small-defects` landed as merge `8b5887752`
(first parent `668b7dff5`) followed by `25941a479`, the commander's
hand-made refresh of one gate-manifest claim.  The proof base was
`668b7dff5` plus this slice's tool commits (a local, unpushed branch --
the tool has to exist in the tree it integrates into), and the command was
`bin/integrate claude/g6-small-defects --base <that branch> --jobs 2`.
Measured on the shared four-core machine, load average 8-11 from other
generals' suites:

| run | what it showed | wall clock |
|---|---|---|
| 1, fresh worktree | the cold build: 369 TUs at `-j2` in **722 s**.  STOPPED at the commit by a defect it found in itself (a stripped `git status` line cut `docs/` to `ocs/`), and its regeneration of the ammonia README surfaced the policy below | 1121 s to the stop |
| 2, reused worktree | the reset-and-reuse path: build **8 s**.  `runTests --scope` and `--gui` were refused by `check_build_fresh`, which read the tool's own `build/integrate/` log directory as a platform build -- moved to the worktree's git dir | 321 s |
| 3, reused worktree | the whole chain, to a verdict | **2258 s** |

Run 3, stage by stage: merge 1 s; regeneration before the build 27 s
(`propsOpsReference` stale); build 12 s; `codeMap` regenerated (stale) and
the two engine generators checked, 268 s; three guides rebuilt with `make
-B` and read back, 35 s; `runTests --scope` over the 35 reached cases with
the five scoped conservation gates, 218 s (one case, `aceticAcid02_plant`,
145 s of it); ten gates standalone, ~40 s; `runTests --gui`, 1688 s (its
own 5845 tests and 32 gates, under that load -- measured at ~3 min on an
idle machine when `--gui` was built); `gate_manifest --only`, 5 s.

**What it reproduced.**  The gate manifest's `check_gibbs_solid_phase` claim
came out byte-identical to the one `25941a479` committed by hand (only the
recorded `seconds` differ).  The plan matched the slice: the GibbsReactor
change reached the 28 `gibbsReactor` cases and the 7 `gibbsMap` cases
(`GibbsMapOp.cpp` includes its header), the gui/ change and the moved
lesson citations triggered `--gui`, and no registration moved, so no
`--fast`.  Every case passed its golden; mass, energy, element and boundary
closure passed scoped; `check_closure_ledger_pinned` had no candidate among
the 35 and refused, which the tool reports as NO SUBJECT (its refusal is
the `--fast` rule, where the declared set must reach it).

**What it found that the landed integration did not**, all three present on
`main` today and confirmed against the commander's own `integ-g6` build:

1. `docs/propsGuide-operations.tex` stale (the `phaseSplitScan` op) --
   regenerated, and `propsGuide.pdf` rebuilt with it;
2. `generated/codeMap.json` stale (the C119 friction and Reynolds-sweep
   classes) -- regenerated;
3. `tutorials/plant/greenAmmonia03_basicDesign/README.md`'s generated NPV
   decomposition no longer reproduces (model fidelity -39.13 -> -39.30 M EUR,
   the start-up years +10.14 -> +10.13, two separators' C_BM by 0.03 M EUR):
   `gen_ammonia_stage_comparison.py --check`, an arm of `bin/runTests`,
   fails on `main`.  Run 1 regenerated it -- and that is what turned it into
   a POLICY: an `engine` artefact prints engine numbers into a page a reader
   trusts, so on a clean merge a stale one is now LISTED with its diff, never
   regenerated, and the verdict is NOT READY.  It is a moved golden by
   another name, and the decision is Vítor's.

The verdict was therefore NOT READY, for a reason that is true of `main`
and not of the branch.
