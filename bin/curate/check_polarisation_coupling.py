#!/usr/bin/env python3
"""Gate: the multi-ionic concentration-polarisation model of Geraldes & Afonso
(2007) is what the engine computes, reduces to the film model it replaced,
and does something when switched on.
    bin/curate/check_polarisation_coupling.py

WHY THIS EXISTS.  Until 2026-09-15 three transport laws carried three copies
of `c_m = c_p + (c_b - c_p) exp(J_v/k)` on ONE film coefficient priced with
ONE diffusivity, so an ion-declared feed had every ion polarising alone and
at the same rate; the SDEM banner said so every run.  The model of Geraldes
& Afonso, J. Membr. Sci. 300 (2007) 20-27 (doi:10.1016/j.memsci.2007.04.025)
gives each ion its own mass-transfer coefficient on its own diffusivity,
corrects it for suction (Geraldes & Afonso, AIChE J. 52 (2006) 3353), and
couples the ions by ONE interface potential gradient fixed by
electroneutrality at the wall -- no film thickness, no new parameter.  It
lives in ONE home (src/unitOperations/membrane/massTransfer/Polarisation.*)
that every law asks.  Three claims must be pinned: the engine solves the
paper's equations (not a look-alike), the defaults reproduce the film model
every golden was recorded on, and the coupling is SEEN to act.

WHAT THIS GATE CHECKS (every case is RUN here; nothing is read from a stale
converged/):
  (a) THE PAPER'S CASE STUDY, RECOMPUTED INDEPENDENTLY.  The props witness
      `polarisation01_geraldes_afonso_table1` runs the `polarisationIndex` op
      on the paper's Table 1 (Bowen & Mohammad 1998 data); this gate reads
      the SAME data file, the correlation constants and the ions' D0 from
      the records, derives Na+ by electroneutrality as the table's footnote
      says, and solves Eqs. (25)-(28) -- with Xi from Eq. (5) -- in Python
      (bisection on xi', nothing shared with the engine).  Every Gamma_i and
      every xi must agree to 1e-8 relative.  xi is pinned as well as Gamma
      because a SIGN FLIP of the migration term leaves every C_m unchanged
      and merely flips xi: Gamma alone could not see it.
  (b) THE SINGLE-SALT IDENTITY, Eq. (20) with Eqs. (19), (23), (24).  A
      two-ion case (Na+ Cl-, D1 != D2) built from the witness in a temp dir
      is run through the op; from its C_m the intrinsic rejection R is
      formed and the paper's closed form Gamma = R/(eta Xi_1/phi_1 +
      (1-eta) Xi_2/phi_2 - R) must equal the op's Gamma to 1e-10, and the
      op's per-ion phi_i must equal Eq. (23)/(24)'s [eta(1+z1/|z2|)]^(1-c) phi
      on the salt's D_S (Eq. 9) to 1e-10.
  (c) THE FILM-THEORY REDUCTION.  With `suctionCorrection filmTheory;
      ionCoupling none;` the op's wall must equal c_p + (c_b - c_p)
      exp(J_v/k) to 1e-11 relative on every row -- the arithmetic every
      membrane golden before this slice was recorded on.  The band is the
      CHANNEL's: the result JSON carries 12 significant digits, so 1e-12
      failed on correct code (measured 4e-12) and the arm holds the kernel
      to what the JSON can show.
  (d) THE REFUSALS, built from the witness: an unknown word in each slot
      (the message must carry the accepted list); an ion whose species
      record has no D0 (named, with the `transport { D0 }` remedy); the
      two words placed inside `massTransfer {}` (named the `polarisation {}`
      block).
  (e) THE ANNOUNCEMENT of the used default: membrane12 (ion-declared, no
      `polarisation {}` block) must print `ionCoupling none ASSUMED
      (default)` and SDEM's own `no field in the film` line; membrane14
      (declared) must print neither and must print SDEM's `Geraldes &
      Afonso` film line instead.
  (f) THE MODULE WITNESS `membrane14_polarisation_multiionic`, from what
      the run PUBLISHED: on every profile node sum_i z_i c_b,i (1 + Gamma_i)
      = 0 to 1e-9 (electroneutrality at the wall, recomputed from the
      c_b_<ion> and Gamma_<ion> columns, never from the engine's own
      residual); one `k_film_<ion>` column per ion, DIFFERENT per ion, and
      no single `k_film` column; `xi_V_per_m_avg` published.  THE NEGATIVE:
      the same case with `ionCoupling none;` must give a DIFFERENT
      Gamma_avg for at least one trace ion (NO3 or NH4) by more than 1e-3
      relative and must publish no xi -- the coupling must be seen to do
      something.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
The paper's own comparison (its Fig. 7, an extended Nernst-Planck integration
inside the dye's film) is NOT reproduced and no measured polarisation index
exists to compare with: arm (a) proves the engine solves the paper's
equations, not that the paper is right.  DSPM-DE under the coupled film is
not exercised by any case.  The batch vessel reads the same policy and is not
exercised.  The film model's own limit (a film with a diffusion potential
INSIDE it, for non-dilute solutions) is outside the model.

SABOTAGE-VERIFIED 2026-09-15 (engine edits BY HAND, rebuilt, run, restored;
the gate never patches a source).  Results as MEASURED, two of which did not
match the prediction and are recorded as they fell:
  S1  Eq. (5) constant 0.26 -> 0.30                CAUGHT by (a): Gamma_dye_r1
      engine 0.5136 vs 0.5041, every Gamma and xi of every row.
  S2  migration term sign flipped in the kernel (z D xi' -> -z D xi')
      CAUGHT, but STRUCTURALLY: the bracket (L, U) is derived from the
      un-flipped sign, so the root left it and the witness REFUSED (exit 1)
      -- the gate stopped at "did not run", not on any arm.  The prediction
      was that Gamma would survive and xi would catch it; that is S2b.
  S2b the REPORTED xi sign flipped (w.xi = -x R T / F)   CAUGHT by (a) on xi
      ONLY: every Gamma agreed (xi -> -xi leaves each C_m unchanged), xi_r1
      +60.34 vs -60.34.  This is the sabotage that justifies pinning xi
      beside Gamma; on Gamma alone it SURVIVES.
  S3  bisection and Newton polish disabled (xi' = the bracket midpoint)
      CAUGHT by (a): Gamma_dye_r1 0.112 vs 0.504, xi -180 vs -60 V/m.
  S4  film theory's expm1 replaced by exp(phi (1 + 1e-3)) - 1   CAUGHT by
      (c) (1.4e-3 on the dye against 1e-11) -- the default reduction is what
      every old golden rests on.
  S5  SDEM's wall lambda ignoring the policy (always uncoupled)   CAUGHT by
      (f) three ways: the published wall not electroneutral (2.6e-2), no
      xi_V_per_m_avg, and membrane14 agreeing with its `none` twin.
  S6  unknown-word refusal replaced by the default   CAUGHT by (d)
      (exit 0, no accepted list in the output).
  S7  the default announcement removed from buildPolarisation   CAUGHT by
      (e) on membrane12.
  S8  closeBy Na derived with the wrong sign in the op   CAUGHT, but by the
      OP ITSELF (it refuses a non-positive derived bulk, exit 1), so the gate
      stopped at "did not run"; arm (a)'s independent derivation was not the
      arm that fired.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
PROPS_CASE = ROOT / "tutorials/props/membrane/polarisation01_geraldes_afonso_table1"
M12 = ROOT / "tutorials/steady/membranes/membrane12_sdem_nf270_nacl_traces"
M14 = ROOT / "tutorials/steady/membranes/membrane14_polarisation_multiionic"
R_GAS = 8.314462618
FARADAY = 96485.33212
Z = {"Na": 1, "Cl": -1, "NO3": -1, "NH4": 1, "dye": -3}


def run(binary, case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BUILD / binary), str(case)], capture_output=True, text=True,
                       timeout=900, env=env)
    return r.returncode, r.stdout + r.stderr


def result_of(out):
    if "<<<Choupo:result-begin>>>" not in out:
        return None
    return json.loads(out.split("<<<Choupo:result-begin>>>")[1].split("<<<Choupo:result-end>>>")[0])


def diag_of(out, name):
    j = result_of(out)
    if j is None:
        return None
    for op in j.get("operationResults", []):
        if op["name"] == name:
            return op["diagnostics"]
    return None


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def read_dataset(path):
    t = strip_comments(Path(path).read_text())
    cols = [c for c, _ in re.findall(r"name\s+(\w+)\s*;\s*unit\s+([^;]+);", t)]
    data = re.search(r"data\s*\((.*?)\)\s*;", t, re.S).group(1).split()
    vals = [float(v) for v in data]
    n = len(cols)
    return cols, [vals[i:i + n] for i in range(0, len(vals), n)]


def species_D0(name, case):
    for p in (case / "constant" / "species" / f"{name}.dat", ROOT / "data/standards/species" / f"{name}.dat"):
        if p.exists():
            m = re.search(r"D0\s*\{\s*value\s+([0-9.eE+-]+)", strip_comments(p.read_text()))
            if m:
                return float(m.group(1))
    raise RuntimeError(f"no D0 for {name}")


def scalar_in(text, key):
    m = re.search(r"\b%s\s+([0-9.eE+-]+)" % key, text)
    return float(m.group(1)) if m else None


def stirred_cell_k(D, omega, r, nu, a=0.23, b=0.567, c=0.33):
    Re = omega * r * r / nu
    Sc = nu / D
    return a * Re ** b * Sc ** c * D / r


def xi_eq5(phi):
    return phi + (1.0 + 0.26 * phi ** 1.4) ** -1.7


def solve_paper(Jv, k, D, z, cb, cp, T):
    """Eqs. (25)-(28) of the paper by bisection on xi' = F xi / (R T): every
    C_m explicit in xi', electroneutrality one scalar equation."""
    n = len(k)
    a, num = [], []
    for i in range(n):
        phi = Jv / k[i]
        ks = k[i] * xi_eq5(phi)
        a.append(ks - Jv)
        num.append(ks * cb[i] - Jv * cp[i])
    lo = max(-a[i] / (z[i] * D[i]) for i in range(n) if z[i] > 0)
    hi = min(-a[i] / (z[i] * D[i]) for i in range(n) if z[i] < 0)

    def g(x):
        return sum(z[i] * num[i] / (a[i] + z[i] * D[i] * x) for i in range(n))
    for _ in range(300):
        mid = 0.5 * (lo + hi)
        if g(mid) > 0:
            lo = mid
        else:
            hi = mid
        if hi - lo <= 1e-16 * (abs(lo) + abs(hi)):
            break
    x = 0.5 * (lo + hi)
    cm = [num[i] / (a[i] + z[i] * D[i] * x) for i in range(n)]
    return [(cm[i] - cb[i]) / cb[i] for i in range(n)], x * R_GAS * T / FARADAY, cm


