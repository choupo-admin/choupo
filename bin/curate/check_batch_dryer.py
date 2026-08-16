#!/usr/bin/env python3
"""check_batch_dryer -- the drying curve closes on the case's OWN records, the
two periods are visible in the published columns, and the refusals fire by name.

CLAIM.  On the witness (tutorials/batch/drying/dryer01_sucrose_tray):

  A1  The GAB equilibrium moisture is REPRODUCED independently.  The gate
      reads the sucrose record's own `sorption { Xm; C; K; }`, the water
      record's own Antoine coefficients, both molar masses, and the case's
      declared air (T, Y) and tray pressure -- then forms the air's water
      activity ITSELF (a_w = P Y/(Y + Mv/Mc) / Psat(T_air)) and evaluates the
      GAB expression at it.  Nothing is taken from the engine's announcement,
      so this closes the whole chain a_w -> X_eq.  It does NOT check the
      sorption parameters themselves (sample data, curated) nor the Antoine
      fit (a curated correlation, extrapolation announced elsewhere).
  A2  The constant-rate flux is an identity on the same records:
      R_constant == k_Y (Y_sat(T_wb) - Y_air), with Y_sat recomputed from the
      water record's Antoine at the run's PUBLISHED T_wb.  The engine's own
      announcement line is separately checked to multiply out (k_Y * dY = R_c
      and R_c A over the declared area) at its printed precision, and the two
      latent KPIs are checked to be one quantity twice:
      latentEnergy_kJ / latentDuty_kW == (X_0 - X) m_s / (R_c A).
  A2b The WET BULB itself, re-solved here.  A2 evaluates Y_sat AT the
      published T_wb, so a damaged adiabatic-saturation solve moves T_wb and
      lets R_constant follow it -- the pair stays self-consistent and A2 sees
      nothing (sabotage S3 below, where A2b is the ONLY arm that fires).
      This arm bisects the same equation on the same records --
      Y_sat(T_wb) - Y = (cp_c + Y cp_v)(T_air - T_wb)/lambda(T_wb), Lewis = 1,
      the two ideal-gas Cp polynomials for the humid heat and the Watson
      latent heat off Tc/Tb/HvapTb -- and requires the published T_wb to
      1e-5 K (the width of the engine's own 1e-7 K bracket, not tighter).
      latentDuty_kW is then reproduced as R_c A lambda(T_wb) with that same
      Watson heat: the number A6 says is published INSTEAD of a ledgered duty
      is itself checked, so "not ledgered" cannot quietly become "not right".
  A3  The rate really vanishes AT X_eq.  A LONG-horizon copy (endTime 3000 ->
      40000 s, ~67 time constants) lands on the published X_equilibrium and
      stops: observed X_final - X_equilibrium = 0 at the result JSON's 12
      printed digits (2.3e-13 relative when recovered from n_water_final),
      published R at the last row 1.936e-18 kg/(m2 s) = 2.8e-15 of R_constant,
      the moisture column non-increasing throughout, never once below X_eq,
      and no negative rate anywhere.  This is the no-clamp claim in the class
      header, measured.  BLIND SPOT, found by sabotage S1 below: this arm sees
      WHERE the rate vanishes, not HOW it gets there -- a falling-rate law
      with the wrong slope still lands on X_eq and passes here.  A4's
      analytic-tail arm is what covers that.
  A4  The two periods are visible in the PUBLISHED columns.  While X > X_c the
      R column is flat to 6.9e-11 relative and equals R_constant; below X_c it
      is strictly decreasing.  The falling stretch is matched against the
      analytic tail the linear law integrates to,
      X = X_eq + (X_c - X_eq) exp(-(t - t_c)/tau) with
      tau = m_s (X_c - X_eq)/(R_c A) formed from the case's own charge and
      area (worst 5.8e-8 relative, the CSV's own 9-digit resolution), and the
      OBSERVED t_critical is checked against the analytic break time
      m_s (X_0 - X_c)/(R_c A) (1.3e-7 relative).
  A5  t_critical is OMITTED, not faked.  A short-horizon copy (endTime 500 s,
      inside the constant-rate period) publishes no `t_critical` key at all --
      the gate asserts the key's ABSENCE from the dryer KPI object and that
      the string never appears in the run.  A sentinel would pass an
      exit-code check and poison every downstream reader.
  A6  The energy ledger REFUSES rather than claiming: the campaign energy
      balance is UNAVAILABLE, energy_balance_available == 0, and the dryer's
      declared gap is quoted verbatim ("the drying duty is supplied by the
      DECLARED air environment ... outside the campaign boundary").
  A7  The declared-material residual is EXPLAINED, not discounted: the
      campaign announces that the residual MATCHES the unit's own declared
      prediction, element_worst_closure_vs_declared_rel is at round-off
      (7.1e-17 observed), nothing is reported as leaving through a ledgered
      boundary (mass_kg_external_out == 0), and the gate reproduces
      mass_residual_kg itself as (X_initial - X_final) m_s with m_s taken from
      n_sucrose_final and the record's molar mass.

REFUSALS (probe copies of the witness, each matched on its own text):
  R1  criticalMoisture below X_eq      -> "is not above the equilibrium moisture"
  R2  tray charged below X_eq          -> "BELOW the equilibrium moisture"
  R3  K a_w >= 1 (sorption K 1.2, wet air) -> "diverges at this air"
  R4  initial.P = 0                    -> "must be a positive absolute pressure"
  R5  sorption block deleted           -> "no component in the tray carries a"
  R6  air.carrier argon                -> "is not a component of this case"
  R7  the whole air {} block deleted   -> "operation.air {} is missing"
R6 and R7 need no record edit: the dry gas and the environment are DECLARED,
and nothing in this unit hardcodes "air", so both must refuse by name rather
than default to something.

THE SEAL, and how it was handled.  The witness is sealed
(`sealSchema computational;`, no `onDivergence` key, so the default is
`announce`).  Every probe is a COPY in a tempdir; the copy is byte-identical
so the witness, long and short runs all keep `"verdict": "verified"` -- the
gate asserts that.  R3 and R5 must edit a manifest-claimed record (the GAB K
and the sorption block live nowhere else), so those two copies diverge on
purpose: the gate REQUIRES the seal to say so ("[seal] ... changed
constant/components/sucrose.dat") in the same run it requires the refusal, so
the probe can never be mistaken for a clean case.  Nothing under
tutorials/ is written by this gate.

SABOTAGE RECORD (all three performed 2026-08-16 against this file as it
stands, `make all` between each and the engine reverted after; the failure
text below is the gate's OWN output, copied from the run.  S1 and S2 were
re-run after A2b/R6/R7 were added, so what is quoted is what this file
prints, not what an earlier one did):

  S1  BatchDryer.cpp falling-rate denominator (X_c_ - X_eq_) -> (X_c_ - 0.5 *
      X_eq_):

        check_batch_dryer: FAILED
          - A4: observed t_critical 1027.755459 s vs the analytic break m_s (X_0 - X_c)/(R_c A) 1027.734723 s
          - A4: falling-rate tail departs from X_eq + (X_c - X_eq) exp(-(t - t_c)/tau) by 6.658e-02 relative (worst row)

      AND A3 DID NOT FIRE -- which is the finding worth keeping.  That
      sabotage moves the SLOPE of the falling law, not its ZERO: the flux
      still vanishes at X_eq, so the long run still lands there with the rate
      at round-off and every A3 arm passes a law that is wrong by 6.7 % in
      shape.  A landing test alone does not verify a falling-rate law; the
      analytic-tail arm is what sees this, and t_critical moves at all only
      because the RK4 stages that straddle X_c mix the two branches.
  S2  kpis() published R_constant as 1.01 * R_c_:

        check_batch_dryer: FAILED
          - A2: R_constant KPI 7.075756e-04 vs k_Y * (Y_sat(T_wb) - Y_air) recomputed from the case's own Antoine record 7.005699e-04 (rel 9.90e-03)
          - A2: the announced R_c = 7.0057e-04 disagrees with the KPI 7.075756e-04 (rel 9.90e-03)
          - A2: the announced R_c A is not R_constant times the declared area
          - A2b: latentDuty_kW 0.864476040 kW vs R_c A lambda(T_wb) with the Watson latent heat recomputed here 0.873120801 kW -- the number A6 publishes INSTEAD of a ledgered duty must still be the right number
          - A2: the two latent KPIs are not one quantity twice: latentEnergy/latentDuty 1.601073447e+03 s vs (X_0 - X) m_s/(R_c A) 1.585221235e+03 s
          - A4: the flat R column 7.005699e-04 is not the published R_constant 7.075756e-04 (rel 9.90e-03)
          - A4: observed t_critical 1027.734851 s vs the analytic break m_s (X_0 - X_c)/(R_c A) 1017.559131 s
          - A4: falling-rate tail departs from X_eq + (X_c - X_eq) exp(-(t - t_c)/tau) by 9.346e-03 relative (worst row)

      Eight arms, and the announcement arm is the one that says WHY in a
      line: the unit announces one flux and publishes another.  A2b fires
      here in the OTHER direction, and it is worth reading twice -- the duty
      KPI is formed from R_c_ and is therefore still CORRECT, so the arm is
      reporting that the published flux and the published duty no longer
      describe the same evaporation.
  S3  BatchDryer.cpp initialise(), the wet-bulb residual: the vapour term
      dropped from the humid heat, (cpc + Y_air_ * cpv) -> (cpc):

        check_batch_dryer: FAILED
          - A2b: the wet bulb re-solved here (adiabatic saturation, Lewis = 1, on this case's own Cp fits and Watson latent heat) is 300.534289849 K vs the published T_wb 300.400562323 K

      ONE arm, and A2b is why it exists: every other arm passed a wet bulb
      wrong by 0.134 K.  A2 recomputes Y_sat at whatever T_wb the engine
      publishes, so the flux, the announcement, the trajectory, the break
      time, the tail and X_eq all stayed mutually consistent around a
      damaged psychrometric equation.  Self-consistency is not correctness.
  All three reverted, rebuilt, and the unmodified tree passes every arm.

NOT COVERED, said plainly: the Lewis = 1 hypothesis and the humid heat
evaluated at T_air (A2b re-solves the SAME equation on the same
approximations -- it verifies the engine's arithmetic, never the model's
physics), the sorption parameters and the Antoine fit
(curated sample/correlation data -- reproduced, never judged), whether the
LINEAR falling-rate law describes any real tray (it is announced as a
modelling choice and this gate checks that the engine integrates the law it
declares, not that the law is true), the solid's temperature history (a named
gap in the class header), and the golden values (runTests' own row
comparison carries those).
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
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
CASE = ROOT / "tutorials" / "batch" / "drying" / "dryer01_sucrose_tray"

failures = []


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BATCH), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def copy(tmp: Path, tag: str) -> Path:
    case = tmp / tag
    shutil.copytree(CASE, case,
                    ignore=shutil.ignore_patterns("expected", "log.*",
                                                  "reports", "converged",
                                                  "trajectory.csv"))
    return case


def kpis(out: str, unit: str):
    m = re.search(r'"' + re.escape(unit) + r'":\s*({[^{}]*})', out)
    return json.loads(m.group(1)) if m else None


def trajectory(case: Path):
    f = case / "trajectory.csv"
    if not f.exists():
        return None
    lines = [ln for ln in f.read_text().splitlines() if ln.strip()]
    head = lines[0].split(",")
    cols = {h: [] for h in head}
    for ln in lines[1:]:
        for h, v in zip(head, ln.split(",")):
            cols[h].append(float(v))
    return cols


def scalar_in(text: str, key: str, unit: str = ""):
    """The declared value of `key` in a dict file, read as the author wrote it."""
    pat = r'\b' + re.escape(key) + r'\s+(?:\[[^\]]*\]\s+)?([-\d.eE+]+)\s*' \
          + (re.escape(unit) if unit else "") + r'\s*;'
    m = re.search(pat, text)
    return float(m.group(1)) if m else None


def set_time(case: Path, key: str, value: str):
    cd = case / "system" / "controlDict"
    cd.write_text(re.sub(r'^(' + key + r'\s+)\S+;', r'\g<1>' + value + ';',
                         cd.read_text(), count=1, flags=re.M))


# -------------------------------------------------------------------------
#  The case's OWN records, read here so nothing below borrows the engine's
#  arithmetic: two molar masses, the water Antoine fit, the GAB isotherm.
# -------------------------------------------------------------------------
def records(case: Path):
    comp = case / "constant" / "components"
    water = (comp / "water.dat").read_text()
    n2 = (comp / "N2.dat").read_text()
    sucrose = (comp / "sucrose.dat").read_text()
    ant = re.search(r'vaporPressure\s*\{.*?coefficients\s*\(([^)]*)\)',
                    water, re.S)
    sorp = re.search(r'sorption\s*\{(.*?)\}', sucrose, re.S)
    r = {
        "Mv": scalar_in(water, "MW"),
        "Mc": scalar_in(n2, "MW"),
        "Msol": scalar_in(sucrose, "MW"),
        "antoine": [float(x) for x in ant.group(1).split()] if ant else None,
        #  What the wet-bulb equation needs, all from the same records: the
        #  Watson inputs for the latent heat and both ideal-gas Cp fits for
        #  the humid heat.
        "Tc": scalar_in(water, "Tc"),
        "Tb": scalar_in(water, "Tb"),
        "HvapTb": scalar_in(water, "HvapTb"),
        "cpV": coeffs_in(water, "idealGasHeatCapacity"),
        "cpC": coeffs_in(n2, "idealGasHeatCapacity"),
    }
    if sorp:
        for k in ("Xm", "C", "K"):
            r[k] = scalar_in(sorp.group(1), k)
    return r


def psat_pa(ant, T):
    #  Antoine in the published convention log10(Psat[bar]) = A - B/(T + C).
    A, B, C = ant
    return 10.0 ** (A - B / (T + C)) * 1.0e5


def coeffs_in(text: str, blockName: str):
    """The `coefficients ( ... )` of a named sub-dict, in declaration order."""
    m = re.search(re.escape(blockName) + r'\s*\{.*?coefficients\s*\(([^)]*)\)',
                  text, re.S)
    return [float(x) for x in m.group(1).split()] if m else None


def poly(c, T):
    return sum(a * T ** i for i, a in enumerate(c))


def main() -> int:
    if not BATCH.exists():
        print(f"check_batch_dryer: {BATCH} missing -- build first")
        return 1

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- WITNESS -------------------------------------------------------
        case = copy(tmp, "witness")
        rc, out = run(case)
        if rc != 0:
            failures.append(f"witness did not run (exit {rc})")
        k = kpis(out, "dryer")
        camp = kpis(out, "campaign")
        traj = trajectory(case)
        rec = records(case)
        fd = (case / "system" / "flowsheetDict").read_text()
        st0 = (case / "0" / "internalState").read_text()
        area = scalar_in(fd, "area", "m2")
        kY = scalar_in(fd, "k_Y")
        Xc_decl = scalar_in(fd, "criticalMoisture")
        #  The air block sits after criticalMoisture in the operation dict;
        #  anchoring there keeps the word "air" in the case header out of it.
        tail = fd[fd.rindex("criticalMoisture"):]
        air = re.search(r'\bair\b[^{]*\{(.*?)\}', tail, re.S).group(1)
        T_air = scalar_in(air, "T", "K")
        Y_air = scalar_in(air, "Y")
        P_bar = scalar_in(st0, "P", "bar")

        if not k or not camp or not traj:
            failures.append("witness KPIs or trajectory columns missing")
            k = k or {}
            camp = camp or {}
            traj = traj or {}
        if '"verdict": "verified"' not in out:
            failures.append("witness copy does not read as a verified seal --"
                            " the tempdir copy must be byte-identical")

        if k and camp and traj:
            P = P_bar * 1.0e5
            if abs(P - k["P_final"]) > 1e-6 * P:
                failures.append(f"declared tray pressure {P:.6g} Pa disagrees"
                                f" with the published P_final {k['P_final']:.6g}")
            if abs(Xc_decl - k["X_critical"]) > 1e-12:
                failures.append("declared criticalMoisture disagrees with the"
                                " published X_critical")

            # ---- A1: a_w and the GAB isotherm, both formed here -------------
            pv = P * Y_air / (Y_air + rec["Mv"] / rec["Mc"])
            aw = pv / psat_pa(rec["antoine"], T_air)
            aw = min(0.99, max(0.0, aw))
            Ka = rec["K"] * aw
            if Ka >= 1.0:
                failures.append("A1: the gate's own a_w puts the isotherm past"
                                " its pole -- the witness cannot be read")
            else:
                Xeq = rec["Xm"] * rec["C"] * Ka \
                    / ((1.0 - Ka) * (1.0 - Ka + rec["C"] * Ka))
                if abs(Xeq - k["X_equilibrium"]) > 1e-8 * k["X_equilibrium"]:
                    failures.append(
                        f"A1: GAB recomputed from the case's own records"
                        f" {Xeq:.9e} vs KPI X_equilibrium"
                        f" {k['X_equilibrium']:.9e}"
                        f" (a_w formed here = {aw:.6f})")

            # ---- A2: the constant-rate flux ---------------------------------
            ps_wb = psat_pa(rec["antoine"], k["T_wb"])
            Ysat = (rec["Mv"] / rec["Mc"]) * ps_wb / (P - ps_wb)
            Rc_indep = kY * (Ysat - Y_air)
            if abs(Rc_indep - k["R_constant"]) > 1e-8 * k["R_constant"]:
                failures.append(
                    f"A2: R_constant KPI {k['R_constant']:.6e} vs k_Y *"
                    f" (Y_sat(T_wb) - Y_air) recomputed from the case's own"
                    f" Antoine record {Rc_indep:.6e}"
                    f" (rel {abs(Rc_indep - k['R_constant']) / k['R_constant']:.2e})")

            ann = re.search(r'R_c = k_Y \(Y_sat\(T_wb\) - Y\) = ([\d.eE+-]+)'
                            r' \* ([\d.eE+-]+) = ([\d.eE+-]+) kg/\(m2 s\) ->'
                            r' ([\d.eE+-]+) kg/s over ([\d.eE+-]+) m2', out)
            if not ann:
                failures.append("A2: the constant-rate announcement line is"
                                " missing -- the unit must state the flux it"
                                " runs on")
            else:
                kY_a, dY_a, Rc_a, RcA_a, area_a = [float(g) for g in ann.groups()]
                if abs(kY_a - kY) > 1e-4 * kY:
                    failures.append("A2: the announced k_Y is not the declared"
                                    " one")
                if abs(area_a - area) > 1e-4 * area:
                    failures.append("A2: the announced area is not the declared"
                                    " one")
                if abs(kY_a * dY_a - Rc_a) > 2e-4 * Rc_a:
                    failures.append(f"A2: the announcement does not multiply"
                                    f" out: {kY_a:.4e} * {dY_a:.4e} !="
                                    f" {Rc_a:.4e}")
                if abs(Rc_a - k["R_constant"]) > 2e-4 * k["R_constant"]:
                    failures.append(
                        f"A2: the announced R_c = {Rc_a:.4e} disagrees with the"
                        f" KPI {k['R_constant']:.6e}"
                        f" (rel {abs(Rc_a - k['R_constant']) / k['R_constant']:.2e})")
                if abs(RcA_a - k["R_constant"] * area) > 2e-4 * RcA_a:
                    failures.append("A2: the announced R_c A is not R_constant"
                                    " times the declared area")

            # ---- A2b: the wet bulb itself, re-solved here -------------------
            #  A2 above recomputes Y_sat AT the published T_wb, so a damaged
            #  adiabatic-saturation solve moves T_wb and R_constant follows it
            #  -- both stay mutually consistent and A2 sees nothing (sabotage
            #  S3).  This arm closes that: the same equation, bisected here on
            #  the same records, plus the latent load the KPI hangs on.
            def lam_jkg(T):                       # Watson, J/kg
                return rec["HvapTb"] * ((rec["Tc"] - T)
                                        / (rec["Tc"] - rec["Tb"])) ** 0.38 \
                    / rec["Mv"] * 1000.0

            def y_sat(T):
                p = psat_pa(rec["antoine"], T)
                return (rec["Mv"] / rec["Mc"]) * p / (P - p)

            cpc = poly(rec["cpC"], T_air) / rec["Mc"] * 1000.0   # J/(kg K)
            cpv = poly(rec["cpV"], T_air) / rec["Mv"] * 1000.0

            def f_wb(T):
                return y_sat(T) - Y_air \
                    - (cpc + Y_air * cpv) * (T_air - T) / lam_jkg(T)

            lo, hi = 273.65, T_air
            for _ in range(200):
                mid = 0.5 * (lo + hi)
                if f_wb(mid) >= 0.0:
                    hi = mid
                else:
                    lo = mid
            T_wb_indep = 0.5 * (lo + hi)
            #  1e-5 K, not tighter: the engine stops its own bisection at
            #  1e-7 K and reports T_wb to 12 digits, so the two answers can
            #  differ by the width of that bracket and nothing more.
            if abs(T_wb_indep - k["T_wb"]) > 1e-5:
                failures.append(
                    f"A2b: the wet bulb re-solved here (adiabatic saturation,"
                    f" Lewis = 1, on this case's own Cp fits and Watson latent"
                    f" heat) is {T_wb_indep:.9f} K vs the published T_wb"
                    f" {k['T_wb']:.9f} K")
            duty = k["R_constant"] * area * lam_jkg(k["T_wb"]) / 1000.0
            if abs(duty - k["latentDuty_kW"]) > 1e-6 * duty:
                failures.append(
                    f"A2b: latentDuty_kW {k['latentDuty_kW']:.9f} kW vs R_c A"
                    f" lambda(T_wb) with the Watson latent heat recomputed"
                    f" here {duty:.9f} kW -- the number A6 publishes INSTEAD"
                    " of a ledgered duty must still be the right number")

            m_solid = k["n_sucrose_final"] * rec["Msol"]
            evap = (k["X_initial"] - k["X_final"]) * m_solid
            lhs = k["latentEnergy_kJ"] / k["latentDuty_kW"]
            rhs = evap / (k["R_constant"] * area)
            if abs(lhs - rhs) > 1e-8 * rhs:
                failures.append(f"A2: the two latent KPIs are not one quantity"
                                f" twice: latentEnergy/latentDuty {lhs:.9e} s"
                                f" vs (X_0 - X) m_s/(R_c A) {rhs:.9e} s")

            # ---- A4: the two periods in the published columns ---------------
            X = traj["dryer.X_kg_kg"]
            R = traj["dryer.R_kg_m2_s"]
            t = traj["t"]
            Xc, Xeq_k, Rc_k = k["X_critical"], k["X_equilibrium"], k["R_constant"]
            flat = [R[i] for i in range(len(t)) if X[i] > Xc]
            if len(flat) < 3:
                failures.append("A4: the witness shows no constant-rate rows")
            else:
                dev = max(abs(f - Rc_k) / Rc_k for f in flat)
                if dev > 1e-6:
                    failures.append(
                        f"A4: the flat R column {flat[0]:.6e} is not the"
                        f" published R_constant {Rc_k:.6e} (rel {dev:.2e})")
            below = [i for i in range(len(t)) if X[i] <= Xc]
            for i, j in zip(below, below[1:]):
                if j == i + 1 and not R[j] < R[i]:
                    failures.append(f"A4: the rate is not strictly decreasing"
                                    f" below X_c (t = {t[j]:.1f} s)")
                    break
            if "t_critical" not in k:
                failures.append("A4: the witness crosses X_c but publishes no"
                                " t_critical")
            else:
                tc = k["t_critical"]
                tc_an = m_solid * (k["X_initial"] - Xc) / (Rc_k * area)
                if abs(tc - tc_an) > 1e-5 * tc_an:
                    failures.append(f"A4: observed t_critical {tc:.6f} s vs the"
                                    f" analytic break m_s (X_0 - X_c)/(R_c A)"
                                    f" {tc_an:.6f} s")
                tau = m_solid * (Xc - Xeq_k) / (Rc_k * area)
                worst = 0.0
                for i in range(len(t)):
                    if X[i] <= Xc and t[i] > tc:
                        Xa = Xeq_k + (Xc - Xeq_k) * math.exp(-(t[i] - tc) / tau)
                        worst = max(worst, abs(Xa - X[i]) / X[i])
                if worst > 1e-5:
                    failures.append(
                        f"A4: falling-rate tail departs from X_eq + (X_c -"
                        f" X_eq) exp(-(t - t_c)/tau) by {worst:.3e} relative"
                        f" (worst row)")

            # ---- A6: the energy ledger refuses ------------------------------
            if k and "energy_balance_available" in camp \
                    and camp["energy_balance_available"] != 0:
                failures.append("A6: the campaign claims an energy balance the"
                                " dryer cannot price")
            if "energy balance UNAVAILABLE" not in out:
                failures.append("A6: the campaign energy balance does not"
                                " report itself UNAVAILABLE")
            gap = ("the drying duty is supplied by the DECLARED air"
                   " environment, which is outside the campaign boundary")
            if gap not in out:
                failures.append("A6: the dryer's declared energy gap is not"
                                " quoted in the UNAVAILABLE verdict")

            # ---- A7: the declared material residual -------------------------
            if "MATCHES the units' own declared prediction" not in out:
                failures.append("A7: the campaign does not report the residual"
                                " as MATCHING the unit's declared prediction")
            if camp.get("element_worst_closure_vs_declared_rel", 1.0) > 1e-12:
                failures.append(
                    "A7: the element closure against the DECLARED prediction is"
                    f" {camp.get('element_worst_closure_vs_declared_rel')}, not"
                    " round-off")
            if camp.get("mass_kg_external_out", 1.0) != 0.0:
                failures.append("A7: the evaporated water is reported as"
                                " leaving through a ledgered boundary")
            if abs(evap - camp["mass_residual_kg"]) > 1e-8 * evap:
                failures.append(
                    f"A7: campaign mass_residual_kg {camp['mass_residual_kg']:.9e}"
                    f" vs (X_initial - X_final) m_s recomputed here"
                    f" {evap:.9e} kg")

        # ---- A3: the rate vanishes AT X_eq --------------------------------
        lc = copy(tmp, "long")
        set_time(lc, "endTime", "40000")
        set_time(lc, "writeInterval", "500")
        rcl, outl = run(lc)
        kl = kpis(outl, "dryer")
        trl = trajectory(lc)
        if rcl != 0 or not kl or not trl:
            failures.append(f"A3: the long-horizon copy did not run (exit {rcl})")
        else:
            d = abs(kl["X_final"] - kl["X_equilibrium"])
            if d > 1e-9 * kl["X_equilibrium"]:
                failures.append(
                    f"A3: long run did not land on X_eq: X_final"
                    f" {kl['X_final']:.6e} vs X_equilibrium"
                    f" {kl['X_equilibrium']:.6e}"
                    f" (rel {d / kl['X_equilibrium']:.2e})")
            Rl = trl["dryer.R_kg_m2_s"]
            Xl = trl["dryer.X_kg_kg"]
            if Rl[-1] / kl["R_constant"] > 1e-12:
                failures.append(
                    f"A3: published rate at the last row is"
                    f" {Rl[-1] / kl['R_constant']:.3e} of R_constant, not"
                    f" round-off")
            if min(Rl) < 0.0:
                failures.append(f"A3: the published rate goes NEGATIVE"
                                f" ({min(Rl):.3e}) -- the law forbids it")
            if any(Xl[i + 1] > Xl[i] for i in range(len(Xl) - 1)):
                failures.append("A3: the moisture column is not monotone"
                                " non-increasing")
            floor = min(Xl) - kl["X_equilibrium"]
            if floor < -1e-9 * kl["X_equilibrium"]:
                failures.append(f"A3: the moisture falls BELOW X_eq by"
                                f" {-floor:.3e} kg/kg -- X_eq is approached"
                                f" from above or the law is broken")

        # ---- A5: t_critical omitted, not faked -----------------------------
        sc = copy(tmp, "short")
        set_time(sc, "endTime", "500")
        rcs, outs = run(sc)
        ks = kpis(outs, "dryer")
        if rcs != 0 or not ks:
            failures.append(f"A5: the short-horizon copy did not run (exit {rcs})")
        else:
            if ks["X_final"] <= ks["X_critical"]:
                failures.append("A5: the short copy left the constant-rate"
                                " period -- the probe proves nothing")
            if "t_critical" in ks:
                failures.append(f"A5: a run that never crossed X_c published"
                                f" t_critical = {ks['t_critical']}")
            if "t_critical" in outs:
                failures.append("A5: 't_critical' appears in a run that never"
                                " observed the crossing")

        # ---- REFUSALS ------------------------------------------------------
        def probe(tag, mutate, expect, seal_must_speak=False):
            c = copy(tmp, tag)
            mutate(c)
            rc2, out2 = run(c)
            if rc2 == 0 or expect not in out2:
                failures.append(f"{tag}: expected refusal containing"
                                f" '{expect}' (exit {rc2})")
            if seal_must_speak and "[seal]" not in out2:
                failures.append(f"{tag}: the probe edits a manifest-claimed"
                                f" record and the seal said nothing")

        def edit(path, old, new):
            def f(c):
                p = c / path
                p.write_text(p.read_text().replace(old, new))
            return f

        probe("R1_Xc_below_Xeq",
              edit("system/flowsheetDict", "criticalMoisture  0.12;",
                   "criticalMoisture  0.010;"),
              "is not above the equilibrium moisture")

        probe("R2_charged_below_Xeq",
              lambda c: (c / "0" / "internalState").write_text(
                  (c / "0" / "internalState").read_text()
                  .replace("totalMoles   0.039148458;",
                           "totalMoles   0.006398;")
                  .replace("molarComposition  { sucrose 0.14924928;"
                           "  water 0.85075072; }",
                           "molarComposition  { sucrose 0.913236;"
                           "  water 0.086764; }")),
              "BELOW the equilibrium moisture")

        probe("R3_gab_pole",
              lambda c: (edit("constant/components/sucrose.dat",
                              "K    0.96;", "K    1.20;")(c),
                         edit("system/flowsheetDict",
                              "Y        0.010;", "Y        0.500;")(c)),
              "diverges at this air", seal_must_speak=True)

        probe("R4_zero_pressure",
              edit("0/internalState", "P            1.013 bar;",
                   "P            0.0 bar;"),
              "must be a positive absolute pressure")

        probe("R5_no_sorption",
              lambda c: (c / "constant" / "components" / "sucrose.dat").write_text(
                  re.sub(r'sorption\s*\{.*?\}', "",
                         (c / "constant" / "components"
                          / "sucrose.dat").read_text(), flags=re.S)),
              "no component in the tray carries a", seal_must_speak=True)

        #  Two more that need no record edit at all: the declared dry gas and
        #  the air block itself.  Nothing in this unit hardcodes "air", so
        #  both must refuse by name rather than default to something.
        probe("R6_unknown_carrier",
              edit("system/flowsheetDict", "carrier  N2;", "carrier  argon;"),
              "is not a component of this case")

        probe("R7_no_air_block",
              lambda c: (c / "system" / "flowsheetDict").write_text(
                  re.sub(r'\n            air.*?\n            \}\n', "\n",
                         (c / "system" / "flowsheetDict").read_text(),
                         flags=re.S)),
              "operation.air {} is missing")

    if failures:
        print("check_batch_dryer: FAILED")
        for f in failures:
            print("  - " + f)
        return 1

    print("check_batch_dryer: OK -- the GAB equilibrium moisture is reproduced"
          " from the case's OWN records (the air's water activity formed here"
          " from the Antoine fit, the two molar masses and the declared air,"
          " never from the engine), the constant-rate flux closes as k_Y"
          " (Y_sat(T_wb) - Y) and the unit's announcement multiplies out, the"
          " wet bulb is re-solved here from the same records (adiabatic"
          " saturation, Lewis = 1, the two Cp fits and the Watson latent"
          " heat) and the latent duty with it, the"
          " published rate column is flat at R_constant above X_c and"
          " strictly decreasing below it along the exponential tail the"
          " declared linear law integrates to, a 40000 s copy lands ON X_eq"
          " with the rate at round-off and never a negative value, a 500 s"
          " copy publishes NO t_critical key (absence, not a sentinel), the"
          " energy balance reports UNAVAILABLE quoting the dryer's declared"
          " gap, the declared material residual is reproduced here and"
          " announced as explained, and seven refusals (X_c below X_eq, a"
          " tray charged below X_eq, the GAB pole, P = 0, no sorption record,"
          " an undeclared carrier, no air block) fire by name.  NOT COVERED:"
          " the Lewis = 1 and humid-heat hypotheses (the same equation is"
          " re-solved, never judged), the curated sorption and Antoine"
          " parameters, whether the LINEAR falling-rate law describes any"
          " real tray, and the golden values (runTests' own rows).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
