#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_dryer_arrangements -- the three flow arrangements of the continuous
convective dryer, held to an INDEPENDENT calculation (2026-11-21).

Real defect it would have caught: an arrangement whose numbers are internally
consistent (first law closed by construction) but whose equations are not the
ones the literature gives -- e.g. a cross-flow march that let the air deplete
down the length (it would then be a co-current dryer under another name), a
log-mean driving force written as an arithmetic mean, or a sign of the solid's
inlet step in the element enthalpy.  check_convective_dryer holds co- and
counter-current from the unit's own profile; nothing held the cross-flow.

The witnesses are ONE feed and ONE air through three dryers
(tutorials/steady/drying/convDryer01 co + counter on half the feed each,
convDryer02 counter-current, convDryer03 cross-flow, all on the same half):

  (a) water balance against the STREAMS, to 1e-9 relative, and the first law
      (each unit's energyResidual_kW and the plant report) below 1e-3 kW, for
      every dryer;
  (b) CROSS-FLOW, Mujumdar (2006) s.3.6.2.3.1, Eq. 3.66-3.78: an independent
      RK4 in Python (400 steps, its own Wagner-Pruss vapour pressure) of
      dX/dxi = -Wdot(X)/S with the log-mean driving force (Eq. 3.73),
      Wdot = G (Y*-Y1)(1-exp(-k_Y A f/G)), Y* at the engine's reported wet
      bulb of the inlet air: X_out to 2e-3 relative, Y_out to the water
      balance; the exhaust temperature from a constant-cp hand balance
      (declared cps, band 2 K); the same with `drivingForce inlet` (Eq. 3.72);
  (c) CO- and COUNTER-CURRENT: the unit's own profile re-derived outside it:
      R = k_Y (Y_sat(T_solid) - Y) f(Phi) with an independent Y_sat (1e-2),
      the integral of R over the area equals S (X_in - X_out) (1e-3), and Y(xi)
      follows the water balance exactly (1e-9) -- the way each arrangement runs;
  (d) THE ORDERING.  From the books: counter-current permits the lowest final
      moisture, parallel flow exposes the feed to the highest temperature
      (van 't Land, Drying in the Process Industry, p. 42, "Modes of Flow");
      fluid-bed and band dryers are cross-flow (same page).  So X_counter <
      X_co is the book's claim and is asserted.  Where cross-flow falls is
      not in the book; it is a RESULT of Eq. 3.66-3.78 and is asserted only as
      what these conditions give (X_counter < X_cross < X_co), each by the
      independent integration of (b) and of the profile of (c);
  (e) four refusals by name on copies of the witness: air recirculation,
      axial dispersion, a non-uniform air distribution, an air flow too small
      for the drying (an element cannot supply the heat or saturates), and an unknown drivingForce.

NOT CHECKED: any measured dryer (k_Y, X_c and the curve are hypothetical
teaching values); the solid's falling-rate warm-up; the T_ex band of 2 K is a
constant-cp hand balance, not the package's formation surface.
"""
import math
import re
import sys
import tempfile
from pathlib import Path

import case_records  # noqa: E402
import check_convective_dryer as ccd  # noqa: E402

ROOT = ccd.ROOT
DRY = ROOT / "tutorials/steady/drying"
C01 = DRY / "convDryer01_sugar_curve"
C02 = DRY / "convDryer02_sugar_countercurrent"
C03 = DRY / "convDryer03_sugar_crossflow"

MV = 18.015                       # kg/kmol
P = 1.0e5
A, KY, XC, EXPN = 300.0, 0.05, 0.12, 1.5      # the witnesses' declared values
CPD, CPV, CPS, CPL, LAM0 = 1.02, 1.88, 1.25, 4.19, 2501.0   # declared hand values


def fail(msg):
    print(f"check_dryer_arrangements: FAILED\n  {msg}")
    sys.exit(1)


def psat(T):
    """Wagner-Pruss (1993) saturation pressure of water, Pa -- independent of
    the engine's own record."""
    Tc, Pc = 647.096, 22.064e6
    t = 1 - T / Tc
    a = (-7.85951783, 1.84408259, -11.7866497, 22.6807411, -15.9618719, 1.80122502)
    s = (a[0] * t + a[1] * t ** 1.5 + a[2] * t ** 3 + a[3] * t ** 3.5
         + a[4] * t ** 4 + a[5] * t ** 7.5)
    return Pc * math.exp(Tc / T * s)


def kpis(out, unit):
    m = re.search(r'"' + unit + r'": (\{ "T_air[^{}]*\})', out)
    if not m:
        fail(f"no KPI row for dryer '{unit}'")
    import json
    return json.loads(m.group(1))


def run(case_dir):
    rc, out = ccd.run(case_dir)
    if rc != 0:
        fail(f"{case_dir.name} did not run (exit {rc}):\n{out[-800:]}")
    return out


def stream_mass(out, name):
    return ccd.block(out, name)["F_mass"]


def cross_flow_python(k, G, S, drivingForce="logMean", n=400, area=A):
    """Independent integration of Mujumdar Eq. 3.66-3.78 (cross-flow)."""
    Xin, Xeq, Yin, Tw = k["X_initial"], k["X_equilibrium_inlet_air"], \
        k["Y_air_in"], k["T_solid_out"]
    Mc = 28.96
    p = psat(Tw)
    ystar = MV / Mc * p / (P - p)

    def wdot(X):
        if X <= Xeq:
            return 0.0
        phi = min(1.0, (X - Xeq) / (XC - Xeq))
        f = phi ** EXPN
        if drivingForce == "logMean":
            return G * (ystar - Yin) * (1.0 - math.exp(-KY * area * f / G))
        return KY * area * f * (ystar - Yin)

    h, X = 1.0 / n, Xin
    for _ in range(n):
        k1 = -wdot(X) / S
        k2 = -wdot(X + 0.5 * h * k1) / S
        k3 = -wdot(X + 0.5 * h * k2) / S
        k4 = -wdot(X + h * k3) / S
        X += h * (k1 + 2 * k2 + 2 * k3 + k4) / 6.0
    return X, ystar


def exhaust_T_hand(k, S, G, Xout):
    """Constant-cp enthalpy balance (kJ/kg dry gas, datum 273.15 K, liquid
    water at the wet bulb): the exhaust temperature to a band of 2 K."""
    Tin, Tsin, Tw = 420.0, 330.0, k["T_solid_out"]
    Yin, Xin = k["Y_air_in"], k["X_initial"]
    Yex = Yin + S * (Xin - Xout) / G
    hin = (CPD + CPV * Yin) * (Tin - 273.15) + Yin * LAM0
    # the solid (and its water) brought from 330 K to the wet bulb gives heat
    step = S * (CPS + Xin * CPL) * (Tsin - Tw)
    evap = S * (Xin - Xout) * CPL * (Tw - 273.15)       # water leaves at Tw
    hex_ = hin + (step + evap) / G
    # h = (CPD + CPV Y) (T-273.15) + Y LAM0
    return 273.15 + (hex_ - Yex * LAM0) / (CPD + CPV * Yex), Yex


# ---- (f) the wet bulb: a floor that is refused, and a root that is checked ----
#
# DEFECT NAMED (third external review, 2026-11-25): psychrometry::wetBulb
# bisected from a floor of 273.65 K and never looked at the sign there nor at
# the final residual, so dry air at 1, 5 and 10 C returned 0.5 C.  Every
# caller of the shared function must now refuse such air BY ITS OWN NAME.

def wb_independent(T, Y, cpa=1.040, cpv=1.86):
    """Adiabatic-saturation temperature of N2 + water at 1 atm from raw
    inputs: Wagner-Pruss psat, lambda(T_C) = 2501 - 2.361 T_C kJ/kg, constant
    cp (kJ/kg K).  Bisection on  Y_sat(Twb) - Y - (cpa + Y cpv)(T - Twb)/lam."""
    P = 101325.0
    def f(Tw):
        ps = psat(Tw)
        ysat = (MV / 28.0134) * ps / (P - ps)
        lam = 2501.0 - 2.361 * (Tw - 273.15)
        return ysat - Y - (cpa + Y * cpv) * (T - Tw) / lam
    lo, hi = 273.15, T
    if f(lo) >= 0.0:
        return None
    for _ in range(200):
        m = 0.5 * (lo + hi)
        lo, hi = (lo, m) if f(m) >= 0.0 else (m, hi)
    return 0.5 * (lo + hi)


def wb_psychrometer(T, Y):
    """Second route: the psychrometer equation p_v = p_sat(Twb) - A P (T - Twb)
    with A = 6.6e-4 /K (ventilated bulb; the Lewis factor of the equation is
    about 0.95 against the adiabatic one), p_v from Y.  Differs from the
    adiabatic route by a few tenths of a K at these states."""
    P = 101325.0
    pv = P * Y / (Y + MV / 28.0134)
    lo, hi = 273.15, T
    g = lambda Tw: psat(Tw) - 6.6e-4 * P * (T - Tw) - pv
    if g(lo) >= 0.0:
        return None
    for _ in range(200):
        m = 0.5 * (lo + hi)
        lo, hi = (lo, m) if g(m) >= 0.0 else (m, hi)
    return 0.5 * (lo + hi)


def wet_bulb_checks(tmp):
    import shutil
    BATCH = ROOT / "tutorials/batch/drying/dryer01_sucrose_tray"
    TOWER = ROOT / "tutorials/steady/heat/coolingTower01_merkel"
    SOLID = DRY / "solidDryer01_sugar"
    EVAP = DRY / "evapDryer01_nacl"

    # (f1) the root, against the adiabatic-saturation equation from RAW inputs
    #      (not the engine's residual) and against the psychrometer equation.
    w = Path(tmp) / "wbB"
    case_records.copytree(BATCH, w)
    import subprocess
    p = subprocess.run([str(ROOT / "build/linux64Gcc/choupoBatch"), "."], cwd=w,
                       capture_output=True, text=True, timeout=600,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    out = p.stdout + p.stderr
    m = re.search(r'"T_wb":\s*([0-9.eE+-]+)', out)
    if p.returncode != 0 or not m:
        fail("(f1) batchDryer witness did not run / publish T_wb:\n" + out[-600:])
    Twb = float(m.group(1))
    ref = wb_independent(333.15, 0.010)
    ref2 = wb_psychrometer(333.15, 0.010)
    if ref is None or abs(Twb - ref) > 0.3:
        fail(f"(f1) batchDryer T_wb {Twb:.3f} K vs independent adiabatic-saturation"
             f" root {ref} K (band 0.3 K: hand cp and lambda)")
    if ref2 is None or abs(Twb - ref2) > 1.0:
        fail(f"(f1) batchDryer T_wb {Twb:.3f} K vs psychrometer-equation route"
             f" {ref2} K (band 1 K)")
    w = Path(tmp) / "wbT"
    case_records.copytree(TOWER, w)
    rc, o = ccd.run(w)
    m = re.search(r'"T_wb_in":\s*([0-9.eE+-]+)', o)
    if rc != 0 or not m:
        fail("(f1) cooling tower witness did not run:\n" + o[-600:])
    Tw2 = float(m.group(1))
    Yt = 1.3 * MV / (65 * 28.0134)
    ref = wb_independent(298.15, Yt)
    if ref is None or abs(Tw2 - ref) > 0.3:
        fail(f"(f1) cooling tower T_wb_in {Tw2:.3f} K vs independent root {ref} K")
    print(f"  wet bulb: batch dryer {Twb:.3f} K (independent {wb_independent(333.15, 0.010):.3f},"
          f" psychrometer eq. {wb_psychrometer(333.15, 0.010):.3f}); tower {Tw2:.3f} K"
          f" (independent {ref:.3f})")

    # (f2) every caller refuses dry air below freezing's wet bulb, by its name.
    def cold(case, rel, binary, unit, kind):
        pr = Path(tmp) / ("cold_" + case.name)
        if pr.exists():
            shutil.rmtree(pr)
        case_records.copytree(case, pr)
        f = pr / rel
        t = f.read_text()
        if kind == "stream":
            t = re.sub(r"\nT\s+[0-9.]+ K;", "\nT               278.15 K;", t, count=1)
            t = re.sub(r"(water\s+)[0-9.]+(\s+kmol/h;)", r"\g<1>0.000001\2", t, count=1)
        else:
            t = re.sub(r"T\s+333\.15 K;", "T        278.15 K;", t, count=1)
            t = re.sub(r"Y\s+0\.010;", "Y        0.0;", t, count=1)
        f.write_text(t)
        p = subprocess.run([str(ROOT / "build/linux64Gcc" / binary), "."], cwd=pr,
                           capture_output=True, text=True, timeout=600,
                           env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
        o = p.stdout + p.stderr
        if p.returncode == 0:
            fail(f"(f2) {case.name}: dry air at 5 C RAN -- the wet bulb of 0.5 C"
                 " would have been returned; the refusal is missing")
        if "below the bracket floor" not in o or unit not in o:
            fail(f"(f2) {case.name}: refused, but not by this unit's name"
                 f" ('{unit}') with the floor wording:\n{o[-600:]}")
    cold(C03, "0/hotAir", "choupoSolve", "dryer", "stream")
    cold(SOLID, "0/hotAir", "choupoSolve", "solidDryer", "stream")
    cold(EVAP, "0/hotGas", "choupoSolve", "dryer", "stream")
    cold(TOWER, "0/air", "choupoSolve", "CoolingTower", "stream")
    cold(BATCH, "system/flowsheetDict", "choupoBatch", "dryer", "dict")

    # (g) CURVE IDENTITY of the chart (third external review, 2026-11-25): the
    #     adiabatic / wet-bulb anchors were keyed with static_cast<int>, so
    #     `wetBulb (20.1 20.9)` drew two curves both named adiabatic:20.
    PSY = ROOT / "tutorials/props/heat/psychro02_air_water"
    pr = Path(tmp) / "chart"
    case_records.copytree(PSY, pr, ignore=shutil.ignore_patterns("expected", "log.*"))
    d = pr / "system/propsDict"
    t = d.read_text()
    t2 = re.sub(r"wetBulb\s+\([^)]*\);", "wetBulb ( 20 20.1 20.9 );", t, count=1)
    if t2 == t:
        fail("(g) could not rewrite the chart's wetBulb list")
    d.write_text(t2)
    p = subprocess.run([str(ROOT / "build/linux64Gcc/choupoProps"), "."], cwd=pr,
                       capture_output=True, text=True, timeout=600,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    if p.returncode != 0:
        fail("(g) the chart did not run:\n" + (p.stdout + p.stderr)[-600:])
    curves = {}
    for line in (pr / "psychroChart.csv").read_text().splitlines()[1:]:
        a = line.split(",")
        curves.setdefault(a[2], []).append((float(a[0]), float(a[1])))
    for fam in ("adiabatic", "wetbulb"):
        names = sorted(c for c in curves if c.startswith(fam + ":"))
        want = [f"{fam}:20", f"{fam}:20.1", f"{fam}:20.9"]
        if names != sorted(want):
            fail(f"(g) {fam} curves are {names}, want {sorted(want)}")
    # each decimal curve starts at ITS OWN saturation point (T = anchor), so
    # the three first points are three different temperatures, and the
    # integer key is the old spelling (psychro02's golden stays byte-identical).
    firsts = sorted(curves["adiabatic:" + s][0][0] for s in ("20", "20.1", "20.9"))
    if not (abs(firsts[0] - 20.0) < 1e-6 and abs(firsts[1] - 20.1) < 1e-6
            and abs(firsts[2] - 20.9) < 1e-6):
        fail(f"(g) adiabatic curves do not start at their anchors: {firsts}")


def main():
    if not ccd.BIN.exists():
        fail(f"{ccd.BIN} is missing -- build first")
    with tempfile.TemporaryDirectory() as tmp:
        outs = {}
        for tag, case in (("01", C01), ("02", C02), ("03", C03)):
            w = Path(tmp) / tag
            case_records.copytree(case, w)
            outs[tag] = run(w)

        # ---- the units under test -------------------------------------------
        units = [("01", "co", "airCo", "exhaustCo", "drySolidCo"),
                 ("01", "counter", "airCounter", "exhaustCounter", "drySolidCounter"),
                 ("02", "dryer", "hotAir", "exhaust", "drySolid"),
                 ("03", "dryer", "hotAir", "exhaust", "drySolid")]
        K = {}
        for tag, u, sa, se, sd in units:
            out = outs[tag]
            k = kpis(out, u)
            K[(tag, u)] = k
            ge = ccd.block(out, "globalEnergyBoundary")
            if abs(ge["residual_kW"]) > 1e-3 or abs(k["energyResidual_kW"]) > 1e-3:
                fail(f"(a) {tag}/{u}: first law -- plant {ge['residual_kW']:.3g}"
                     f" kW, unit {k['energyResidual_kW']:.3g} kW")
            picked = stream_mass(out, se) - stream_mass(out, sa)
            removed = k["water_removed_kg_s"]
            if abs(picked - removed) > 1e-9 * removed:
                fail(f"(a) {tag}/{u}: the air picked up {picked:.12g} kg/s,"
                     f" the solid lost {removed:.12g}")

        # ---- (b) cross-flow against an independent integration -----------------
        out3 = outs["03"]
        k3 = K[("03", "dryer")]
        S = stream_mass(out3, "wetSolid") / (1.0 + k3["X_initial"])
        G = stream_mass(out3, "hotAir") / (1.0 + k3["Y_air_in"])
        Xp, ystar = cross_flow_python(k3, G, S)
        if abs(Xp - k3["X_final"]) > 2e-3 * k3["X_final"]:
            fail(f"(b) cross-flow X_out: engine {k3['X_final']:.8g}, independent"
                 f" RK4 {Xp:.8g} (Eq. 3.66-3.73)")
        Tex, Yex = exhaust_T_hand(k3, S, G, k3["X_final"])
        if abs(Yex - k3["Y_air_out"]) > 1e-9 or abs(Tex - k3["T_air_out"]) > 2.0:
            fail(f"(b) cross-flow exhaust: engine Y {k3['Y_air_out']:.6g},"
                 f" T {k3['T_air_out']:.3f} K; hand balance Y {Yex:.6g},"
                 f" T {Tex:.3f} K (band 2 K)")
        prof = ccd.block(out3, "profiles")["dryer"]["columns"]
        X3, Y3, T3 = prof["X_kg_kg"], prof["Y_kg_kg"], prof["T_gas_K"]
        if any(b > a + 1e-15 for a, b in zip(X3, X3[1:])):
            fail("(b) cross-flow: the solid's moisture rises along the length")
        # the local air is fed fresh at every element: it never exceeds Y*
        if max(Y3) > ystar * (1 + 5e-3) or min(Y3) < k3["Y_air_in"] - 1e-12:
            fail("(b) cross-flow: a local air humidity outside [Y_in, Y*]")
        # the mix of the elements is what leaves: mass-mean of the local air
        # humidity over the unit equals the exhaust humidity (trapezoid)
        ymean = sum(0.5 * (a + b) for a, b in zip(Y3, Y3[1:])) / (len(Y3) - 1)
        if abs(ymean - k3["Y_air_out"]) > 2e-3 * k3["Y_air_out"]:
            fail(f"(b) cross-flow: the elements' mean humidity {ymean:.6g} is"
                 f" not the exhaust's {k3['Y_air_out']:.6g}")

        # the Eq. 3.72 form, run through the real reader
        fs = (C03 / "system/flowsheetDict").read_text()
        pin = Path(tmp) / "inlet"
        case_records.copytree(C03, pin)
        (pin / "system/flowsheetDict").write_text(
            fs.replace("flow              crossflow;",
                       "flow              crossflow;\n            drivingForce      inlet;")
              .replace("area              300 m2;", "area              30 m2;"))
        ki = kpis(run(pin), "dryer")
        Xpi, _ = cross_flow_python(k3, G, S, "inlet", area=30.0)
        if abs(Xpi - ki["X_final"]) > 2e-3 * ki["X_final"]:
            fail(f"(b) drivingForce inlet X_out: engine {ki['X_final']:.8g},"
                 f" independent {Xpi:.8g} (Eq. 3.72, A = 30 m2)")
        Xpl, _ = cross_flow_python(k3, G, S, "logMean", area=30.0)
        if not Xpl > ki["X_final"] > 0:
            fail("(b) 1 - exp(-x) <= x, so the inlet driving force (Eq. 3.72)"
                 " must dry at least as far as the log-mean one (Eq. 3.73)")

        # ---- (c) co- and counter-current profiles re-derived -------------------
        for tag, u, sa, se, sd in units[:3]:
            out, k = outs[tag], K[(tag, u)]
            sign = 1 if u == "co" else -1
            col = ccd.block(out, "profiles")[u]["columns"]
            X, Y, Ts, R, Phi, xi = (col["X_kg_kg"], col["Y_kg_kg"],
                                    col["T_solid_K"], col["R_kg_m2_s"],
                                    col["Phi"], col["position"])
            Sx = stream_mass(out, "wetSolid" if tag != "01" else
                             ("wetSolidCo" if u == "co" else "wetSolidCounter")) \
                / (1.0 + k["X_initial"])
            Gx = stream_mass(out, sa) / (1.0 + k["Y_air_in"])
            for i, (r, ts, y, ph) in enumerate(zip(R, Ts, Y, Phi)):
                p = psat(ts)
                ys = MV / 28.96 * p / (P - p)
                want = KY * (ys - y) * ph ** EXPN
                if r > 0 and abs(r - want) > 1e-2 * max(r, 1e-9) + 1e-9:
                    fail(f"(c) {tag}/{u} row {i}: R = {r:.6g}, independent"
                         f" k_Y (Y_sat - Y) f(Phi) = {want:.6g}")
            water = sum(0.5 * (a + b) * (x1 - x0) for a, b, x0, x1
                        in zip(R, R[1:], xi, xi[1:])) * A
            if abs(water - Sx * (k["X_initial"] - k["X_final"])) > \
                    1e-3 * water:
                fail(f"(c) {tag}/{u}: integral of R A = {water:.6g} kg/s,"
                     f" S (X_in - X_out) = "
                     f"{Sx * (k['X_initial'] - k['X_final']):.6g}")
            yref = (k["Y_air_in"] if sign == 1 else k["Y_air_out"])
            for xk, yk in zip(X, Y):
                yw = yref + sign * Sx * (k["X_initial"] - xk) / Gx
                if abs(yk - yw) > 1e-9:
                    fail(f"(c) {tag}/{u}: Y(xi) off the water balance")

        # ---- (d) the ordering --------------------------------------------------
        xco, xcn = K[("01", "co")]["X_final"], K[("01", "counter")]["X_final"]
        xc2, xcr = K[("02", "dryer")]["X_final"], k3["X_final"]
        if abs(xc2 - xcn) > 1e-3 * xcn:
            fail(f"(d) convDryer02 ({xc2:.8g}) is not convDryer01's counter-"
                 f"current dryer ({xcn:.8g}) on the same feed")
        if not xcn < xco:
            fail("(d) the book (van 't Land p. 42): counter-current permits a"
                 f" lower final moisture; got counter {xcn:.5g}, co {xco:.5g}")
        if not xcn < xcr < xco:
            fail(f"(d) the equations' ordering for these conditions: counter"
                 f" {xcn:.5g} < cross {xcr:.5g} < co {xco:.5g}")

        # ---- (e) refusals ------------------------------------------------------
        probes = [
            ("recirculation", fs.replace("flow              crossflow;",
             "flow              crossflow;\n            recirculation     0.5;"),
             "does not recirculate"),
            ("axial dispersion", fs.replace("flow              crossflow;",
             "flow              crossflow;\n            axialDispersion   0.01;"),
             "PLUG flow"),
            ("non-uniform air", fs.replace("flow              crossflow;",
             "flow              crossflow;\n            airDistribution   triangular;"),
             "must be `uniform`"),
            ("unknown drivingForce", fs.replace("flow              crossflow;",
             "flow              crossflow;\n            drivingForce      mean;"),
             "must be logMean"),
            ("too little air", None, "cannot supply the heat"),
            ("inlet force beyond Y*", fs.replace("flow              crossflow;",
             "flow              crossflow;\n            drivingForce      inlet;"),
             "over-states the rate"),
        ]
        air0 = (C03 / "0/hotAir").read_text()
        for label, text, needle in probes:
            pr = Path(tmp) / "probe"
            if pr.exists():
                import shutil
                shutil.rmtree(pr)
            case_records.copytree(C03, pr)
            if text is not None:
                (pr / "system/flowsheetDict").write_text(text)
            else:
                # one fiftieth of the air for the same drying
                new = re.sub(r"(N2|O2|Ar|water)(\s+)([0-9.]+)( kmol/h)",
                             lambda m: f"{m.group(1)}{m.group(2)}"
                             f"{float(m.group(3)) / 50:.10g}{m.group(4)}", air0)
                (pr / "0/hotAir").write_text(new)
            rc, o = ccd.run(pr)
            if rc == 0:
                fail(f"(e) probe '{label}': the case RAN -- the refusal is missing")
            if needle not in o:
                fail(f"(e) probe '{label}': refused, but not by name"
                     f" (expected '{needle}'):\n{o[-500:]}")

        wet_bulb_checks(tmp)

    print("check_dryer_arrangements: OK -- co-, counter- and cross-flow on one"
          " feed and one air: every dryer closes its water balance (1e-9) and"
          " first law (1e-3 kW); the cross-flow equals an independent RK4 of"
          " Mujumdar Eq. 3.66-3.73 (2e-3), also with the inlet driving force"
          " (3.72), and its exhaust a constant-cp hand balance (2 K); the"
          " co/counter profiles re-derive their rate law and water balance"
          " outside the unit; counter < co as the book says (van 't Land p."
          " 42) and counter < cross < co as these conditions give; five"
          " refusals by name; the wet bulb equals an independent adiabatic-saturation"
          " root (0.3 K) and the psychrometer equation (1 K), and dry air at 5 C"
          " is refused by name by five callers.  NOT checked: a measured dryer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
