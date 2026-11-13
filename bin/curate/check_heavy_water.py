#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: heavyWater.dat is held to the IAPWS formulation it was derived from.

    bin/curate/check_heavy_water.py

WHY THIS EXISTS.  `heavyWater.dat` was an unverified import (Antoine and Cp
polynomials fitted to a third-party EOS, off the primary vapour-pressure
curve by up to 2.3 %).  It is now DERIVED from the IAPWS R16-17(2018)
formulation and the Herrig et al. 2018 auxiliary equations by
bin/curate/heavy_water_iapws.py.  A record that says `reviewStatus
reviewed;` and is then edited by hand, or a script whose transcription of
the equation has drifted, would make that word false with nothing noticing;
this gate is the independent recomputation.

WHAT IT CHECKS (arms):
  (a) the TRANSCRIPTION: the script reproduces every computer-verification
      value printed in R16-17 Tables 6, 7, 8 and the auxiliary-equation check
      values (heavy_water_iapws.check());
  (b) the RECORD's Wagner block IS Herrig Eq. (1)/Table 3 (coefficients,
      exponents, reducing constants) -- no hand-edit survives;
  (c) the RECORD's vapour pressure against the full EOS (Maxwell criterion)
      at 6 temperatures, 276.969-643 K, within 1e-4 (the paper's own stated
      agreement of Eq. (1) with the EOS);
  (d) the RECORD's constants against the EOS: MW, Tc, Pc, Tb (p_record(Tb)
      = 101325 Pa), HvapTb, omega, Vliq;
  (e) the Cp polynomials: coefficients equal a fresh fit (to 1e-5 relative)
      and the declared maximum deviations hold;
  (f) the ENGINE: choupoProps on tutorials/props/thermo/
      heavyWater01_isotope_effect publishes the Wagner psat to 1e-6 of this
      script's arithmetic, the IF97 water psat to 1e-5 of the EOS-independent
      IF97 saturation equation of the tree's own record, and the D2O/H2O
      boiling points the record implies;
  (g) the record keeps its honesty: `reviewStatus reviewed;`, NO
      standardThermochemistry block (its pair is not sourced -- adding one
      without a cleared primary must be a decision, not a drift), and the
      UNIFAC group, if present, is exactly `H2O` AND declared an assumption in
      the provenance (`groups { origin assumed; }`) -- D2O has no published
      decomposition, so a group may stand only as a declared approximation.

