#!/usr/bin/env python3
"""Gate: the plant-boundary first law is PINNED where it is published.

    bin/curate/check_energy_boundary_pinned.py

WHY THIS EXISTS.  2026-09-05: Vitor opened the flagship plant on the live site
and saw a first-law residual of 372.5 kW (1.79 %) under "Global energy
balance".  The engine's own energyBalance report, on the same run, closes the
boundary at 34.4 kW (0.163 %).  The GUI was not drawing the engine's number: it
summed utility-ALLOCATED duties itself, so the crystalliser's and the
fermentor's cooling -- served by no declared utility -- never entered its sum,
and 372.5 - 34.4 = 74.8 + 263.3 exactly (the one duty it saw, plus the engine's
boundary heat it never read).  A second home for a balance the doctrine says
is engine-owned.

The fix stamps the report's ledger on the result as ONE top-level object,
`globalEnergyBoundary`, and the GUI draws it.  A top-level block carrying a
number a reader acts on must arrive PINNED in the same commit (the 2026-08-12
rule), so the `boundary` golden kind reads it and this gate holds both
directions:

  (a) PUBLISHED IS PINNED: every case whose run emits `globalEnergyBoundary`
      and ships a golden carries `boundary global <term>` rows for the three
      TERMS -- H_feeds_kW, Q_boundary_kW, H_products_kW.  The residual is
      their difference; the generator pins it only when it is >= 1 W in
      magnitude (a 1e-13 kW residual pinned at 1e-4 RELATIVE is a golden over
      cancellation noise -- the column13 lesson), and that threshold has ONE
      home, in `bin/runTests`' generator.  This gate does not repeat it: it
      requires the three terms and checks any residual row it finds under (b).
  (b) PINNED IS PUBLISHED: every `boundary` row names a field the run still
      emits.  A row matching nothing reads as coverage it does not give.

Reads the suite's single-pass cache (CHOUPO_SUITE_OUTPUTS) when present and
runs the case otherwise.  A case that exits non-zero, or emits no block
(batch, ctrl, props -- the report is choupoSolve's), owes nothing.

NOT CHECKED: whether the engine's ledger is RIGHT (which duties are boundary
heat is the report's decision and has its own record), and per-unit closures
(`check_closure_ledger_pinned` covers the model-boundary ledger; the plain
per-unit residuals the report "cannot attribute" are pinned by nothing here).
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")
TERMS = ("H_feeds_kW", "Q_boundary_kW", "H_products_kW")


def cached_stdout(case: Path):
    if not _CACHE:
        return None
    rel = case.resolve().relative_to(ROOT).as_posix().replace("/", "__")
    try:
        return (Path(_CACHE) / (rel + ".out")).read_text(errors="replace")
    except OSError:
        return None


def app_of(case: Path) -> str:
    m = re.search(r"\bapplication\s+(\w+)", (case / "system/controlDict").read_text(errors="replace"))
    return m.group(1) if m else "choupoSolve"


NOT_RUN = object()   # the bare run could not be judged (see published())


def published(case: Path):
    """The emitted object's fields; None when a CLEAN run emits none; NOT_RUN
    when the run could not be performed here.  The third state matters: a
    userOps case needs bin/runTests' compile step and exits 2 when the bare
    binary is asked -- accusing its pinned rows of matching nothing would be a
    gate accusing the innocent (userOp02, first standalone run, 2026-09-05).
    Under the suite the cache carries the harness's own run and it IS judged."""
    out = cached_stdout(case)
    if out is None:
        binary = ROOT / app_of(case)
        if not binary.exists():
            return NOT_RUN
        proc = subprocess.run([str(binary), str(case)], capture_output=True, text=True)
        if proc.returncode != 0:
            return NOT_RUN
        out = proc.stdout
    m = re.search(r'"globalEnergyBoundary": \{([^}]*)\}', out)
    if not m:
        return None
    return dict(re.findall(r'"(\w+)": (-?[0-9][0-9.eE+-]*|true|false)', m.group(1)))


def pinned(case: Path):
    rows = []
    for line in (case / "expected").read_text(errors="replace").splitlines():
        parts = line.split()
        if parts[:1] == ["boundary"] and len(parts) >= 4:
            rows.append((parts[1], parts[2]))
    return rows


def main() -> int:
    problems, npin, ncase, notrun = [], 0, 0, []
    for exp in sorted(ROOT.glob("tutorials/**/expected")):
        case = exp.parent
        if not (case / "system/controlDict").exists():
            continue
        if (case / ".known-broken").exists() or (case / ".expect-nonconvergence").exists():
            continue
        pub = published(case)
        pin = pinned(case)
        rel = case.relative_to(ROOT).as_posix()
        if pub is NOT_RUN:
            notrun.append(rel)
            continue
        if pub is None:
            for name, key in pin:
                problems.append(f"{rel}: pins `boundary {name} {key}` but the run emits no "
                                "globalEnergyBoundary -- a row matching nothing reads as coverage.")
            continue
        ncase += 1
        for t in TERMS:
            if ("global", t) not in pin:
                problems.append(f"{rel}: publishes globalEnergyBoundary but pins no `boundary global {t}`."
                                f"  Remedy: bin/runTests --record-append {rel}")
        for name, key in pin:
            if name != "global" or key not in pub:
                problems.append(f"{rel}: pins `boundary {name} {key}`, which the run does not emit.")
            else:
                npin += 1
    if problems:
        print("check_energy_boundary_pinned: FAILED")
        for p in problems[:40]:
            print("  " + p)
        if len(problems) > 40:
            print(f"  ... and {len(problems) - 40} more")
        return 1
    print(f"check_energy_boundary_pinned: OK -- {npin} plant-boundary first-law quantit(ies) pinned "
          f"across {ncase} golden-shipping case(s) that publish `globalEnergyBoundary`, in both "
          f"directions (published implies pinned for the three terms; every pinned row is still "
          f"emitted).  The residual row follows the generator's own >= 1 W rule and is checked only "
          f"for existence here.  "
          + (f"NOT JUDGED standalone: {len(notrun)} case(s) whose bare run fails here ({', '.join(notrun)}) "
             f"-- judged under the suite, whose cache carries the harness's own run.  " if notrun else "")
          + f"NOT CHECKED: whether the engine's ledger is right, and the per-unit residuals the report "
          f"cannot attribute.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