def build_props_probe(dst, ions, close_by, dataset_text, policy):
    shutil.copytree(PROPS_CASE, dst, ignore=shutil.ignore_patterns("log.*", "expected", "reports"))
    (dst / "constant" / "experimental" / "probe.dat").write_text(dataset_text)
    pd = dst / "system" / "propsDict"
    t = pd.read_text()
    t = re.sub(r"ions\s*\([^)]*\);", "ions ( " + " ".join(ions) + " );", t)
    t = re.sub(r"closeBy\s+\w+;", ("closeBy " + close_by + ";") if close_by else "", t)
    t = re.sub(r'dataset\s+"[^"]*";', 'dataset "constant/experimental/probe";', t)
    t = re.sub(r"polarisation\s*\{[^}]*\}", "polarisation { %s }" % policy, t)
    pd.write_text(t)


def two_ion_dataset(rows):
    head = ("columns\n(\n    { name C_b_Na; unit mol/m3; }\n    { name C_b_Cl; unit mol/m3; }\n"
            "    { name C_p_Na; unit mol/m3; }\n    { name C_p_Cl; unit mol/m3; }\n"
            "    { name J_v; unit m/s; }\n);\n\ndata\n(\n")
    return head + "".join("    %g %g %g %g %g\n" % r for r in rows) + ");\n"


