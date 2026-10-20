#!/usr/bin/env python3
"""Gate: a spray dryer fed with SEVERAL volatile solvents loses none of them.

    bin/curate/check_spray_dryer_solvents.py

WHY THIS EXISTS (DEV.md 4c C111, 2026-10-20).  Vitor, preparing a
pharmaceutical project with his students: "o modelo de spray dryer nao aceita
correntes com varios solventes".  Measured before the fix: `SprayDryer.cpp`
picked ONE volatile solvent -- the LAST feed component with a vapour pressure
-- and every later step read that index.  sprayDryer01_sugar fed 30 kg/h of
acetone beside 30 kg/h of water ran to exit 0 and put the water in the exhaust
and the acetone NOWHERE: the unit's material closed at 98.0620 % (-30.0001
kg/h), the element balance was off by 52.49 %, and the energy balance read
0.0000 kW -- because the unit solves T_out from H(out) = H(in) with the
acetone in H(in) and in no outlet, so the acetone's formation enthalpy was
absorbed into the exhaust TEMPERATURE (333.45 K).  With ethanol the same
missing enthalpy drove the dryer to its wet-bulb floor and left 11.84 kg/h of
WATER in the powder that the air could have carried.  Nothing refused, and
an energy arm alone could not have seen it: the mass arm of (a) is the one
that fails on the old engine.

The rule now (docs/design/a-spray-dryer-with-several-solvents.md): with
several solvents the OUTLET IS THE PACKAGE'S EQUILIBRIUM of the air and every
solvent at T_out -- one vapour phase means everything evaporated; a split
means the air cannot carry it all, the vapour is the exhaust (saturated, never
a fog) and the liquid stays on the powder at the composition the package's
K-values give it -- and T_out closes H(out) = H(in) through `priceState` on
the streams as published.  The sorption isotherm and the two droplet-trajectory
chamber models are about ONE solvent and REFUSE a mixed-solvent feed by name.

Every probe is a COPY of tutorials/steady/drying/sprayDryer01_sugar in a
temporary directory (unsealed, `acetone`/`ethanol` added from the standards,
the feed's 60 kg/h of water split 30/30): the tutorial itself is not touched.

WHAT IS CHECKED.
  (a) acetone + water, normal air: exit 0; the material recomputed component
      by component from the PUBLISHED streams (feed + air = powder + exhaust,
      every component, |gap| <= 1e-9 relative); every solvent leaves in the
      exhaust (no residual, `exhaustSaturated` 0); the exhaust is BELOW its
      dew point, recomputed here with Raoult and each record's own Antoine
      (the case declares an ideal package -- an independent arithmetic, not
      the engine's); the unit's `energyClosures` row leaves <= 1e-4 kW; the
      pseudo-solvent announcement is printed.
  (b) ethanol + water, normal air: the same material and energy arms.
  (c) acetone + water, STARVED air (8 kmol/h instead of 50): the air cannot
      carry every solvent -> `exhaustSaturated` 1, the announcement names the
      saturated exhaust, liquid stays on the powder, the exhaust sits ON its
      dew point (Raoult sum within 1e-6 of 1) and never above it, the
      residual is RICHER in water than the feed's solvent (the more volatile
      acetone leaves first -- the package's K-values, not a frozen
      composition), and material and energy close as in (a).
  (d) the sorption isotherm with two solvents REFUSES, naming the isotherm,
      the solvents and the remedy.
  (e) `model langrishKockel;` with two solvents REFUSES, naming `marshall`.
  (f) a dissolved feed component with neither `role nonvolatile` nor a
      vapour pressure (a `role radical;` copy of sucrose, `binderX`, 0.01
      kmol/h) REFUSES: it used to vanish (3.42 kg/h, with the acetone's 30,
      on the old engine: unit closure 97.8456 %).
  (g) a SINGLE-solvent feed takes the old route: sprayDryer01_sugar itself
      runs and does not print the several-solvent announcement.  (Its numbers
      are pinned by its golden in the corpus sweep, which is where
      byte-identity is held, not here.)

BY-HAND SABOTAGES (2026-10-20, each restored before the next):
  S1  the several-solvent material reads only the last solvent
      (`nFluid` built from `isSolvent[i] && i == iSolv`) -> (a) material arm:
      acetone 30 kg/h in, 0 out.
  S2  the sorption refusal deleted -> (d).
  S3  the exhaust priced pinned as a vapour (`priceFlows(ex, T, 1.0, ...)`
      -> `priceState(..., true, 1.0, ...)` is not the report's reading)
      -> recorded in the design record, see there.
  S4  the split ignored (`vf` forced to 1: everything evaporates whatever
      the air can carry) -> (c): `exhaustSaturated` 0 and the exhaust
      recomputed ABOVE its dew point (a fog published as vf = 1).
  S5  the no-outlet refusal deleted -> (f).
  S6  the chamber-model refusal deleted -> (e).

NOT CHECKED: any measured mixed-solvent spray dryer; the droplet's own
selective evaporation (not modelled -- the pseudo-solvent KPIs are announced
as such); a non-ideal package (the arithmetic of (a)/(c) is Raoult because the
probes declare `activityModel ideal`).
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
BIN = ROOT / "choupoSolve"
SRC = ROOT / "tutorials/steady/drying/sprayDryer01_sugar"
STD = ROOT / "data/standards/components"
UNIT = "dryer"
P_AIR = 1.0e5
ANNOUNCE = "volatile solvents ("
SATURATED = "the exhaust leaves SATURATED"
REL = 1.0e-9
KW = 1.0e-4


def fail(msg):
    print("check_spray_dryer_solvents: FAILED\n  " + msg)
    sys.exit(1)


def make(tmp, name, solvent, n_solvent, n_water, keep_sorption=False,
         air=None, model=None, no_outlet=False):
    work = Path(tmp) / name
    shutil.copytree(SRC, work, ignore=shutil.ignore_patterns(
        "converged", "reports", "design", "postProcessing", "iterations"))
    (work / "constant/propertyManifest").unlink()
    rec = (STD / f"{solvent}.dat").read_text()
    if solvent == "ethanol" and "diffusionVolume" not in rec:
        #  The standards record carries no Fuller volume and the probe's
        #  package declares Fuller diffusivity, which then REFUSES (correctly:
        #  a declared model that cannot price).  The probe adds it CASE-LOCALLY
        #  from the same FSG atomic increments acetone's record states
        #  (C 15.9, H 2.31, O 6.11): C2H6O -> 2(15.9) + 6(2.31) + 6.11.
        rec += "\ndiffusionVolume  51.77;   // probe-local, FSG increments 2C+6H+O\n"
    (work / "constant/components" / f"{solvent}.dat").write_text(rec)
    tp = work / "constant/thermoPhysPropDict"
    t = tp.read_text()
    old = "components ( water air sucrose );"
    if old not in t:
        fail(f"{name}: sprayDryer01's component list moved -- update the probe")
    extra = " binderX" if no_outlet else ""
    tp.write_text(t.replace(old, f"components ( {solvent} water air sucrose{extra} );"))
    if no_outlet:
        #  A dissolved component the dryer has no outlet for: sucrose's own
        #  record renamed and given `role radical;` -- the one role that is
        #  neither `nonvolatile` (powder) nor required to carry a vapour
        #  pressure (exhaust).  A NEW name, because a case-local record
        #  OVERLAYS a standards one field by field: stripping acetone's
        #  `vaporPressure` here gives it straight back.
        s = (work / "constant/components/sucrose.dat").read_text()
        s = re.sub(r"(?m)^name\s+sucrose;", "name        binderX;", s)
        s, k = re.subn(r"(?m)^role\s+nonvolatile;.*$", "role        radical;", s)
        if k != 1:
            fail(f"{name}: sucrose's role line moved -- update the probe")
        (work / "constant/components/binderX.dat").write_text(s)
    fd = work / "0/feed"
    t, k = re.subn(r"water\s+3\.33053314 kmol/h;",
                   f"{solvent}    {n_solvent} kmol/h;\n    water    {n_water} kmol/h;",
                   fd.read_text())
    if k != 1:
        fail(f"{name}: sprayDryer01's feed moved -- update the probe")
    if no_outlet:
        t = re.sub(r"(sucrose\s+0\.11686686 kmol/h;)", r"\1\n    binderX    0.01 kmol/h;", t)
    fd.write_text(t)
    if air is not None:
        fa = work / "0/dryingAir"
        t, k = re.subn(r"air\s+50 kmol/h;", f"air    {air} kmol/h;", fa.read_text())
        if k != 1:
            fail(f"{name}: sprayDryer01's air moved -- update the probe")
        fa.write_text(t)
    if not keep_sorption:
        sc = work / "constant/components/sucrose.dat"
        t, k = re.subn(r"\nsorption\s*\{[^}]*\}\n", "\n", sc.read_text())
        if k != 1:
            fail(f"{name}: sucrose's sorption block moved -- update the probe")
        sc.write_text(t)
    if model is not None:
        fs = work / "system/flowsheetDict"
        t, k = re.subn(r"(type\s+sprayDryer;)", r"\1\n        model       " + model + ";",
                       fs.read_text())
        if k != 1:
            fail(f"{name}: could not declare the chamber model")
        fs.write_text(t)
    return work


def run(work):
    p = subprocess.run([str(BIN), "."], cwd=work, capture_output=True, text=True,
                       timeout=900, env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout + p.stderr


def json_block(txt, key):
    at = txt.find('"%s": ' % key)
    if at < 0:
        return None
    try:
        return json.JSONDecoder().raw_decode(txt, at + len(key) + 4)[0]
    except ValueError:
        return None


def antoine(name):
    """log10(Psat/bar) = A - B/(T + C), from the record the probe runs on."""
    src = (SRC / "constant/components" / f"{name}.dat")
    if not src.exists():
        src = STD / f"{name}.dat"
    m = re.search(r"\nvaporPressure\s*\{[^}]*?model\s+Antoine;[^}]*?coefficients\s*"
                  r"\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s*\)", src.read_text())
    if not m:
        fail(f"{name}: no Antoine block the gate can read")
    A, B, C = (float(x) for x in m.groups())
    return lambda T: 1.0e5 * 10.0 ** (A - B / (T + C))


def comp_flows(s):
    """kmol/s per component of a published stream: the result JSON's `F`
    and `composition` cover the fluid AND the crystals (`solids` is their
    mass breakdown, not a second amount)."""
    F = float(s.get("F", 0.0))
    return {k: F * float(v) for k, v in (s.get("composition") or {}).items()}


def check_balances(name, out, solvents):
    streams = json_block(out, "streams")
    if not isinstance(streams, dict):
        fail(f"{name}: no result streams")
    try:
        ins = [comp_flows(streams[n]) for n in ("feed", "dryingAir")]
        outs = [comp_flows(streams[n]) for n in ("powder", "exhaustAir")]
    except KeyError as e:
        fail(f"{name}: stream {e} not published")
    comps = set()
    for d in ins + outs:
        comps |= set(d)
    for c in sorted(comps):
        fi = sum(d.get(c, 0.0) for d in ins)
        fo = sum(d.get(c, 0.0) for d in outs)
        if abs(fo - fi) > REL * max(fi, fo, 1e-30):
            fail(f"{name}: '{c}' does not close across the dryer: in {fi:.12e}, "
                 f"out {fo:.12e} kmol/s")
    for c in solvents:
        if sum(d.get(c, 0.0) for d in ins) <= 0.0:
            fail(f"{name}: the probe feeds no {c}")
    rows = json_block(out, "energyClosures")
    if not isinstance(rows, list):
        fail(f"{name}: the energy report published no energyClosures")
    row = next((r for r in rows if r.get("unit") == UNIT), None)
    if row is None:
        fail(f"{name}: no energyClosures row for '{UNIT}'")
    for key in ("raw_kW", "remaining_kW"):
        v = row.get(key)
        if v is None or abs(float(v)) > KW:
            fail(f"{name}: '{UNIT}' leaves {key} = {v} of its adiabatic balance "
                 f"unattributed (must be <= {KW} kW)")
    return streams


def dew_sum(stream, T, names):
    """Raoult: SUM y_i P / Psat_i(T) -- 1 on the dew point.  Over EVERY
    component the exhaust carries, the air's included: the probes' ideal
    package gives N2/O2/Ar their (extrapolated, announced) Antoine too, and
    leaving them out reads a saturated exhaust 0.0015 short of its dew point.
    `names` are the solvents, which must be present."""
    z = stream.get("composition") or {}
    for n in names:
        if float(z.get(n, 0.0)) <= 0.0:
            fail(f"the exhaust carries no {n}")
    return sum(float(v) * P_AIR / antoine(k)(T) for k, v in z.items() if float(v) > 0.0)


def kpi(out, key, name):
    k = (json_block(out, "kpis") or {}).get(UNIT, {})
    if key not in k:
        fail(f"{name}: '{UNIT}' publishes no '{key}'")
    return float(k[key])


def main():
    if not BIN.exists():
        fail(f"{BIN} is not built")
    with tempfile.TemporaryDirectory() as tmp:
        claims = []
        # (a) acetone + water, normal air
        w = make(tmp, "acetoneWater", "acetone", 0.51653, 1.66527)
        rc, out = run(w)
        if rc != 0:
            fail(f"(a) acetone+water did not run (exit {rc}):\n{out[-1500:]}")
        if ANNOUNCE not in out:
            fail("(a) the several-solvent route was not announced")
        st = check_balances("(a)", out, ["acetone", "water"])
        if kpi(out, "exhaustSaturated", "(a)") != 0.0:
            fail("(a) the normal-air probe reports a saturated exhaust")
        for c in ("acetone", "water"):
            if kpi(out, "residual_" + c, "(a)") != 0.0:
                fail(f"(a) {c} stays on the powder although the air carries it")
        Ta = float(st["exhaustAir"]["T"])
        ds = dew_sum(st["exhaustAir"], Ta, ["acetone", "water"])
        if not ds < 1.0:
            fail(f"(a) the exhaust at {Ta:.3f} K is at or above its dew point "
                 f"(Raoult sum {ds:.6f})")
        claims.append(f"(a) acetone+water closes, T_out {Ta:.2f} K, dew sum {ds:.4f}")

        # (b) ethanol + water
        w = make(tmp, "ethanolWater", "ethanol", 0.65120, 1.66527)
        rc, out = run(w)
        if rc != 0:
            fail(f"(b) ethanol+water did not run (exit {rc}):\n{out[-1500:]}")
        check_balances("(b)", out, ["ethanol", "water"])
        claims.append("(b) ethanol+water closes")

        # (c) starved air: the exhaust saturates
        w = make(tmp, "starved", "acetone", 0.51653, 1.66527, air=8)
        rc, out = run(w)
        if rc != 0:
            fail(f"(c) the starved probe did not run (exit {rc}):\n{out[-1500:]}")
        st = check_balances("(c)", out, ["acetone", "water"])
        if kpi(out, "exhaustSaturated", "(c)") != 1.0:
            fail("(c) 8 kmol/h of air carries every solvent? the probe no longer starves")
        if SATURATED not in out:
            fail("(c) the saturated exhaust was not announced")
        Tc = float(st["exhaustAir"]["T"])
        ds = dew_sum(st["exhaustAir"], Tc, ["acetone", "water"])
        if not (abs(ds - 1.0) <= 1.0e-6):
            fail(f"(c) the saturated exhaust at {Tc:.4f} K is not ON its dew point: "
                 f"Raoult sum {ds:.9f} (above 1 is a fog published as vapour)")
        ra = kpi(out, "residual_acetone", "(c)")
        rw = kpi(out, "residual_water", "(c)")
        fa, fw = 0.51653 * 58.080, 1.66527 * 18.015         # kg/h fed
        if not (rw > 0.0 and rw * 3600 / fw > ra * 3600 / fa):
            fail(f"(c) the residual is not richer in water than the feed: "
                 f"acetone {ra * 3600:.4f}/{fa:.4f} kg/h, water {rw * 3600:.4f}/{fw:.4f} kg/h")
        claims.append(f"(c) starved exhaust saturated at {Tc:.2f} K, residual "
                      f"water {100 * rw * 3600 / fw:.1f} % vs acetone {100 * ra * 3600 / fa:.1f} % of fed")

        # (d) sorption with two solvents refuses
        w = make(tmp, "sorption", "acetone", 0.51653, 1.66527, keep_sorption=True)
        rc, out = run(w)
        if rc == 0 or "declares a `sorption {}`" not in out or "acetone, water" not in out \
                or "Remedy" not in out:
            fail(f"(d) a mixed-solvent feed with a sorption isotherm did not refuse by "
                 f"name (exit {rc}):\n{out[-800:]}")
        claims.append("(d) sorption refused")

        # (e) a droplet-trajectory chamber model refuses
        w = make(tmp, "trajectory", "acetone", 0.51653, 1.66527, model="langrishKockel")
        rc, out = run(w)
        if rc == 0 or "chamber model `langrishKockel`" not in out or "model marshall;" not in out:
            fail(f"(e) langrishKockel with two solvents did not refuse by name (exit {rc}):\n"
                 f"{out[-800:]}")
        claims.append("(e) langrishKockel refused")

        # (f) a component with no outlet refuses
        w = make(tmp, "noOutlet", "acetone", 0.51653, 1.66527, no_outlet=True)
        rc, out = run(w)
        if rc == 0 or "has no outlet for it" not in out or "carries binderX" not in out:
            fail(f"(f) a dissolved component with no outlet did not refuse (exit {rc}):\n"
                 f"{out[-800:]}")
        claims.append("(f) no-outlet component refused")

        # (g) one solvent: the old route
        w = Path(tmp) / "single"
        shutil.copytree(SRC, w, ignore=shutil.ignore_patterns(
            "converged", "reports", "design", "postProcessing", "iterations"))
        rc, out = run(w)
        if rc != 0:
            fail(f"(g) sprayDryer01_sugar did not run (exit {rc})")
        if ANNOUNCE in out or "exhaustSaturated" in out:
            fail("(g) a single-solvent feed took the several-solvent route")
        claims.append("(g) one solvent keeps its route")

    print("check_spray_dryer_solvents: OK -- a spray dryer fed several solvents "
          "loses none; " + "; ".join(claims))


if __name__ == "__main__":
    main()
