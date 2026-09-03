#!/usr/bin/env python3
"""Gate: which utility serves a duty is PINNED, not merely reported.

    bin/curate/check_utility_allocation_pinned.py

WHY THIS EXISTS.  Found 2026-08-12, the third instance in one session of one
question: which blocks of the result JSON can a golden row actually read?

`pickForDuty` chooses a catalogue utility for every unit duty -- steamLP for a
330 K heater, chilled water for a cold one -- and publishes the choice, its
mass flow and its cost into a top-level `"utilityAllocation"` array.  That
array was readable by nothing: not a `kpi` object, not a stream, not an
`operationResults[].diagnostics`.  Seventy-seven cases emitted one and no
golden row touched it, so the utility choice and its price could change with
the suite green.  The unit's own `Q_kW` KPI does not move when the picker
does -- the duty is the same, the service is not.

WHAT THIS CHECKS, per case that emits an allocation:
  (a) PUBLISHED IS PINNED: every (unit, tier, utility, field) the run emits a
      number for has a `utility` row in the case's `expected`.
  (b) PINNED IS PUBLISHED: every `utility` row names an allocation the run
      still emits.

THE UTILITY NAME LIVES IN THE ROW'S KEY, and that is the design point rather
than a detail.  The decision recorded here is WHICH utility serves the duty,
and a name is a word, which a golden row cannot compare.  Keyed as
`<tier>.<utility>.<field>`, a row matches only while that utility is the one
allocated: a picker that switched steamLP for steamMP does not shift a number
by a per cent, it makes every row of that allocation report MISSING.  The
consequences -- kg_s, eur_h, T -- are pinned beside it as ordinary numbers.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER THE CHOICE IS GOOD.  An expensive utility pins as happily as a
    cheap one.  This gate is about the decision being falsifiable.
  * PRICES.  A `eur_h` row pins that the number has not MOVED; the catalogue
    price behind it is a curated datum with its own provenance, and
    check_economics_honesty owns whether it may be quoted as a cost at all.
  * CASES WITH NO GOLDEN.  Ten of the emitting cases ship none (run-only plant
    sectors and the like); they are counted and named in the OK line rather
    than silently dropped, but nothing is demanded of them.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIELDS = ("duty_kW", "T", "kg_s", "eur_h")

#  Single-pass cache (2026-08-24): when bin/runTests invokes this gate it
#  hands the directory where the suite's OWN case pass saved each clean
#  run's stdout -- the same output this sweep used to recompute by re-running
#  the corpus.  Freshness is by construction (the dir is cleared and written
#  by the very run that invokes us).  Standalone invocations see no env var
#  and run live, exactly as before; a case absent from the cache (run-only
#  plant showcases, non-zero exits) is run live, never silently skipped.
_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")


def cached_stdout(case: Path):
    if not _CACHE:
        return None
    rel = case.resolve().relative_to(ROOT).as_posix().replace("/", "__")
    f = Path(_CACHE) / (rel + ".out")
    try:
        return f.read_text(errors="replace")
    except OSError:
        return None


def norm(s: str) -> str:
    """Whitespace -> `_`.  A golden row's key is whitespace-delimited, so a
    name that carries a space cannot appear in one verbatim.  ONE rule, mirrored
    by `bin/runTests`' generator and extractor."""
    return re.sub(r"[ \t]+", "_", s)


def candidates():
    """Cases that can emit an allocation: any steady/electrochem/plant case,
    plus (for arm b) any case whose golden already carries `utility` rows.

    Discovery is by RUNNING, because whether `pickForDuty` fires depends on
    the duties a flowsheet produces and not on anything a dict declares --
    there is no cheap syntactic marker to key on, and inventing one would be a
    second home for a fact the run already owns."""
    out = {}
    for cd in sorted(ROOT.glob("tutorials/**/system/controlDict")):
        rel = cd.relative_to(ROOT).as_posix()
        if not rel.startswith(("tutorials/steady/", "tutorials/electrochem/",
                               "tutorials/plant/")):
            continue
        out[cd.parent.parent] = True
    for exp in sorted(ROOT.glob("tutorials/**/expected")):
        for line in exp.read_text(errors="replace").splitlines():
            if line.split()[:1] == ["utility"]:
                out[exp.parent] = True
                break
    return sorted(out)


