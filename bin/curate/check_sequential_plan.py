#!/usr/bin/env python3
"""check_sequential_plan -- the tear/order contract REFUSES, end to end,
through the real choupoSolve binary (2026-10-25, DEV.md 4c C150 R27).

WHY THIS GATE EXISTS.  The sequential-plan contract (CLAUDE.md §6, settled
2026-07-25; `Flowsheet::validateSequentialPlan`) exists because two
mistakes -- an undeclared recycle and an acyclic flowsheet declared in the
wrong order -- used to read a stale 0/ seed and publish a plausible number
at exit 0.  The tear-streams EduTool teaches that contract, and its first
step described the old behaviour in the present tense.  A second review
asked which of the two descriptions is true today.  Nothing in the tree
answered by RUNNING a case: the GUI tests read the lesson's text and one
`file:line` citation, and no gate fed the binary a plan it must refuse.  A
contract that is only cited is a sentence, not a check.

CLAIM, each arm a real run of choupoSolve on a copy of a shipped case:

  (a) WITNESS  tutorials/steady/flowsheets/process03_recycle, as shipped,
               solves (exit 0) and writes converged/.
  (b) MISSING  the same case with its `tearStreams` declaration removed
               REFUSES (exit != 0), names `MISSING TEAR` and the recycle
               stream, and writes NO converged/ (the name is a contract).
  (c) ORDER    tutorials/steady/flowsheets/process01_reactor_flash with its
               two units declared in the reverse order -- an ACYCLIC
               flowsheet, so no tear can be the remedy -- REFUSES, names
               `INVALID ORDER`, and writes no converged/.
  (d) FORWARD  process03 declaring a FORWARD stream (`mixed`) as the tear
               REFUSES naming `FORWARD TEAR`.

NOT COVERED, said plainly: the other four named refusals (OFF-CYCLE,
UNKNOWN, INLET, UNCONSUMED) are not fired here; the sectored-plant form of
the plan; and `choupo-lint`'s merged report.  Whether a converged recycle is
RIGHT is not this gate's question.

SABOTAGE RECORD (2026-10-25): the throw on `!planFindings.empty()` in
Flowsheet.cpp disabled and rebuilt -> (b), (c) and (d) FAILED (each ran to
exit 0 and wrote converged/); reverted.

Exit 1 listing failures."""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
RECYCLE = ROOT / "tutorials" / "steady" / "flowsheets" / "process03_recycle"
CHAIN = ROOT / "tutorials" / "steady" / "flowsheets" / "process01_reactor_flash"

failures = []


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(SOLVE), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def copy(src: Path, tmp: Path, tag: str) -> Path:
    case = tmp / tag
    shutil.copytree(src, case,
                    ignore=shutil.ignore_patterns("expected", "log.*",
                                                  "reports", "converged"))
    return case


def edit(path: Path, old: str, new: str):
    s = path.read_text()
    if s.count(old) != 1:
        raise SystemExit(f"check_sequential_plan: fixture text not found once"
                         f" in {path}: {old!r} -- fix the GATE")
    path.write_text(s.replace(old, new))


def refused(tag: str, rc: int, out: str, case: Path, words):
    if rc == 0:
        failures.append(f"{tag}: ran to exit 0 -- the plan was NOT refused")
    for w in words:
        if w not in out:
            failures.append(f"{tag}: the refusal does not name {w!r}")
    if (case / "converged").exists():
        failures.append(f"{tag}: converged/ was written for a refused plan")


def main() -> int:
    if not SOLVE.exists():
        print(f"check_sequential_plan: {SOLVE} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        w = copy(RECYCLE, tmp, "witness")
        rc, out = run(w)
        if rc != 0:
            failures.append(f"(a) witness: exit {rc}")
        if not (w / "converged").is_dir():
            failures.append("(a) witness: no converged/ written")

        m = copy(RECYCLE, tmp, "missing")
        edit(m / "system" / "solverDict",
             "tearStreams           ( recycle );", "")
        rc, out = run(m)
        refused("(b) undeclared recycle", rc, out, m,
                ["MISSING TEAR", "recycle"])

        o = copy(CHAIN, tmp, "order")
        fd = o / "system" / "flowsheetDict"
        s = fd.read_text()
        a = s.index("    {\n        name        reactor;")
        b = s.index("    {\n        name        separator;")
        e = s.index("\n);", b)
        reactor, separator = s[a:b], s[b:e]
        if not reactor.rstrip().endswith("}") or \
                not separator.rstrip().endswith("}"):
            raise SystemExit("check_sequential_plan: process01's unit blocks"
                             " are not where the gate expects -- fix the GATE")
        fd.write_text(s[:a] + separator.rstrip() + "\n\n" + reactor.rstrip()
                      + s[e:])
        rc, out = run(o)
        refused("(c) acyclic, reverse order", rc, out, o, ["INVALID ORDER"])

        f = copy(RECYCLE, tmp, "forward")
        edit(f / "system" / "solverDict",
             "tearStreams           ( recycle );",
             "tearStreams           ( recycle  mixed );")
        rc, out = run(f)
        refused("(d) forward stream declared a tear", rc, out, f,
                ["FORWARD TEAR"])

    if failures:
        for x in failures:
            print("  FAIL " + x)
        print("check_sequential_plan: FAIL")
        return 1
    print("check_sequential_plan: OK -- process03_recycle solves as shipped;"
          " with its tear removed it refuses MISSING TEAR, with a forward"
          " tear declared FORWARD TEAR, and process01 declared in reverse"
          " order refuses INVALID ORDER; no refused plan writes converged/"
          " (4 of the 7 named refusals fired; OFF-CYCLE, UNKNOWN, INLET and"
          " UNCONSUMED not fired here)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
