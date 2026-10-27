#!/usr/bin/env python3
"""A neutral species is not an ion: the molar mass of a mineral whose
dissolution master is NEUTRAL (DEV.md 4c C179).

The regression this exists to prevent (found 2026-10-27, Vitor, on a
volcanic-water cooling case run in the GUI): `SpeciationSolver::mineralMW`
weighed each dissolution master through `ionMW`, i.e. `findIon`, which
refuses a charge-0 species by design.  Silica dissolves to the NEUTRAL
H4SiO4 (SiO2 + 2 H2O = H4SiO4), so every silica phase -- SiO2a, chalcedony,
quartz -- killed the PRECIPITATION LEDGER with a fatal error, whether the
phase precipitated or stayed dissolved (the ledger weighs both).  The same
wrong abstraction converted a mass-basis analysis total (`H4SiO4 250 mg/L`).
Both now weigh through `aqueousSpeciesMW` (the generic aqueous lookup);
`findIon` keeps its refusal, and the molar mass keeps its one home, the
species record.

Arms, each run on the witness
tutorials/props/electrolyte/precipitation_volcanic_cooling:
  (a) the run exits 0 and every equilibrate op prints its ledger;
  (b) BOTH ledger paths are reached for a neutral-master phase: SiO2a
      stays dissolved (n = 0) at 55 C and precipitates (n > 0) at 20 C;
  (c) the mineral molar mass is RECOMPUTED from the records -- MW(H4SiO4)
      read from species/H4SiO4.dat minus 2 MW(water) read from
      components/water.dat -- and the printed mg/kg must equal n * MW for
      every silica line; SiO2 must come out at 60.083 g/mol;
  (d) the Si and Ca mole balances close: dissolved (every species in the
      op's CSV carrying the element) + precipitated = the declared total,
      the totals converted with the species records' own MW;
  (e) every equilibrated phase that precipitated sits at SI = 0, every one
      that stayed dissolved at SI < 0, and the 20 C quartz and chalcedony
      operations each bring their own phase to SI = 0;
  (f) SOURCE: findIon still refuses a neutral species, ionMW still goes
      through findIon, and neither mineralMW nor the mass-basis total calls
      ionMW.

WHAT THIS DOES NOT CHECK: whether the amounts are RIGHT against a measured
spring (the analysis is illustrative), or the existing calcite/gypsum
answers -- those are held by precipitation_ro_brackish's golden.

Exit 1 listing failures."""
import csv
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/props/electrolyte/precipitation_volcanic_cooling"
BIN = ROOT / "choupoProps"
STD = ROOT / "data/standards"

REL_TOL = 1.0e-7       # CSV molalities carry 9 significant figures
SI_TOL = 1.0e-6
SILICA = ("SiO2a", "chalcedony", "quartz")
FAM = {
    "Si": ("H4SiO4", "H3SiO4", "H2SiO4"),
    "Ca": ("Ca", "CaCO3aq", "CaHCO3", "CaHSO4", "CaOH", "CaSO4aq"),
}
SOLID_HOLDS = {"SiO2a": "Si", "chalcedony": "Si", "quartz": "Si",
               "calcite": "Ca", "gypsum": "Ca"}

fails = []


def fail(msg):
    fails.append(msg)


def record_mw(path):
    text = path.read_text(encoding="utf-8")
    m = (re.search(r"^\s*MW\s*\{\s*value\s+([0-9.eE+-]+)", text, re.M)
         or re.search(r"^\s*MW\s+([0-9.eE+-]+)\s*;", text, re.M))
    if not m:
        raise SystemExit(f"check_neutral_master_mineral: no MW in {path}")
    return float(m.group(1))


