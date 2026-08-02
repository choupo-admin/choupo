#!/usr/bin/env python3
"""A6 gate: a declared cycle is STRUCTURE that changes no physics, and the
cyclic-steady-state verdict is tri-state with the tolerance the CASE
declares.

Design record: docs/design/fixed-bed-thermal-a5.md section 7.

  EQUIVALENCE   the load/purge steps written as `cycle { period; repeat;
                steps (...) }` must reproduce the hand-unrolled recipe
                EXACTLY -- that equivalence is what let batch23's
                hand-written event list be retired, and it is the claim
                this gate exists to keep true.  Probed cheaply: two
                60 s-period variants of the same short campaign, one
                declared and one unrolled, compared KPI by KPI.
  VERDICT       with a declared cssTolerance the run reports CONVERGED or
                NOT YET CONVERGED and pins css_relative_change; WITHOUT
                one it reports UNAVAILABLE and refuses to invent the
                number that decides whether a bed has settled.
  REFUSALS      step time outside [0, period)   (an offset, never absolute)
                `when {}` inside a step         (a cycle is a TIME structure)
                repeat not a whole number       (cycles are counted)
                cssTolerance <= 0

Exit 1 listing failures."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
BASE = ROOT / "tutorials" / "batch" / "adsorber" / "batch23_tsa_cycles"
FS = "system/flowsheetDict"
CTRL = "system/controlDict"

failures = []

#  ONE period of 60 s (30 s load + 30 s purge), two periods -- long enough
#  for a second cycle boundary (the verdict needs two to compare) and short
#  enough for a gate.
DECLARED = """cycle
{
    period        60;
    repeat        2;
    cssTolerance  1e-3;
    steps
    (
        { time 0;  action setParameter; unit bed; key feed.T;   value 298.15;}
        { time 0;  action setParameter; unit bed; key feed.CO2; value 0.15;  }
        { time 30; action setParameter; unit bed; key feed.CO2; value 0.0;   }
        { time 30; action setParameter; unit bed; key feed.T;   value 400.0; }
    );
}
"""

UNROLLED = """recipe
(
    { time 0;  action setParameter; unit bed; key feed.T;   value 298.15;}
    { time 0;  action setParameter; unit bed; key feed.CO2; value 0.15;  }
    { time 30; action setParameter; unit bed; key feed.CO2; value 0.0;   }
    { time 30; action setParameter; unit bed; key feed.T;   value 400.0; }
    { time 60; action setParameter; unit bed; key feed.T;   value 298.15;}
    { time 60; action setParameter; unit bed; key feed.CO2; value 0.15;  }
    { time 90; action setParameter; unit bed; key feed.CO2; value 0.0;   }
    { time 90; action setParameter; unit bed; key feed.T;   value 400.0; }
);
"""


def make_case(tmp: Path, tag: str, block: str) -> Path:
    case = tmp / f"probe_{tag}"
    shutil.copytree(BASE, case, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "[0-9]*", "resultJson*"))
    fs = case / FS
    t = fs.read_text()
    i = t.index("cycle\n{")          # the case now ships the declared form
    fs.write_text(t[:i] + block)
    c = case / CTRL
    t = c.read_text().replace("endTime         21600;", "endTime         120;")
    assert "endTime         120;" in t, "controlDict shortening failed"
    c.write_text(t.replace("writeInterval   300;", "writeInterval   60;"))
    return case


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BATCH), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=1800)
    return p.returncode, p.stdout + p.stderr


def kpis_of(out: str):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1)).get("kpis", {})
    except json.JSONDecodeError:
        return None


def main() -> int:
    if not BATCH.exists():
        print(f"check_cycle_css: {BATCH} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- EQUIVALENCE: the whole justification for the grammar --------
        rcd, outd = run(make_case(tmp, "declared", DECLARED))
        rcu, outu = run(make_case(tmp, "unrolled", UNROLLED))
        if rcd != 0 or rcu != 0:
            failures.append(f"EQUIVALENCE: exits declared={rcd} unrolled={rcu},"
                            " both must be 0")
        kd, ku = kpis_of(outd), kpis_of(outu)
        if not kd or not ku:
            failures.append("EQUIVALENCE: a result block was unreadable")
        else:
            n, worst, worstk = 0, 0.0, ""
            for unit, keys in ku.items():
                for k, want in keys.items():
                    have = kd.get(unit, {}).get(k)
                    if have is None:
                        failures.append(f"EQUIVALENCE: declared form lost"
                                        f" KPI {unit}.{k}")
                        continue
                    n += 1
                    d = abs(have - want) / max(abs(want), 1e-30)
                    if d > worst:
                        worst, worstk = d, f"{unit}.{k}"
            if n < 20:
                failures.append(f"EQUIVALENCE: only {n} KPIs compared --"
                                " the probe is not exercising the case")
            if worst > 1e-4:
                failures.append("EQUIVALENCE: the declared cycle does NOT"
                                f" reproduce the unrolled recipe -- worst"
                                f" {worstk} differs by {worst:.3e}.  The"
                                " grammar may only buy structure, never"
                                " change an answer.")
        if "Declared cycle: 2 x 60" not in outd:
            failures.append("EQUIVALENCE: the declared run does not announce"
                            " its expansion")

        # ---- VERDICT: present with a tolerance, UNAVAILABLE without -------
        if "[cycle] CSS" not in outd:
            failures.append("VERDICT: no CSS verdict announced")
        if kd and "css_relative_change" not in kd.get("campaign", {}):
            failures.append("VERDICT: css_relative_change is not a KPI --"
                            " the measure must reach the artefact")
        rc, out = run(make_case(tmp, "notol",
                                DECLARED.replace("    cssTolerance  1e-3;\n", "")))
        if rc != 0:
            failures.append(f"VERDICT/no-tolerance: expected exit 0, got {rc}")
        elif "CSS verdict UNAVAILABLE" not in out:
            failures.append("VERDICT/no-tolerance: the engine must report"
                            " UNAVAILABLE, not invent a tolerance")
        elif "does not invent one" not in out:
            failures.append("VERDICT/no-tolerance: the message does not say"
                            " WHY it withholds the verdict")

        # ---- REFUSALS -----------------------------------------------------
        probes = [
            ("stepOutside", DECLARED.replace("time 30;", "time 60;", 1),
             ["outside [0, period", "offset WITHIN one period"]),
            ("whenInStep",
             DECLARED.replace("{ time 0;  action setParameter; unit bed;"
                              " key feed.T;   value 298.15;}",
                              "{ time 0; when { unit bed; quantity T; op gt;"
                              " value 1; } action setParameter; unit bed;"
                              " key feed.T; value 298.15;}"),
             ["may not carry a", "TIME structure"]),
            ("fractionalRepeat", DECLARED.replace("repeat        2;",
                                                  "repeat        2.5;"),
             ["repeat must be a positive"]),
            ("zeroTolerance", DECLARED.replace("cssTolerance  1e-3;",
                                               "cssTolerance  0;"),
             ["cssTolerance must be > 0"]),
        ]
        for tag, block, needles in probes:
            rc, out = run(make_case(tmp, tag, block))
            if rc == 0:
                failures.append(f"REFUSAL {tag}: expected nonzero exit, got 0")
                continue
            for nd in needles:
                if nd not in out:
                    failures.append(f"REFUSAL {tag}: message lacks '{nd}'")

    if failures:
        print("check_cycle_css: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_cycle_css: OK -- a declared cycle reproduces the unrolled"
          " recipe KPI for KPI (structure, never physics); the CSS verdict"
          " is announced and measured, and UNAVAILABLE when the case"
          " declares no tolerance; 4 refusals fire named (step outside the"
          " period, when{} in a step, fractional repeat, zero tolerance)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
