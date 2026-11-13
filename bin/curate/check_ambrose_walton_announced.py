#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the Ambrose-Walton vapour-pressure model SAYS WHAT IT IS, and says
when its curve contradicts the record it was built from -- and moves no number.

    bin/curate/check_ambrose_walton_announced.py

WHY THIS EXISTS (2026-11-10, DEV.md 4c C281 step 1).  48 catalogue components
declared `vaporPressure { model AmbroseWalton; }` (32 since DEV.md 4c C285, whose
graded acceptance replaced sixteen by Antoines fitted to every laboratory's
measurements -- seven of them already under C283; arm (e)).  The model reads Tc, Pc and
omega only and never the record's Tb; evaluated from each record's own
constants, the curve's normal boiling point (P = 101325 Pa) misses the record's
Tb by more than 2 K for 26 of the 48 and by more than 10 K for 14 (maleic acid
+154 K, squalane +87 K, glycerol +83 K).  Nothing in a run said so.  The model
now announces, once per component per process through AdvisoryLog (console
`[psat-estimate]`, end-of-run caveat block, result JSON `advisories`): (1) that
the pressure is a corresponding-states ESTIMATE from Tc, Pc, omega, not a fit
to measurements; (2) where Tb is declared and |T_nb(curve) - Tb| > 1 K, both
temperatures and the gap.

THE PUBLISHED EQUATIONS (read here, never imported from the C++): Ambrose &
Walton, Poling, Prausnitz & O'Connell, "The Properties of Gases and Liquids",
5th ed., Eq. 7-2.7:  ln(Psat/Pc) = f0 + omega f1 + omega^2 f2, tau = 1 - Tr,
f_k = (c1 tau + c15 tau^1.5 + c25 tau^2.5 + c5 tau^5) / Tr, coefficients below.

WHAT IS CHECKED, by running the real `choupoProps` on probe cases:
  (a) EVERY catalogue AW record: the gap the engine prints equals, to 0.01 K,
      the gap recomputed in Python from the record's own Tc, Pc, omega, Tb and
      the equations above; the SET of components that announce a gap equals the
      set the Python predicts (|gap| > 1 K), and every component prints its
      estimate line exactly once.
  (b) A two-component probe (methylIsobutylEther, consistent; glycerol,
      inconsistent): glycerol prints exactly one gap line and one estimate line,
      methylIsobutylEther prints only the estimate line, and the result JSON
      `advisories` carries the same (provenance/info for both, validity/warning
      for glycerol only).
  (c) NO NUMBER MOVED: nine Psat values (glycerol, maleicAcid,
      diethylethanolamine at three temperatures) equal the values printed by
      the PARENT commit's build (19933c63f, recorded before the change) to
      1e-12 relative, and equal the Python equations to 1e-9.
  (d) A record with no Tb gets the estimate line and no gap line.

  (e) THE COUNT ONLY FALLS (C281 step 2).  At most AW_MAX records declare
      AmbroseWalton: step 2 replaced the curve of every record whose archive
      measurements validated a fit (`bin/choupo-curate vp`), and a NEW
      estimate entering the catalogue, or a promoted fit reverted
      (`bin/choupo-curate revert <component>`), must lower or raise this pin
      deliberately, never in silence.

WHAT IS NOT CHECKED: that the estimate is ACCURATE (C279 measured a median
19.6 % AAD against archive data on 25 of them); that a declared Tb is itself
right (several are estimates); the wording beyond the numbers and the one
structural phrase per announcement; the sealed case-local copies of a record
(they are read through the same constructor, but only glycerol is reached by a
tutorial and `bin/runTests` runs it).

SABOTAGES (by hand; each restored and rebuilt afterwards):
  S1  `if (!(Tb > 0.0)) return;` replaced by `if (true) return;` (the whole gap
      block dead) -> arm (a): all 30 expected gap announcements missing; arm (b):
      glycerol's console line and JSON advisory missing.  Arms (c), (d) stayed
      green, as they should: no number moved and the estimate line was intact.
  S2  threshold 1.0 K raised to 100 K -> arm (a): the 28 components with a gap
      between 1 K and 100 K no longer announce (python-only set), arm (b):
      glycerol (+82.9 K) silenced as well.  Only maleic acid and squalane still
      fired, which is why (a) recounts the whole catalogue.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXE = ROOT / "choupoProps"
