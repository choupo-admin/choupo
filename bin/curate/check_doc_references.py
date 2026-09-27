#!/usr/bin/env python3
"""Every path and case name the AI-facing docs point at must exist.

Design record: DEV.md section 5 debt 5.

`bin/llmctx` concatenates `docs/ai/*.md` into the context an assistant uses to
author a case for a user.  A path in there is not decoration -- it is an
instruction the reader will follow, and a dead one costs them a search that
ends nowhere.  Measured on 2026-08-02, out of 213 path mentions and 102 case
names, seven were dead: an archive directory that had been dissolved into the
categorised layout (`tutorials/props/old/`), three starter-table cases that no
longer existed under those names, UNIFAC groups still filed at their
pre-Migration-2 address, a k_ij folder that was never built, and a machinery
credit in CLAUDE.md for two directories that never existed at all.  Each was
individually harmless and collectively they made the docs untrustworthy.

Two checks, both mechanical:

  PATHS       anything shaped like a repo path (tutorials/, src/, data/, ...)
              must exist on disk.
  CASE NAMES  anything shaped like a case name in backticks (`flash01_...`)
              must be a real tutorial directory.

NOT-YET / DELIBERATELY-ABSENT entries are ALLOWED, but only by being listed
below with the reason -- naming a retired thing is legitimate prose and the
list is where that legitimacy is written down, not inferred.

Exit 1 listing the dead references."""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

DOCS = sorted((ROOT / "docs" / "ai").glob("*.md")) + [ROOT / "CLAUDE.md",
                                                      ROOT / "DEV.md"]

PREFIXES = ("tutorials", "src", "bin", "data", "docs", "gui", "make",
            "metadata", "generated", "etc")

#  A path may legitimately not exist.  Each entry says WHY, and the reason is
#  the thing a reviewer checks -- an unexplained entry here is a suppressed
#  failure wearing a whitelist.
#  THE PRIVATE TIER IS A RULE, NOT FOUR ENTRIES.  `data/local/` is the
#  gitignored, private working tier: the public repository ships it EMPTY by
#  design, so NOTHING under it can exist in a clean checkout, and a doc that
#  names one of its paths is describing where a user's OWN data goes.  This
#  used to be a hand-kept list of four such paths, and it went stale the
#  moment a fifth was written about (`data/local/lennardJones/`, the Svehla
#  slice of 2026-09-06) -- the suite then went red on a correct sentence in
#  CLAUDE.md, in every fresh clone, for ever.  A list of instances of a rule
#  is the rule with extra steps and a drift.  The tier IS the reason, stated
#  once here; a path needing a reason of its OWN still goes in ALLOWED_PATHS.
PRIVATE_TIER = "data/local/"


def in_private_tier(p: str) -> bool:
    return p.startswith(PRIVATE_TIER)


#  A RUN OUTPUT IS A RULE TOO, and for the same reason (2026-09-27).  A doc
#  that names `tutorials/<case>/txy.csv` is naming what that case WRITES when
#  it runs: the file exists in a checkout where the case has run and in no
#  fresh clone, because `.gitignore` keeps every run output out of the tree.
#  So the gate went red on DEV.md in every fresh worktree and green wherever
#  the witness had run -- a verdict about the reader's machine, not the doc.
#  Listing the two paths in ALLOWED_PATHS would have been wrong twice over:
#  a list of instances of a rule drifts (PRIVATE_TIER above), and the
#  stale-entry arm below would then fire in exactly the checkouts where the
#  file HAD been generated.  The rule, and what it still checks:
#
#    * the path is one git IGNORES (asked of git itself -- `check-ignore` --
#      never re-derived from the patterns here), so its absence from a clean
#      checkout is the repository's own declaration, not a guess; AND
#    * the CASE that produces it exists -- the nearest ancestor holding
#      `system/controlDict`.  A renamed or deleted witness therefore still
#      reads as a dead reference, which is the defect this gate is for.
#
#  NOT CHECKED, said plainly: whether the prose DESCRIBES the path as a run
#  output (no gate here can read that), and whether the case really writes a
#  file of that name (only running it can say).
RUN_OUTPUT_ROOT = "tutorials/"
_ignored_cache: dict = {}


def git_ignores(p: str) -> bool:
    """True when git's own ignore rules match `p`.  A checkout with no git
    cannot answer; that REFUSES rather than guessing either way."""
    if p not in _ignored_cache:
        try:
            r = subprocess.run(["git", "-C", str(ROOT), "check-ignore", "-q",
                                "--", p], capture_output=True, text=True)
        except OSError as e:
            raise SystemExit(f"check_doc_references: REFUSED -- cannot ask git"
                             f" whether '{p}' is ignored ({e}); the run-output"
                             " rule cannot be evaluated and must not pass")
        if r.returncode not in (0, 1):
            raise SystemExit(f"check_doc_references: REFUSED -- `git"
                             f" check-ignore` failed on '{p}'"
                             f" ({r.stderr.strip()}); the run-output rule"
                             " cannot be evaluated and must not pass")
        _ignored_cache[p] = (r.returncode == 0)
    return _ignored_cache[p]


