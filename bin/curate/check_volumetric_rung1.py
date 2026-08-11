#!/usr/bin/env python3
"""Gate: the volumetric-model slot, and rung 1 (standardStateVolumes).

    bin/curate/check_volumetric_rung1.py

WHY THIS EXISTS.  Vitor ruled (2026-08-11) a FIRST explicit volumetric rung:
ideal volumetric mixing on the infinite-dilution standard state (V_E = 0),
direct and algebraic, as one legitimate formulation inside an extensible
slot -- never a shortcut hard-wired into aqueousAnalysis, and never the
constant-map "iteration" of the rejected slice-B build.  What has to be
true, and is checked here:

  (V1) THE ENGINE'S OWN ARITHMETIC.  The witness case run under
       `volumetric { method standardStateVolumes; }` writes a
       densityDerivation record whose terms this gate re-derives
       INDEPENDENTLY: phi = Sum n V0, soluteMass = Sum n MW, and
       rho = rhoWater*(1 - phi) + soluteMass, each to 1e-9 relative.  The
       record must also declare `excessVolume 0` -- the model's defining
       claim, stated rather than implied.

  (V2) EXTERNAL DENSITY ANCHORS (the measurement, not the model's own
       output).  Electroneutral salt sums built FROM THE CURATED RECORDS
       are used to predict rho(m) at 25 C for NaCl (Rogers & Pitzer 1982)
       and KCl (Isono 1984), and compared with the MEASURED values inside
       per-point bands.  Two things this pins that nothing else can:
         * the CURATION -- V0(Na)+V0(Cl) = 16.62 and V0(K)+V0(Cl) = 26.85
           reproduce the literature salt volumes, which is what a
           sign-flipped single ion could not do (the DWSIM K+ = -9
           precedent would give 8.83);
         * the VALIDITY CLAIM, measured in BOTH directions: the model is
           within 0.15 % to 1 molal, and DEGRADES to ~+0.7 % at 3 molal.
           The 3 molal point is pinned as a FLOOR too -- if the error ever
           shrinks below 0.3 % there, the declared ~1 mol/kg validity has
           silently changed and the claim must be re-derived, not enjoyed.

  (V3) CONVENTION INVARIANCE, THROUGH THE ENGINE.  Single-ion V0 are
       conventional (V0(H+) = 0); only electroneutral sums are physical.
       Shifting every V0 by lambda*z and re-running must give the SAME
       density, because the reconciled inventory is charge-closed
       (Sum n z = 0).  Checked at 1e-12 relative -- the identity is exact,
       but summation order is not, so this is a tight numerical tolerance
       and NOT a bit-level claim (Vitor's refinement, 2026-08-11).

  (V4) THE REFUSALS, each by name: a master with no volumetric block (the
       DWSIM silent-zero-volume failure), a V0 with no convention, mixed
       conventions in one sum, an unregistered method, `provenance derived`
       with no method declared, and the shared domain refusals.

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * ACCURACY BEYOND THE ANCHORED RANGE.  V_E = 0 is an approximation whose
    error grows with concentration; the anchors measure it to 3 molal for
    two 1-1 salts and say nothing about 2-1 salts, mixed brines, or
    temperatures away from 25 C (the V0 records carry a +-5 K Trange).
  * ANY composition dependence.  V0 is constant by construction here;
    rung 2 (V_i(T, I), excess volume, Pitzer volumetrics) does not exist,
    and the genuinely ITERATIVE density closure of aqueousAnalysis slice B
    stays BLOCKED on it.
  * the reconciliation and inversion arithmetic (their own gates).

SABOTAGE-VERIFIED 2026-08-11; OBSERVED output recorded, not predicted.

Sabotage 1 -- K+ sign-flipped in the curated record (the DWSIM precedent
reproduced deliberately):

    check_volumetric_rung1: FAILED
      V2: KCl at 0.5 m: model 1029.69 kg/m3 vs measured 1020.6 (dev
      +0.890 %, band 0.150 %) -- the curated electroneutral sum does not
      reproduce the measurement
      V2: KCl at 1.0 m: ... (dev +1.826 %, band 0.250 %)
    WORTH KNOWING: the 0.1 m point stays INSIDE its band under the flip.
    A single dilute anchor would not have caught a sign-flipped ion --
    which is why the set spans 0.1 to 3 molal rather than one point.

Sabotage 2 -- the missing-volumetric refusal removed (silent zero volume):

    check_volumetric_rung1: FAILED
      V4/no-volumetric: a master with no volumetric data was ACCEPTED --
      mass counted with volume dropped is rung 0 wearing rung 1's name
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE = os.path.join(ROOT, "tutorials", "steady", "flash",
                    "analysis01_water_analysis_inlet")
SOLVE = os.path.join(ROOT, "build", "linux64Gcc", "choupoSolve")
IMPORT = os.path.join(ROOT, "bin", "choupo-import")
ENV = dict(os.environ, CHOUPO_HOME=ROOT)
MEASURED = "density   { value 998.4 kg/m3;  provenance measured; }"
RUNG1 = ("density   { provenance derived; "
         "volumetric { method standardStateVolumes; } }")

fails = []


def rho_kell(t):
    num = (999.83952 + 16.945176 * t - 7.9870401e-3 * t * t
           - 46.170461e-6 * t ** 3 + 105.56302e-9 * t ** 4
           - 280.54253e-12 * t ** 5)
    return num / (1.0 + 16.879850e-3 * t)


def curated_V0(species):
    """V0 read from the species record on disk -- the gate never imports the
    number it checks from the engine."""
    p = os.path.join(ROOT, "data", "standards", "species", species + ".dat")
    s = open(p, encoding="utf-8").read()
    b = re.search(r"volumetric\s*\{(.*?)\n\}", s, re.S)
    if not b:
        return None
    m = re.search(r"V0\s*\{\s*value\s+([0-9.eE+-]+)", b.group(1))
    return float(m.group(1)) if m else None


def staged(density_line, mutate_records=None, unseal=False, do_import=True):
    d = tempfile.mkdtemp(prefix="rung1_")
    dst = os.path.join(d, "case")
    shutil.copytree(CASE, dst)
    p = os.path.join(dst, "0", "feed")
    s = open(p, encoding="utf-8").read()
    if MEASURED not in s:
        shutil.rmtree(d, ignore_errors=True)
        return None, None, "the witness's measured density line moved"
    open(p, "w", encoding="utf-8").write(s.replace(MEASURED, density_line))
    if do_import:
        subprocess.run([sys.executable, IMPORT, dst], env=ENV,
                       capture_output=True, text=True, timeout=900)
    if unseal:
        mf = os.path.join(dst, "constant", "propertyManifest")
        if os.path.exists(mf):
            os.remove(mf)
    if mutate_records:
        mutate_records(os.path.join(dst, "constant", "species"))
    pr = subprocess.run([SOLVE], cwd=dst, env=ENV, capture_output=True,
                        text=True, timeout=900)
    return (d, dst), (pr.returncode, pr.stdout + pr.stderr), None


def derivation(case_dir):
    conv = open(os.path.join(case_dir, "converged", "feed"),
                encoding="utf-8").read()
    b = re.search(r"densityDerivation\s*\{(.*?)\n        \}", conv, re.S)
    return (b.group(1) if b else None), conv


# ---- V1: the engine's own arithmetic, re-derived -------------------------
st, res, err = staged(RUNG1)
if err:
    fails.append("V1: " + err)
else:
    rc, out = res
    if rc != 0:
        fails.append("V1: the rung-1 witness refused -- " + out[-400:])
    else:
        blk, _ = derivation(st[1])
        if not blk:
            fails.append("V1: no densityDerivation record was written")
        else:
            if "method             standardStateVolumes;" not in blk:
                fails.append("V1: the record does not name its method")
            if "excessVolume       0;" not in blk:
                fails.append("V1: the record does not state `excessVolume 0` "
                             "-- V_E = 0 is the model's defining claim and "
                             "must be stated, not implied")
            g = {k: float(re.search(rf"{k}\s+([0-9.eE+-]+)", blk).group(1))
                 for k in ("rhoWater", "soluteVolumeFrac", "soluteMass",
                           "final") if re.search(rf"{k}\s+([0-9.eE+-]+)", blk)}
            terms = re.findall(
                r"(\w+) \{ molPerL ([0-9.eE+-]+); V0 ([0-9.eE+-]+) cm3/mol;"
                r" MW ([0-9.eE+-]+) g/mol; z ([0-9.eE+-]+);"
                r" convention (\S+); \}", blk)
            if not terms:
                fails.append("V1: the record carries no per-master terms")
            else:
                phi = sum(float(n) * float(v) * 1e-3 for _, n, v, _, _, _ in terms)
                sm = sum(float(n) * float(mw) for _, n, _, mw, _, _ in terms)
                rho = g["rhoWater"] * (1.0 - phi) + sm
                for nm, got, want in (("soluteVolumeFrac",
                                       g["soluteVolumeFrac"], phi),
                                      ("soluteMass", g["soluteMass"], sm),
                                      ("final", g["final"], rho)):
                    if abs(got - want) > 1e-9 * max(1.0, abs(want)):
                        fails.append(f"V1: {nm} = {got} but the record's own "
                                     f"terms give {want}")
                #  the invariance PREMISE, from the record itself
                netz = sum(float(n) * float(z) for _, n, _, _, z, _ in terms)
                if abs(netz) > 1e-9 * max(1.0, sum(abs(float(n) * float(z))
                                                   for _, n, _, _, z, _ in terms)):
                    fails.append(f"V1: the recorded inventory is not "
                                 f"charge-closed (Sum n z = {netz}) -- the "
                                 f"convention-invariance premise fails")
    if st:
        shutil.rmtree(st[0], ignore_errors=True)

# ---- V2: external density anchors ----------------------------------------
#  MEASURED rho(m) at 25 C.  NaCl: Rogers & Pitzer, J. Phys. Chem. Ref. Data
#  11 (1982) 15.  KCl: Isono, J. Chem. Eng. Data 29 (1984) 45.  INTERIM
#  transcriptions, staged for Vitor's batch primary review like the V0 they
#  test.  band = the deviation this rung is ALLOWED at that molality.
ANCHORS = [
    #  salt,  ions,            MW,      m,   rho_meas, band %, floor %
    ("NaCl", (("Na", 1), ("Cl", 1)), 58.443, 0.1, 1001.1, 0.15, None),
    ("NaCl", (("Na", 1), ("Cl", 1)), 58.443, 0.5, 1017.6, 0.15, None),
    ("NaCl", (("Na", 1), ("Cl", 1)), 58.443, 1.0, 1036.9, 0.25, None),
    #  THE DECLARED EDGE, pinned BOTH ways: at 3 molal the V_E = 0 model is
    #  expected to be ~+0.7 % high.  A floor as well as a ceiling, so the
    #  "validity ~1 mol/kg" claim cannot silently become something else.
    ("NaCl", (("Na", 1), ("Cl", 1)), 58.443, 3.0, 1108.7, 1.00, 0.30),
    ("KCl",  (("K", 1),  ("Cl", 1)), 74.551, 0.1, 1002.4, 0.15, None),
    ("KCl",  (("K", 1),  ("Cl", 1)), 74.551, 0.5, 1020.6, 0.15, None),
    ("KCl",  (("K", 1),  ("Cl", 1)), 74.551, 1.0, 1043.0, 0.25, None),
]
rw25 = rho_kell(25.0)
for salt, ions, mw, m, rho_meas, band, floor in ANCHORS:
    vs = [(curated_V0(sp), nu) for sp, nu in ions]
    if any(v is None for v, _ in vs):
        fails.append(f"V2: {salt} -- a curated V0 is missing from the species "
                     f"records, so the anchor cannot be evaluated")
        continue
    V = sum(v * nu for v, nu in vs)                  # cm3/mol, electroneutral
    vol = 1000.0 / (rw25 / 1000.0) + m * V           # cm3 per kg water
    rho = (1000.0 + m * mw) / vol * 1000.0           # kg/m3
    dev = 100.0 * (rho - rho_meas) / rho_meas
    if abs(dev) > band:
        fails.append(f"V2: {salt} at {m} m: model {rho:.2f} kg/m3 vs measured "
                     f"{rho_meas} (dev {dev:+.3f} %, band {band:.3f} %) -- the "
                     f"curated electroneutral sum does not reproduce the "
                     f"measurement")
    if floor is not None and abs(dev) < floor:
        fails.append(f"V2: {salt} at {m} m: the model is only {dev:+.3f} % off "
                     f"(floor {floor} %) -- the declared ~1 mol/kg validity "
                     f"assumed this point DEGRADES; if it no longer does, the "
                     f"claim changed and must be re-derived, not enjoyed")

# ---- V3: convention invariance, through the engine ------------------------
def shift(species_dir):
    for f in os.listdir(species_dir):
        p = os.path.join(species_dir, f)
        s = open(p, encoding="utf-8").read()
        zm = re.search(r"^charge\s+([0-9.eE+-]+)\s*;", s, re.M)
        vm = re.search(r"(V0\s*\{\s*value\s+)([0-9.eE+-]+)", s)
        if not zm or not vm:
            continue
        new = float(vm.group(2)) + 5.0 * float(zm.group(1))     # lambda = 5
        open(p, "w", encoding="utf-8").write(
            s[:vm.start(2)] + repr(new) + s[vm.end(2):])


base_rho = None
st, res, err = staged(RUNG1, unseal=True)
if not err and res[0] == 0:
    blk, _ = derivation(st[1])
    if blk:
        base_rho = float(re.search(r"final\s+([0-9.eE+-]+)", blk).group(1))
if st:
    shutil.rmtree(st[0], ignore_errors=True)

st, res, err = staged(RUNG1, mutate_records=shift, unseal=True)
if err:
    fails.append("V3: " + err)
elif res[0] != 0:
    fails.append("V3: the convention-shifted case refused -- " + res[1][-300:])
elif base_rho is None:
    fails.append("V3: the unshifted reference run produced no density")
else:
    blk, _ = derivation(st[1])
    got = float(re.search(r"final\s+([0-9.eE+-]+)", blk).group(1)) if blk else None
    if got is None:
        fails.append("V3: the shifted run wrote no derivation record")
    elif abs(got - base_rho) > 1e-12 * max(1.0, abs(base_rho)):
        fails.append(f"V3: a convention shift (V0 -> V0 + 5 z) moved the "
                     f"density {base_rho} -> {got}.  Over a charge-closed "
                     f"inventory it must cancel exactly; only electroneutral "
                     f"sums are physical")
if st:
    shutil.rmtree(st[0], ignore_errors=True)

# ---- V4: the refusals, each by name --------------------------------------
def drop_volumetric(species_dir):
    p = os.path.join(species_dir, "Ca.dat")
    s = open(p, encoding="utf-8").read()
    open(p, "w", encoding="utf-8").write(
        re.sub(r"\nvolumetric\s*\{.*?\n\}\n", "\n", s, flags=re.S))


def drop_convention(species_dir):
    p = os.path.join(species_dir, "Ca.dat")
    s = open(p, encoding="utf-8").read()
    open(p, "w", encoding="utf-8").write(
        re.sub(r"\n\s*convention\s+\S+;\n", "\n", s, count=1))


def mix_conventions(species_dir):
    p = os.path.join(species_dir, "Cl.dat")
    s = open(p, encoding="utf-8").read()
    open(p, "w", encoding="utf-8").write(
        s.replace("convention  MilleroConventional-v1;",
                  "convention  SomeOther-v1;", 1))


PROBES = [
    ("no-volumetric", RUNG1, drop_volumetric, True,
     "has no `volumetric {}` block",
     "a master with no volumetric data was ACCEPTED -- mass counted with "
     "volume dropped is rung 0 wearing rung 1's name"),
    ("no-convention", RUNG1, drop_convention, True,
     "declares no `convention`",
     "a V0 with no convention was ACCEPTED -- a conventional quantity must "
     "name its profile"),
    ("mixed-conventions", RUNG1, mix_conventions, True,
     "mixed single-ion volume conventions",
     "two conventions in one sum were ACCEPTED"),
    ("unknown-method",
     "density   { provenance derived; volumetric { method pitzerVolumetric; } }",
     None, False, "is not registered",
     "an unregistered volumetric method was ACCEPTED"),
    ("no-method", "density   { provenance derived; }", None, False,
     "selects a volumetric formulation and none is declared",
     "`provenance derived` with no method was ACCEPTED"),
]
for tag, dens, mut, unseal, need, msg in PROBES:
    st, res, err = staged(dens, mutate_records=mut, unseal=unseal)
    if err:
        fails.append(f"V4/{tag}: {err}")
        continue
    rc, out = res
    shutil.rmtree(st[0], ignore_errors=True)
    if rc == 0:
        fails.append(f"V4/{tag}: {msg}")
    elif need not in out:
        fails.append(f"V4/{tag}: it refused, but without the named reason "
                     f"(expected '{need}')")

if fails:
    print("check_volumetric_rung1: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("check_volumetric_rung1: OK -- rung 1 (standardStateVolumes) runs "
      "through the volumetric slot and its record re-derives exactly "
      "(phi, solute mass, rho, and a charge-closed inventory); the curated "
      f"electroneutral sums reproduce {len(ANCHORS)} MEASURED solution "
      "densities (NaCl Rogers & Pitzer 1982, KCl Isono 1984) inside their "
      "bands, with the 3 molal point pinned BOTH ways so the ~1 mol/kg "
      "validity claim cannot silently drift; a convention shift "
      "(V0 -> V0 + 5 z) leaves the density unchanged to 1e-12 through the "
      "engine; and five refusals fire by name.  NOT COVERED: accuracy "
      "outside the anchored range (two 1-1 salts, 25 C, to 3 molal), any "
      "composition dependence (rung 2 does not exist -- slice B's iterative "
      "closure stays BLOCKED on it), and the reconciliation arithmetic "
      "(its own gates).")