def main():
    failures = []

    # ---------------- (a) the case study, recomputed ----------------------
    rc, out = run("choupoProps", PROPS_CASE)
    d = diag_of(out, "table1")
    if rc != 0 or d is None:
        print("check_polarisation_coupling: FAILED")
        print(f"  {PROPS_CASE.name} did not run (exit {rc}):\n" + out[-1500:])
        return 1
    pdict = strip_comments((PROPS_CASE / "system" / "propsDict").read_text())
    omega = scalar_in(pdict, "omega"); r_cm = scalar_in(pdict, "radius")
    mu = scalar_in(pdict, "viscosity"); rho = scalar_in(pdict, "density")
    T = scalar_in(pdict, "T")
    if None in (omega, r_cm, mu, rho, T):
        failures.append("(a) could not read omega/radius/viscosity/density/T from the witness propsDict")
    else:
        r = r_cm / 100.0 if re.search(r"radius\s+[0-9.]+\s*cm", pdict) else r_cm
        nu = mu / rho
        ions = ["dye", "Cl", "Na"]
        D = [species_D0(i, PROPS_CASE) for i in ions]
        z = [Z[i] for i in ions]
        k = [stirred_cell_k(Di, omega, r, nu) for Di in D]
        cols, rows = read_dataset(PROPS_CASE / "constant/experimental/bowen1998_table1.dat")
        for nm, kk in zip(ions, k):
            if abs(d["k_" + nm] / kk - 1.0) > 1e-10:
                failures.append(f"(a) k_{nm}: engine {d['k_' + nm]:.10e} vs correlation {kk:.10e}")
        n_checked = 0
        for ir, row in enumerate(rows, start=1):
            v = dict(zip(cols, row))
            cb = [v["C_b_dye"], v["C_b_Cl"], 0.0]; cp = [v["C_p_dye"], v["C_p_Cl"], 0.0]
            cb[2] = -(z[0] * cb[0] + z[1] * cb[1]) / z[2]      # Na+ by electroneutrality (the table's footnote)
            cp[2] = -(z[0] * cp[0] + z[1] * cp[1]) / z[2]
            gam, xi, _ = solve_paper(v["J_v"], k, D, z, cb, cp, T)
            for s, nm in enumerate(ions):
                ge = d.get(f"Gamma_{nm}_r{ir}")
                if ge is None or abs(ge - gam[s]) > 1e-8 * max(abs(gam[s]), 1e-3):
                    failures.append(f"(a) row {ir} Gamma_{nm}: engine {ge} vs independent {gam[s]:.10g}")
            xe = d.get(f"xi_r{ir}")
            if xe is None or abs(xe - xi) > 1e-8 * max(abs(xi), 1e-3):
                failures.append(f"(a) row {ir} xi: engine {xe} vs independent {xi:.10g} V/m")
            n_checked += 1
        if n_checked != 10 or d.get("n_rows") != 10:
            failures.append(f"(a) {n_checked} rows checked, engine reports {d.get('n_rows')}; Table 1 has 10")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        # ---------------- (b) the single-salt identity ------------------------
        rows_b = [(10.0, 10.0, 2.0, 2.0, 1.0e-5), (50.0, 50.0, 5.0, 5.0, 2.0e-5)]
        d_b = tmp / "salt"
        build_props_probe(d_b, ["Na", "Cl"], None, two_ion_dataset(rows_b),
                          "suctionCorrection GeraldesAfonso2006; ionCoupling electroneutral;")
        rc, out = run("choupoProps", d_b)
        db = diag_of(out, "table1")
        if rc != 0 or db is None:
            failures.append("(b) the two-ion probe did not run:\n" + out[-800:])
        else:
            D1, D2 = species_D0("Na", d_b), species_D0("Cl", d_b)
            z1, z2 = 1, 1
            c = 0.33
            eta = 1.0 / (1.0 + (z1 / z2) * (D1 / D2))                        # (19)
            DS = D1 * D2 * (z1 + z2) / (z1 * D1 + z2 * D2)                    # (9)
            k1, k2, kS = (stirred_cell_k(Dx, omega, r, nu) for Dx in (D1, D2, DS))
            for ir, (cb, _, cp, _, Jv) in enumerate(rows_b, start=1):
                g1, g2 = db[f"Gamma_Na_r{ir}"], db[f"Gamma_Cl_r{ir}"]
                if abs(g1 - g2) > 1e-12 * abs(g1):
                    failures.append(f"(b) row {ir}: the two ions of one salt polarise differently ({g1} vs {g2})")
                cm = cb * (1.0 + g1)
                R = (cm - cp) / cm                                             # (15), intrinsic
                phi = Jv / kS                                                 # (12)
                phi1 = (eta * (1.0 + z1 / z2)) ** (1.0 - c) * phi               # (23)
                phi2 = ((1.0 - eta) * (1.0 + z2 / z1)) ** (1.0 - c) * phi       # (24)
                for name, ph, kk in (("phi_1", phi1, k1), ("phi_2", phi2, k2)):
                    if abs(ph - Jv / kk) > 1e-10 * ph:
                        failures.append(f"(b) row {ir}: Eq. 23/24 {name} = {ph:.12g} vs J_v/k_i = {Jv / kk:.12g}")
                gam20 = R / (eta * xi_eq5(phi1) / phi1 + (1.0 - eta) * xi_eq5(phi2) / phi2 - R)   # (20)
                if abs(gam20 - g1) > 1e-10 * abs(g1):
                    failures.append(f"(b) row {ir}: Eq. 20 gives Gamma {gam20:.12g}, the op {g1:.12g}")

        # ---------------- (c) the film-theory reduction ---------------------
        d_c = tmp / "film"
        build_props_probe(d_c, ["dye", "Cl", "Na"], "Na",
                          (PROPS_CASE / "constant/experimental/bowen1998_table1.dat").read_text(),
                          "suctionCorrection filmTheory; ionCoupling none;")
        rc, out = run("choupoProps", d_c)
        dc = diag_of(out, "table1")
        if rc != 0 or dc is None:
            failures.append("(c) the film-theory probe did not run:\n" + out[-800:])
        else:
            import math
            cols, rows = read_dataset(PROPS_CASE / "constant/experimental/bowen1998_table1.dat")
            for ir, row in enumerate(rows, start=1):
                v = dict(zip(cols, row))
                cb = {"dye": v["C_b_dye"], "Cl": v["C_b_Cl"]}; cp = {"dye": v["C_p_dye"], "Cl": v["C_p_Cl"]}
                cb["Na"] = 3 * cb["dye"] + cb["Cl"]; cp["Na"] = 3 * cp["dye"] + cp["Cl"]
                for nm in ("dye", "Cl", "Na"):
                    kk = dc["k_" + nm]
                    cm = cp[nm] + (cb[nm] - cp[nm]) * math.exp(v["J_v"] / kk)
                    gam = cm / cb[nm] - 1.0
                    ge = dc[f"Gamma_{nm}_r{ir}"]
                    if abs(ge - gam) > 1e-11 * max(abs(gam), 1e-6):
                        failures.append(f"(c) row {ir} {nm}: film-theory wall gives Gamma {gam:.15g}, the op {ge:.15g}")
                if abs(dc[f"xi_r{ir}"]) != 0.0:
                    failures.append(f"(c) row {ir}: an uncoupled film published xi = {dc[f'xi_r{ir}']}")

        # ---------------- (d) the refusals ------------------------------------
        def probe_refusal(label, mutate, must_contain):
            dd = tmp / label
            shutil.copytree(PROPS_CASE, dd, ignore=shutil.ignore_patterns("log.*", "expected", "reports"))
            mutate(dd)
            rc, out = run("choupoProps", dd)
            missing = [m for m in must_contain if m not in out]
            if rc == 0 or missing:
                failures.append(f"(d) {label}: exit {rc}, refusal missing {missing}:\n" + out[-600:])

        def bad_suction(dd):
            p = dd / "system/propsDict"
            p.write_text(p.read_text().replace("suctionCorrection  GeraldesAfonso2006;", "suctionCorrection  GeraldesAfonso2007;"))
        probe_refusal("badSuction", bad_suction, ["GeraldesAfonso2007", "Accepted", "GeraldesAfonso2006", "filmTheory"])

        def bad_coupling(dd):
            p = dd / "system/propsDict"
            p.write_text(p.read_text().replace("ionCoupling        electroneutral;", "ionCoupling        electroneutrality;"))
        probe_refusal("badCoupling", bad_coupling, ["electroneutrality", "Accepted", "electroneutral", "none"])

        def no_D0(dd):
            p = dd / "constant/species/dye.dat"
            p.write_text(re.sub(r"transport\s*\{.*?\n\}\n", "", p.read_text(), flags=re.S))
        probe_refusal("noD0", no_D0, ["ion 'dye'", "D0", "transport { D0"])

        def wrong_block(dd):
            p = dd / "system/propsDict"
            t = p.read_text().replace("polarisation\n        {\n            suctionCorrection  GeraldesAfonso2006;\n            ionCoupling        electroneutral;\n        }", "")
            t = t.replace("density    1000;", "density    1000;\n            ionCoupling electroneutral;")
            p.write_text(t)
        probe_refusal("wrongBlock", wrong_block, ["inside `massTransfer {}`", "polarisation {"])

    # ---------------- (e) the announcement ------------------------------------
    rc12, out12 = run("choupoSolve", M12)
    rc14, out14 = run("choupoSolve", M14)
    if rc12 != 0:
        failures.append("(e) membrane12 did not run:\n" + out12[-600:])
    else:
        if "ionCoupling none ASSUMED (default)" not in out12:
            failures.append("(e) membrane12 (ion-declared, no polarisation {}) did not announce `ionCoupling none ASSUMED (default)`")
        if "no field in the film" not in out12:
            failures.append("(e) membrane12: SDEM did not announce its field-free film")
    if rc14 != 0:
        failures.append("(e) membrane14 did not run:\n" + out14[-600:])
    else:
        if "ASSUMED (default)" in out14:
            failures.append("(e) membrane14 declares both words and still announced a default")
        if "no field in the film" in out14:
            failures.append("(e) membrane14: SDEM announced a field-free film under ionCoupling electroneutral")
        if "[SDEM] polarisation film: the Geraldes & Afonso" not in out14:
            failures.append("(e) membrane14: SDEM did not announce the Geraldes & Afonso interface film")

    # ---------------- (f) the module witness, from what it published -----------
    j14 = result_of(out14) if rc14 == 0 else None
    if j14 is not None:
        k = j14["kpis"]["NF"]
        prof = j14.get("profiles", {}).get("NF", {}).get("columns", {})
        ions = ["Na", "Cl", "NO3", "NH4"]
        nn = len(prof.get("z", []))
        if nn == 0:
            failures.append("(f) membrane14 published no profile")
        worst = 0.0
        for node in range(nn):
            q = sum(Z[i] * prof[f"c_b_{i}"][node] * (1.0 + prof[f"Gamma_{i}"][node]) for i in ions)
            qa = sum(abs(Z[i]) * prof[f"c_b_{i}"][node] * (1.0 + prof[f"Gamma_{i}"][node]) for i in ions)
            worst = max(worst, abs(q) / qa)
        if worst > 1e-9:
            failures.append(f"(f) membrane14: the wall recomputed from c_b(1+Gamma) is not electroneutral (max {worst:.2e})")
        if "k_film" in prof:
            failures.append("(f) membrane14 published a single k_film column on an ion-declared feed with a correlation")
        kcols = [prof.get(f"k_film_{i}") for i in ions]
        if any(c is None for c in kcols):
            failures.append("(f) membrane14 lacks a k_film_<ion> column for some ion")
        elif len({round(c[0], 12) for c in kcols}) < 3:
            failures.append(f"(f) membrane14: the per-ion k are not different per ion ({[c[0] for c in kcols]})")
        if "xi_V_per_m_avg" not in k or abs(k["xi_V_per_m_avg"]) < 1e-6:
            failures.append("(f) membrane14 published no non-zero xi_V_per_m_avg")
        for i in ions:
            if f"Gamma_{i}_avg" not in k:
                failures.append(f"(f) membrane14 published no Gamma_{i}_avg")
        # the negative: the uncoupled twin
        with tempfile.TemporaryDirectory() as tmp:
            dn = Path(tmp) / "none"
            shutil.copytree(M14, dn, ignore=shutil.ignore_patterns("converged", "log.*", "expected", "reports"))
            p = dn / "system/flowsheetDict"
            p.write_text(p.read_text().replace("ionCoupling        electroneutral;", "ionCoupling        none;"))
            rcn, outn = run("choupoSolve", dn)
            jn = result_of(outn)
            if rcn != 0 or jn is None:
                failures.append("(f) the ionCoupling none twin did not run:\n" + outn[-600:])
            else:
                kn = jn["kpis"]["NF"]
                moved = [i for i in ("NO3", "NH4")
                         if abs(kn[f"Gamma_{i}_avg"] - k[f"Gamma_{i}_avg"]) > 1e-3 * abs(k[f"Gamma_{i}_avg"])]
                if not moved:
                    failures.append("(f) switching the coupling off moved no trace ion's Gamma_avg by 1e-3 -- the coupling is not seen to act")
                if "xi_V_per_m_avg" in kn:
                    failures.append("(f) the ionCoupling none twin published xi_V_per_m_avg")

    if failures:
        print("check_polarisation_coupling: FAILED")
        for f in failures:
            print("  " + f)
        return 1
    print("check_polarisation_coupling: OK -- the polarisationIndex bench on Geraldes & Afonso (2007) "
          "Table 1 reproduces an independent Python solve of Eqs. (25)-(28) on all 10 rows (Gamma per "
          "ion AND xi to 1e-8); a single salt obeys the paper's closed form Eq. (20) with Eqs. (19), "
          "(23), (24) to 1e-10; `filmTheory` + `none` reduces to c_p + (c_b - c_p) exp(J_v/k) to "
          "1e-11 (the JSON's 12 digits); 4 refusals fire by name; the used default is announced on membrane12 and not on "
          "membrane14; membrane14's published wall is electroneutral to 1e-9 on every node, prices "
          "k per ion, publishes xi, and its `ionCoupling none` twin polarises the trace ions "
          "differently.  NOT CHECKED: the paper's Fig. 7 Nernst-Planck comparison (not reproduced), "
          "any MEASURED polarisation index (none exists), DSPM-DE and the batch vessel under the "
          "coupled film, a film with a potential inside it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
