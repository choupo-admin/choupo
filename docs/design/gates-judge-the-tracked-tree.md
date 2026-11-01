# Gates judge the tracked tree — a verdict is a property of the commit

*Slice 2026-11-01 (DEV.md 4c C170 item 4 and its owed fixes).  Tooling plane —
the `bin/curate/check_*.py` gates.  Status: shipped for the gates the
measurement found; the rest is named, not claimed.  Record level: 3.*

---

## 1. The defect

Vítor's laptop swept **752 PASS / 15 FAIL** on a `main` that passed in the
container.  Three were real defects and were fixed; most of the rest were his
machine, not the corpus: private data in `data/local/` (the gitignored working
tier), untracked files, Node 18, missing git tags.  C170 recorded the promise
"problem-divergence and duplicate-keys must not judge `data/local/`; no gate
may fail on an untracked file", and nothing had been done about it.

A gate that `os.walk`s or `rglob`s a directory judges **whatever is on that
disk**.  The same commit therefore returns a different verdict — or, worse, a
different *claim* with the same verdict — on a machine that holds private or
untracked files.  A verdict that depends on the machine is not a verdict about
the repository.

## 2. What was measured (not assumed)

Method: the gates that read a data or tree root (87 of 286 by a grep of their
sources; later all 278 non-destructive ones) were run with the same build in
three states of one worktree — **A** nothing private, **B** the project's real
`data/local/` copied in (19 entries: components, parameters, electrolyte,
adsorption, mechanisms …), **C** untracked probe files that violate common
rules planted in `data/standards/`, `tutorials/`, `docs/`, `src/` — and the
verdicts and claim lines compared.  There is no `CHOUPO_NO_LOCAL` switch in
the engine (grep of `src/`): `data/local` is read by `Database.cpp`, `NRTL`,
`UNIQUAC`, `Wilson`, `Component.cpp` (cosmo) by design ("standards beats local;
local fills gaps"), so the engine-driven gates cannot be made blind to it from
the outside; that is a separate decision (§6).

Two full runs of the 278 non-destructive gates, same build, `CHOUPO_HOME`
unset (the shell had exported the MAIN checkout's, which made the first
attempt measure the wrong tree — see §6): **clean** (no private data, no
probes) against **dirty** (the real `data/local/`, 19 entries, plus untracked
probe files planted in `data/standards/`, `tutorials/`, `docs/`, `src/`).
268 gates PASS clean, 5 time out in both (`check_energy_boundary_pinned`,
`check_energy_closure`, `check_mass_closure`, `check_unread_keys`,
`check_utility_allocation_pinned`: not measured), 5 fail clean (`check_batch_plan` arm (l), `check_method_tools` — no
`gui/node_modules`, `check_models_catalogue`, `check_sealed_corpus`, and
`check_origin_census`, which was this slice's own re-sourcing moving a
prose-stated census and is fixed in the same commit); the other four are
unrelated to it and unchanged.  Gates whose verdict or claim differed:

| gate | difference | cause |
|---|---|---|
| `check_duplicate_keys` | **FAIL with `data/local`** (`data/local/components/NH3.dat` declares a key twice) | `SCAN` listed `data/local` by name |
| `check_problem_divergence` | **FAIL with `data/local`** (A1/A3/A4: "did not refuse an unauthorised ideal pair") | the engine falls back to a private `acetone-water` / `acetone-methanol` pair, so the gate's "uncurated" probes are curated on that machine |
| `check_source_licence` | **FAIL on an untracked probe** | five `rglob` arms |
| `check_glossary_bans` | claim 41 776 vs 43 354 files scanned | `rglob` over `data/` reached the private tier |
| `check_gibbs_duhem` | claim "9" vs "10" model/pair combinations | the engine read a private pair file |
| `check_registry_scan` | read `data/local/parameters` by name | explicit second root |
| `check_case_tiers`, `check_fastset` | FAIL on an untracked tutorial folder | mirror `bin/runTests`' own walk of the disk — NOT converted, §5 |
| `check_empty_dirs`, `check_asset_homes`, `check_component_name_hint`, `check_record_form`, `check_ion_pins`, `check_tree_gate`, `check_validity_windows` | same verdict, claimed counts move with untracked files | a count in the claim line; harmless, not converted |
| `check_composite_limits`, `check_flash_complex`, `check_inlet_resolution`, `check_neutral_master_mineral`, `check_solid_equilibrium_spike`, `check_solid_service`, `check_volumetric_rung1` | FAIL when a broken UNTRACKED record sits in `data/standards/` | the ENGINE loads the whole catalogue directory and refuses a record that declares a key twice — correct engine behaviour, not a gate defect |

(Probe-induced engine refusals are listed so nobody mistakes them for gate
sensitivity: a malformed file in `data/standards/` stops the engine on every
machine; that is the refusal working.)

## 3. The rule

> **A gate judges the files `git ls-files` lists, and a gate that cannot
> enumerate them REFUSES.**

* `bin/curate/tracked_tree.py` is the one home: `tracked_files(root, *prefixes,
  suffixes=…, gate=…)`, `all_tracked(root, gate)`.  It exits 1 with *CANNOT
  RUN* when `git ls-files` fails or lists fewer than 500 paths (a tarball with
  no `.git`, a shallow export) — never an empty list, because a scan over
  nothing is the `check_true_ions` shape (a permanently green gate).
* A gate whose **subject is the private tier** (`check_evidence_records`,
  `check_evidence_partition`: they exist to say something about
  `data/local/evidence/`) does not use it to look there; its claim says what
  it did and did not check.
* The converted gates' claim lines say **NOT judged: `data/local/` and
  untracked files**, so the reader sees the boundary (the 2026-09-06 rule:
  a gate's claim states what was scanned and what was not).

Converted: `check_duplicate_keys`, `check_glossary_bans`,
`check_source_licence` (five arms), `check_registry_scan` (symmetric-pair
sweep) read tracked files; `check_problem_divergence` and `check_gibbs_duhem`,
which DRIVE the engine, run it against `tracked_tree.public_data_root()` — a
throw-away `CHOUPO_HOME` whose `data/` holds a copy of the tracked
`standards/`, symlinks to the other entries and no `local` — because the
engine has no switch to hide the private tier (§6).  Held by
`check_gates_judge_tracked` for the first five (the sixth, `check_gibbs_duhem`,
by the manual before/after: claim 9 combinations with and without
`data/local`).

## 4. The gate that keeps it true

`check_gates_judge_tracked` holds the conversion by **behaviour**, not by grep:
for each converted gate it plants an untracked file that violates the gate's
exact rule — in the tracked tier's own directory and under `data/local/` — and
requires the gate to keep exit 0 and to say it did not judge them; then the
**negative control**: the same violation made *tracked* in a throw-away copy of
the index (`GIT_INDEX_FILE` + `git add -N`; the real index is never touched)
must make the gate fail — without it the first arm could be a gate that judges
nothing.  A third arm runs the helper from a directory that is not a
repository and requires the by-name refusal.  By-hand sabotages of the gate
itself are listed in the slice report.

## 5. What is NOT done, and why

* About 130 gates glob or walk a directory.  Only those measured to change
  verdict or claim were converted; the others are not thereby immune, and the
  new gate's probe table is the place to add one.  `check_empty_dirs` judges
  directories — tracked files cannot show an empty directory — and was left.
* `check_case_tiers` and `check_fastset` mirror `bin/runTests`' own `find`
  over the disk: a new untracked case is walked by the suite, so these two
  say "register it" until it is.  Converting them to tracked files would let
  the suite walk a case its completeness gates cannot see.  It is a decision
  about what an untracked case means to the suite, put to the architect, not
  taken here.
* An engine-driven gate not listed above that reads a private pair is not
  thereby immune; the 5 gates that time out in both runs were not measured.

## 6. Owed: one engine switch (a decision, not taken here)

`data/local` is read at six sites in `src/` (`Database.cpp:220,277`,
`Component.cpp:1060`, `NRTL.cpp:104`, `UNIQUAC.cpp:85`, `Wilson.cpp:77`).  A
single `Database::localTierVisible()` read from `CHOUPO_NO_LOCAL`, called by
all six, would replace the throw-away root of §3 and let every engine-driven
gate run on the public tier alone with no copy.  It moves lines in files
EduTool lessons cite by `file:line`, needs a rebuild and `--gui`, and changes
engine behaviour (an env var that hides data), so it is put to the architect
rather than slipped into a gates slice.  Until then `public_data_root()` does
it from outside, at the cost of a 7 MB copy per gate.

A trap found on the way: a shell that exports `CHOUPO_HOME` (the project's own
`etc/bashrc` does) makes every engine-driven gate read THAT tree's `data/`
whatever worktree the gate lives in.  The first measurement here ran against
the main checkout's private data for an hour before the verdict contradicted
the file listing.  A measurement states which `CHOUPO_HOME` it ran under.

## 7. The other owed fixes of C170, recorded here with their verdicts

* **`check_workspace_truth`** said *"the container recycler has rewound this
  checkout"* to a laptop that was merely **behind** origin.  Two facts shared
  one message.  Now: HEAD an ancestor of origin → *BEHIND by N commits,
  fast-forward only* with `git pull --ff-only` (and `--remediate`
  fast-forwards, never `reset --hard`); neither an ancestor of the other →
  *DIVERGED* (rewound, force-moved or never pushed), the recycler named as one
  possible cause; the OK line states **CHECKED** (origin is an ancestor of
  HEAD after a fresh fetch; the overlay sentinels intact) and **NOT CHECKED**
  (untracked files, tracked content beyond the sentinels, whether HEAD is the
  commit meant, the recycler itself).  The `DEGRADED` path (no network) still
  exits 0 by design and says what is not proven.
* **`nu 0; order 1`** — the false plateau C164 found is a *reversible*
  collider whose reverse leg has no `c_M`; `Reaction::
  refuseNonMassActionDetailedBalance` (C185, `54348e4a1`) already refuses it by
  name on every reader.  The same entry in an **irreversible** reaction is a
  homogeneous catalyst or, with a negative order (honoured since C190 item 10,
  `Reaction::powerLawFactor`), an inhibitor: a mechanism fact the
  stoichiometry cannot express and the rate law can.  Refusing it would forbid
  catalysis.  Decision: **keep the refusal where detailed balance applies, keep
  the entry elsewhere**; the corpus declares no `nu 0` entry at all (grep).
  Held by `check_lhhw_detailed_balance` arm (g).
* **Burcat** — see `bin/curate/debt_registry.py` `NC_COMPILATION`:
  sixteen records re-sourced from NASA/TP-2002-211556 where the report agrees
  (dHf 0.5 kJ/mol, s 0.02 J/(mol K), Cp 2 %); twenty stay pinned with the
  measured reason each.