THRESHOLD_K = 1.0            # the engine's tbGapAnnounce_K (stated default)
AW_MAX = 32                  # arm (e): 48 at step 1, 47 after C281 step 2, 41 after step 3 (C283),
                             # 32 after C285 (sixteen promoted under the graded acceptance)

# Parent-commit (19933c63f) values, printed by its build before the change.
PARENT = [
    ("glycerol", 400.0, 0.0483367885341),
    ("glycerol", 500.0, 202.806319695),
    ("glycerol", 600.0, 22836.8464307),
    ("maleicAcid", 400.0, 67.624607047),
    ("maleicAcid", 500.0, 12196.1455868),
    ("maleicAcid", 600.0, 244278.819412),
    #  diethylethanolamine was the third component until C281 step 3 promoted
    #  its fitted Antoine (DEV.md 4c C283); diButylCarbonate took its place
    #  until DEV.md 4c C285 promoted it (fitGrade severe); mNitrotoluene, still
    #  AmbroseWalton (its fit is refused, Tnb 22 K from Tb), takes it now.  Its
    #  three values are this build's: the AmbroseWalton source is unchanged
    #  since the parent commit, and the arm also holds them to the published
    #  equations at 1e-9.
    ("mNitrotoluene", 350.0, 250.736156580),
    ("mNitrotoluene", 400.0, 3254.34439995),
    ("mNitrotoluene", 450.0, 21218.4183522),
]

C = {
    "f0": (-5.97616, 1.29874, -0.60394, -1.06841),
    "f1": (-5.03365, 1.11505, -5.41217, -7.46628),
    "f2": (-0.64771, 2.41539, -4.26979, 3.25259),
}

fail = []
checked = []


def psat(T, Tc, Pc, w):
    if T >= Tc:
        return Pc
    Tr = T / Tc
    t = 1.0 - Tr

    def f(c):
        return (c[0] * t + c[1] * t ** 1.5 + c[2] * t ** 2.5 + c[3] * t ** 5) / Tr
    return Pc * math.exp(f(C["f0"]) + w * f(C["f1"]) + w * w * f(C["f2"]))


def tnb(Tc, Pc, w, P=101325.0):
    lo, hi = 0.2 * Tc, Tc * (1.0 - 1e-12)
    if not (psat(lo, Tc, Pc, w) < P) or not (psat(hi, Tc, Pc, w) >= P):
        return None
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if psat(mid, Tc, Pc, w) < P:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def strip(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def scal(t, k):
    m = re.search(r"^\s*" + k + r"\s+([-+0-9.eE]+)", t, re.M)
    return float(m.group(1)) if m else None


def records():
    out = []
    for f in sorted((ROOT / "data/standards/components").glob("*.dat")):
        t = strip(f.read_text())
        if not re.search(r"^\s*model\s+AmbroseWalton", t, re.M):
            continue
        out.append((f.stem, scal(t, "Tc"), scal(t, "Pc") * 1e5,
                    scal(t, "omega") or 0.0, scal(t, "Tb")))
    return out


def mkcase(d, comps, points, local=None):
    (d / "system").mkdir(parents=True)
    (d / "constant").mkdir()
    (d / "system/controlDict").write_text(
        'application choupoProps;\ndescription "probe";\nverbosity 1;\n')
    (d / "constant/thermoPhysPropDict").write_text(
        "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
        "components ( %s );\nequilibrium\n{\n formulation gammaPhi;\n"
        " liquid { activityModel { model ideal; } }\n"
        " vapour { fugacityModel idealGas; }\n}\n" % "  ".join(comps))
    ops = ""
    for i, (c, T) in enumerate(points):
        comp = " ".join("%s %s;" % (x, "1.0" if x == c else "0.0") for x in comps)
        ops += ("{ name p%d; type propertyPoint; state { T %s K; P 1 atm; "
                "composition { %s } } properties ( Psat_%s ); }\n" % (i, T, comp, c))
    (d / "system/propsDict").write_text("operations\n(\n%s);\n" % ops)
    if local:
        (d / "constant/components").mkdir()
        for name, text in local.items():
            (d / "constant/components" / (name + ".dat")).write_text(text)


def run(d):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(EXE), str(d)], capture_output=True, text=True,
                       env=env, timeout=600)
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  r.stdout, re.S)
    j = json.loads(m.group(1)) if m else None
    lines = [ln for ln in r.stderr.splitlines() if ln.startswith("[psat-estimate]")]
    return r.returncode, lines, j, r.stdout