WHAT IT DOES NOT CHECK.  That the IAPWS equation is right about heavy water
(that is the formulation's own uncertainty: vapour pressure mostly 0.05 %); the
liquid density beyond the single Vliq point; and nothing about transport,
which the record does not carry.
"""
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate"))
import heavy_water_iapws as H  # noqa: E402

REC = ROOT / "data" / "standards" / "components" / "heavyWater.dat"
CASE = ROOT / "tutorials" / "props" / "thermo" / "heavyWater01_isotope_effect"
PROPS = ROOT / "choupoProps"

fails = []


def fail(msg):
    fails.append(msg)
    print("  FAIL", msg)


def nums(s):
    return [float(x) for x in re.findall(r'[-+]?\d+\.?\d*(?:[eE][-+]?\d+)?', s)]


def block(text, name):
    m = re.search(r'^' + name + r'\s*\n\{(.*?)^\}', text, re.S | re.M)
    return m.group(1) if m else None


def scalar(text, key):
    m = re.search(r'^' + key + r'\s+([-+0-9.eE]+)\s*;', text, re.M)
    return float(m.group(1)) if m else None


def run_checks():
    text = REC.read_text()

    # (a) transcription of the EOS against the release's own tables
    import io
    import contextlib
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = H.check()
    if rc != 0:
        fail("(a) heavy_water_iapws.py --check no longer reproduces R16-17 Tables 6-8")

    # (g) honesty
    if not re.search(r'^reviewStatus\s+reviewed\s*;', text, re.M):
        fail("(g) reviewStatus is not `reviewed`")
    if re.search(r'^standardThermochemistry', text, re.M):
        fail("(g) standardThermochemistry appeared: its source pair (dHf, s) must be a cleared primary")
    if re.search(r'^groups', text, re.M):
        g = block(text, "groups")
        if g is None or not re.search(r'unifac\s*\(\s*\{\s*group\s+H2O\s*;\s*count\s+1\s*;\s*\}\s*\)', g):
            fail("(g) the UNIFAC group is not exactly `H2O` (a declared approximation, not a decomposition)")
        pg = block(text, "provenance")
        gm = re.search(r'^\s+groups\s*\n\s*\{(.*?)^\s*\}', pg or "", re.S | re.M)
        gp = gm.group(1) if gm else None
        if gp is None or not re.search(r'origin\s+assumed\s*;', gp):
            fail("(g) the UNIFAC group stands without `origin assumed` in the provenance")

    # (b) the Wagner block IS Herrig Eq. (1) / Table 3
    vp = block(text, "vaporPressure")
    if vp is None or not re.search(r'model\s+Wagner', vp):
        fail("(b) vaporPressure is not the Wagner model")
        return
    coef = nums(re.search(r'coefficients\s*\(([^)]*)\)', vp).group(1))
    expo = nums(re.search(r'exponents\s*\(([^)]*)\)', vp).group(1))
    red = re.search(r'reducing\s*\{\s*T\s+([\d.]+)\s*K;\s*P\s+([\d.]+)\s*MPa;', vp)
    Tr, Pr = float(red.group(1)), float(red.group(2))
    if list(coef) != list(H.PV_N) or list(expo) != list(H.PV_E) \
            or (Tr, Pr) != (H.TC, H.PC_MPA):
        fail("(b) the record's Wagner block differs from Herrig et al. 2018 Eq.(1)/Table 3")

    def psat_rec(T):  # arithmetic of src/thermo/vaporPressure/Wagner.cpp
        tau = 1.0 - T / Tr
        return Pr * math.exp(Tr / T * sum(a * tau ** e for a, e in zip(coef, expo)))

    # (c) record vs the full EOS, 6 temperatures
    worst = 0.0
    for T in (280.0, 298.15, 350.0, 374.549, 500.0, 640.0):
        ps = H.saturation(T)[0]
        d = abs(psat_rec(T) / ps - 1.0)
        worst = max(worst, d)
        if d > 1e-4:
            fail(f"(c) psat record vs EOS at {T} K: {d:.2e} > 1e-4")

    # (d) constants against the EOS
    if abs(scalar(text, "MW") * 1e-3 * 1e3 - H.M) > 1e-9:
        fail("(d) MW differs from R16-17 Eq. (4)")
    if scalar(text, "Tc") != H.TC:
        fail("(d) Tc differs from R16-17 Eq. (1)")
    if abs(scalar(text, "Pc") * 0.1 - H.PC_MPA) > 1e-9:
        fail("(d) Pc differs from Herrig Table 1")
    Tb = scalar(text, "Tb")
    pTb = psat_rec(Tb)
    if abs(pTb / 0.101325 - 1) > 1e-4:
        fail(f"(d) record's p(Tb) = {pTb * 1e6:.1f} Pa is not 101325 Pa to 1e-4")
    Tb_eos = H.sat_T_at_p(0.101325)
    if abs(Tb - Tb_eos) > 6e-4:
        fail(f"(d) Tb {Tb} vs EOS {Tb_eos:.4f}")
    ps, rl, rv = H.saturation(Tb_eos)
    hv = H.props(Tb_eos, rv)["h"] - H.props(Tb_eos, rl)["h"]
    if abs(scalar(text, "HvapTb") / hv - 1) > 1e-5:
        fail(f"(d) HvapTb {scalar(text, 'HvapTb')} vs EOS {hv:.2f}")
    om = -math.log10(H.saturation(0.7 * H.TC)[0] / H.PC_MPA) - 1
    if abs(scalar(text, "omega") - om) > 2e-5:
        fail(f"(d) omega {scalar(text, 'omega')} vs EOS {om:.5f}")
    rl298 = H.saturation(298.15)[1]
    if abs(scalar(text, "Vliq") * 1e3 * rl298 - 1) > 1e-4:
        fail(f"(d) Vliq vs EOS 1/rho'(298.15)")

    # (e) Cp polynomials
    f = H.fits()
    for key, blk in (("cp0", "idealGasHeatCapacity"), ("cpl", "liquidHeatCapacity")):
        b = block(text, blk)
        rec = nums(re.search(r'coefficients\s*\(([^)]*)\)', b).group(1))
        for r_, n_ in zip(rec, f[key][0]):
            if abs(r_ / n_ - 1) > 1e-5:
                fail(f"(e) {blk} coefficient {r_} differs from a fresh fit {n_}")
        tr = nums(re.search(r'Trange\s*\(([^)]*)\)', b).group(1))
        if tuple(tr) != tuple(f[key][1]):
            fail(f"(e) {blk} Trange differs from the fitted window")
    if f["cp0"][2] > 1.5e-3 or f["cpl"][2] > 5e-3:
        fail("(e) declared fit residuals (0.139 %, 0.474 %) no longer hold")
    # against Simko et al. 2017 Table 6, D2(16O), as read
    cp = f["cp0"][0]
    for T, s in ((298.15, 34.26113), (500.0, 37.1955), (800.0, 42.2909)):
        v = sum(c * T ** k for k, c in enumerate(cp))
        if abs(v / s - 1) > 6e-4:
            fail(f"(e) ideal-gas Cp at {T} K vs Simko Table 6: {v / s - 1:+.2e}")

    # (f) the engine -- on a witness whose sealed mirror IS the catalogue record
    mirror = CASE / "constant" / "components" / "heavyWater.dat"
    body = [l for l in mirror.read_text().splitlines() if not l.startswith("// [imported]")]
    if body != REC.read_text().splitlines():
        fail("(f) the witness's sealed mirror of heavyWater.dat differs from the catalogue record "
             "(re-import: bin/choupo-import --overwrite constant/components/heavyWater.dat)")
    if not PROPS.exists():
        print("  (f) choupoProps not built: the engine arm CANNOT run -- refusing")
        fail("(f) engine arm could not run (choupoProps absent)")
        return worst
    import csv
    import shutil
    with tempfile.TemporaryDirectory(prefix="c197-hw-") as td:
        dst = Path(td) / CASE.name
        shutil.copytree(CASE, dst)
        r = subprocess.run([str(PROPS), "."], cwd=dst, capture_output=True,
                           text=True, timeout=600,
                           env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
        if r.returncode != 0:
            fail(f"(f) choupoProps exit {r.returncode}: {r.stderr[-300:]}")
            return worst
        def rd(f):
            return list(csv.DictReader(open(dst / f)))
        scan = rd("psat_isotope.csv")
        tbH = float(rd("boiling_water.csv")[0]["T_bubble"])
        tbD = float(rd("boiling_heavyWater.csv")[0]["T_bubble"])
    for row in scan:
        T = float(row["T"])
        pd2 = float(row["Psat_heavyWater"])
        if abs(pd2 / (psat_rec(T) * 1e6) - 1) > 1e-6:
            fail(f"(f) engine Psat_heavyWater at {T} K = {pd2} vs equation {psat_rec(T) * 1e6}")
        if abs(pd2 / (H.saturation(T)[0] * 1e6) - 1) > 1e-4:
            fail(f"(f) engine Psat_heavyWater at {T} K is not within 1e-4 of the EOS")
        pw = float(row["Psat_water"])
        if abs(pw / H_water_psat(T) - 1) > 1e-5:
            fail(f"(f) engine Psat_water (IF97) at {T} K = {pw} vs saturation eq {H_water_psat(T)}")
    if abs(tbD - Tb_eos) > 2.5e-3:
        fail(f"(f) engine D2O boiling point {tbD} vs EOS {Tb_eos:.4f}")
    if abs(tbH - H_water_Tsat(101325.0)) > 1e-3:
        fail(f"(f) engine H2O boiling point {tbH} vs the IF97 saturation line at 101325 Pa")
    return worst, tbH, tbD, Tb_eos, scan


def H_water_psat(T):
    """IAPWS-IF97 region-4 saturation pressure [Pa] (R7-97(2012) Eq. 31), with the
    ten coefficients READ from src/thermo/iapws/IF97.cpp (n4, Table 34) -- not a
    second home for them.  This arm therefore checks the WIRING (pureFluids ->
    IF97 for water in this case); the equation itself is verified against its
    release by IF97WaterFluid::verify() on every run (steam01)."""
    src = (ROOT / "src" / "thermo" / "iapws" / "IF97.cpp").read_text()
    m = re.search(r'constexpr double n4\[10\]\s*=\s*\{(.*?)\};', src, re.S)
    n = nums(m.group(1))
    assert len(n) == 10
    th = T + n[8] / (T - n[9])
    A = th * th + n[0] * th + n[1]
    B = n[2] * th * th + n[3] * th + n[4]
    C = n[5] * th * th + n[6] * th + n[7]
    return (2 * C / (-B + math.sqrt(B * B - 4 * A * C))) ** 4 * 1e6


def H_water_Tsat(p):
    lo, hi = 300.0, 400.0
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if H_water_psat(mid) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


if __name__ == "__main__":
    out = run_checks()
    if fails or not isinstance(out, tuple):
        print(f"check_heavy_water: FAILED -- {len(fails)} arm(s)")
        sys.exit(1)
    worst, tbH, tbD, tb, scan = out
    print(f"check_heavy_water: OK -- heavyWater.dat (reviewed) is the IAPWS R16-17(2018)/Herrig 2018 "
          f"formulation: Wagner block = Eq.(1) Table 3; psat within {worst:.1e} of the full EOS at 6 temperatures "
          f"(<= 1e-4); Tb/HvapTb/omega/Vliq/MW/Pc/Tc match; Cp fits reproduce; engine psat = the equation to 1e-6; "
          f"boiling points from the engine: H2O {tbH:.4f} K (IF97), D2O {tbD:.4f} K (EOS {tb:.4f}), shift {tbD - tbH:.4f} K. "
          f"Does NOT check transport (not carried), the EOS's own uncertainty, or any formation datum (none entered).")
