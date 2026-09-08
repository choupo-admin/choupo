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
  (b) PINNED IS PUBLISHED: every `boundary global` row names a field the run
      still emits.  A row matching nothing reads as coverage it does not give.

THE `boundary` KIND NAMES A LEDGER (2026-09-08).  Its `name` column used to be
the fixed word `global`, because there was one boundary ledger; it now SELECTS
one -- `global` is the first law, `mass` is the plant material summary in its
two scopes (`globalMassBoundary`).  This gate is about the FIRST LAW, so it
reads the `global` rows and COUNTS the rest rather than accusing them.
MEASURED rather than supposed, by adding one `boundary mass
process_closure_pct` row to a corpus golden by hand: with the old ledger-blind
read this gate FAILED -- "pins `boundary mass process_closure_pct`, which the
run does not emit" -- so recording the mass rows would have broken a gate about
energy.  With the ledger-aware read it passes and says how many rows belong to
the other ledger.  What checks a `mass` row is the row itself (the golden
compares it) plus `check_mass_closure`, which holds the closure it carries.

Reads the suite's single-pass cache (CHOUPO_SUITE_OUTPUTS) when present and
runs the case otherwise.  A case that exits non-zero, or emits no block
(batch, ctrl, props -- the report is choupoSolve's), owes nothing.

NOT CHECKED: whether the engine's ledger is RIGHT (which duties are boundary
heat is the report's decision and has its own record), and per-unit closures
(`check_closure_ledger_pinned` covers the model-boundary ledger; the plain
per-unit residuals the report "cannot attribute" are pinned by nothing here).
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
#  The single-pass cache, and (under --fast) the SCOPE it becomes.  One home:
#  bin/curate/suite_cache.py.
from suite_cache import SCOPED, scope_sentence, stdout_of   # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
TERMS = ("H_feeds_kW", "Q_boundary_kW", "H_products_kW")


def app_of(case: Path) -> str:
    m = re.search(r"\bapplication\s+(\w+)", (case / "system/controlDict").read_text(errors="replace"))
    return m.group(1) if m else "choupoSolve"


NOT_RUN = object()      # the bare run could not be judged (see published())
OUT_OF_SCOPE = object() # the caller did not run this case at all (--fast)


def published(case: Path):
    """The emitted object's fields; None when a CLEAN run emits none; NOT_RUN
    when the run could not be performed here.  The third state matters: a
    userOps case needs bin/runTests' compile step and exits 2 when the bare
    binary is asked -- accusing its pinned rows of matching nothing would be a
    gate accusing the innocent (userOp02, first standalone run, 2026-09-05).
    Under the suite the cache carries the harness's own run and it IS judged."""
    out = stdout_of(case)
    if out is None and SCOPED:
        return OUT_OF_SCOPE
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
    """-> (this gate's `global` rows, count of rows naming ANOTHER ledger).

    The second number is returned and reported rather than dropped: a gate
    that silently ignores rows of its own KIND is hiding the fact that another
    ledger exists at all."""
    rows, other = [], 0
    for line in (case / "expected").read_text(errors="replace").splitlines():
        parts = line.split()
        if parts[:1] == ["boundary"] and len(parts) >= 4:
            if parts[1] == "global":
                rows.append((parts[1], parts[2]))
            else:
                other += 1
    return rows, other


def main() -> int:
    problems, npin, ncase, notrun, nskipped = [], 0, 0, [], 0
    nother = 0      # `boundary` rows naming a ledger other than the first law
    for exp in sorted(ROOT.glob("tutorials/**/expected")):
        case = exp.parent
        if not (case / "system/controlDict").exists():
            continue
        if (case / ".known-broken").exists() or (case / ".expect-nonconvergence").exists():
            continue
        pub = published(case)
        pin, nOtherLedger = pinned(case)
        nother += nOtherLedger
        rel = case.relative_to(ROOT).as_posix()
        if pub is OUT_OF_SCOPE:
            nskipped += 1
            continue
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
    if SCOPED and ncase == 0 and not problems:
        print("check_energy_boundary_pinned: FAILED\n"
              "  no case IN SCOPE publishes a globalEnergyBoundary -- the "
              "caller ran none that does, so this gate checked nothing.  "
              "Remedy: the fast set must carry at least one steady case whose "
              "golden pins `boundary global ...` rows.")
        return 1
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
          + (f"{nother} `boundary` row(s) name ANOTHER ledger (today: `mass`, the "
             f"plant material summary) and are outside this gate's subject -- counted "
             f"here rather than dropped, and held by the golden itself and by "
             f"check_mass_closure.  " if nother else "")
          + (f"NOT JUDGED standalone: {len(notrun)} case(s) whose bare run fails here ({', '.join(notrun)}) "
             f"-- judged under the suite, whose cache carries the harness's own run.  " if notrun else "")
          + "NOT CHECKED: whether the engine's ledger is right, and the per-unit residuals the report "
          "cannot attribute."
          + scope_sentence(ncase, nskipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