GAP = re.compile(r"^\[psat-estimate\] (\S+): the curve's own normal boiling point "
                 r"\(P = 101325 Pa\) is ([0-9.]+) K, the record declares Tb = "
                 r"([0-9.]+) K, a gap of ([-+0-9.]+) K")
EST = re.compile(r"^\[psat-estimate\] (\S+): the vapour pressure is an "
                 r"Ambrose-Walton corresponding-states ESTIMATE computed from")


def main():
    if not EXE.exists():
        print("check_ambrose_walton_announced: CANNOT RUN -- no choupoProps "
              "(run `make all`)")
        return 2
    recs = records()
    # ---- (e) the count only falls -----------------------------------------
    if len(recs) > AW_MAX:
        fail.append("(e) %d catalogue records declare AmbroseWalton, the pin is %d "
                    "(C281 step 2) -- a new estimate entered, or a fitted curve was "
                    "reverted; lower or raise AW_MAX deliberately" % (len(recs), AW_MAX))
    else:
        checked.append("(e) %d AW records, at most the pinned %d" % (len(recs), AW_MAX))
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)

        # ---- (a) every catalogue record ------------------------------------
        names = [r[0] for r in recs]
        mkcase(td / "all", names, [(names[0], 400.0)])
        rc, lines, j, out = run(td / "all")
        if rc != 0 or j is None:
            fail.append("(a) the all-records probe did not run (exit %d)" % rc)
        else:
            est = {}
            gap = {}
            for ln in lines:
                m = EST.match(ln)
                if m:
                    est[m.group(1)] = est.get(m.group(1), 0) + 1
                m = GAP.match(ln)
                if m:
                    gap.setdefault(m.group(1), []).append(
                        (float(m.group(2)), float(m.group(3)), float(m.group(4))))
            for n in names:
                if est.get(n) != 1:
                    fail.append("(a) %s: %s estimate lines (want exactly 1)"
                                % (n, est.get(n, 0)))
            expect = {}
            for n, Tc, Pc, w, Tb in recs:
                T = tnb(Tc, Pc, w)
                if Tb and (T is None or abs(T - Tb) > THRESHOLD_K):
                    expect[n] = None if T is None else T - Tb
            if set(expect) != set(gap):
                fail.append("(a) components announcing a gap differ: python-only %s, "
                            "engine-only %s" % (sorted(set(expect) - set(gap)),
                                                sorted(set(gap) - set(expect))))
            for n, g in gap.items():
                if len(g) != 1:
                    fail.append("(a) %s: %d gap lines (want exactly 1)" % (n, len(g)))
                elif n in expect and expect[n] is not None:
                    if abs(g[0][2] - expect[n]) > 0.0101:
                        fail.append("(a) %s: engine gap %+.2f K, python %+.2f K"
                                    % (n, g[0][2], expect[n]))
            if not any(f.startswith("(a)") for f in fail):
                checked.append("(a) %d AW records: %d announce a gap, each equal to "
                               "the independent Python value within 0.01 K, the "
                               "other %d print the estimate line only"
                               % (len(names), len(gap), len(names) - len(gap)))

        # ---- (b) consistent vs inconsistent probe --------------------------
        mkcase(td / "two", ["methylIsobutylEther", "glycerol"],
               [("glycerol", 500.0)])
        rc, lines, j, out = run(td / "two")
        if rc != 0 or j is None:
            fail.append("(b) the two-component probe did not run (exit %d)" % rc)
        else:
            g = [l for l in lines if GAP.match(l)]
            e = [l for l in lines if EST.match(l)]
            if len(e) != 2:
                fail.append("(b) %d estimate lines (want 2)" % len(e))
            if len(g) != 1 or not g[0].startswith("[psat-estimate] glycerol:"):
                fail.append("(b) gap lines %r (want exactly one, glycerol's)" % g)
            adv = j.get("advisories", [])
            aw = [a for a in adv if "Ambrose-Walton" in a["message"]
                  or "Ambrose" in a["message"] or "normal boiling point" in a["message"]]
            est_j = {a["locus"] for a in aw if a["category"] == "provenance"
                     and "ESTIMATE" in a["message"]}
            gap_j = [a for a in aw if a["category"] == "validity"
                     and "normal boiling point" in a["message"]]
            if est_j != {"component 'glycerol'", "component 'methylIsobutylEther'"}:
                fail.append("(b) JSON estimate advisories for %s" % sorted(est_j))
            if len(gap_j) != 1 or gap_j[0]["locus"] != "component 'glycerol'":
                fail.append("(b) JSON gap advisories %r (want one, glycerol)" % gap_j)
            if not any(f.startswith("(b)") for f in fail):
                checked.append("(b) the consistent component prints only the "
                               "estimate line, the inconsistent one exactly one "
                               "gap line, both in the result JSON advisories")

        # ---- (c) no number moved --------------------------------------------
        pts = [(c, T) for c, T, _ in PARENT]
        comps = sorted({c for c, _ in pts})
        mkcase(td / "num", comps, pts)
        rc, lines, j, out = run(td / "num")
        if rc != 0 or j is None:
            fail.append("(c) the number probe did not run (exit %d)" % rc)
        else:
            vals = re.findall(r'"Psat_(\w+)": ([-0-9.eE+]+)', out)
            if len(vals) != len(PARENT):
                fail.append("(c) %d Psat values found, want %d" % (len(vals), len(PARENT)))
            else:
                by = {r[0]: r for r in recs}
                for (c, T, ref), (cn, v) in zip(PARENT, vals):
                    v = float(v)
                    _, Tc, Pc, w, _ = by[c]
                    if abs(v / ref - 1) > 1e-11:
                        fail.append("(c) %s at %g K: %.12g, parent build %.12g"
                                    % (c, T, v, ref))
                    if abs(v / psat(T, Tc, Pc, w) - 1) > 1e-9:
                        fail.append("(c) %s at %g K: %.12g vs python equations %.12g"
                                    % (c, T, v, psat(T, Tc, Pc, w)))
            if not any(f.startswith("(c)") for f in fail):
                checked.append("(c) nine Psat values (3 components x 3 T) equal the "
                               "parent commit's build and the published equations")

        # ---- (d) no Tb declared -> estimate line only -----------------------
        src = (ROOT / "data/standards/components/glycerol.dat").read_text()
        notb = re.sub(r"(?m)^Tb\s.*\n", "", src)
        if notb == src:
            fail.append("(d) could not strip Tb from the glycerol record")
        else:
            # a DIFFERENT name: a case-local record of a catalogue name overlays
            # field by field and would keep the catalogue's Tb.
            notb = re.sub(r"(?m)^name\s.*\n", "name awNoTb;\n", notb)
            mkcase(td / "notb", ["awNoTb"], [("awNoTb", 500.0)],
                   local={"awNoTb": notb})
            rc, lines, j, out = run(td / "notb")
            if rc != 0 or j is None:
                fail.append("(d) the no-Tb probe did not run (exit %d)" % rc)
            elif [l for l in lines if GAP.match(l)] or not [l for l in lines if EST.match(l)]:
                fail.append("(d) no-Tb record: lines %r (want the estimate "
                            "line and no gap line)" % lines)
            else:
                checked.append("(d) a record with no Tb prints the estimate line "
                               "and no gap line")

    if fail:
        print("check_ambrose_walton_announced: FAILED")
        for f in fail:
            print("  * " + f)
        return 1
    print("check_ambrose_walton_announced: OK -- " + "; ".join(checked)
          + ".  The gate checks that the reader is TOLD and that no number moved, "
            "never that the estimate is ACCURATE or that a declared Tb is right.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
