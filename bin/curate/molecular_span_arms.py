#!/usr/bin/env python3
"""molecular_span_arms -- the MOLECULAR arms (p), (q), (r) of the pair-span gate
(PO-01 / PO-02 / PO-03 of docs/reviews/2026-11-12-pairs-out-of-sample,
2026-11-12).

Called by check_regressed_pairs.py after the electrolyte arms; runnable alone:

    bin/curate/molecular_span_arms.py        # exit 0 + one OK line, or 1

ARM (p)  AN INFINITE-DILUTION gamma IS ANNOUNCED OFF THE SPAN (PO-01).
         nButanol + nHeptane, NRTL, `activityCoefficients` at 303.15 K (below
         the pair's declared span) with nButanol at EXACTLY zero: the value the
         op publishes IS the infinite-dilution coefficient, so the run prints
         exactly ONE `[pair-span]` line for the pair and records it in the
         advisories.  The same state with nButanol at 1e-9 prints the same line
         (the twin that always did) and the two gammas agree to 1e-6 relative.
         Guard against over-reach: a three-component probe with the pair's
         components BOTH absent (the third pure) and the same T prints none,
         and an ordinary property scan (a flash-like evaluation with the
         component absent) prints none.
ARM (q)  A BUBBLE-POINT ANNOUNCEMENT DESCRIBES THE ANSWER, NOT THE GUESS
         (PO-02).  ethanol + ethyleneGlycol + water, NRTL, `propertyScan1D`
         T_bubble at 101300 Pa and x = (0.078, 0.169, 0.753): the answer
         (365.3 K) lies inside every span, so NO advisory about a temperature
         the solve only visited stays `accepted` in the result JSON (an entry
         raised at the initial guess is `trial`, which the caveat block files
         under THE SOLVER'S PATH), and the run's published T is unchanged.
ARM (r)  A RECORD THAT DECLARES NO SPAN SAYS SO WHEN IT IS USED (PO-03).
         The three Popken UNIQUAC records declare no validity span; the pair
         used at 500 K prints ONE `[pair-span]` line that says the record
         declares none and that out-of-span use cannot be detected, and lands
         in the advisories; a record that declares a span (isopropanol-water,
         NRTL) prints no such sentence.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "choupoProps"


def _case(tmp, tag, components, model, ops, verbosity=2):
    case = Path(tmp) / tag
    (case / "system").mkdir(parents=True)
    (case / "constant").mkdir()
    (case / "system" / "controlDict").write_text(
        f'application choupoProps;\ndescription "span probe {tag}";\n'
        f"verbosity {verbosity};\n")
    (case / "system" / "propsDict").write_text(
        "operations\n(\n" + "\n".join(ops) + "\n);\n")
    (case / "constant" / "thermoPhysPropDict").write_text(
        "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
        f"components ( {' '.join(components)} );\n"
        "equilibrium\n{\n    formulation gammaPhi;\n"
        f"    liquid {{ activityModel {{ model {model}; }}"
        " standardState pureLiquid; }\n"
        "    vapour { fugacityModel idealGas; }\n}\n")
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(PROPS), "."], cwd=str(case), env=env,
                       capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def _result(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def _gamma_op(name, T, comp):
    cs = " ".join(f"{k} {v!r};" for k, v in comp.items())
    return (f"    {{ name {name}; type activityCoefficients;"
            f" temperature {T!r}; composition {{ {cs} }} }}")


def _gammas(js):
    d = {}
    for op in (js or {}).get("operationResults", []):
        for k, v in op.get("diagnostics", {}).items():
            if k.startswith("gamma_"):
                d[(op.get("name"), k)] = v
    return d


def _span_lines(out, needle=None):
    return [ln for ln in out.splitlines() if ln.startswith("[pair-span]")
            and (needle is None or needle in ln)]


def arm_p(tmp, fails):
    comps = ["nButanol", "nHeptane"]
    rc0, out0 = _case(tmp, "p0", comps, "NRTL",
                      [_gamma_op("g", 303.15, {"nButanol": 0.0, "nHeptane": 1.0})])
    rc1, out1 = _case(tmp, "p1", comps, "NRTL",
                      [_gamma_op("g", 303.15, {"nButanol": 1e-9, "nHeptane": 1.0})])
    if rc0 or rc1:
        fails.append(f"arm (p): a probe exited {rc0}/{rc1} -- cannot run, so it must not pass")
        return 0
    l0 = _span_lines(out0, "NRTL pair")
    l1 = _span_lines(out1, "NRTL pair")
    if len(l0) != 1:
        fails.append(f"arm (p): gamma at INFINITE DILUTION (nButanol = 0) below the pair's "
                     f"span printed {len(l0)} `[pair-span]` line(s), want ONE -- the value "
                     "the op publishes reads the pair")
    if len(l1) != 1:
        fails.append(f"arm (p): the 1e-9 twin printed {len(l1)} line(s), want ONE")
    js0, js1 = _result(out0), _result(out1)
    if not any(a.get("category") == "validity" and "NRTL pair" in a.get("locus", "")
               for a in (js0 or {}).get("advisories", [])):
        fails.append("arm (p): the infinite-dilution announcement is not in the "
                     "result JSON's advisories")
    g0, g1 = _gammas(js0), _gammas(js1)
    v0 = g0.get(("g", "gamma_nButanol"))
    v1 = g1.get(("g", "gamma_nButanol"))
    if v0 is None or v1 is None or abs(v0 - v1) > 1e-6 * abs(v1):
        fails.append(f"arm (p): the zero and 1e-9 gammas disagree ({v0} vs {v1}) -- "
                     "an announcement must move no number")
    #  Over-reach: the pair's two components both absent (a pure third) is not read.
    rc2, out2 = _case(tmp, "p2", ["nButanol", "nHeptane", "water"], "NRTL",
                      [_gamma_op("g", 303.15, {"nButanol": 0.0, "nHeptane": 0.0,
                                               "water": 1.0})])
    if rc2 == 0 and _span_lines(out2, "nButanol-nHeptane") + \
            _span_lines(out2, "nHeptane-nButanol"):
        fails.append("arm (p): the pair nButanol-nHeptane was announced with BOTH "
                     "components absent -- an absent pair is not read")
    return 1


def arm_q(tmp, fails):
    comps = ["ethanol", "ethyleneGlycol", "water"]
    op = ("    { name tb; type propertyScan1D; vary { variable T; from 360 K; to 361 K; n 2; }"
          " state { P 101300 Pa; composition { ethanol 0.078; ethyleneGlycol 0.169;"
          " water 0.753; } } properties ( T_bubble ); output { file tb.csv; } }")
    rc, out = _case(tmp, "q", comps, "NRTL", [op])
    if rc:
        fails.append(f"arm (q): the bubble-point probe exited {rc}")
        return 0
    try:
        rows = (Path(tmp) / "q" / "tb.csv").read_text().splitlines()
        Tans = float(rows[1].split(",")[1])
    except (OSError, IndexError, ValueError):
        fails.append("arm (q): the probe published no T_bubble -- cannot judge")
        return 0
    js = _result(out)
    adv = [a for a in (js or {}).get("advisories", []) if a.get("category") == "validity"]
    temps = lambda a: [float(t) for t in re.findall(r"T = ([0-9.]+) K", a.get("message", ""))]  # noqa: E731
    trial = [a for a in adv if a.get("status") == "trial"]
    if not trial:
        fails.append("arm (q): no validity advisory was raised at a visited temperature -- "
                     "the starting guess no longer leaves the spans, so the arm is vacuous")
    for a in adv:
        if a.get("status", "accepted") != "trial":
            for t in temps(a):
                if abs(t - Tans) > 0.5:
                    fails.append(f"arm (q): an ACCEPTED validity advisory is about T = {t} K "
                                 f"but the published bubble temperature is {Tans:.3f} K: "
                                 + a.get("message", "")[:140])
    #  The console says the same: every [pair-span] / [psat] line is about the answer.
    for ln in out.splitlines():
        if ln.startswith(("[pair-span]", "[psat]")):
            for t in temps({"message": ln}) + [float(x) for x in re.findall(r"T = ([0-9.]+) K", ln)]:
                if abs(t - Tans) > 0.5:
                    fails.append(f"arm (q): the console announced a temperature the solve only "
                                 f"visited ({t} K, answer {Tans:.3f} K): {ln[:140]}")
                    break
    return 1


def run_arms(tmp, fails):
    return arm_p(tmp, fails) + arm_q(tmp, fails)


def main():
    fails = []
    with tempfile.TemporaryDirectory(prefix="choupo-molspan-") as t:
        held = run_arms(Path(t), fails)
    if fails:
        for f in fails:
            print("FAIL: " + f)
        return 1
    print(f"OK  molecular span arms (p)-(r): {held} arms held "
          "(infinite dilution announced, bubble point describes its answer, "
          "a spanless record says so)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
