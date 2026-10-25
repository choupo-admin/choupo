#!/usr/bin/env python3
"""Gate: WHY the DSPM-DE pore held each ion back -- the partition factors,
the potential steps and the pore's numerics the props bench publishes --
holds together and holds to its definitions.

    bin/curate/check_pore_partition.py

WHY THIS EXISTS (2026-10-25, DEV.md 4c C165).  An on-screen audit asked
whether a PhD student could learn DSPM-DE from the NanoFiltran paper's case
(tutorials/props/membrane/nanofiltran_geraldesAlves2008) without the paper,
and scored "why is each ion rejected" 2/10: the engine computed every
factor of each ion's partition (DSPM_DE.cpp) and published none of them.
It now publishes them -- per ion lambda, K_d, K_c, Phi_S, the Born factor;
per ion, face and point the activity ratio, the Donnan factor, the
partition c_pore/c_solution and the pore's face concentration, and the
ion's Peclet number; per point the three potential steps, the Newton's
final ||F|| against its tolerance and the closure checks -- and the GUI
draws them through the op schema's point tables.  A published number a
student reads to learn WHY must be held to what it claims, or it is a
number in a table.

The case is run ONCE, in a temporary copy (its default views write the
last point's pore profile of every op, which arms (d) and (f) read).

WHAT THIS GATE CHECKS.
  (a) THE PARTITION IS THE PRODUCT OF ITS FACTORS.  At every op, point, ion
      and face, the published partition -- read by the engine off the SOLVED
      pore (c_pore(0)/c_wall, c_pore(1)/c_perm) -- equals Phi_S x Born x
      gamma ratio x Donnan, the factors the law used, recomputed here from
      the published factors (1e-9 relative).  This is the partition
      equation's own residual on the answer, so it fails if any published
      factor is not the one the solve used.
  (b) THE DONNAN FACTORS ARE THE NAMED POTENTIALS'.  donnanFeed =
      exp(-z psi_D,feed F/RT) and donnanPerm = exp(+z psi_D,perm F/RT), z
      from the ion's species record and the potentials from the published
      steps (1e-9).
  (c) THE THREE POTENTIAL STEPS SUM TO dPsi_m.  feed Donnan jump + pore +
      permeate Donnan jump = dPsi_m_V at every point (1e-12 V).
  (d) THE TABLE IS THE DRAWING.  At each op's last point (the one its
      default views draw): the potential profile starts at psi_D,feed and
      ends at psi_D,feed + psi_pore; each pore ion's profile starts at
      c_poreFeed and ends at c_porePerm; and c_poreFeed/c_wall,
      c_porePerm/c_perm equal the published partitions (1e-9).
  (e) THE GEOMETRY IS THE DEFINITIONS'.  lambda = r_i/r_p from the species
      and membrane records, Phi_S = (1 - lambda)^2, K_d and K_c the
      Dechadilok & Deen (2006) pair, the Born factor exp(-z^2 e^2 /
      (8 pi eps0 r_i kT) (1/eps_p - 1/eps_b)) with eps_b the op's
      bulkDielectric (or epsWater(T)) and eps_p the record's (Born off
      without one); Pe = K_c J_v / (K_d D_i A_k/dx) with D_i the record's
      D0 (this case declares no viscosity model, so no Stokes-Einstein
      factor, as its caveat says) (1e-9).  An ion with lambda >= 1 is
      EXCLUDED: Phi_S = 0, both partitions 0, no K_d, K_c, Donnan or
      activity key published.
  (f) THE ACTIVITY RATIOS ARE THE DECLARED TREATMENT'S.  Under `activity
      ideal` both ratios are exactly 1; under `bulkOverPoreDavies` they are
      recomputed at the last point from the published wall and permeate
      concentrations and the drawn pore end points, Davies on log10 with
      A(eps, T) = 1.82483e6 (eps T)^-1.5 (1e-8).
  (g) THE NUMERICS SAY WHAT THEY CLAIM.  At every point ||F|| <= the
      published tolerance, and electroneutrality, zero current and flux
      constancy are at round-off (<= 1e-10).
  (h) E1 AND E8.  Every op draws its pore and potential views; and the
      bench raises no advisory about "the permeate STREAM's anion" (a bench
      has no stream; the module's announcement of the same fact is held by
      check_spiral_array arm (i)).
  (i) THE SCHEMA NAMES WHAT IS PUBLISHED.  Every key pattern in the
      poreTransport schema's point tables resolves to at least one
      diagnostic of the run -- a renamed key would draw an empty column.

WHAT THIS GATE DOES NOT CHECK, said plainly: whether DSPM-DE is right for
any membrane (check_nanofiltran_reference / _paper hold the code-to-code and
the experiment comparisons); the `wallDavies` activity path (no op of this
case declares it; its feed ratio is the frozen bulk Davies gamma the law has
always used, published unchanged); the interior of the drawn profiles (only
their end points are tied to the table here); the GUI rendering (gui/tests/
c165PoreWhy.test.ts).

BY-HAND SABOTAGES (2026-10-25), each restored and the engine rebuilt, the
gate re-run to OK:
  S1  donnanPerm published as exp(+z (psi(1) - psi_p)) (DSPM_DE.cpp) ->
      FAILED (a) and (b), 146 findings.
  S2  the feed face's gamma ratio published as the frozen wall gamma under
      bulkOverPoreDavies (DSPM_DE.cpp) -> FAILED (a) and (f) on
      example_davies and the six grid ops, 42 findings.
  S3  the Born factor published as 1 (DSPM_DE.cpp) -> FAILED (a) and (e).
  S4  the permeate Donnan jump published as psi(1) - psi_p
      (PoreTransportBench.cpp) -> FAILED (b) and (c).
  S5  E1 reverted, the pore views drawn for no op (PoreTransportBench.cpp)
      -> FAILED (h), 22 findings.
  S6  the bench telling the law it carries a salt stream -> FAILED (h).
  S7  one schema point-table key misspelt -> FAILED (i) only.
  And one defect the gate found while it was being written, before any
  sabotage: an ion carried by two salts (Cl- of NaCl and MgCl2) published
  its pore face concentrations from ONE salt's row while c_wall summed both,
  so c_pore(0)/c_wall was a fifth of the partition -- arm (d), fixed by
  summing them like c_wall.
"""
import csv
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
sys.path.insert(0, str(ROOT / "bin" / "curate" / "nanofiltran"))
import paper_case  # noqa: E402

