#!/usr/bin/env python3
"""Gate: the SDEM transport law couples the ions and adds no parameter.
    bin/curate/check_sdem.py

WHY THIS EXISTS.  `transport solutionDiffusion;` on an ION-declared feed
gives every ion its own permeance and couples nothing, so the permeate
carries a net charge (membrane07: -0.82 % of the cation equivalents).
`transport SDEM;` (solution-diffusion-electromigration, Yaroshchuk 2013)
keeps the SAME per-ion permeances and adds ONE state variable per station --
the electric potential across the active layer -- fixed by zero current.  The
claim is therefore twofold and both halves must be pinned: the permeate is
electroneutral BY CONSTRUCTION, and NOTHING was added to make it so.  A law
that neutralised the permeate by fitting an extra number, or by quietly
scaling one ion, would pass a "sum of charges" check and teach the wrong
thing.

WHAT THIS GATE CHECKS (the two witness cases are RUN here, never read from a
stale converged/):
  (a) PERMEATE ELECTRONEUTRALITY to machine level, on both witnesses:
      |sum z_i x_i| / sum |z_i| x_i <= 1e-9 on the permeate stream.
  (b) THE AMBIPOLAR IDENTITY, recomputed in Python from the ion permeances
      the records SHIP and held to the salt permeances the SOURCE PAPER
      publishes in the same table (Fernandez de Labastida & Yaroshchuk,
      Membranes 11 (2021) 272, Table 1, CC BY 4.0):
          P_s = (z+ + |z-|) P+ P- / (z+ P+ + |z-| P-)
      For all four dominant salts of that table -- the two the witnesses
      carry and the two they do not (transcribed here with the citation) --
      within 5 %, the table's own rounding.  This is the arm that makes
      "calibratable from single-salt tests" a checked sentence: the per-ion
      numbers reproduce the salt numbers the authors measured.
  (c) THE ENGINE OBEYS THE SINGLE-SALT LAW: the dominant salt's observed
      rejection equals J_v / (J_v + P_s) with the AMBIPOLAR P_s of (b) and
      the run's own J_w_avg, within 0.02 absolute (the traces are 2 % of the
      salt, recovery ~1 %, k_film large: the run is intrinsic to that order).
  (d) THE TRACE SIGNS THE PAPER STATES: NaCl case -- NO3- rejected BELOW the
      dominant anion and below 50 %, NH4+ within the 40-80 % the text gives;
      MgSO4 case -- NO3- NEGATIVELY rejected, both trace cations rejected,
      SO4 above 90 %.  These are the qualitative claims the paper's text
      makes; its per-point rejections live in figures and are NOT transcribed.
  (e) THE FIELD IS PUBLISHED: `membranePotential_mV_avg` on the KPIs, a
      `psi_mV` column on the profile, non-zero -- the pedagogical point.
  (f) THE NEGATIVE: the SAME feed under `transport solutionDiffusion;` must
      ANNOUNCE the uncoupled law by name and must NOT yield a neutral
      permeate.  Without this arm a permeate that is neutral for some other
      reason (equal permeances, say) would pass (a) without the law doing
      anything.
  (g) THE REFUSALS, built from the witness rather than assumed: a feed that
      is not electroneutral (one ion nudged) refuses naming the imbalance; a
      record giving an ion no permeance refuses naming the ion.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
No per-point measured rejection is compared: the paper's data are in its
figures, and the anchors here are its Table 1 salt permeances plus the signs
its text states.  The polarisation film is per ion and field-free (the law
announces it) and nothing here tests a film with a field.  Concentration
dependence of the permeances is outside the model.  The batch vessel
(`batchDiafilter`) accepts the same factory word and is NOT exercised here.

SABOTAGE-VERIFIED 2026-09-15 (results recorded in the design record
docs/design/electroneutrality-without-a-new-parameter.md).
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
CASES = {
    "NaCl":  "tutorials/steady/membranes/membrane12_sdem_nf270_nacl_traces",
    "MgSO4": "tutorials/steady/membranes/membrane13_sdem_nf270_mgso4_traces",
}
Z = {"Na": 1, "K": 1, "NH4": 1, "Mg": 2, "Ca": 2, "Cl": -1, "NO3": -1, "HCO3": -1, "SO4": -2}

#  Table 1 of Fernandez de Labastida & Yaroshchuk, Membranes 11 (2021) 272
#  (CC BY 4.0): membrane permeance to the dominant salt, and the ion
#  permeances the SDEM fit gave, in um/s.  A value the paper gives as a bound
#  or a range is taken at the end that reproduces P_s (noted in the records).
TABLE1 = {
    "NaCl":   {"Ps": 7.5,  "cation": ("Na", 1, 113.0), "anion": ("Cl", 1, 3.9)},
    "MgCl2":  {"Ps": 6.1,  "cation": ("Mg", 2, 3.7),   "anion": ("Cl", 1, 9.3)},
    "Na2SO4": {"Ps": 0.16, "cation": ("Na", 1, 0.8),   "anion": ("SO4", 2, 0.06)},
    "MgSO4":  {"Ps": 0.23, "cation": ("Mg", 2, 0.9),   "anion": ("SO4", 2, 0.13)},
}


def ambipolar(zp, Pp, zm, Pm):
    return (zp + zm) * Pp * Pm / (zp * Pp + zm * Pm)


def run_case(case_dir):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BUILD / "choupoSolve"), str(case_dir)],
                       capture_output=True, text=True, timeout=900, env=env)
    return r.returncode, r.stdout + r.stderr


def result_of(out):
    if "<<<Choupo:result-begin>>>" not in out:
        return None
    return json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                         .split("<<<Choupo:result-end>>>")[0])


def charge_of(stream):
    comp = stream["composition"]
    q = sum(Z.get(k, 0) * v for k, v in comp.items())
    qa = sum(abs(Z.get(k, 0)) * v for k, v in comp.items())
    return q, qa


def record_permeances(case_dir):
    txt = (Path(case_dir) / "constant" / "assets").glob("NF270_sdem_*.dat")
    txt = open(next(txt)).read()
    block = re.search(r"permeabilities\s*\{(.*?)\}", txt, re.S).group(1)
    return {m.group(1): float(m.group(2))
            for m in re.finditer(r"^\s*(\w+)\s+([\d.]+e[-+]?\d+)\s*m/s", block, re.M)}


def main():
    failures = []
    results = {}
    for salt, rel in CASES.items():
        rc, out = run_case(ROOT / rel)
        j = result_of(out)
        if rc != 0 or j is None:
            print("check_sdem: FAILED")
            print(f"  {rel} did not run (exit {rc}):\n" + out[-1500:])
            return 1
        results[salt] = (j, out)

    # (a) electroneutral permeate
    for salt, (j, _) in results.items():
        q, qa = charge_of(j["streams"]["permeate"])
        if qa <= 0.0 or abs(q) / qa > 1e-9:
            failures.append(f"(a) {salt}: permeate charge {q:.3e} / {qa:.3e} = "
                            f"{q / qa if qa else float('nan'):.3e}, above 1e-9")

    # (b) the ambipolar identity against the paper's own salt permeances
    for salt, row in TABLE1.items():
        _, zp, Pp = row["cation"]; _, zm, Pm = row["anion"]
        Ps = ambipolar(zp, Pp, zm, Pm)
        if abs(Ps - row["Ps"]) / row["Ps"] > 0.05:
            failures.append(f"(b) {salt}: ambipolar P_s from the ion permeances is "
                            f"{Ps:.3f} um/s against the table's {row['Ps']} um/s")
    #  ... and the records ship exactly those ion values (the records are the
    #  engine's input; the table is the gate's).
    for salt, rel in CASES.items():
        rec = record_permeances(ROOT / rel)
        for key in ("cation", "anion"):
            ion, _, P_um = TABLE1[salt][key]
            if abs(rec.get(ion, 0.0) - P_um * 1e-6) > 1e-3 * P_um * 1e-6:
                failures.append(f"(b) {salt}: record ships {ion} = {rec.get(ion)} m/s, "
                                f"the table says {P_um} um/s")

    # (c) the engine obeys R = J_v / (J_v + P_s) for the dominant salt
    for salt, (j, _) in results.items():
        k = j["kpis"]["NF"]
        _, zp, Pp = TABLE1[salt]["cation"]; anion, zm, Pm = TABLE1[salt]["anion"]
        Ps = ambipolar(zp, Pp, zm, Pm) * 1e-6
        Jv = k["J_w_avg"]
        R_law = Jv / (Jv + Ps)
        R_eng = k["R_obs_" + anion]
        if abs(R_eng - R_law) > 0.02:
            failures.append(f"(c) {salt}: engine R_obs_{anion} = {R_eng:.4f} against the "
                            f"single-salt ambipolar law {R_law:.4f} at J_v = {Jv:.3e} m/s")

    # (d) the trace signs the paper's text states
    k = results["NaCl"][0]["kpis"]["NF"]
    if not (k["R_obs_NO3"] < k["R_obs_Cl"] and k["R_obs_NO3"] < 0.5):
        failures.append(f"(d) NaCl: NO3- rejection {k['R_obs_NO3']:.3f} is not below the "
                        f"dominant anion's {k['R_obs_Cl']:.3f} and below 0.5")
    if not (0.4 <= k["R_obs_NH4"] <= 0.8):
        failures.append(f"(d) NaCl: NH4+ rejection {k['R_obs_NH4']:.3f} outside the 40-80 % "
                        "the paper reports")
    k = results["MgSO4"][0]["kpis"]["NF"]
    if not (k["R_obs_NO3"] < 0.0):
        failures.append(f"(d) MgSO4: NO3- rejection {k['R_obs_NO3']:.3f} is not NEGATIVE")
    if not (k["R_obs_Na"] > 0.0 and k["R_obs_NH4"] > 0.0):
        failures.append("(d) MgSO4: a trace cation is not rejected "
                        f"(Na {k['R_obs_Na']:.3f}, NH4 {k['R_obs_NH4']:.3f})")
    if not (k["R_obs_SO4"] > 0.9):
        failures.append(f"(d) MgSO4: SO4 rejection {k['R_obs_SO4']:.3f} is not above 0.9")

    # (e) the field is published
    for salt, (j, _) in results.items():
        k = j["kpis"]["NF"]
        col = j.get("profiles", {}).get("NF", {}).get("columns", {}).get("psi_mV")
        if "membranePotential_mV_avg" not in k or abs(k["membranePotential_mV_avg"]) < 1e-3:
            failures.append(f"(e) {salt}: no non-zero membranePotential_mV_avg KPI")
        if not col or not all(abs(v) > 1e-3 for v in col):
            failures.append(f"(e) {salt}: no non-zero psi_mV profile column")

    # (f) the negative, and (g) the refusals -- probes built from the witness
    src = ROOT / CASES["NaCl"]
    with tempfile.TemporaryDirectory() as tmp:
        def probe(name, mutate):
            d = Path(tmp) / name
            shutil.copytree(src, d, ignore=shutil.ignore_patterns("converged", "log.*",
                                                                   "expected", "reports"))
            mutate(d)
            return run_case(d)

        def to_sd(d):
            p = d / "system" / "flowsheetDict"
            p.write_text(p.read_text().replace("transport        SDEM;",
                                               "transport        solutionDiffusion;"))
        rc, out = probe("uncoupled", to_sd)
        j = result_of(out)
        if rc != 0 or j is None:
            failures.append("(f) the uncoupled probe did not run:\n" + out[-800:])
        else:
            if "per-ion solution-diffusion without charge coupling" not in out:
                failures.append("(f) solutionDiffusion on an ionic feed did not announce "
                                "`per-ion solution-diffusion without charge coupling`")
            q, qa = charge_of(j["streams"]["permeate"])
            if qa > 0 and abs(q) / qa < 1e-6:
                failures.append(f"(f) the uncoupled permeate is neutral ({q / qa:.2e}) -- "
                                "the coupling is not what SDEM adds on this feed")

        def unbalance(d):
            p = d / "0" / "feed"
            p.write_text(re.sub(r"^(\s*Na\s+)([\d.]+)", lambda m: f"{m.group(1)}{float(m.group(2)) + 1e-4:.6g}",
                                p.read_text(), count=1, flags=re.M))
        rc, out = probe("unbalanced", unbalance)
        if rc == 0 or "not electroneutral" not in out:
            failures.append(f"(g) an unbalanced feed ran to exit {rc} without the refusal "
                            "naming `not electroneutral`")

        def strip_nh4(d):
            p = next((d / "constant" / "assets").glob("NF270_sdem_*.dat"))
            p.write_text(re.sub(r"^\s*NH4\s+[^\n]*\n", "", p.read_text(), flags=re.M))
        rc, out = probe("noPermeance", strip_nh4)
        if rc == 0 or "no permeance" not in out or "'NH4'" not in out:
            failures.append(f"(g) a record with no NH4 permeance ran to exit {rc} without "
                            "the refusal naming the ion")

    if failures:
        print("check_sdem: FAILED")
        for f in failures:
            print("  " + f)
        return 1
    print("check_sdem: OK -- both SDEM witnesses run here: permeate electroneutral to "
          "1e-9, the ambipolar identity reproduces all 4 Table 1 salt permeances "
          "(Fernandez de Labastida & Yaroshchuk 2021) within 5 %, the engine obeys "
          "R = J_v/(J_v+P_s) within 0.02 on the dominant anion, the paper's trace "
          "signs hold, the field is published, the uncoupled law announces itself "
          "and yields a charged permeate, and 2 refusals fire by name.  NOT CHECKED: "
          "per-point measured rejections (in the paper's figures, not transcribed), "
          "a polarisation film with a field, concentration-dependent permeances, "
          "the batch vessel under SDEM.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