def published(case: Path):
    """{(unit, tier, utility, field)} the run emits a number for."""
    app = "choupoSolve"
    cd = case / "system" / "controlDict"
    if cd.is_file():
        m = re.search(r'^\s*application\s+(\w+)', cd.read_text(errors="replace"), re.M)
        if m:
            app = m.group(1)
    if not (ROOT / app).exists():
        return set(), None
    txt = cached_stdout(case)   # cache-present implies ran-clean (exit 0)
    if txt is None:
        proc = subprocess.run([str(ROOT / app), str(case)], capture_output=True, text=True)
        if proc.returncode != 0:
            return set(), None  # a failing case is the suite's problem, not this gate's
        txt = proc.stdout
    line = next((l for l in txt.splitlines()
                 if '"utilityAllocation":' in l), None)
    if line is None:
        return set(), None
    keys = set()
    for rec in re.split(r'\}, *\{', line):
        u = re.search(r'"unit": "([^"]*)"', rec)
        t = re.search(r'"tier": "([^"]*)"', rec)
        if not (u and t):
            continue
        #  THE SAME TWO RULES THE GENERATOR APPLIES, and they are here rather
        #  than inferred because a gate that derives its keys differently from
        #  the writer measures the difference between the two -- which is the
        #  arity sin, inside the machinery built to enforce it.  Both were
        #  paid for on this gate's first run.
        if '"allocated": true' not in rec:
            #  An unallocated duty's `utility` field is PROSE ("(none
            #  adequate)", "(carried: ...)"), never a name; it is pinned by one
            #  row keyed on the port, whose KIND is the record's typed
            #  `carried` field (2026-09-03) -- `carried` for a duty met by the
            #  unit's own streams or a heat-link, `unserved` for one no
            #  catalogue utility can meet.  The same rule as the writer's.
            p = re.search(r'"port": "([^"]*)"', rec)
            port = norm(p.group(1)) if p and p.group(1) else "-"
            kind = "carried" if '"carried": true' in rec else "unserved"
            keys.add((u.group(1), t.group(1), port, kind))
            continue
        w = re.search(r'"utility": "([^"]*)"', rec)
        if not w:
            continue
        #  A real name may carry a space -- `electricity (generated)` is the
        #  credit an electrochemical cell earns -- and a golden row's key is
        #  whitespace-delimited, so it is normalised on both sides.
        name = norm(w.group(1))
        for f in FIELDS:
            if re.search(r'"%s": *-?[0-9]' % f, rec):
                keys.add((u.group(1), t.group(1), name, f))
    return keys, None


def pinned(case: Path):
    exp = case / "expected"
    if not exp.is_file():
        return None
    out = set()
    for line in exp.read_text(errors="replace").splitlines():
        parts = line.split()
        if len(parts) < 4 or parts[0] != "utility":
            continue
        key = parts[2].split(".")
        if len(key) < 3:
            continue
        #  `<tier>.<utility>.<field>`: tier first, field last, utility between
        #  (a utility name may itself carry a dot in principle).
        out.add((parts[1], key[0], ".".join(key[1:-1]), key[-1]))
    return out


def main() -> int:
    problems, npins, nemit, nogolden = [], 0, 0, []
    for case in candidates():
        rel = case.relative_to(ROOT).as_posix()
        pub, _ = published(case)
        pin = pinned(case)
        if not pub and not pin:
            continue
        if pub:
            nemit += 1
        if pin is None:
            nogolden.append(rel)
            continue
        for t in sorted(pub - pin):
            problems.append(
                f"{rel}: allocates {t[2]} to unit '{t[0]}' ({t[1]}) and"
                f" publishes {t[3]}, which NO `utility` row pins -- the picker"
                " may change utility or price with the suite still green."
                "  Remedy: bin/runTests --record " + rel)
        for t in sorted(pin - pub):
            problems.append(
                f"{rel}: pins {t[3]} for {t[2]} on unit '{t[0]}' ({t[1]}),"
                " which the run does NOT allocate -- either the pick changed"
                " (the name is part of the key exactly so this shows) or the"
                " row is stale.")
        npins += len(pin & pub)

    if problems:
        print("check_utility_allocation_pinned: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print(f"check_utility_allocation_pinned: OK -- {npins} utility-allocation "
          f"quantit(ies) pinned across {nemit} emitting case(s), in both "
          "directions (published implies pinned, pinned implies published), "
          "with the chosen utility's NAME in each row's key so a different "
          f"pick reports MISSING rather than shifting a number.  "
          f"{len(nogolden)} emitting case(s) ship no golden and are exempt: "
          + (", ".join(nogolden) if nogolden else "none") +
          ".  NOT CHECKED: whether a choice is GOOD (an expensive utility pins "
          "as happily as a cheap one), and whether a catalogue price may be "
          "quoted as a cost at all -- that is check_economics_honesty's.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
