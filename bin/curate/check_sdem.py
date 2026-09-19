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
  (h) THE PAPER'S FIGURES, DIGITISED (2026-09-15): the SDEM lines the
      authors drew through their measured points -- their Eq. (3), the
      analytical TRACE-LIMIT solution with the Table 1 permeances -- were
      read off the published figures by bin/curate/digitise_fdl2021.py into
      the NaCl witness's constant/experimental/fdl2021_figures.csv (calibration verified
      against the tick labels, reading error declared per point).  For each
      trace series whose permeances the paper DETERMINES, a probe is built
      from the witness with that salt's Table 1 row and the traces at 1e-3 of
      the paper's concentration (the trace limit the lines assume), the feed
      pressure is driven to the figure's own J_v, and the engine's
      f = 1/(1-R) must reproduce the drawn line within the band stated in
      LINE_BANDS -- sized to the residual MEASURED on the day, so a
      regression that widens the gap fails.  Two fluxes per series: the 2nd
      and the 2nd-to-last of those under a line, because the 1st sits where
      f ~ 1 (a sign reversal, where a relative band is meaningless) and the
      last is where the authors' lines often stop.  Left OUT, with the paper's own
      words: NH4 under NaCl ('>60, the fit became insensitive' -- the engine
      needs ~1000 um/s to meet that line) and NH4 under Na2SO4 (both its own
      permeance and Na's are 'orientative').
  (i) A TRACE IS NOT A TRACE WHEN THE DOMINANT ANION IS 100x SLOWER: on the
      MgSO4 feed at the paper's own 2e-4 M, the trace anions carry the anion
      current the 0.13 um/s sulfate cannot, the field relaxes, and the
      engine's NO3 f is >= 1.25x its trace-limit value while the trace
      cations' f is <= 0.6x (measured 1.37 and 0.45).  This is the size of
      the correction the paper's trace-limit fit neglects, and the reason
      the engine at 2e-4 M does NOT reproduce the sulfate lines: pinned as a
      lesson, with its margin.
  (j) THE STALE PIN on the source: Fig 2a's drawn MgCl2 line is NOT Eq. (1)
      with the Table 1 P_s = 6.1 um/s (at 44 um/s it reads 5.5 where Eq. (1)
      gives 8.3, and the measured points follow the line); the CSV must keep
      showing that gap, so the day a re-digitisation closes it this arm asks
      for its pin back.  The engine's answer agrees with Eq. (1), not with
      the drawn line, and that is recorded rather than tuned.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
Arm (h) compares the engine with the authors' FITTED LINES, never with the
measured symbols: the symbols scatter about the lines by the authors' own
fit residual (up to ~15 % in f on Fig 1a's last point), and the model cannot
be held to a residual its own source accepted.  The symbols are in the CSV
for a reader; no arm pins them.  The polarisation film on both witnesses is per
ion and field-free (the default, which the law and the module announce);
the film WITH a field -- the Geraldes & Afonso 2007 interface model, declared
by `polarisation { ionCoupling electroneutral; }` -- is membrane14's and is
gated by check_polarisation_coupling, not here.  Concentration dependence of
the permeances is outside the model.  The batch vessel
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


#  The trace-ion permeances of the same table (um/s), with the bound taken
#  where the paper gives one; NH4 under NaCl / Na2SO4 are listed for the
#  probes but arm (h) does not hold the engine to their lines (see above).
TRACES = {
    "NaCl":   {"NO3": 13.8, "NH4": 60.0},
    "MgCl2":  {"Na": 250.0, "NH4": 700.0, "NO3": 16.9},
    "Na2SO4": {"NH4": 100.0, "Cl": 3.4, "NO3": 9.8},
    "MgSO4":  {"Na": 79.4, "NH4": 80.0, "Cl": 15.7, "NO3": 41.9},
}
#  Relative band on f = 1/(1-R) between the engine in the trace limit and the
#  drawn line, per (salt, trace).  MEASURED 2026-09-15 (max over the 2nd and
#  6th points): NaCl NO3 0.074; MgCl2 NO3 0.071, Na 0.025, NH4 0.096;
#  Na2SO4 Cl 0.083, NO3 0.082; MgSO4 Na 0.05, NH4 0.035, Cl 0.053, NO3 0.079.
#  The band is that residual with ~50 % headroom, never wider than the
#  reading error justifies, and one number per series so a series that
#  drifts is named.
LINE_BANDS = {
    ("NaCl", "NO3"): 0.11,
    ("MgCl2", "NO3"): 0.11, ("MgCl2", "Na"): 0.05, ("MgCl2", "NH4"): 0.14,
    ("Na2SO4", "Cl"): 0.12, ("Na2SO4", "NO3"): 0.12,
    ("MgSO4", "Na"): 0.08, ("MgSO4", "Cl"): 0.08, ("MgSO4", "NO3"): 0.12,
}
#  Not in LINE_BANDS: MgSO4/NH4 -- only 3 of its 7 triangles show from under the
#  Na diamonds (2 with a line); its drawn line lies within 1 % of Na's, which
#  IS held.  MgCl2/Na shows 5 of 7 (two under NH4 triangles), enough.
FEED_M = {  # the paper's feeds: dominant salt 0.01 mol/L, ion by ion (mol/L)
    "NaCl": {"Na": 0.01, "Cl": 0.01}, "MgCl2": {"Mg": 0.01, "Cl": 0.02},
    "Na2SO4": {"Na": 0.02, "SO4": 0.01}, "MgSO4": {"Mg": 0.01, "SO4": 0.01},
}
TRACE_M = 2e-4      # each trace SALT (NaNO3, NH4Cl): NO3, NH4 and one Na and one Cl each
CSV_REL = "tutorials/steady/membranes/membrane12_sdem_nf270_nacl_traces/constant/experimental/fdl2021_figures.csv"


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


def read_figures():
    import csv
    rows = []
    with open(ROOT / CSV_REL) as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            fig, salt, series, axis, x, dx, fe, dfe, fl, q, *_ = line.strip().split(",")
            rows.append(dict(figure=fig, salt=salt, series=series, x=float(x), dx=float(dx),
                             f_exp=float(fe), df=float(dfe), f_line=(float(fl) if fl else None),
                             quality=q))
    return rows


def build_probe(dst, salt, trace_scale):
    """A one-element intrinsic SDEM case for `salt`, built from the NaCl
    witness: the Table 1 row as its record, the paper's feed with the trace
    salts at TRACE_M * trace_scale, k_film 1 m/s and a 1 mbar element so the
    run is uniform and film-free."""
    src = ROOT / CASES["NaCl"]
    #  A PROBE IS NOT ITS DONOR.  The witnesses are SEALED cases, and a sealed
    #  manifest forbids the runtime every catalogue fallback -- so a probe that
    #  copies one and then WIDENS its component set (a second salt, a third ion)
    #  refuses at the resolver seam before it can reach the behaviour under test.
    #  The sealed manifest is the donor's, and this is not the donor (the same
    #  move as check_feed_thermal_state's and check_evaporator_chest_phase's
    #  probe builders).
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("converged", "log.*", "expected",
                                                            "reports", "experimental",
                                                            "propertyManifest"))
    cat, zc, Pc = TABLE1[salt]["cation"]; an, za, Pa = TABLE1[salt]["anion"]
    feed = dict(FEED_M[salt])
    tr = TRACE_M * trace_scale
    for ion in ("NO3", "NH4", "Na", "Cl"):          # NaNO3 + NH4Cl
        feed[ion] = feed.get(ion, 0.0) + tr
    ions = [cat, an] + [i for i in ("Na", "NH4", "Cl", "NO3") if i not in (cat, an)]
    perms = {cat: Pc, an: Pa}
    perms.update(TRACES[salt])
    # components: the witness carries Na Cl NO3 NH4; Mg and SO4 come from the MgSO4 witness
    comp = dst / "constant" / "components"
    for ion in ions:
        if not (comp / f"{ion}.dat").exists():
            shutil.copy(ROOT / CASES["MgSO4"] / "constant" / "components" / f"{ion}.dat", comp)
    for f in (dst / "constant" / "assets").glob("NF270_sdem_*.dat"):
        f.unlink()
    (dst / "constant" / "assets" / f"NF270_probe_{salt}.dat").write_text(
        "// gate probe: Table 1 row %s of Fernandez de Labastida & Yaroshchuk, Membranes 11 (2021) 272 (CC BY 4.0)\n"
        "name           NF270_probe_%s;\nkind           NF;\nmanufacturer   \"DuPont FilmTec\";\n"
        "A_w            1.0e-5  m/s/bar;\nprovenance     primarySource;\n"
        "source         \"Fernandez de Labastida & Yaroshchuk, Membranes 11 (2021) 272, Table 1\";\n"
        "licence        CC-BY-4.0;\npermeabilities\n{\n%s}\nP_max 41.4;\nT_max 318;\npH_min 3;\npH_max 10;\nMWCO 200;\n"
        % (salt, salt, "".join(f"    {i:<7} {perms[i] * 1e-6:.4e}  m/s;\n" for i in ions)))
    fd = dst / "system" / "flowsheetDict"
    t = fd.read_text()
    t = re.sub(r"membrane\s+NF270_sdem_\w+;", f"membrane         NF270_probe_{salt};", t)
    t = re.sub(r"k_film\s+[0-9.e-]+;", "k_film           1.0;", t)
    t = re.sub(r"dP_feed_total\s+[0-9.e-]+ bar;", "dP_feed_total    0.001 bar;", t)
    fd.write_text(t)
    tp = dst / "constant" / "thermoPhysPropDict"
    tp.write_text(re.sub(r"components\s*\([^)]*\);", "components       ( water " + " ".join(ions) + " );",
                         tp.read_text()))
    for st in ("feed", "permeate", "retentate"):
        p = dst / "0" / st
        if st == "feed":
            blk = "componentMolarFlows\n{\n    water   55.508 kmol/h;\n" + "".join(
                f"    {i:<7} {feed[i]:.10g} kmol/h;\n" for i in ions) + "}"
        else:
            blk = "componentMolarFlows\n{\n    water   1.0 kmol/h;\n" + "".join(
                f"    {i:<7} 1e-5 kmol/h;\n" for i in ions) + "}"
        p.write_text(re.sub(r"componentMolarFlows\s*\{[^}]*\}", blk, p.read_text()))


def run_at_flux(dst, Jv_umps):
    """Drive the feed pressure until J_w_avg is the figure's J_v (to 0.5 %,
    a tenth of the reading error in x); returns the KPI dict."""
    J = Jv_umps * 1e-6; Aw_Pa = 1.0e-5 / 1e5
    feed = dst / "0" / "feed"
    P = 1.0e5 + J / Aw_Pa + 0.6e5              # 1 bar permeate + hydraulic + an osmotic guess
    k = None
    for _ in range(6):
        feed.write_text(re.sub(r"\nP\s+[0-9.e+]+ Pa;", f"\nP               {P:.6g} Pa;", feed.read_text()))
        rc, out = run_case(dst)
        j = result_of(out)
        if rc != 0 or j is None:
            raise RuntimeError(f"probe {dst.name} at P = {P / 1e5:.3f} bar did not run (exit {rc}):\n" + out[-1200:])
        k = j["kpis"]["NF"]
        if abs(k["J_w_avg"] - J) / J < 5e-3:
            return k
        P += (J - k["J_w_avg"]) / Aw_Pa
    raise RuntimeError(f"probe {dst.name}: flux not matched, {k['J_w_avg']:.3e} vs {J:.3e} m/s")


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
            #  the donor is sealed -- see the note in build_probe
            shutil.copytree(src, d, ignore=shutil.ignore_patterns("converged", "log.*",
                                                                   "expected", "reports",
                                                                   "propertyManifest"))
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

    # (h) the paper's lines in the trace limit, (i) the not-a-trace correction,
    # (j) the stale pin on Fig 2a
    figs = read_figures()
    n_series = len({(r["figure"], r["series"]) for r in figs})
    if len(figs) != 106 or n_series != 16:
        failures.append(f"(h) {CSV_REL} holds {len(figs)} points in {n_series} series; 106 in 16 expected")
    # the seven fluxes of one figure are one experiment: every series' x must coincide
    for fig in sorted({r["figure"] for r in figs}):
        xs = sorted({round(r["x"], 0) for r in figs if r["figure"] == fig})
        if len(xs) > 8:
            failures.append(f"(h) {fig}: the series do not share their fluxes ({xs})")
    checked = 0
    with tempfile.TemporaryDirectory() as tmp:
        probes = {}
        for salt in TABLE1:
            d = Path(tmp) / f"tl_{salt}"; build_probe(d, salt, 1e-3); probes[salt] = d
        for (salt, trace), band in sorted(LINE_BANDS.items()):
            pts = sorted((r for r in figs if r["salt"] == salt and r["series"] == trace and r["f_line"]),
                         key=lambda r: r["x"])
            if len(pts) < 5:
                failures.append(f"(h) {salt}/{trace}: only {len(pts)} digitised point(s) with a line")
                continue
            for r in (pts[1], pts[-2]):        # the 2nd and the 2nd-to-last with a line
                try:
                    k = run_at_flux(probes[salt], r["x"])
                except RuntimeError as e:
                    failures.append(f"(h) {salt}/{trace} at {r['x']:.2f} um/s: {e}"); continue
                f_eng = 1.0 / (1.0 - k["R_obs_" + trace])
                dev = abs(f_eng / r["f_line"] - 1.0)
                checked += 1
                if dev > band:
                    failures.append(f"(h) {salt}/{trace} at J_v {r['x']:.2f} um/s: engine (trace limit) "
                                    f"f = {f_eng:.3f} vs the paper's line {r['f_line']:.3f} "
                                    f"({dev * 100:.1f} %, band {band * 100:.0f} %)")
        # (i) MgSO4 at the 5th measured flux, the paper's 2e-4 M against the trace limit
        pts = sorted((r for r in figs if r["salt"] == "MgSO4" and r["series"] == "NO3"), key=lambda r: r["x"])
        x5 = pts[4]["x"]
        d2 = Path(tmp) / "real_MgSO4"; build_probe(d2, "MgSO4", 1.0)
        try:
            kr = run_at_flux(d2, x5); kt = run_at_flux(probes["MgSO4"], x5)
            fr = {i: 1.0 / (1.0 - kr["R_obs_" + i]) for i in ("NO3", "Na", "NH4")}
            ft = {i: 1.0 / (1.0 - kt["R_obs_" + i]) for i in ("NO3", "Na", "NH4")}
            if not fr["NO3"] / ft["NO3"] >= 1.25:
                failures.append(f"(i) MgSO4 at {x5:.1f} um/s: NO3 f at 2e-4 M is {fr['NO3']:.3f}, "
                                f"{fr['NO3'] / ft['NO3']:.2f}x the trace limit's {ft['NO3']:.3f} -- below 1.25")
            for i in ("Na", "NH4"):
                if not fr[i] / ft[i] <= 0.6:
                    failures.append(f"(i) MgSO4 at {x5:.1f} um/s: {i} f at 2e-4 M is {fr[i]:.3f}, "
                                    f"{fr[i] / ft[i]:.2f}x the trace limit's {ft[i]:.3f} -- above 0.6")
        except RuntimeError as e:
            failures.append(f"(i) {e}")
    # (j) Fig 2a's line is not Eq. (1) with the table's P_s -- the pin on the source
    pts = sorted((r for r in figs if r["figure"] == "g002a" and r["f_line"]), key=lambda r: r["x"])
    r6 = pts[5]; f_eq1 = 1.0 + r6["x"] / TABLE1["MgCl2"]["Ps"]
    if abs(r6["f_line"] / f_eq1 - 1.0) < 0.10:
        failures.append(f"(j) Fig 2a's MgCl2 line at {r6['x']:.1f} um/s reads {r6['f_line']:.2f}, within 10 % of "
                        f"Eq. (1)'s {f_eq1:.2f} -- the recorded gap has closed; take this pin back and re-read "
                        "docs/design/electroneutrality-without-a-new-parameter.md section 7")

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
          "and yields a charged permeate, and 2 refusals fire by name; the engine in the "
          f"TRACE LIMIT reproduces the paper's digitised SDEM lines at {checked} (salt, trace, flux) "
          "point(s) across all four dominant salts within the per-series bands, the 2e-4 M "
          "not-a-trace correction on MgSO4 keeps its measured size, and Fig 2a's line still "
          "disagrees with Eq. (1) (pinned as the source's own inconsistency).  NOT CHECKED: the "
          "measured SYMBOLS themselves (in the CSV, compared by nobody -- the model is held to "
          "the authors' fit, not to their fit residual), NH4 under NaCl and Na2SO4 (permeances the "
          "paper leaves as bounds), the coupled polarisation film (membrane14, gated by "
          "check_polarisation_coupling), concentration-dependent permeances, the batch vessel "
          "under SDEM.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