def main():
    if not BIN.exists():
        print("check_neutral_master_mineral: REFUSED -- no native choupoProps"
              " (run `make all` first)")
        return 1
    run = subprocess.run([str(BIN)], cwd=CASE, capture_output=True, text=True,
                         timeout=600)
    log = run.stdout + run.stderr

    # (a) -------------------------------------------------------------------
    if run.returncode != 0:
        tail = "\n".join(log.splitlines()[-5:])
        print("check_neutral_master_mineral: FAIL (a) the witness exited "
              f"{run.returncode}:\n{tail}")
        return 1
    ledgers = re.findall(r"PRECIPITATION LEDGER:\n((?:    .*\n)+)", log)
    ops_eq = ["eq_55C", "eq_45C", "eq_35C", "eq_25C", "eq_20C",
              "eq_20C_chalcedony", "eq_20C_quartz"]
    if len(ledgers) != len(ops_eq):
        fail(f"(a) {len(ledgers)} PRECIPITATION LEDGER block(s) printed,"
             f" {len(ops_eq)} equilibrate operations declared")
    led = dict(zip(ops_eq, ledgers))

    diag = {}
    for m in re.finditer(r'\{ "name": "([^"]+)", "type": "speciate", '
                         r'"diagnostics": \{([^}]*)\}', log):
        d = {}
        for k, v in re.findall(r'"([^"]+)":\s*([-0-9.eE+]+)', m.group(2)):
            d[k] = float(v)
        diag[m.group(1)] = d

    # (b) -------------------------------------------------------------------
    if not re.search(r"SiO2a\s+stayed dissolved \(n = 0\)", led.get("eq_55C", "")):
        fail("(b) SiO2a does not stay dissolved at 55 C -- the n = 0 ledger"
             " path is not reached for a neutral-master phase")
    if not re.search(r"SiO2a\s+n = [0-9.eE+-]+ mol/kg", led.get("eq_20C", "")):
        fail("(b) SiO2a does not precipitate at 20 C -- the n > 0 ledger path"
             " is not reached for a neutral-master phase")

    # (c) -------------------------------------------------------------------
    mw_h4sio4 = record_mw(STD / "species/H4SiO4.dat")
    mw_water = record_mw(STD / "components/water.dat")
    mw_sio2 = mw_h4sio4 - 2.0 * mw_water
    if abs(mw_sio2 - 60.083) > 1e-9:
        fail(f"(c) MW(SiO2) from the records = {mw_sio2:.6f} g/mol, expected"
             " 60.083")
    lines_checked = 0
    for op, body in led.items():
        for nm, n, mg in re.findall(r"(\w+)\s+n = ([0-9.eE+-]+) mol/kg = "
                                    r"([0-9.]+) mg/kg", body):
            if nm not in SILICA:
                continue
            lines_checked += 1
            want = float(n) * mw_sio2 * 1000.0
            if abs(float(mg) - want) > 0.0051 + 1e-4 * want:
                fail(f"(c) {op}: {nm} printed {mg} mg/kg, n * MW(SiO2) ="
                     f" {want:.3f} mg/kg")
    if lines_checked < 4:
        fail(f"(c) only {lines_checked} precipitating silica line(s) read --"
             " the arm needs SiO2a, chalcedony and quartz all precipitating")

    # (d) -------------------------------------------------------------------
    totals = {
        "Si": 250.0 / mw_h4sio4 / 1000.0,
        "Ca": 150.0 / record_mw(STD / "species/Ca.dat") / 1000.0,
    }
    for op in ["raw_55C"] + ops_eq:
        f = CASE / f"{op}.csv"
        if not f.exists():
            fail(f"(d) {op}: no {f.name} written")
            continue
        m = {r["species"]: float(r["molality"])
             for r in csv.DictReader(f.open())}
        d = diag.get(op, {})
        for el, total in totals.items():
            dis = sum(m.get(s, 0.0) for s in FAM[el])
            sol = sum(d.get("n_" + ph, 0.0)
                      for ph, holds in SOLID_HOLDS.items() if holds == el)
            err = (dis + sol - total) / total
            if abs(err) > REL_TOL:
                fail(f"(d) {op}: {el} balance off by {err:+.2e} relative"
                     f" (dissolved {dis:.6e} + solid {sol:.6e} vs {total:.6e})")

    # (e) -------------------------------------------------------------------
    for op in ops_eq:
        d = diag.get(op)
        if d is None:
            fail(f"(e) {op}: no diagnostics in the result")
            continue
        for key, n in d.items():
            if not key.startswith("n_"):
                continue
            ph = key[2:]
            si = d.get("SI_" + ph)
            if si is None:
                fail(f"(e) {op}: n_{ph} published without SI_{ph}")
            elif n > 0.0 and abs(si) > SI_TOL:
                fail(f"(e) {op}: {ph} precipitated (n = {n:.3e}) at SI = {si:+.2e}")
            elif n == 0.0 and si >= 0.0:
                fail(f"(e) {op}: {ph} stayed dissolved at SI = {si:+.3e} >= 0")
    for ph in ("chalcedony", "quartz"):
        d = diag.get(f"eq_20C_{ph}", {})
        if not d.get("n_" + ph, 0.0) > 0.0:
            fail(f"(e) eq_20C_{ph}: {ph} did not precipitate")

    # (g) THE NATIVE FIGURE (DEV.md 4c C180): the propsDict view draws, per
    #     mineral, one point per operation at (T_K, mass_<m>), and each point
    #     is the op's own published diagnostic -- the view computes nothing.
    vcsv = CASE / "postProcessing/case/precipitation_vs_T.csv"
    if not vcsv.exists():
        fail("(g) the view postProcessing/case/precipitation_vs_T.csv was not written")
    else:
        rows = list(csv.DictReader(vcsv.open()))
        seen = set()
        ops_T = ["eq_55C", "eq_45C", "eq_35C", "eq_25C", "eq_20C"]
        for r in rows:
            ph, x, y = r["series"], float(r["x"]), float(r["y"])
            # the axis is declared in degC: the view rescales the published
            # T_K (C182), so x + 273.15 must be the operation's own T_K
            match = [o for o in ops_T
                     if abs(diag.get(o, {}).get("T_K", -1) - (x + 273.15)) < 1e-9]
            if len(match) != 1:
                fail(f"(g) view point {ph} at x = {x} matches no single operation's T_K")
                continue
            d = diag[match[0]]
            want = d.get("mass_" + ph)
            if want is None or abs(y - want) > 1e-9 * max(1.0, abs(want)):
                fail(f"(g) view point {ph} at {x} K = {y}, operation"
                     f" {match[0]} publishes mass_{ph} = {want}")
            n = d.get("n_" + ph, 0.0)
            mw = mw_sio2 if ph in SILICA else None
            if mw and abs(y - n * mw * 1000.0) > 1e-6 * max(1.0, y):
                fail(f"(g) {match[0]}: mass_{ph} = {y} is not n * MW = {n * mw * 1000.0}")
            seen.add((ph, match[0]))
        if len(seen) != 15:
            fail(f"(g) the view holds {len(seen)} (mineral, temperature) points, 15 declared")

    # (f) -------------------------------------------------------------------
    salt = (ROOT / "src/thermo/electrolyte/SaltFromCatalogue.H").read_text()
    fi = re.search(r"inline DictPtr findIon\(.*?\n\}", salt, re.S)
    if not fi or "NEUTRAL" not in fi.group(0) or "== 0" not in fi.group(0):
        fail("(f) findIon no longer refuses a charge-0 species")
    im = re.search(r"inline double ionMW\(.*?\n\}", salt, re.S)
    if not im or "findIon(" not in im.group(0):
        fail("(f) ionMW no longer goes through findIon")
    spec = (ROOT / "src/thermo/electrolyte/SpeciationSolver.cpp").read_text()
    mm = re.search(r"double SpeciationSolver::mineralMW\(.*?\n\}", spec, re.S)
    if not mm or "ionMW(" in mm.group(0) or "aqueousSpeciesMW(" not in mm.group(0):
        fail("(f) SpeciationSolver::mineralMW does not weigh its masters"
             " through aqueousSpeciesMW")
    sp = (ROOT / "src/propertyOps/Speciate.cpp").read_text()
    sp_code = re.sub(r"//.*", "", sp)
    if "ionMW(" in sp_code or "aqueousSpeciesMW(" not in sp_code:
        fail("(f) Speciate.cpp's mass-basis total does not weigh through"
             " aqueousSpeciesMW")

    if fails:
        print("check_neutral_master_mineral: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print("check_neutral_master_mineral: OK -- a NEUTRAL dissolution master"
          f" (H4SiO4) is weighed by its species record: SiO2 = {mw_sio2:.3f}"
          f" g/mol, {lines_checked} precipitating silica ledger lines equal"
          " n * MW, SiO2a reaches both ledger paths (dissolved at 55 C,"
          f" precipitated at 20 C), Si and Ca close within {REL_TOL:g} on"
          f" {1 + len(ops_eq)} operations, every equilibrated phase sits at"
          " SI = 0 or SI < 0 with n = 0, the native view precipitation_vs_T"
          " draws each op's own (T_K, drawn in degC, mass_<m>) for 3 minerals x 5 T, and"
          " findIon still refuses a"
          " neutral (witness precipitation_volcanic_cooling; amounts NOT"
          " validated against a measured spring)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
