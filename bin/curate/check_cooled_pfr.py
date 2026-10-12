#!/usr/bin/env python3
"""Gate: the cooled multitubular pfr computes what it claims, and refuses by name.

    bin/curate/check_cooled_pfr.py

WHY THIS EXISTS (DEV.md 4c C69, 2026-10-12).  The multi-reaction `pfr` in
`thermalMode heatExchange` gained catalyst TUBES (`operation.tubes`), a
packed-bed WALL correlation object for the bed side of the coefficient
(`wallHeatTransfer { model LiFinlayson; }`, reactor/wallHeatTransfer/) in
series with the tube wall and a declared coolant film, and a COOLANT with its
own energy balance (`coolant { arrangement coCurrent|counterCurrent|boiling;
... }`) -- counter-current being a two-point boundary-value problem the unit
SHOOTS.  A golden pins what a run PRINTS, so it cannot say whether the
coefficient is Li & Finlayson's or whether the shot landed on the right
boundary condition; this gate recomputes both.

WHAT THIS GATE CHECKS:

  (a) THE WALL COEFFICIENT, recomputed by hand on the witness
      `tutorials/steady/reactors/pfr05_cooled_multitubular`: Re_p = d_p G/mu,
      Pr = cp mu/lambda, U_w = (lambda/d_t) 2.26 Re^0.8 Pr^0.33 exp(-6 d_p/d_t)
      (spheres), and the overall 1/U = 1/U_w + d_i ln(d_o/d_i)/(2 k_w) +
      (d_i/d_o)/h_c -- from the run's own published gas properties and the
      CASE's declared geometry, wall and film -- at 1e-10 relative.  The
      constants are the transcription in LiFinlayson.H; the gate holds the
      engine to them, and prints the source they were read in.
  (b) THE COOLANT AND THE HOT SPOT on the witness (co-current): the coolant's
      own balance m cp (T_out - T_in) equals the duty the bed lost
      (Q_coolant_kW = -Q_kW) at 1e-9; the profile's T_coolant starts at T_in;
      T_max is the profile's maximum and hotSpot_z_m is its volume over the
      cross-section; the design spec put the hot spot at its 665 K limit.
  (c) THE BOUNDARY-VALUE PROBLEM, against an INDEPENDENT integration.  A
      non-reacting copy (pure N2 at 700 K, a declared U, no pressure drop,
      coolant at 600 K) is run CO-current and COUNTER-current; the gate
      integrates the same two ODEs itself -- H(T) from N2's own ideal-gas Cp
      polynomial read from data/standards/components/N2.dat, RK4 on the same
      400 steps, and its OWN bisection shooting for the counter-current case
      -- and holds the engine's gas outlet and coolant outlet temperatures to
      it at 1e-5 K, and the counter-current coolant's arrival at the bed
      outlet to its declared T_in.  A sign error in either coolant equation,
      or a shot that stopped at the wrong root, moves these by kelvins.
  (d) THE SIZER on the witness's sheet: nTubes = ceil(nTubesSolved), A =
      pi d_o L N, shellID = d_o (N/0.319)^(1/2.142) + 0.012 (Sinnott, one
      pass, triangular -- htc/ShellTubeDesign's constants), the catalyst
      charge = the BUILT tubes' volume x the unit's catalystLoading.
  (e) EVERY REFUSAL FIRES BY NAME (13 probes): V_R beside tubes.length;
      L_over_D beside tubes; areaPerVolume beside tubes; U beside
      wallHeatTransfer; T_coolant beside coolant; a film beside a declared U;
      no particle shape; an unknown arrangement; a boiling coolant with a
      flow; cp AND utility; wallHeatTransfer with no coolant block; a coolant
      in adiabatic mode; an unknown wall model.
  (f) THE LEGACY FORM IS UNTOUCHED: `U`, `areaPerVolume`, `T_coolant` on
      pfr04 publish none of the C69 KPIs.  (Byte-identity of every corpus pfr
      case's log, result JSON and written files against the parent build was
      measured by hand, DEV.md 4c C69; this arm is the re-runnable part.)

WHAT THIS DOES NOT CHECK, said plainly:
  * whether Li & Finlayson's correlation is RIGHT for this catalyst: nothing
    here measures a bed (an arithmetic anchor proves a transcription);
  * the source's own Table 4 critical pressures: the witness departs from the
    source on purpose (local p_O2, a computed U, a lumped heat), see its
    constant/reactions;
  * a counter-current bed with SEVERAL steady states: the shooting reports
    the one its bracket found, and so does this gate's.

SABOTAGES PERFORMED (by hand, 2026-10-12), each against this gate:
  S1  the sphere exponent 0.8 -> 0.85 in LiFinlayson.H.  Caught by (a).
  S2  the counter-current coolant equation given the co-current sign
      (`(wx.mode == CoolantMode::coCurrent ? -q : q)` -> `-q`).  Caught by (c).
  S3  the wall resistance dropped from the series sum.  Caught by (a).
  S4  the sizer's ceil() replaced by a truncation.  Caught by (d).
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials/steady/reactors/pfr05_cooled_multitubular"
PFR04 = ROOT / "tutorials/steady/reactors/pfr04_adiabatic"
N2DAT = ROOT / "data/standards/components/N2.dat"


def run(case):
    p = subprocess.run([str(SOLVE)], cwd=str(case), capture_output=True,
                       text=True, timeout=900)
    out = p.stdout + p.stderr
    js = None
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    return p.returncode, out, js


def copy(src, td):
    dst = Path(td) / "case"
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "reports", "converged", "log.*", "iterations", "design",
        "designspec_history.csv"))
    return dst


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


#  The witness's operation block, as a template the probes edit.
OP_RE = re.compile(r"        operation\n        \{.*?\n        \}\n", re.S)


def with_operation(case, new_op, drop_outer=True, drop_post=True):
    fs = case / "system/flowsheetDict"
    txt = fs.read_text()
    m = OP_RE.search(txt)
    assert m, "witness flowsheetDict layout changed; update this gate"
    fs.write_text(txt[:m.start()] + new_op + txt[m.end():])
    if drop_outer and (case / "system/outerDict").exists():
        (case / "system/outerDict").unlink()
    if drop_post and (case / "system/postDict").exists():
        (case / "system/postDict").unlink()


BASE_OP = """        operation
        {
            nSteps           400;
            thermalMode      heatExchange;
            catalystLoading  1300;
            tubes { count 3000; innerDiameter 0.025 m; length 2 m;%(tubeExtra)s }
            catalyst { particleDiameter 2 mm;%(shape)s }
%(extra)s        }
"""

GOOD_WALL = """            wallHeatTransfer { model LiFinlayson; }
            coolant { arrangement coCurrent; T_in 625 K; flow 20 kg/s; cp 1299.13; film 1000; }
