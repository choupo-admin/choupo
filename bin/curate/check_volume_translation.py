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
that against Perry's published values), the PR constant (refused by name, none
is in the held literature), the liquid density of `ThermoPackage::density`
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
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fail:
        print("check_volume_translation: FAILED")
        for m in fail:
            print("  - " + m)
        return 1
    print("check_volume_translation: OK -- equilibrium byte-identical under the shift (5-point "
          "bubble scan); v_liq and v_vap drop by sum x_i c_i (Eq. 6, Eq. 8) on 3 states "
          "to 1e-9; H_R moves by -P c, S_R by 0; a component without Z_RA is refused by name.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
