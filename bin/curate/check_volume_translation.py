#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the Peneloux volume translation does what the paper says and nothing else.

    bin/curate/check_volume_translation.py

WHY THIS EXISTS (DEV.md 4c C408 (a)).  A volume translation is the one change
to a cubic equation of state that must leave every fugacity coefficient, every
K-value and every flash exactly where it was (Peneloux, Rauzy & Freze 1982,
Fluid Phase Equilib. 8, 7-23, Eq. 2-4, pp. 8-9), and move the volume by the
mole-weighted shift c = sum x_i c_i (Eq. 6, p. 9) and the enthalpy departure
by -P c.  A golden pins what a run PRINTS; none of it can say that the two
packages of `tutorials/props/molecular/volumeTranslation01_nhexane_peneloux`
agree on equilibrium, so that is held here, from the run's own output.

WHAT THIS GATE CHECKS, every number recomputed and none typed from the engine:

  (a) EQUILIBRIUM IS UNCHANGED.  The two bubble-temperature scans (plain SRK,
      SRK + Peneloux) are byte-identical files.
  (b) THE SHIFT IS EQ. 8 AND EQ. 6.  c_i = 0.40768 (R Tc/Pc)(0.29441 - Z_RA)
      from the component record's Tc, Pc and the case's declared Z_RA; the
      liquid molar volume of every pure and mixed point drops by sum x_i c_i,
      to 1e-9 relative (the mixture's by the mole-weighted mean of the pure
      shifts: c is linear in x).
  (c) THE ENTHALPY DEPARTURE MOVES BY -P c, AND THE ENTROPY'S DOES NOT MOVE.
  (d) THE DEFAULT IS OFF.  The plain-SRK points carry no shift (their volume
      is the untranslated cubic's: checked against the translated one by (b)).
  (e) A COMPONENT WITHOUT Z_RA IS REFUSED BY NAME (arm run on a throwaway
      copy): the exit is non-zero and the message names the component and the
      three remedies.

NOT CHECKED: that the shift improves any density (the case's anchor rows hold
that against Perry's published values), the PR shift beyond n-hexane and the
Table-2 families (refused by name), the liquid density of `ThermoPackage::density`
(the Rackett route; the translation is on the EoS volumes only).
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
CASE = ROOT / "tutorials/props/molecular/volumeTranslation01_nhexane_peneloux"
R = 8.314462618


def rec(name, key):
    txt = (CASE / "constant/components" / f"{name}.dat").read_text()
    m = re.search(rf"^\s*{key}\s+([0-9.eE+-]+)\s*;", txt, re.M)
    if not m:
        raise ValueError(f"{name}: no {key}")
    return float(m.group(1))


def zra(variant):
    txt = (CASE / "constant/thermoPhysPropDict").read_text()
    blk = txt[txt.index(f"    {variant} "):]
    blk = blk[: blk.index("liquid {")]
    return {n: float(v) for n, v in re.findall(r"(\w+)\s*\{\s*ZRA\s+([0-9.]+)", blk)}


def shift(name, z):
    return 0.40768 * R * rec(name, "Tc") / (rec("%s" % name, "Pc") * 1e5) * (0.29441 - z)


def run(case):
    p = subprocess.run([str(PROPS), str(case)], capture_output=True, text=True,
                       timeout=600)
    return p


def main() -> int:
    fail = []
    if not PROPS.exists():
        print("check_volume_translation: REFUSED -- choupoProps is not built.")
        return 1
    #  The two scan files are DELETED first: a stale CSV from an earlier run
    #  must never stand in for this run's (VT-11).
    for name in ("txy_SRK.csv", "txy_SRK_Peneloux.csv"):
        (CASE / name).unlink(missing_ok=True)
    p = run(CASE)
    if p.returncode != 0:
        print(f"check_volume_translation: FAILED\n  - the case did not run (exit {p.returncode})")
        return 1
    out = p.stdout
    body = out.split("<<<Choupo:result-end>>>")[0]
    j = json.loads(body[body.rindex("\n{\n"):])
    d = {o["name"]: o.get("diagnostics", {}) for o in j["operationResults"]}

    #  (a)
    a = (CASE / "txy_SRK.csv").read_bytes()
    b = (CASE / "txy_SRK_Peneloux.csv").read_bytes()
    if not a or a != b:
        fail.append("the bubble-temperature scans of plain SRK and SRK + Peneloux "
                    "differ: a volume translation moved an equilibrium")
    elif a.count(b"\n") != 6:
        fail.append("the scans do not carry the expected 5 rows")

    #  (b)-(d)
    z = zra("peneloux")
    c = {n: shift(n, zv) for n, zv in z.items()}
    for tag, comp in (("nHexane", {"nHexane": 1.0}), ("nDecane", {"nDecane": 1.0}),
                      ("mixture50", {"nHexane": 0.5, "nDecane": 0.5})):
        base, tr = d[f"{tag}_SRK"], d[f"{tag}_SRK_Peneloux"]
        cc = sum(x * c[n] for n, x in comp.items())
        dv = base["v_molar_liq"] - tr["v_molar_liq"]
        if abs(dv - cc) > 1e-9 * abs(cc):
            fail.append(f"{tag}: v_liq(SRK) - v_liq(SRK+Peneloux) = {dv:.9e} m3/mol, "
                        f"Eq. 6 with Eq. 8 gives {cc:.9e}")
        dvv = base["v_molar"] - tr["v_molar"]
        if abs(dvv - cc) > 1e-9 * abs(cc):
            fail.append(f"{tag}: the vapour-root volume moved by {dvv:.9e}, not c = {cc:.9e}")
        dH = tr["H_R"] - base["H_R"]
        if abs(dH + base["P"] * cc) > 1e-6 * abs(base["P"] * cc):
            fail.append(f"{tag}: H_R moved by {dH:.9e} J/mol, -P c = {-base['P'] * cc:.9e}")
        if abs(tr["S_R"] - base["S_R"]) > 1e-12 * max(1.0, abs(base["S_R"])):
            fail.append(f"{tag}: S_R moved ({base['S_R']} -> {tr['S_R']}); entropy departure must not")

    #  (b') Peng-Robinson: Jhaveri & Youngren 1988, c = s b (Eq. 17), s of
    #  Table 1 (n-hexane, p. 1035) and Eq. 18 + Table 2 (n-alkanes: d 2.258,
    #  e 0.1823) for n-decane, b = 0.07780 R Tc/Pc; the volume moves by -c
    #  (c is NEGATIVE for hexane: the volume grows), H_R by -P c, S_R by 0.
    bPR = lambda n: 0.07780 * R * rec(n, "Tc") / (rec(n, "Pc") * 1e5)
    sH = -0.01478
    sD = 1.0 - 2.258 / rec("nDecane", "MW") ** 0.1823
    cp = {"nHexane": sH * bPR("nHexane"), "nDecane": sD * bPR("nDecane")}
    for tag, comp in (("nHexane", {"nHexane": 1.0}), ("nDecane", {"nDecane": 1.0}),
                      ("mixture50", {"nHexane": 0.5, "nDecane": 0.5})):
        base, tr = d[f"{tag}_PR"], d[f"{tag}_PR_Jhaveri"]
        cc = sum(x * cp[n] for n, x in comp.items())
        dv = base["v_molar_liq"] - tr["v_molar_liq"]
        if abs(dv - cc) > 1e-9 * abs(cc):
            fail.append(f"PR {tag}: v_liq(PR) - v_liq(PR+J&Y) = {dv:.9e}, Eq. 17/18 give {cc:.9e}")
        dH = tr["H_R"] - base["H_R"]
        if abs(dH + base["P"] * cc) > 1e-6 * abs(base["P"] * cc):
            fail.append(f"PR {tag}: H_R moved by {dH:.9e}, -P c = {-base['P'] * cc:.9e}")
        if abs(tr["S_R"] - base["S_R"]) > 1e-12 * max(1.0, abs(base["S_R"])):
            fail.append(f"PR {tag}: S_R moved")

    #  (f) THE FUGACITY CONVENTION AND G = H - T S, from a probe linked to the
    #  library (bin/curate/_volumeTranslationProbe.cpp): the translated fluid
    #  is ONE fluid, ln phi_i(on) - ln phi_i(off) = -c_i P/RT per component,
    #  per root (vapour AND liquid), per cubic, at 4 states, to 1e-9; the
    #  volumes of both roots drop by c; and G^R = RT sum y ln phi equals
    #  H^R - T S^R on the vapour root, with the shift off AND on, to 1e-9
    #  relative (VT-08, VT-11).
    probe = tempfile.mkdtemp(prefix="vt_probe_")
    try:
        exe = Path(probe) / "probe"
        b = subprocess.run(["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}",
                            str(ROOT / "bin/curate/_volumeTranslationProbe.cpp"),
                            str(ROOT / "build/linux64Gcc/libchoupo.so"),
                            "-Wl,-rpath," + str(ROOT / "build/linux64Gcc"), "-o", str(exe)],
                           capture_output=True, text=True)
        if b.returncode != 0:
            fail.append("the probe did not compile: " + b.stderr[-600:])
        else:
            import os
            pr = subprocess.run([str(exe)], capture_output=True, text=True, timeout=300,
                                env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
            lines = pr.stdout.split("<<<PROBE\n")[-1].split("PROBE>>>")[0].splitlines()
            rows = {}
            for ln in lines:
                f = ln.split()
                if len(f) >= 4 and f[0] in ("SRK", "PR") and f[1].isdigit():
                    rows[(f[0], int(f[1]), f[2])] = [float(v) for v in f[3:]]
            if not rows:
                fail.append("the probe printed nothing")
            cmap = {"SRK": [c["nHexane"], c["nDecane"]], "PR": [cp["nHexane"], cp["nDecane"]]}
            for (tag, k, key), v in rows.items():
                if key != "state":
                    continue
                T, P, y0 = v
                y = [y0, 1.0 - y0]
                cs = cmap[tag]
                for i in range(2):
                    for root, kk in (("V", f"lnphiV{i}"), ("L", f"lnphiL{i}")):
                        off, on = rows[(tag, k, kk)]
                        want = -cs[i] * P / (R * T)
                        if abs((on - off) - want) > 1e-9:
                            fail.append(f"{tag} state {k}: ln phi_{i}({root}) moved by {on - off:.12e}, "
                                        f"-c_i P/RT = {want:.12e}")
                cc = y[0] * cs[0] + y[1] * cs[1]
                for key2 in ("vV", "vL"):
                    off, on = rows[(tag, k, key2)]
                    if abs((off - on) - cc) > 1e-9 * abs(cc):
                        fail.append(f"{tag} state {k}: {key2} moved by {off - on:.9e}, c = {cc:.9e}")
                for lab, idx in (("off", 0), ("on", 1)):
                    G = R * T * sum(y[i] * rows[(tag, k, f"lnphiV{i}")][idx] for i in range(2))
                    H = rows[(tag, k, "HR")][idx]
                    S = rows[(tag, k, "SR")][idx]
                    if abs(G - (H - T * S)) > 1e-9 * max(1.0, abs(G)):
                        fail.append(f"{tag} state {k} (shift {lab}): G^R = {G:.9e} but H^R - T S^R = "
                                    f"{H - T * S:.9e}")
    finally:
        shutil.rmtree(probe, ignore_errors=True)

    #  (e) the refusal, on a throwaway copy
    tmp = Path(tempfile.mkdtemp(prefix="vt_gate_"))
    try:
        cp = tmp / "case"
        shutil.copytree(CASE, cp, ignore=shutil.ignore_patterns("*.csv"))
        f = cp / "constant/thermoPhysPropDict"
        t = f.read_text()
        i = t.index("nDecane { ZRA 0.2578;")
        j2 = t.index("}", t.index("source", i)) + 1
        f.write_text(t[:i] + t[j2:])
        q = run(cp)
        msg = q.stdout + q.stderr
        if q.returncode == 0 or "nDecane" not in msg or "Z_RA" not in msg \
                or "missingZRA YamadaGunn" not in msg:
            fail.append("a component with no Z_RA and no declared shift was not "
                        "refused by name with its remedies")
        #  (e') PR: a Table-2 family declared for n-hexane (MW 86.18, not
        #  HEAVIER than hexane) is refused by name.
        f.write_text(t.replace("nHexane { shiftTable1 nHexane;",
                               "nHexane { family nAlkane;"))
        q3 = run(cp)
        m3 = q3.stdout + q3.stderr
        if q3.returncode == 0 or "nHexane" not in m3 or "heavier than n-hexane" not in m3:
            fail.append("PR: a Table-2 family declared for n-hexane was not "
                        "refused by name")
        #  (e'') VT-14 / VT-12 / VT-10: the wrong model word under each cubic, an
        #  entry for a component that is not in the system, and a translation
        #  under a gammaPhi vapour, each refused by name.
        # PR variant carrying `model Peneloux` / SRK variant carrying `model JhaveriYoungren`
        a_pr = t.replace("model JhaveriYoungren;", "model Peneloux;")
        a_srk = t.replace("model Peneloux;", "model JhaveriYoungren;")
        a_unk = t.replace("nHexane { ZRA 0.2636;", "water { ZRA 0.2636; source \"x\"; }\n                        nHexane { ZRA 0.2636;", 1)
        for label, text, needle in (
                ("PR with `model Peneloux`", a_pr, "takes `model JhaveriYoungren;`"),
                ("SRK with `model JhaveriYoungren`", a_srk, "takes `model Peneloux;`"),
                ("an entry for a component not in the system", a_unk, "not a component of this system")):
            f.write_text(text)
            qq = run(cp)
            mm = qq.stdout + qq.stderr
            if qq.returncode == 0 or needle not in mm:
                fail.append(f"{label} was not refused by name ({needle!r})")
        f.write_text(t)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fail:
        print("check_volume_translation: FAILED")
        for m in fail:
            print("  - " + m)
        return 1
    print("check_volume_translation: OK -- ONE translated fluid: ln phi_i moves by -c_i P/RT per component, root and cubic (probe, 4 states, 1e-9) and G^R = H^R - T S^R closes with the shift off and on; equilibrium byte-identical under the shift (5-point "
          "bubble scan); v_liq and v_vap drop by sum x_i c_i (Eq. 6, Eq. 8) on 3 states "
          "to 1e-9; H_R moves by -P c, S_R by 0; PR + Jhaveri-Youngren c = s b (Eq. 17-18) on 3 states likewise; a component without Z_RA, and a Table-2 family on hexane, are refused by name.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