def producing_case(p: str):
    """The case directory whose run writes the ignored path `p`, or None."""
    if not p.startswith(RUN_OUTPUT_ROOT) or not git_ignores(p):
        return None
    d = (ROOT / p).parent
    stop = ROOT / RUN_OUTPUT_ROOT.rstrip("/")
    while d != stop and d != ROOT:
        if (d / "system" / "controlDict").is_file():
            return d
        d = d.parent
    return None


ALLOWED_PATHS = {
    # Retired homes, named BECAUSE they are retired.  Removing the mention
    # would lose the instruction not to recreate them.
    "data/proposed/":                        "RETIRED 2026-07-13, named as retired",
    "data/standards/propertyPackages/":      "RETIRED 2026-07-15, named as retired",
    "data/standards/components/true/aqueous/": "RETIRED layout, named as banned",
    "generated/indexes/":  "never built; named in CLAUDE.md as a correction, so\n"
                           "                          the next reader stops looking for it",
    # DELETED, and named BECAUSE it was deleted.  DEV.md records the finding
    # that a sourceless binary sits outside every source gate at once -- a
    # v0.2.0 Theory Guide, tracked, built from no source in the tree, naming
    # two commercial competitors the manuals doctrine forbids.  The record of
    # a withdrawal has to name what was withdrawn; that is not a pointer a
    # reader would follow, and removing the name would lose the finding.
    "docs/theoryGuide-STIFF-METHODS.pdf":
        "DELETED 2026-09-03 (sourceless render, doctrine breach); DEV.md\n"
        "                          records the withdrawal and must name it",
    # Build outputs: created by a build, absent from a fresh clone.  The doc
    # is DESCRIBING where a build lands, which is exactly a path that is
    # absent by design until `make wasm-gui` runs.  (Found 2026-08-22: the
    # gate was RED on every clean checkout over this line, and a standing
    # red teaches readers that failure is normal.)
    "gui/public/wasm/":  "WASM build output (make wasm-gui); absent on a fresh clone",
    # Hypothetical names in worked examples.
    "tutorials/plant/myPlant/":                  "placeholder in a worked example",
    "tutorials/plant/myPlant":                   "placeholder in a worked example",
    "tutorials/plant/myPlant/sectors/REACTION":  "placeholder in a worked example",
}

#  A source reference without its extension (`src/thermo/SystemClassifier`
#  meaning the .H/.cpp pair) is the project's normal way of naming a
#  translation unit; accept it when either file is there.
SRC_EXT = (".H", ".cpp", ".h", ".hpp")

#  A tutorial case name always starts LOWERCASE (flash01_, batch19_, ctrl16_,
#  userOp01_, cosmoSAC01_, vanKrevelen01_ ...).  Requiring that is what keeps
#  catalogue record names out of the case check: `NF270_dspmde` otherwise
#  parses as NF + "27" + "0_dspmde" and gets reported as a missing tutorial.
#  The uppercase-initial tutorial directories that do exist (SECTOR_R,
#  ChemicalPlantTutorial, ...) carry no NN_ index, so nothing real is lost.
CASE_RE = re.compile(r'`([a-z][A-Za-z0-9]*\d{2}_[A-Za-z0-9_]+)`')
#  `*` and `<...>` are placeholders, not paths -- a mention carrying one is a
#  pattern the reader fills in, so match them and skip rather than truncate the
#  path at the placeholder and then report the stump as missing.
PATH_RE = re.compile(r'(?<![\w/.-])((?:' + "|".join(PREFIXES) +
                     r')/[A-Za-z0-9_./<>*-]+)')
PLACEHOLDER = re.compile(r'[<>*]')

#  THE BLIND SPOT THIS CLOSES (found by the 2026-08-03 coherence sweep).
#  PATH_RE only recognises paths under the PREFIXES whitelist, so a citation
#  under a top-level directory that does NOT exist was invisible: CLAUDE.md
#  pointed at `memory/universal_solver_2026_07_06.md` for months -- a session
#  memory never in the repository -- and this gate reported every path
#  resolving.  A reference that LOOKS like a repo path and whose root is not
#  a directory of the repo is exactly the reference a reader will chase and
#  not find.  Extensions only, so `kmol/h` and `J/(mol K)` cannot match; URLs
#  are excluded by the negative look-behind on `/` and `:`.
#  Roots that legitimately appear WITHOUT a repo prefix, each with the
#  frame it is relative to.  The list is explicit so that a NEW bare root
#  has to be justified here rather than slipping in unnoticed -- which is
#  the whole point: `memory/` would have had to be added, and could not
#  have been, because it names nothing.
BARE_ROOTS = {
    # relative to a CASE directory (docs/ai/case-layout.md)
    "constant", "system", "reports", "converged", "iterations",
    "design", "economics",
    # relative to data/standards/ (the catalogue's own homes)
    "components", "species", "chemistry", "parameters", "conventions",
    "assets", "mixtures", "utilities", "solution",
    # relative to src/ (source-tree prose: `core/Dictionary`, ...)
    "core", "streams", "thermo", "solver", "unitOperations", "flowsheet",
    "postProcessing", "outerDriver", "materials", "control", "applications",
    "choupoSolve", "choupoBatch", "choupoCtrl", "choupoSemiContinuous", "choupoProps",
    # relative to a props case / guide prose
    "propertyOps", "code",
}

