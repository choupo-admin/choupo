#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_unit_convention -- a key whose bare number is in a working unit
reads a declared unit too, and is read in one place.

    bin/curate/check_unit_convention.py

WHY THIS EXISTS (DEV.md 4c C454, first slice).  The parser converts a value
written with its unit to canonical SI (`Pc 220.64 bar;` -> 2.2064e7 Pa); a key
the code then reads BARE and treats as bar was a trap: `Pc 220.64 bar;` would
have run as 2.2064e7 bar, at exit 0, in every component, and nothing could see
it because every record writes the number bare.  The 2026-11-19 outside sweep
(docs/reviews/2026-11-19-units-correlations-edutools/units.md) counted 18 such
families; the widest were component `Pc` (bar) and `pressureDesign` (bar g,
read bare as bar by thirteen sizers and as Pa by the pressure exchanger -- one
key, two conventions, in one postDict).  `Dictionary::lookupScalarIn(key,
Dims, workingUnit)` is the one reader: bare keeps the working unit (no record
moves), a declared unit is converted.

ARMS.
  (a) SOURCE: every read of a key listed in WORKING_UNIT_KEYS goes through
      `lookupScalarIn` / `lookupScalarInOrDefault` -- a plain `lookupScalar*`
      of it is the trap coming back.
  (b) Pc, BEHAVIOUR: flash09_n2ch4_stryjek (a phi-phi PR flash, where Pc
      enters both phases) is run three times on an unsealed copy -- CH4's Pc
      bare (the catalogue's number), written `<same> bar;`, and written bare
      as the Pa number.  The first two must agree to 1e-12 on V/F; the third
      must NOT (it proves the run is sensitive to Pc, without which the first
      comparison would prove nothing).
  (c) pressureDesign, BEHAVIOUR: flash22_drum_sizing_benzene_toluene run
      with its bare `pressureDesign` and with the same number written `bar`
      must publish the same sizing numbers to 1e-12; ten times the number
      bare must move some (the sheet sees the pressure).

  (d) TEMPERATURE DIFFERENCES (family 2): every read of a key in
      TEMPERATURE_DIFFERENCE_KEYS goes through lookupTemperatureDifference
      (source), and gibbs13_adiabatic_approach_direction runs identically
      with `temperatureApproach 10 K;` and bare while `10 C;` is REFUSED by
      name -- before, `10 C` ran as a 283.15 K approach at exit 0.

  (e) YEARS (family 4): `yr` and `h` convert to SECONDS, so a bare-in-years
      key read plainly would run `projectLife 10 yr;` as 3.15e8 years.
      economics01's NPV must be the same with projectLife/depreciableLife
      bare and written `yr`; twice the life must move it.

  (f) THE SECOND SLICE (families 5, 8, 9, 10, 11, 12, 13): seven real cases
      (PROBES) run with the key bare, written in its working unit's word, and
      bare with another number.  Bare and declared give every number of the
      result to 1e-12; the other number must move one.  `TminC 273.15 K;` is
      `TminC 0;` (degC) -- the affine `0 C` of the old read was 273.15 degC.
  (g) gibbsReactor `Q` (family 18): a POWER (`Q 5 kW;`) is refused by its
      dimensions; it ran as 5 J/mol.
  Source arm (a) also holds FILE_SCOPED_KEYS (names too common to hold
  tree-wide: `m`, `from`, `to`, `Q`, `maxAAD`) and the degC bounds.

WHAT IT DOES NOT CHECK.  Whether `bar` is the RIGHT working unit (it is the
corpus convention, kept so no golden moves); keys read in the files this table
does not name (a new reader of `m` elsewhere is not seen); family 17 and the
bare conventions of P_max/phiL/wtAlcohol/fromMolality/maxAAD have no behaviour
probe (no shipped case writes them where a result number reads them), only the
source arm.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import case_records                                      # noqa: E402

ROOT = HERE.parents[1]
SCAN_ROOTS = ("tutorials",)  # the rglob walks a private copy of a tutorial case (copied from tutorials/)
BIN = ROOT / "build" / "linux64Gcc" / "choupoSolve"
BIN_PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
LABEL = "check_unit_convention"

#  Configuration, not a waiver: the keys whose bare number is in a working
#  unit, and that unit (docs/ai/dict-syntax.md lists the same keys).
WORKING_UNIT_KEYS = {"Pc": "bar", "pressureDesign": "bar",
                     "projectLife": "yr", "depreciableLife": "yr",
                     "constructionPeriod": "yr", "operatorAnnualHours": "h",
                     #  the families of the second C454 slice (units.md 5, 7-15)
                     "chargeDensity": "mol/m3", "P_max": "bar",
                     "wheelSpeed": "rpm", "totalMolality": "mol/kg",
                     "fromMolality": "mol/kg", "toMolality": "mol/kg",
                     "phiL": "cal/mol", "spaceVelocity": "1/h",
                     "baffleCutPercent": "percent", "targetSize": "um",
                     "wtAlcohol": "percent"}

#  A key whose NAME is too common to hold tree-wide (`m` is also UNIFAC's group
#  count, `Q` its surface area, `from`/`to` a range in a dozen ops): held in
#  the files that read it as the working unit, and only there.
FILE_SCOPED_KEYS = {
    "src/propertyOps/PitzerActivity.cpp":      {"m": "mol/kg", "from": "mol/kg", "to": "mol/kg"},
    "src/propertyOps/FreezingPoint.cpp":       {"m": "mol/kg", "from": "mol/kg", "to": "mol/kg"},
    "src/propertyOps/ENRTLMixedSolventOp.cpp": {"m": "mol/kg"},
    "src/thermo/ThermoPackageBuilder.cpp":     {"maxAAD": "percent"},
    "src/propertyOps/CatalogueLookup.cpp":     {"maxAAD": "percent"},
    #  family 18: a WRONG DIMENSION was accepted (`Q -500 kW;` ran as -500 J/mol)
    "src/unitOperations/reactor/GibbsReactor.cpp": {"Q": "kJ/kmol"},
}

#  `TminC`/`TmaxC` are degC, an AFFINE working unit lookupScalarIn refuses:
#  they are read by the one named helper `readCelsius` (family 13).
CELSIUS_KEYS = ("TminC", "TmaxC")

#  Configuration: keys that are a temperature DIFFERENCE (family 2) -- read
#  by Dictionary::lookupTemperatureDifference, which refuses an affine word.
TEMPERATURE_DIFFERENCE_KEYS = ("temperatureApproach", "superheat", "subcool",
                               "dTmin", "latentWidth", "LMTD")

FLASH = ROOT / "tutorials" / "steady" / "flash" / "flash09_n2ch4_stryjek"
SIZING = ROOT / "tutorials" / "steady" / "flash" / "flash22_drum_sizing_benzene_toluene"
ECON = ROOT / "tutorials" / "steady" / "economics" / "economics01_esterification_dcf"
APPROACH = ROOT / "tutorials" / "steady" / "gibbs" / "gibbs13_adiabatic_approach_direction"

fails = []


def arm_a():
    bad = []
    keys = "|".join(map(re.escape, WORKING_UNIT_KEYS))
    pat = re.compile(r'lookupScalar(?!In)\w*\(\s*"(' + keys + r')"')
    for p in sorted((ROOT / "src").rglob("*.[cH]*")):
        if p.suffix not in (".cpp", ".H"):
            continue
        for i, line in enumerate(p.read_text(errors="replace").split("\n"), 1):
            if line.lstrip().startswith("//"):
                continue
            m = pat.search(line)
            if m:
                bad.append("%s:%d reads `%s` without lookupScalarIn (bare would be "
                           "%s, a declared unit SI)" % (p.relative_to(ROOT), i, m.group(1),
                                                       WORKING_UNIT_KEYS[m.group(1)]))
    for rel, keyset in FILE_SCOPED_KEYS.items():
        p = ROOT / rel
        if not p.is_file():
            bad.append("%s: a FILE_SCOPED_KEYS file is gone -- update the table" % rel)
            continue
        spat = re.compile(r'lookupScalar(?!In)\w*\(\s*"(' + "|".join(map(re.escape, keyset)) + r')"')
        for i, line in enumerate(p.read_text(errors="replace").split("\n"), 1):
            if line.lstrip().startswith("//"):
                continue
            m = spat.search(line)
            if m:
                bad.append("%s:%d reads `%s` without lookupScalarIn (bare would be %s, "
                           "a declared unit SI)" % (rel, i, m.group(1), keyset[m.group(1)]))
    cpat = re.compile(r'lookupScalar\w*\(\s*"(' + "|".join(CELSIUS_KEYS) + r')"')
    for p in sorted((ROOT / "src").rglob("*.cpp")):
        for i, line in enumerate(p.read_text(errors="replace").split("\n"), 1):
            if not line.lstrip().startswith("//") and cpat.search(line):
                bad.append("%s:%d reads a degC bound without readCelsius (`0 C` would "
                           "be 273.15 degC)" % (p.relative_to(ROOT), i))
    tpat = re.compile(r'lookupScalar\w*\(\s*"(' + "|".join(TEMPERATURE_DIFFERENCE_KEYS) + r')"')
    for p in sorted((ROOT / "src").rglob("*")):
        if p.suffix not in (".cpp", ".H"):
            continue
        for i, line in enumerate(p.read_text(errors="replace").split("\n"), 1):
            if line.lstrip().startswith("//"):
                continue
            m = tpat.search(line)
            if m:
                bad.append("%s:%d reads the temperature DIFFERENCE `%s` without "
                           "lookupTemperatureDifference (`10 C` would be 283.15 K)"
                           % (p.relative_to(ROOT), i, m.group(1)))
    fails.extend(bad)
    return len(bad) == 0


def run(case, timeout=600, binary=None):
    """Run the engine on `case`.  A run past `timeout` is a FINDING, not a
    crash: the trap this gate guards can hang a run (projectLife 10 yr read
    as 3.15e8 years walks a cash flow of that many years)."""
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    try:
        p = subprocess.run([str(binary or BIN)], cwd=str(case), capture_output=True,
                           text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return -9, "the run did not finish in %d s" % timeout, None
    out = p.stdout + p.stderr
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    js = json.loads(m.group(1)) if m else None
    return p.returncode, out, js


def copy_unsealed(src, dst, keep_manifest=False):
    """A probe copy; the manifest is dropped only when the probe edits a
    RECORD (arm b) -- a probe that edits only system/ keeps the case's own
    resolution (economics01 run unsealed meets a Trange refusal its sealed
    records do not)."""
    outputs = {"converged", "reports", "iterations", "design", "economics"}
    top = str(Path(src).resolve())

    def ign(dirpath, names):
        #  Run outputs at the case root only: `constant/economics` is the
        #  case's own price file, not an output.
        return [n for n in names if n in outputs and str(Path(dirpath).resolve()) == top]
    if keep_manifest:
        #  A plain copy: materialising pinned records beside the manifest that
        #  pins them is refused (a local copy equal to the catalogue's).
        shutil.copytree(src, dst, ignore=ign)
        return dst
    case_records.copytree(src, dst, ignore=ign)
    if not keep_manifest:
        for man in dst.rglob("propertyManifest"):
            man.unlink()
    return dst


def kpi(js, unit, key):
    return js["kpis"][unit][key]


def arm_b(td):
    variants = {}
    for name in ("bare", "declared", "pa"):
        d = copy_unsealed(FLASH, Path(td) / ("pc_" + name))
        rec = d / "constant" / "components" / "CH4.dat"
        if not rec.is_file():
            fails.append("(b) the probe copy carries no components/CH4.dat -- STALE fixture")
            return False
        t = rec.read_text()
        m = re.search(r"(?m)^(Pc\s+)([0-9.eE+-]+)(\s*;)", t)
        if not m:
            fails.append("(b) CH4.dat has no bare `Pc <number>;` line -- STALE fixture")
            return False
        v = float(m.group(2))
        new = {"bare": m.group(0),
               "declared": "%s%s bar%s" % (m.group(1), m.group(2), m.group(3)),
               "pa": "%s%r%s" % (m.group(1), v * 1e5, m.group(3))}[name]
        rec.write_text(t[:m.start()] + new + t[m.end():])
        rc, out, js = run(d)
        if rc != 0 or js is None:
            fails.append("(b) %s run failed (exit %d): %s" % (name, rc, out[-400:]))
            return False
        variants[name] = kpi(js, "node", "V_over_F")
    ok = True
    if abs(variants["bare"] - variants["declared"]) > 1e-12 * max(1.0, abs(variants["bare"])):
        fails.append("(b) `Pc %s bar;` gives V/F %.15g, bare gives %.15g -- the declared unit "
                     "is not read as bar" % ("<v>", variants["declared"], variants["bare"]))
        ok = False
    if abs(variants["bare"] - variants["pa"]) < 1e-6:
        fails.append("(b) the run is insensitive to Pc (bare Pa number gives the same V/F) -- "
                     "the comparison proves nothing; choose another witness")
        ok = False
    return ok, variants


def sizing_numbers(js):
    """Every number the sizing pass published: each equipment item's
    `values {}` (wall, dimensions, weight ...) and its equipment-list row."""
    out = {}
    for it in js.get("equipment", []) or []:
        for k, v in (it.get("values") or {}).items():
            if isinstance(v, (int, float)):
                out[(it.get("item", "?"), k)] = v
    for row in (js.get("equipmentList") or {}).get("rows", []):
        for k, v in row.items():
            if isinstance(v, (int, float)):
                out[(row.get("itemId", "?"), "list." + k)] = v
    return out


def arm_c(td):
    res = {}
    for name in ("bare", "declared", "x10"):
        d = copy_unsealed(SIZING, Path(td) / ("pd_" + name))
        pd = d / "system" / "postDict"
        t = pd.read_text()
        ms = list(re.finditer(r"pressureDesign\s+([0-9.eE+-]+)\s*;", t))
        if not ms:
            fails.append("(c) the sizing witness declares no bare pressureDesign -- STALE fixture")
            return False
        if name != "bare":
            for m in reversed(ms):
                v = (m.group(1) + " bar") if name == "declared" else repr(10 * float(m.group(1)))
                t = t[:m.start()] + "pressureDesign %s;" % v + t[m.end():]
            pd.write_text(t)
        rc, out, js = run(d)
        if rc != 0 or js is None:
            fails.append("(c) %s run failed (exit %d): %s" % (name, rc, out[-400:]))
            return False
        res[name] = (sizing_numbers(js), js)
    a, b = res["bare"][0], res["declared"][0]
    if not a:
        fails.append("(c) the witness published no sizing numbers in its result -- STALE fixture")
        return False
    diff = [k for k in a if k not in b or abs(a[k] - b[k]) > 1e-12 * max(1.0, abs(a[k]))]
    x10 = res["x10"][0]
    if all(abs(a[k] - x10.get(k, a[k])) <= 1e-12 * max(1.0, abs(a[k])) for k in a):
        fails.append("(c) ten times the design pressure moved no published sizing number -- "
                     "the comparison proves nothing; choose another witness")
        return False
    if diff:
        fails.append("(c) `pressureDesign <v> bar;` moved %d sizing number(s), e.g. %s: %r -> %r"
                     % (len(diff), diff[0], a[diff[0]], b.get(diff[0])))
        return False
    return len(a)


def arm_d(td):
    """temperatureApproach: `10 K` equals bare; `10 C` is REFUSED by name."""
    out = {}
    for name, new in (("bare", None), ("kelvin", "temperatureApproach 10 K;"),
                      ("celsius", "temperatureApproach 10 C;")):
        d = copy_unsealed(APPROACH, Path(td) / ("dt_" + name))
        f = d / "system" / "flowsheetDict"
        t = f.read_text()
        old = "temperatureApproach 10;"
        if t.count(old) != 1:
            fails.append("(d) gibbs13 no longer holds `%s` exactly once -- STALE fixture" % old)
            return False
        if new:
            f.write_text(t.replace(old, new))
        rc, o, js = run(d)
        out[name] = (rc, o, js)
    rb, _, jb = out["bare"]
    rk, _, jk = out["kelvin"]
    if rb != 0 or rk != 0 or jb is None or jk is None:
        fails.append("(d) the bare or the K run failed (exit %d / %d)" % (rb, rk))
        return False
    a = kpi(jb, "bed3", "F_out_kmol_h")
    b = kpi(jk, "bed3", "F_out_kmol_h")
    if abs(a - b) > 1e-12 * max(1.0, abs(a)):
        fails.append("(d) `temperatureApproach 10 K;` gives F_out %.15g, bare gives %.15g" % (b, a))
        return False
    rc, o, _ = out["celsius"]
    if rc == 0 or "temperature DIFFERENCE" not in o:
        fails.append("(d) `temperatureApproach 10 C;` was not refused by name (exit %d) -- "
                     "an affine word would run as 283.15 K" % rc)
        return False
    return True


def arm_e(td):
    """projectLife / depreciableLife: `10 yr;` equals bare (yr converts to s)."""
    npv = {}
    for name in ("bare", "declared", "x2"):
        d = copy_unsealed(ECON, Path(td) / ("ec_" + name), keep_manifest=True)
        f = d / "system" / "postDict"
        t = f.read_text()
        for key in ("projectLife", "depreciableLife"):
            m = re.search(r"(?m)^(\s*" + key + r"\s+)([0-9.]+)(\s*;)", t)
            if not m:
                fails.append("(e) economics01 has no bare `%s` line -- STALE fixture" % key)
                return False
            if name == "declared":
                t = t[:m.start()] + m.group(1) + m.group(2) + " yr" + m.group(3) + t[m.end():]
            elif name == "x2" and key == "projectLife":
                t = t[:m.start()] + m.group(1) + repr(2 * float(m.group(2))) + m.group(3) + t[m.end():]
        f.write_text(t)
        rc, o, js = run(d, timeout=120)
        if rc != 0 or js is None:
            fails.append("(e) %s run failed (exit %d): %s" % (name, rc, o[-300:]))
            return False
        npv[name] = kpi(js, "economics", "NPV")
    if abs(npv["bare"] - npv["declared"]) > 1e-12 * max(1.0, abs(npv["bare"])):
        fails.append("(e) `projectLife 10 yr;` gives NPV %.15g, bare gives %.15g"
                     % (npv["declared"], npv["bare"]))
        return False
    if abs(npv["bare"] - npv["x2"]) < 1e-6 * abs(npv["bare"]):
        fails.append("(e) twice the project life moved no NPV -- the comparison proves nothing")
        return False
    return npv["bare"]


#  The second slice's families (units.md 5, 8, 10, 11, 12, 13, 9): each probe
#  runs a real case with the key written bare, written in its working unit's
#  word, and (a sensitivity) bare with another number.  bare == declared to
#  1e-12 on every number the result carries; the other number must move one.
#  (case, file, old text, declared text, other text, binary, edits-a-record)
PROBES = [
    ("wheelSpeed (family 8)", ROOT / "tutorials/steady/drying/sprayDryer07_design",
     "system/flowsheetDict", "wheelSpeed       20000;", "wheelSpeed       20000 rpm;",
     "wheelSpeed       10000;", BIN, False),
    ("targetSize (family 12)", ROOT / "tutorials/steady/drying/sprayDryer07_design",
     "system/postDict", "targetSize       40;", "targetSize       40 um;",
     "targetSize       20;", BIN, False),
    ("baffleCutPercent (family 11)",
     ROOT / "tutorials/steady/heat/heatExchanger04_bell_delaware_rating",
     "system/flowsheetDict", "baffleCutPercent     25;", "baffleCutPercent     25 percent;",
     "baffleCutPercent     35;", BIN, False),
    ("spaceVelocity (family 10)",
     ROOT / "tutorials/steady/economics/economics03_startup_years",
     "system/postDict", "spaceVelocity 20000;", "spaceVelocity 20000 1/h;",
     "spaceVelocity 10000;", BIN, False),
    ("TminC (family 13)", ROOT / "tutorials/props/heat/psychro01_n2_water",
     "system/propsDict", "TminC            0;", "TminC            273.15 K;",
     "TminC            10;", BIN_PROPS, False),
    ("totalMolality (family 9)",
     ROOT / "tutorials/props/electrolyte/enrtl_multisalt_nacl_kcl",
     "system/propsDict", "totalMolality 4.0;", "totalMolality 4.0 mol/kg;",
     "totalMolality 3.0;", BIN_PROPS, False),
    ("chargeDensity (family 5)",
     ROOT / "tutorials/steady/membranes/membrane10_dspmde_divalent",
     "constant/assets/NF270_dspmde.dat", "chargeDensity          -5;",
     "chargeDensity          -5 mol/m3;", "chargeDensity          -10;", BIN, True),
]


def numbers(js, prefix=""):
    """Every number a result carries, flattened (the whole result, not one KPI)."""
    out = {}
    if isinstance(js, dict):
        for k, v in js.items():
            out.update(numbers(v, prefix + "/" + str(k)))
    elif isinstance(js, list):
        for i, v in enumerate(js):
            out.update(numbers(v, prefix + "[%d]" % i))
    elif isinstance(js, (int, float)) and not isinstance(js, bool):
        out[prefix] = js
    return out


def arm_f(td):
    done = []
    for label, case, rel, old, decl, other, binary, record in PROBES:
        res = {}
        for name, new in (("bare", None), ("declared", decl), ("other", other)):
            d = copy_unsealed(case, Path(td) / ("f_%s_%s" % (label.split()[0], name)),
                              keep_manifest=not record)
            if record:
                #  the manifest was dropped to edit a record: the case's held
                #  copies of catalogue records become undeclared homonyms
                case_records.declare_homonyms(d)
            f = d / rel
            t = f.read_text()
            if t.count(old) < 1:
                fails.append("(f) %s: `%s` not in %s -- STALE fixture" % (label, old, rel))
                break
            if new:
                f.write_text(t.replace(old, new))
            rc, o, js = run(d, timeout=300, binary=binary)
            if rc != 0 or js is None:
                fails.append("(f) %s: the %s run failed (exit %d): %s" % (label, name, rc, o[-300:]))
                break
            res[name] = numbers(js)
        else:
            a, b, c = res["bare"], res["declared"], res["other"]
            if not a:
                fails.append("(f) %s: the result carries no numbers -- STALE fixture" % label)
                continue
            bad = [k for k in a if k not in b or abs(a[k] - b[k]) > 1e-12 * max(1.0, abs(a[k]))]
            if bad:
                fails.append("(f) %s: the declared word moved %d number(s), e.g. %s: %r -> %r"
                             % (label, len(bad), bad[0], a[bad[0]], b.get(bad[0])))
                continue
            if all(k in c and abs(a[k] - c[k]) <= 1e-12 * max(1.0, abs(a[k])) for k in a):
                fails.append("(f) %s: another number moved nothing -- the comparison proves "
                             "nothing; choose another witness" % label)
                continue
            done.append(label.split()[0])
    return done


def arm_g(td):
    """gibbsReactor Q (family 18): a POWER is refused by its dimensions."""
    d = copy_unsealed(APPROACH, Path(td) / "q_kw", keep_manifest=True)
    f = d / "system" / "flowsheetDict"
    t = f.read_text()
    old = "temperatureApproach 10;"
    if t.count(old) != 1:
        fails.append("(g) gibbs13 no longer holds `%s` exactly once -- STALE fixture" % old)
        return False
    f.write_text(t.replace(old, old + "  Q 5 kW;"))
    rc, o, _ = run(d)
    if rc == 0 or "dimension" not in o.lower():
        fails.append("(g) `Q 5 kW;` on a gibbsReactor was not refused by its dimensions (exit %d)" % rc)
        return False
    return True


def main():
    if not BIN.is_file():
        print("%s: FAILED -- no engine binary at %s (run `make all`); a check that "
              "cannot run must not pass" % (LABEL, BIN))
        return 1
    a_ok = arm_a()
    with tempfile.TemporaryDirectory(prefix="unitconv.") as td:
        b = arm_b(td)
        c = arm_c(td)
        d = arm_d(td)
        e = arm_e(td)
        f = arm_f(td)
        g = arm_g(td)
    if fails:
        for f in fails:
            print("  " + f)
        print("%s: FAILED (%d finding(s))" % (LABEL, len(fails)))
        return 1
    _, v = b
    print("%s: OK (a) every read of %s goes through lookupScalarIn; (b) flash09's "
          "V/F is %.12g with CH4's Pc bare and with it written `bar`, and %.6g with "
          "the Pa number bare (the run sees Pc); (c) %d published sizing numbers of "
          "flash22 are identical with pressureDesign bare and written `bar` (ten times the pressure moves them: the sheet sees it); (d) "
          "every read of the temperature differences %s goes through "
          "lookupTemperatureDifference, and gibbs13 runs identically with "
          "`temperatureApproach 10 K;` and bare while `10 C;` is refused by name; (e) economics01's NPV "
          "is the same with projectLife/depreciableLife bare and written `yr` (twice "
          "the life moves it); (f) probes %s run identically bare and written in the "
          "working unit's word (another number moves them); (g) `Q 5 kW;` on a gibbsReactor "
          "is refused by its dimensions.  NOT checked: P_max, phiL, wtAlcohol, fromMolality, "
          "maxAAD have the source arm only (no probe)."
          % (LABEL, " and ".join("`%s` (%s)" % kv for kv in WORKING_UNIT_KEYS.items()),
             v["bare"], v["pa"], c, "/".join(TEMPERATURE_DIFFERENCE_KEYS), ", ".join(f)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