"""


def op(extra=GOOD_WALL, shape=" shape sphere;",
       tubeExtra=" wallThickness 1.65 mm; wallConductivity 16;"):
    return BASE_OP % {"extra": extra, "shape": shape, "tubeExtra": tubeExtra}


# ---- the independent integration of arm (c) -------------------------------
def n2_cp():
    t = N2DAT.read_text()
    blk = re.search(r"idealGasHeatCapacity\s*\{(.*?)\}", t, re.S).group(1)
    co = re.search(r"coefficients\s*\(([^)]*)\)", blk).group(1).split()
    return [float(x) for x in co]


def march_python(c, F, T0, V, U, aV, mcp, Tc0, counter, n=400):
    """RK4 on y = [H (W), Tc], H the N2 enthalpy flow above 298.15 K."""
    a0, a1, a2, a3 = c

    def h(T):      # J/mol, integral of the polynomial from 298.15 K
        f = lambda x: a0 * x + a1 * x * x / 2 + a2 * x ** 3 / 3 + a3 * x ** 4 / 4
        return f(T) - f(298.15)

    def cp(T):
        return a0 + a1 * T + a2 * T * T + a3 * T ** 3

    def T_of(H):
        T = T0
        for _ in range(60):
            dT = (H / F - h(T)) / cp(T)
            T += dT
            if abs(dT) < 1e-13:
                break
        return T

    def f(y):
        T = T_of(y[0])
        q = U * aV * (y[1] - T)
        return [q, (q if counter else -q) / mcp]

    y = [F * h(T0), Tc0]
    dV = V / n
    for _ in range(n):
        k1 = f(y)
        k2 = f([y[i] + 0.5 * dV * k1[i] for i in range(2)])
        k3 = f([y[i] + 0.5 * dV * k2[i] for i in range(2)])
        k4 = f([y[i] + dV * k3[i] for i in range(2)])
        y = [y[i] + dV / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) for i in range(2)]
    return T_of(y[0]), y[1]


def main() -> int:
    fails, claims = [], []
    if not SOLVE.exists():
        print("check_cooled_pfr: CANNOT RUN -- no native build at " + str(SOLVE))
        return 1

    # ---- (a) (b) (d) the witness, as shipped ----------------------------
    with tempfile.TemporaryDirectory() as td:
        case = copy(CASE, td)
        rc, out, js = run(case)
        if rc != 0 or js is None:
            print("check_cooled_pfr: FAIL -- the witness did not run (exit %d):\n%s"
                  % (rc, out[-1500:]))
            return 1
        k = js["kpis"]["reactor"]
        dp, dt, do, kw, hc = 0.002, 0.025, 0.025 + 2 * 1.65e-3, 16.0, 1000.0
        G, mu, lam, cpm = k["G_tube_kg_m2_s"], k["mu_gas_wall_in"], \
            k["lambda_gas_wall_in"], k["cp_gas_wall_in"]
        Re = dp * G / mu
        Pr = cpm * mu / lam
        Nu = 2.26 * Re ** 0.8 * Pr ** 0.33 * math.exp(-6 * dp / dt)
        Ub = Nu * lam / dt
        U = 1.0 / (1.0 / Ub + dt * math.log(do / dt) / (2 * kw) + (dt / do) / hc)
        for key, ref in (("Re_p_wall_in", Re), ("Pr_wall_in", Pr), ("Nu_wall_in", Nu),
                         ("U_bed_in", Ub), ("U_in", U)):
            if rel(k[key], ref) > 1e-10:
                fails.append(f"(a) {key} = {k[key]!r}, by hand {ref!r}")
        # G itself: the feed's mass flow over the tubes' cross-section
        mdot = js["streams"]["feed"].get("F_mass")          # kg/s
        if mdot is None:
            fails.append("(a) the feed stream publishes no F_mass -- G cannot be checked")
        else:
            Gref = mdot / (k["nTubes"] * math.pi * dt * dt / 4)
            if rel(G, Gref) > 1e-10:
                fails.append(f"(a) G = {G!r}, feed mass flow / tube cross-section {Gref!r}")
        if "Li & Finlayson" not in out or "Iordanidis" not in out:
            fails.append("(a) the run does not name the correlation's source and"
                         " the document it was read in")
        claims.append(f"(a) Li-Finlayson U_w {Ub:.4f} and overall U {U:.4f} W/m2/K"
                      " recomputed at 1e-10")

        # (b) the coolant's balance and the hot spot
        mcp = 20.0 * 1299.13
        Qc = mcp * (k["T_coolant_out"] - k["T_coolant_in"]) / 1000.0
        if rel(Qc, k["Q_coolant_kW"]) > 1e-9 or rel(-k["Q_kW"], k["Q_coolant_kW"]) > 1e-9:
            fails.append(f"(b) coolant m cp dT = {Qc!r} kW, Q_coolant_kW = "
                         f"{k['Q_coolant_kW']!r}, -Q_kW = {-k['Q_kW']!r}")
        prof = js["profiles"]["reactor"]["columns"]
        T, V, Tc = prof["T"], prof["V"], prof["T_coolant"]
        imax = max(range(len(T)), key=lambda i: T[i])
        if abs(T[imax] - k["T_max"]) > 1e-9 or abs(V[imax] - k["hotSpot_V_m3"]) > 1e-10:
            fails.append("(b) T_max / hotSpot_V_m3 are not the profile's maximum")
        if rel(k["hotSpot_z_m"], V[imax] / k["A_bed_m2"]) > 1e-10:
            fails.append("(b) hotSpot_z_m is not V_hot / A")
        if abs(Tc[0] - 625.0) > 1e-9 or abs(Tc[-1] - k["T_coolant_out"]) > 1e-9:
            fails.append("(b) the co-current coolant profile does not start at T_in"
                         " and end at T_coolant_out")
        if abs(k["T_max"] - 665.0) > 0.01:
            fails.append(f"(b) the design spec left the hot spot at {k['T_max']} K,"
                         " not its 665 K limit")
        claims.append(f"(b) coolant balance closes ({Qc:.3f} kW); hot spot "
                      f"{k['T_max']:.2f} K at z = {k['hotSpot_z_m']:.3f} m, "
                      f"{k['nTubes']:.2f} tubes solved")

        # (d) the sizer
        eq = {e["item"]: e for e in js.get("equipment", [])}
        r, ch = eq.get("reactor/reactor"), eq.get("reactor/catalystCharge")
        if not r or not ch:
            fails.append("(d) the witness published no reactor/reactor or"
                         " reactor/catalystCharge item")
        else:
            v = r["values"]
            N = math.ceil(k["nTubes"] - 1e-9)
            A = math.pi * do * 2.0 * N
            Ds = do * (N / 0.319) ** (1 / 2.142) + 0.012
            m = N * math.pi * dt * dt / 4 * 2.0 * 1300.0
            for key, got, ref in (("nTubes", v["nTubes"], N), ("A", v["A"], A),
                                  ("shellID", v["shellID"], Ds),
                                  ("m_catalyst_kg", ch["values"]["m_catalyst_kg"], m)):
                if rel(got, ref) > 1e-10:
                    fails.append(f"(d) {key} = {got!r}, by hand {ref!r}")
            claims.append(f"(d) {N} tubes, A {A:.3f} m2, shell ID {Ds:.4f} m, "
                          f"catalyst {m:.1f} kg recomputed")

    # ---- (c) the boundary-value problem, independently --------------------
    c = n2_cp()
    F = 230.0 / 3600.0 * 1000.0                   # mol/s of N2
    V = 3000 * math.pi * 0.025 ** 2 / 4 * 2.0
    Ud, aV, mcp = 10.0, 4 / 0.025, 2.0 * 1300.0
    for arr in ("coCurrent", "counterCurrent"):
        with tempfile.TemporaryDirectory() as td:
            case = copy(CASE, td)
            with_operation(case, op(
                extra="            U 10;\n            coolant { arrangement %s;"
                      " T_in 600 K; flow 2 kg/s; cp 1300; }\n" % arr, shape=""))
            f0 = case / "0/feed"
            t = f0.read_text()
            t = re.sub(r"componentMolarFlows\s*\{.*?\}\n",
                       "componentMolarFlows\n{\n    N2  230 kmol/h;\n}\n", t, flags=re.S)
            t = re.sub(r"\nT\s+625 K;", "\nT               700 K;", t)
            f0.write_text(t)
            rc, out, js = run(case)
            if rc != 0 or js is None:
                fails.append(f"(c) the non-reacting {arr} copy did not run (exit {rc}):"
                             f" {out[-400:]}")
                continue
            k = js["kpis"]["reactor"]
            counter = (arr == "counterCurrent")
            if counter:
                lo, hi = 600.0, 700.0
                for _ in range(200):
                    mid = 0.5 * (lo + hi)
                    _, TcE = march_python(c, F, 700.0, V, Ud, aV, mcp, mid, True)
                    if TcE > 600.0:
                        hi = mid
                    else:
                        lo = mid
                Tc0 = 0.5 * (lo + hi)
                Tout, TcEnd = march_python(c, F, 700.0, V, Ud, aV, mcp, Tc0, True)
                Tcout = Tc0
                prof = js["profiles"]["reactor"]["columns"]["T_coolant"]
                if abs(prof[-1] - 600.0) > 1e-6:
                    fails.append(f"(c) the counter-current coolant reaches the bed"
                                 f" outlet at {prof[-1]!r} K, not its T_in 600 K")
                if "two-point boundary-value problem" not in out:
                    fails.append("(c) the counter-current shooting was not announced")
            else:
                Tout, Tcout = march_python(c, F, 700.0, V, Ud, aV, mcp, 600.0, False)
            for key, ref in (("T_out", Tout), ("T_coolant_out", Tcout)):
                if abs(k[key] - ref) > 1e-5:
                    fails.append(f"(c) {arr}: {key} = {k[key]!r} K, the independent"
                                 f" integration {ref!r} K")
            claims.append(f"(c) {arr}: gas {k['T_out']:.5f} K, coolant out "
                          f"{k['T_coolant_out']:.5f} K = independent RK4 (max "
                          f"|diff| {max(abs(k['T_out'] - Tout), abs(k['T_coolant_out'] - Tcout)):.1e} K)"
                          + (" + bisection shooting" if counter else ""))

    # ---- (e) refusals ----------------------------------------------------
    probes = [
        ("V_R beside tubes.length", op(extra=GOOD_WALL + "            V_R 3;\n"), "tubes.length"),
        ("L_over_D beside tubes", op(extra=GOOD_WALL + "            L_over_D 6;\n"), "L_over_D"),
        ("areaPerVolume beside tubes", op(extra=GOOD_WALL + "            areaPerVolume 160;\n"),
         "areaPerVolume"),
        ("U beside wallHeatTransfer", op(extra=GOOD_WALL + "            U 90;\n"), "operation.U"),
        ("T_coolant beside coolant", op(extra=GOOD_WALL + "            T_coolant 625 K;\n"),
         "T_coolant"),
        ("film beside a declared U", op(extra="            U 90;\n            coolant {"
                                        " arrangement coCurrent; T_in 625 K; flow 20 kg/s;"
                                        " cp 1299.13; film 1000; }\n"), "coolant.film"),
        ("no particle shape", op(shape=""), "shape"),
        ("unknown arrangement", op(extra=GOOD_WALL.replace("coCurrent", "crossFlow")),
         "crossFlow"),
        ("boiling with a flow", op(extra=GOOD_WALL.replace("coCurrent", "boiling")),
         "BOILING"),
        ("cp and utility", op(extra=GOOD_WALL.replace("film 1000;",
                                                      "film 1000; utility hitecSalt;")),
         "ONE place"),
        ("wall model, no coolant", op(extra="            wallHeatTransfer { model"
                                      " LiFinlayson; }\n            T_coolant 625 K;\n"),
         "coolant"),
        ("coolant in adiabatic mode", op(extra=GOOD_WALL).replace(
            "thermalMode      heatExchange;", "thermalMode      adiabatic;"), "heatExchange"),
        ("unknown wall model", op(extra=GOOD_WALL.replace("LiFinlayson", "Leva1949")),
         "Leva1949"),
    ]
    for label, opblock, expect in probes:
        with tempfile.TemporaryDirectory() as td:
            case = copy(CASE, td)
            with_operation(case, opblock)
            rc, out, _ = run(case)
            if rc == 0:
                fails.append(f"(e) {label}: ran to exit 0 -- no refusal")
            elif expect not in out:
                fails.append(f"(e) {label}: refused without naming `{expect}`:"
                             f" ...{out[-300:]}")
    claims.append(f"(e) {len(probes)} refusals fired by name")

    # ---- (f) the legacy form ----------------------------------------------
    with tempfile.TemporaryDirectory() as td:
        case = copy(PFR04, td)
        fs = case / "system/flowsheetDict"
        t = fs.read_text()
        t2 = re.sub(r"thermalMode\s+adiabatic;[^\n]*",
                    "thermalMode heatExchange; U 300; areaPerVolume 200; T_coolant 340 K;", t)
        fs.write_text(t2)
        rc, out, js = run(case)
        k = (js or {}).get("kpis", {}).get("reactor", {})
        if t2 == t or rc != 0:
            fails.append("(f) the legacy heatExchange copy of pfr04 did not run")
        elif any(x in k for x in ("T_coolant_out", "Q_coolant_kW", "U_in", "hotSpot_V_m3")):
            fails.append("(f) the legacy U/areaPerVolume/T_coolant form publishes C69 KPIs")
    claims.append("(f) the legacy form publishes no C69 KPI")

    if fails:
        print("check_cooled_pfr: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print("check_cooled_pfr: OK -- " + "; ".join(claims))
    return 0


if __name__ == "__main__":
    sys.exit(main())