FOREIGN_ROOT_RE = re.compile(
    r'(?<![\w/:.-])([a-zA-Z][a-zA-Z0-9_-]*)/'
    r'([A-Za-z0-9_./-]+\.(?:md|py|H|cpp|dat|json|sh|txt|csv))')

dead = []


def path_exists(p: str) -> bool:
    f = ROOT / p
    if f.exists():
        return True
    return any((ROOT / (p + e)).exists() for e in SRC_EXT)


def main() -> int:
    cases = {d.name for d in (ROOT / "tutorials").glob("*/*") if d.is_dir()}
    cases |= {d.name for d in (ROOT / "tutorials").glob("*/*/*") if d.is_dir()}
    if len(cases) < 100:
        print(f"check_doc_references: only {len(cases)} tutorial dirs found --"
              " the corpus scan is not working, refusing to pass on it")
        return 1

    nPaths = nCases = 0
    runOutputs = set()
    for doc in DOCS:
        if not doc.exists():
            dead.append(f"{doc.relative_to(ROOT)}: the doc itself is missing")
            continue
        txt = doc.read_text()
        rel = doc.relative_to(ROOT)

        for p in sorted({m.group(1).rstrip('.,;:)`"\'')
                         for m in PATH_RE.finditer(txt)}):
            nPaths += 1
            if PLACEHOLDER.search(p) or p in ALLOWED_PATHS \
               or in_private_tier(p):
                continue
            #  Decided BEFORE existence, so the verdict and the count are the
            #  same whether or not the case has run in this checkout.
            if producing_case(p) is not None:
                runOutputs.add(p)
                continue
            if path_exists(p):
                continue
            dead.append(f"{rel}: path '{p}' does not exist")

        for m in FOREIGN_ROOT_RE.finditer(txt):
            root = m.group(1)
            if root in PREFIXES or root in BARE_ROOTS \
               or (ROOT / root).is_dir():
                continue
            whole = m.group(0).rstrip('.,;:)`"\'')
            if PLACEHOLDER.search(whole) or whole in ALLOWED_PATHS \
               or in_private_tier(whole):
                continue
            dead.append(f"{rel}: '{whole}' looks like a repo path but"
                        f" '{root}/' is not a directory of this repository"
                        f" -- a reader will chase it and find nothing")

        for c in sorted(set(CASE_RE.findall(txt))):
            nCases += 1
            if c not in cases:
                dead.append(f"{rel}: case '{c}' is not a tutorial directory")

    #  An allow-list entry that has come TRUE is also rot -- the prose still
    #  says "retired" about something now on disk, or the placeholder collided
    #  with a real case.  Say so rather than let it sit.
    #  EXCEPT an entry git IGNORES: that is a build or run output, whose
    #  existence says whether a build ran here, not whether the prose went
    #  stale.  `gui/public/wasm/` is the one today, and without this the arm
    #  went red in every checkout that had run `make wasm-gui` -- the same
    #  machine-dependent verdict the run-output rule above removes.
    for p, why in sorted(ALLOWED_PATHS.items()):
        if path_exists(p) and not git_ignores(p):
            dead.append(f"ALLOW-LIST: '{p}' now EXISTS but is listed as"
                        f" absent ({why}) -- update the prose and drop the"
                        " entry, or the docs are describing the opposite of"
                        " what is on disk")

    if dead:
        print("check_doc_references: FAIL")
        for d in dead:
            print("  -", d)
        return 1
    print(f"check_doc_references: OK -- {nPaths} path mention(s) and {nCases}"
          f" case name(s) across {len(DOCS)} AI-facing docs all resolve;"
          f" {len(ALLOWED_PATHS)} deliberate absences are listed with their"
          " reason and none of them has quietly come true (build outputs git"
          f" ignores excepted); {len(runOutputs)} mention(s) of a RUN OUTPUT"
          " are accepted as such -- git ignores the path and the case that"
          " writes it exists -- whether or not it has run here.  NOT checked:"
          " that the prose calls it a run output, or that the case really"
          " writes that file")
    return 0


if __name__ == "__main__":
    sys.exit(main())