CASE = paper_case.CASE
PROPS = ROOT / "choupoProps"
SCHEMA = ROOT / "gui" / "schemas" / "operations" / "poreTransport.schema.json"
R, F, KB, NA = 8.314462618, 96485.33212, 1.380649e-23, 6.02214076e23
E_CHARGE, EPS0 = F / NA, 8.8541878128e-12

fails = []


def rel(a, b):
    return abs(a - b) / max(abs(a), abs(b), 1e-300)


def record_value(text, key):
    m = re.search(r"^\s*" + key + r"\s+(?:\{\s*value\s+)?([-+0-9.eE]+)", text, re.M)
    return float(m.group(1)) if m else None


def species(ion):
    t = (CASE / "constant" / "species" / f"{ion}.dat").read_text()
    t = "\n".join(l.split("//")[0] for l in t.splitlines())
    return {"z": int(record_value(t, "charge")), "r": record_value(t, "radius"),
            "D0": record_value(t, "D0")}


def membrane(name):
    t = (CASE / "constant" / "assets" / f"{name}.dat").read_text()
    t = "\n".join(l.split("//")[0] for l in t.splitlines())
    pm = t[t.index("poreModel"):]
    pm = pm[:pm.index("}")]
    return {"rp": record_value(pm, "poreRadius"), "AkdX": record_value(pm, "porosityOverThickness"),
            "epsP": record_value(pm, "poreDielectric")}


def eps_water(T):
    mm = lambda t: 87.740 - 0.40008 * t + 9.398e-4 * t * t - 1.410e-6 * t ** 3  # noqa: E731
    return 78.45 * mm(T - 273.15) / mm(25.0)


def dechadilok_deen(l):
    phi = (1 - l) ** 2
    if l <= 0.95:
        H = (1 + 1.125 * l * math.log(l) - 1.56034 * l + 0.528155 * l ** 2 + 1.91521 * l ** 3
             - 2.81903 * l ** 4 + 0.270788 * l ** 5 + 1.10115 * l ** 6 - 0.435933 * l ** 7)
        kd = H / phi
    else:
        kd = 0.984 * ((1 - l) / l) ** 2.5
    kc = (1 + 3.867 * l - 1.907 * l * l - 0.834 * l ** 3) / (1 + 1.867 * l - 0.741 * l * l)
    return kd, kc, phi


def davies_ln(z, I_molL, A):
    s = math.sqrt(max(I_molL, 0.0))
    return -math.log(10) * A * z * z * (s / (1 + s) - 0.3 * I_molL)


