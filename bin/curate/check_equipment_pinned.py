#!/usr/bin/env python3
"""Gate: what the sizing and costing passes PUBLISH per unit is PINNED, in
both directions.

    bin/curate/check_equipment_pinned.py

WHY THIS EXISTS.  The result JSON gained a top-level `equipment` array on
2026-09-04 -- per unit: its sizing values, its design basis and the three
capital costs -- and for a day no golden kind could read it.  A block no kind
reads is not a block that fails; it is a block that stops being checked, in
silence, with the suite green.  This project has a rule for that
(`docs/design/which-result-blocks-a-golden-can-read.md`: published implies
pinned AND pinned implies published) and I broke it with the block itself.
The `equipment` kind arrived the next day; this gate is what makes the rule
hold from now on, so the next such block is caught by a red line and not by an
absence sweep.

WHAT THIS CHECKS, per case whose system/postDict declares a `sizing {}` pass
and that carries a golden:
  (a) PUBLISHED IS PINNED.  Every (unit, key) the run emits under `equipment`
      -- following the generator's OWN emission rule: `basis` when the sizer
      states one, every `values.<k>`, and the three `cost.*` totals when a
      costing pass ran -- has an `equipment` row in `expected`.  `cost.factors`
      are deliberately NOT emitted and therefore not required: they are the
      costing PROVENANCE, which `check_cost_provenance` recomputes the total
      from independently; a golden row beside it would be a second home for
      the same claim.
  (b) PINNED IS PUBLISHED.  Every `equipment` row names a (unit, key) the run
      still emits.  A row matching nothing reads as coverage it does not give.
  (c) A SIZING CASE WITH NO GOLDEN IS NAMED.  A case that sizes and ships no
      `expected` has its capital cost checked by the exit code alone.  A SWEEP
      (`outerDict` with `type sweep;`) is the one shape excused, BY NAME: a
      sweep writes no `converged/`, and which of its N points is "the" answer
      is RESERVED for Vitor (task #77) -- demanding a golden there would demand
      a decision nobody has taken.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER A SIZE OR A COST IS RIGHT.  A wrong area pins as happily as a right
    one.  This gate makes the number falsifiable; `check_cost_provenance` and
    `check_design_sheet` carry the arithmetic.
  * WHETHER THE `basis` IS PRESENT.  A sizer that states no basis emits no
    `basis` key and owes no row; that absence is task #78's subject and
    `check_cost_provenance`'s stated blind spot, not this gate's.
  * THE VALUES THEMSELVES.  Agreement of the pinned NUMBER with the run is
    `bin/runTests`' job for every row; this gate is about the SET of keys.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")


def is_sweep(case: Path) -> bool:
    od = case / "system" / "outerDict"
    return od.is_file() and bool(
        re.search(r'^\s*type\s+sweep\s*;', od.read_text(errors="replace"), re.M))


def sizing_cases():
    """Every case whose postDict declares a sizing pass.  A sweep is NOT
    excluded here: one that ships a golden (economics02_irr_sweep does, with
    equipment rows that pass) is checked like any other case.  The excuse
    below is for the sweep that has NO golden, and only that."""
    found = []
    for pd in sorted(ROOT.glob("tutorials/**/system/postDict")):
        if not re.search(r'^\s*sizing\s*(\{|$)', pd.read_text(errors="replace"), re.M):
            continue
        found.append(pd.parent.parent)
    return found


def stdout_of(case: Path):
    rel = case.relative_to(ROOT).as_posix()
    if _CACHE:
        f = Path(_CACHE) / (rel.replace("/", "__") + ".out")
        try:
            return f.read_text(errors="replace")
        except OSError:
            pass
    proc = subprocess.run([str(ROOT / "choupoSolve"), str(case)],
                          capture_output=True, text=True)
    return proc.stdout if proc.returncode == 0 else None


def published(case: Path):
    """{(unit, key)} the run emits, by the generator's rule.  Each equipment
    item is ONE LINE (ResultEmitter emits them so); the array is entered on
    `"equipment": [` and left on the line that closes it."""
    out = stdout_of(case)
    if out is None:
        return None, "the case does not run to exit 0"
    keys, inblk, seen = set(), False, False
    for line in out.splitlines():
        if '"equipment": [' in line:
            inblk, seen = True, True
            continue
        if inblk and re.match(r'^  \]', line):
            inblk = False
        if not inblk:
            continue
        m = re.search(r'"unit": "([^"]*)"', line)
        if not m:
            continue
        u = m.group(1)
        if re.search(r'"basis": "[^"]*"', line):
            keys.add((u, "basis"))
        mv = re.search(r'"values": \{([^}]*)\}', line)
        if mv:
            for k in re.findall(r'"([A-Za-z_][A-Za-z0-9_]*)": *-?[0-9]', mv.group(1)):
                keys.add((u, "values." + k))
        mc = re.search(r'"cost": \{(.*)$', line)
        if mc:
            body = re.sub(r'"factors": \{[^}]*\}', "", mc.group(1))
            for c in ("purchased", "bareModule", "totalModule"):
                if re.search(r'"%s": *-?[0-9]' % c, body):
                    keys.add((u, "cost." + c))
    if not seen:
        return None, "the run emits no `equipment` block"
    return keys, None


def pinned(case: Path):
    exp = case / "expected"
    if not exp.is_file():
        return None
    rows = set()
    for line in exp.read_text(errors="replace").splitlines():
        parts = line.split()
        if len(parts) >= 4 and parts[0] == "equipment":
            rows.add((parts[1], parts[2]))
    return rows


def main() -> int:
    cases = sizing_cases()
    sweeps = []
    if not cases:
        print("check_equipment_pinned: FAILED\n  no case under tutorials/ declares"
              " a `sizing {}` pass.  A gate with no subject reports PASS forever"
              " -- fix the discovery, do not retire the check.")
        return 1

    problems, npins, ncases = [], 0, 0
    for case in cases:
        rel = case.relative_to(ROOT).as_posix()
        pub, why = published(case)
        if pub is None:
            problems.append(f"{rel}: {why}")
            continue
        pin = pinned(case)
        if pin is None and is_sweep(case):
            #  A sweep with no golden: which of its N points is "the" answer
            #  is RESERVED (task #77), so there is nothing to record yet.
            sweeps.append(case)
            continue
        if pin is None:
            problems.append(
                f"{rel}: declares a `sizing {{}}` pass and ships NO `expected`,"
                " so its equipment sizes and capital cost are checked by the"
                " exit code alone.  Remedy: bin/runTests --record " + rel)
            continue
        for u, k in sorted(pub - pin):
            problems.append(
                f"{rel}: publishes equipment {u} {k} that NO golden row pins --"
                " the size or cost may drift with the suite still green."
                "  Remedy: bin/runTests --record-append " + rel)
        for u, k in sorted(pin - pub):
            problems.append(
                f"{rel}: pins equipment {u} {k}, which the run does NOT publish"
                " -- a row that matches nothing reads as coverage it does not"
                " give.")
        npins += len(pub & pin)
        ncases += 1

    for s in sweeps:
        print(f"  [excused: a sweep with no golden -- which point is the answer"
              f" is RESERVED, task #77] {s.relative_to(ROOT).as_posix()}")

    if problems:
        print("check_equipment_pinned: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print(f"check_equipment_pinned: OK -- {npins} equipment key(s) across "
          f"{ncases} sizing case(s) are pinned in their goldens, in both "
          "directions (published implies pinned, pinned implies published), by"
          " the generator's own emission rule (basis when stated, every sizing"
          " value, the three cost totals; never the costing factors, which"
          " check_cost_provenance recomputes from).  "
          f"{len(sweeps)} golden-less sweep(s) excused by name.  NOT CHECKED: whether"
          " any size or cost is RIGHT, whether a sizer STATES a basis (task"
          " #78), or the pinned numbers' agreement with the run (bin/runTests'"
          " job for every row).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