def op_settings(block):
    def word(k):
        m = re.search(r"^\s*" + k + r"\s+([^;\s]+)\s*;", block, re.M)
        return m.group(1) if m else None
    T = float(re.search(r"^\s*T\s+([-+0-9.eE]+)", block, re.M).group(1))
    bd = word("bulkDielectric")
    return {"membrane": word("membrane"), "activity": word("activity") or "wallDavies",
            "T": T, "epsB": float(bd) if bd else eps_water(T)}


def profile(case, op, view):
    p = case / "postProcessing" / op / f"{view}.csv"
    if not p.is_file():
        return None
    series = {}
    with p.open() as f:
        for row in csv.DictReader(f):
            series.setdefault(row["series"], []).append((float(row["x"]), float(row["y"])))
    return series


def main():
    if not PROPS.exists():
        print("check_pore_partition: FAILED -- no choupoProps binary (build first)")
        return 1
    blocks = paper_case.op_blocks((CASE / "system" / "propsDict").read_text())
    with tempfile.TemporaryDirectory(prefix="porewhy_") as d:
        case = Path(d) / "case"
        shutil.copytree(CASE, case, ignore=shutil.ignore_patterns("postProcessing"))
        env = dict(os.environ, CHOUPO_HOME=str(ROOT))
        r = subprocess.run([str(PROPS), str(case)], capture_output=True, text=True,
                           timeout=1800, env=env, cwd=str(case))
        out = r.stdout + r.stderr
        if r.returncode != 0 or "<<<Choupo:result-begin>>>" not in out:
            print(f"check_pore_partition: FAILED -- the case did not run (exit {r.returncode}):\n"
                  + out[-1500:])
            return 1
        res = json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                            .split("<<<Choupo:result-end>>>")[0])
        diags = {o["name"]: o.get("diagnostics", {}) for o in res.get("operationResults", [])}
        n = {"a": 0, "b": 0, "c": 0, "d": 0, "e": 0, "f": 0, "g": 0, "excl": 0}
        spc = {}
        for op, dg in diags.items():
            st = op_settings(blocks[op])
            mem = membrane(st["membrane"])
            ions = sorted({k[len("c_bulk_"):].rsplit("_p", 1)[0] for k in dg if k.startswith("c_bulk_")})
            npts = int(dg["n_points"])
            VT = R * st["T"] / F
            epsP = mem["epsP"] if mem["epsP"] is not None else st["epsB"]
            for ion in ions:
                sp = spc.setdefault(ion, species(ion))
                z = sp["z"]
                lam = sp["r"] / mem["rp"]
                # ---- (e) the geometry
                if rel(dg.get(f"lambda_{ion}", float("nan")), lam) > 1e-9:
                    fails.append(f"(e) {op} lambda_{ion} = {dg.get(f'lambda_{ion}')} but r_i/r_p = {lam}")
                born = 1.0
                if epsP < st["epsB"]:
                    dW = (z * z * E_CHARGE ** 2) / (8 * math.pi * EPS0 * sp["r"]) * (1 / epsP - 1 / st["epsB"])
                    born = math.exp(-dW / (KB * st["T"]))
                if rel(dg.get(f"bornFactor_{ion}", float("nan")), born) > 1e-9:
                    fails.append(f"(e) {op} bornFactor_{ion} = {dg.get(f'bornFactor_{ion}')} but the Born"
                                 f" energy gives {born}")
                if lam >= 1.0:
                    n["excl"] += 1
                    if dg.get(f"PhiS_{ion}") != 0:
                        fails.append(f"(e) {op} {ion} is excluded (lambda {lam}) but PhiS = {dg.get(f'PhiS_{ion}')}")
                    for key in (f"Kd_{ion}", f"Kc_{ion}", f"donnanFeed_{ion}_p1", f"gammaRatioFeed_{ion}_p1"):
                        if key in dg:
                            fails.append(f"(e) {op} publishes {key} for an EXCLUDED ion (no pore unknown)")
                    for p in range(1, npts + 1):
                        for face in ("Feed", "Perm"):
                            if dg.get(f"partition{face}_{ion}_p{p}") != 0:
                                fails.append(f"(e) {op} {ion} excluded but partition{face}_p{p} != 0")
                    continue
                kd, kc, phi = dechadilok_deen(lam)
                for key, want in ((f"Kd_{ion}", kd), (f"Kc_{ion}", kc), (f"PhiS_{ion}", phi)):
                    if rel(dg.get(key, float("nan")), want) > 1e-9:
                        fails.append(f"(e) {op} {key} = {dg.get(key)} but Dechadilok-Deen gives {want}")
                n["e"] += 1
                for p in range(1, npts + 1):
                    t = f"_{ion}_p{p}"
                    try:
                        g = {k: dg[k + t] for k in ("partitionFeed", "partitionPerm", "gammaRatioFeed",
                                                    "gammaRatioPerm", "donnanFeed", "donnanPerm",
                                                    "c_poreFeed", "c_porePerm", "Pe")}
                    except KeyError as e:
                        fails.append(f"(a) {op} publishes no {e.args[0]}{t}")
                        continue
                    pe = kc * dg[f"Jv_p{p}"] / (kd * sp["D0"] * mem["AkdX"])
                    if rel(g["Pe"], pe) > 1e-9:
                        fails.append(f"(e) {op} Pe{t} = {g['Pe']} but K_c J_v/(K_d D A_k/dx) = {pe}")
                    # ---- (a) the product
                    for face in ("Feed", "Perm"):
                        prod = dg[f"PhiS_{ion}"] * dg[f"bornFactor_{ion}"] * g["gammaRatio" + face] \
                            * g["donnan" + face]
                        if rel(g["partition" + face], prod) > 1e-9:
                            fails.append(f"(a) {op}{t} {face.lower()} face: partition {g['partition' + face]!r}"
                                         f" but Phi_S x Born x gamma ratio x Donnan = {prod!r}"
                                         f" ({rel(g['partition' + face], prod):.1e})")
                        n["a"] += 1
                    # ---- (b) Donnan from the named potentials
                    dF = math.exp(-z * dg[f"psiDonnanFeed_V_p{p}"] / VT)
                    dP = math.exp(+z * dg[f"psiDonnanPerm_V_p{p}"] / VT)
                    if rel(g["donnanFeed"], dF) > 1e-9 or rel(g["donnanPerm"], dP) > 1e-9:
                        fails.append(f"(b) {op}{t}: Donnan factors {g['donnanFeed']}, {g['donnanPerm']}"
                                     f" but the published jumps give {dF}, {dP}")
                    n["b"] += 1
                    # ---- (d) the face concentrations against the partitions
                    if rel(g["c_poreFeed"] / dg[f"c_wall_{ion}_p{p}"], g["partitionFeed"]) > 1e-9 \
                            or rel(g["c_porePerm"] / dg[f"c_perm_{ion}_p{p}"], g["partitionPerm"]) > 1e-9:
                        fails.append(f"(d) {op}{t}: the pore's face concentrations over the wall /"
                                     f" permeate are not the published partitions")
                    # ---- (f) ideal
                    if st["activity"] == "ideal" and (g["gammaRatioFeed"] != 1.0 or g["gammaRatioPerm"] != 1.0):
                        fails.append(f"(f) {op}{t}: activity ideal but gamma ratios "
                                     f"{g['gammaRatioFeed']}, {g['gammaRatioPerm']}")
                    if st["activity"] == "ideal":
                        n["f"] += 1
            # ---- per point: (c) and (g)
            for p in range(1, npts + 1):
                s = sum(dg[f"{k}_p{p}"] for k in ("psiDonnanFeed_V", "psiPore_V", "psiDonnanPerm_V"))
                if abs(s - dg[f"dPsi_m_V_p{p}"]) > 1e-12:
                    fails.append(f"(c) {op} p{p}: the three steps sum to {s!r} V, dPsi_m_V = "
                                 f"{dg[f'dPsi_m_V_p{p}']!r}")
                n["c"] += 1
                if not dg[f"poreResidual_p{p}"] <= dg["poreTolerance"]:
                    fails.append(f"(g) {op} p{p}: ||F|| {dg[f'poreResidual_p{p}']} above the tolerance"
                                 f" {dg['poreTolerance']}")
                for k in ("poreElectroneutral", "poreCurrent", "poreFluxConstancy"):
                    if not dg[f"{k}_p{p}"] <= 1e-10:
                        fails.append(f"(g) {op} p{p}: {k} = {dg[f'{k}_p{p}']}, not round-off")
                n["g"] += 1
            # ---- (d) the drawing, at the last point
            pore, pot = profile(case, op, "pore"), profile(case, op, "potential")
            if pore is None or pot is None:
                fails.append(f"(h) {op} draws no pore/potential view (E1: every op draws its pore)")
                continue
            P = npts
            psi = pot["psi_V"]
            if abs(psi[0][1] - dg[f"psiDonnanFeed_V_p{P}"]) > 1e-11 or \
                    abs(psi[-1][1] - dg[f"psiDonnanFeed_V_p{P}"] - dg[f"psiPore_V_p{P}"]) > 1e-11:
                fails.append(f"(d) {op}: the drawn potential runs {psi[0][1]} -> {psi[-1][1]} V, the"
                             f" published steps say psi(0) = {dg[f'psiDonnanFeed_V_p{P}']}")
            act = st["activity"] == "bulkOverPoreDavies"
            ends = {}
            for ion in ions:
                c = pore.get(f"c_{ion}_molm3")
                if c is None:
                    continue                                  # excluded: no pore value
                ends[ion] = (c[0][1], c[-1][1])
                for face, i in (("Feed", 0), ("Perm", -1)):
                    if rel(c[i][1], dg[f"c_pore{face}_{ion}_p{P}"]) > 1e-9:
                        fails.append(f"(d) {op} {ion}: the drawn profile's {face.lower()} end {c[i][1]}"
                                     f" is not c_pore{face} {dg[f'c_pore{face}_{ion}_p{P}']}")
                n["d"] += 1
            if act and ends:
                A_b = 1.82483e6 * (st["epsB"] * st["T"]) ** -1.5
                A_p = 1.82483e6 * (epsP * st["T"]) ** -1.5
                I = {"w": 0.0, "0": 0.0, "N": 0.0, "p": 0.0}
                for ion in ions:
                    z2 = spc[ion]["z"] ** 2
                    I["w"] += 0.5 * z2 * dg[f"c_wall_{ion}_p{P}"]
                    if ion in ends:
                        I["0"] += 0.5 * z2 * ends[ion][0]
                        I["N"] += 0.5 * z2 * ends[ion][1]
                        I["p"] += 0.5 * z2 * dg[f"c_perm_{ion}_p{P}"]
                for ion in ends:
                    z = spc[ion]["z"]
                    gf = math.exp(davies_ln(z, I["w"] / 1e3, A_b) - davies_ln(z, I["0"] / 1e3, A_p))
                    gp = math.exp(davies_ln(z, I["p"] / 1e3, A_b) - davies_ln(z, I["N"] / 1e3, A_p))
                    if rel(dg[f"gammaRatioFeed_{ion}_p{P}"], gf) > 1e-8 or \
                            rel(dg[f"gammaRatioPerm_{ion}_p{P}"], gp) > 1e-8:
                        fails.append(f"(f) {op} {ion}: published gamma ratios "
                                     f"{dg[f'gammaRatioFeed_{ion}_p{P}']}, {dg[f'gammaRatioPerm_{ion}_p{P}']}"
                                     f" but Davies on the drawn ends gives {gf}, {gp}")
                    n["f"] += 1
        # ---- (h) E8
        if "permeate stream's anion" in out:
            fails.append("(h) the bench raised the module-only advisory about the permeate STREAM's anion")
        # ---- (i) the schema's keys are published
        x = json.loads(SCHEMA.read_text())["x-choupo"]
        tables = [x["pointTable"]] + x.get("pointTables", [])
        allkeys = set().union(*[set(dg) for dg in diags.values()])
        nkeys = 0
        for t in tables:
            for col in t.get("perPoint", []) + t.get("perIon", []):
                pat = "^" + re.escape(col["key"]).replace(r"\{ion\}", "[A-Za-z0-9]+") \
                    .replace(r"\{p\}", r"\d+") + "$"
                nkeys += 1
                if not any(re.match(pat, k) for k in allkeys):
                    fails.append(f"(i) the schema's point-table key {col['key']!r} ({t['title'][:40]}...)"
                                 f" matches no diagnostic of the run")
    if fails:
        print("check_pore_partition: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print(f"check_pore_partition: OK -- over the {len(diags)} ops of the NanoFiltran paper's case: "
          f"{n['a']} face partitions equal Phi_S x Born x gamma ratio x Donnan (1e-9); {n['b']} Donnan "
          f"factor pairs equal the published jumps; at {n['c']} points the three potential steps sum to "
          f"dPsi_m (1e-12 V) and ||F|| is below the tolerance with electroneutrality, current and flux "
          f"constancy at round-off; {n['d']} drawn profile end points are the published pore face "
          f"concentrations; lambda, Phi_S, K_d, K_c, the Born factor and Pe recomputed from the records "
          f"for {n['e']} (op, ion) pairs, {n['excl']} excluded ion(s) published as excluded; {n['f']} "
          f"activity ratios are the declared treatment's (ideal 1, bulkOverPoreDavies recomputed); every "
          f"op draws its pore; no stream advisory in the bench; {nkeys} schema point-table keys are "
          f"published.  NOT CHECKED: whether DSPM-DE is right for a membrane, the wallDavies path (no "
          f"op declares it), the profiles' interior, the GUI rendering.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
