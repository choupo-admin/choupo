#!/usr/bin/env python3
"""Gate: the enthalpy-concentration locus is an EQUILIBRIUM on the ONE datum.

    bin/curate/check_enthalpy_concentration.py

WHY THIS EXISTS.  `enthalpyConcentration` is the first surface in the engine
that publishes SATURATED-PHASE ENTHALPY against composition -- the data an
enthalpy-concentration (Ponchon-Savarit) construction is drawn on.  Three
things about that table can be wrong in ways nothing on screen would reveal:

  * THE DATUM.  The construction's difference point and its lever arms are
    enthalpy DIFFERENCES, so a constant offset cancels in the geometry.  A
    diagram drawn on a private sensible datum -- Hliquid/Hvapour, whose
    per-component zero is at 298.15 K -- therefore looks EXACTLY as
    plausible as one drawn on the project's elements datum, and is about
    2.4e5 J/mol away from it.  Nothing in the picture says which it is.

  * THE TIE.  A tie line joins a liquid to the vapour IN EQUILIBRIUM WITH IT.
    A table that paired rows by index, or drew a vertical, or interpolated
    one end, would give a diagram whose staircase is wrong everywhere and
    still closed, smooth and pretty.

  * THE INCIDENCE.  A dew node solved by a SECOND residual with a SECOND
    tolerance lands NEAR the saturated-vapour curve rather than on it.  The
    whole construction is tie lines ending on that curve.

So this gate does not read the engine's answer back.  It RECOMPUTES the
locus in Python -- Antoine, NRTL, the Watson transition at 298.15 K and the
two Cp polynomials -- and requires the published table to reproduce it.  The
numbers it recomputes FROM are PARSED OUT OF THE CASE'S OWN SEALED RECORDS,
never transcribed into this file: a gate carrying its own copy of a curated
value is a second home for it, and it would MASK a record edit rather than
catch one.

Three layers, each doing one job, and it is worth naming which is which
because none of them alone is enough.  This gate checks that the ENGINE and
the RECORDS agree.  The case's `expected` golden checks that the ANSWER has
not moved.  The seal manifest checks that the RECORDS have not moved.  Edit a
record and this gate stays green by design -- the golden and the seal are
what fire.

WHAT THIS GATE CHECKS.

  (a) SCHEMA AND SIDECAR.  The table carries the declared columns, and the
      `.meta` sidecar beside it exists and STATES the datum, the two
      kernels, the tie contract and whether H^E is included.  A file that
      does not say what its axis means leaves the next consumer to assume
      one.

  (b) THE EQUILIBRIUM, RECOMPUTED.  For every bubble row: the bubble
      temperature and the equilibrium vapour recomputed here from
      log10(Psat[bar]) = A - B/(T+C) and the NRTL pair, with no reference
      to the engine's numbers other than the composition it was asked for.

  (c) THE ENTHALPIES, RECOMPUTED ON THE ELEMENTS DATUM.  h_liquid and
      H_vapour rebuilt from each record's own dHf_298, the Watson
      transition at 298.15 K and the declared liquid / ideal-gas Cp
      polynomials.  This is the arm that separates the two data: the
      sensible-datum surface differs by ~2.4e5 J/mol, five orders of
      magnitude above the tolerance here.

  (d) THE TIE IS AN EQUILIBRIUM, NOT A VERTICAL.  Every solved row carries
      both ends; y1 satisfies the recomputed equilibrium; and y1 - x1
      changes sign exactly once in the interior, which is the azeotrope --
      a y column copied from x, or offset by a constant, cannot do that.

  (e) THE DEW ROWS LAND ON THE CURVE.  Each dew row's own (x1, y1) is an
      equilibrium pair of the SAME recomputed map, so the tie ends ON the
      saturated-vapour curve rather than near it.

  (f) THE REFUSALS FIRE, on two probe cases built from REAL catalogue
      components in a temp directory: one whose component has no route to
      the elements datum, one whose component has the datum but no
      ideal-gas leg.  Each must exit non-zero, name the component, name the
      remedy, and write NO table.  A refusal that cannot be shown to fire
      pins nothing.

  (g) THE LATENT-HEAT FINDING, PINNED BOTH WAYS.  At a pure end the tie
      collapses and H_vapour - h_liquid IS the state surface's own heat of
      vaporisation at the boiling point.  It does NOT equal the record's
      declared HvapTb, because the liquid leg takes the Watson transition
      at 298.15 K and then integrates the DECLARED liquid Cp, while HvapTb
      is an independent datum at Tb.  Ethanol: 40.68 kJ/mol against a
      declared 38.56 (+5.50 %).  Water: 41.49 against 40.66 (+2.04 %).
      That is a finding, recorded and never tuned -- and it is pinned in
      BOTH directions so it can neither drift nor be quietly closed
      without someone saying so here.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
It says nothing about whether the published locus is RIGHT against
measurement: no number in the witness case is compared with experimental
h-x-y data, and (b)-(e) prove agreement between the engine and a second
implementation of the same equations, which is verification and not
validation.  It exercises exactly one formulation (gammaPhi, NRTL, ideal
vapour) and one binary; a package whose vapour carries an EoS departure, or
whose liquid declares calorimetricFit, is checked by nothing here.  And it
does not check the DRAWING: no difference point, no lever arm, no
construction is computed anywhere in this file.

WIRING -- NOT DONE HERE, and it must be.  This gate is not yet called from
`bin/runTests`; the file was outside the author's territory when the gate was
written.  It belongs beside the other engine-running gates, in the pattern
`check_pellet_announcement` uses.  A gate nobody runs is not a gate.

SABOTAGE-VERIFIED 2026-08-19, six times.  The output below is OBSERVED,
copied from the runs, not predicted -- and TWO of the five fired differently
from the prediction.  Those two differences are the most useful thing in this
docstring and both changed something.

Sabotage 1 -- the datum swapped for the sensible one (`H_liquid_formation`
-> `Hliquid`, `H_stream_formation(..., 1.0, ...)` -> `Hvapour`, in
EnthalpyConcentration.cpp::priceNode):

    check_enthalpy_concentration: FAILED
      bubble row x1 = 0: h_liquid published 5609.92 J/mol, recomputed -280791.66824 J/mol on the elements datum (difference 2.86402e+05)
      bubble row x1 = 0: H_vapour published 46309.2 J/mol, recomputed -239303.95493 J/mol on the elements datum (difference 2.86402e+05)
      ... (164 such rows, bubble and dew)
      pure-end lambda(water) = 40699.2 J/mol is outside its pinned window [41487.1, 41488.3].  ...
      pure-end lambda(ethanol) = 38558.9 J/mol is outside its pinned window [40679.0, 40680.2].  ...

    167 lines.  The last two are worth reading twice: on the SENSIBLE datum
    the pure-end lambda comes back as 38558.9 and 40699.2 J/mol -- which is
    each record's declared HvapTb almost exactly (38560, 40660).  That is
    not a coincidence and it is not evidence that the sensible surface is
    the better one: Hliquid/Hvapour take the Watson latent heat AT T, while
    the elements-datum surface takes the transition at 298.15 K and then
    integrates the DECLARED liquid Cp.  The two legs are built from
    different data and disagree by 2 to 5.5 %.  Arm (g) exists to keep that
    disagreement visible instead of letting either side drift; see the
    witness README.

Sabotage 2 -- the tie made a vertical (`nd.y1 = r.y[0]` -> `nd.y1 = nd.x1`):

    check_enthalpy_concentration: FAILED
      bubble row x1 = 0.025: y1 published 0.025, recomputed 0.21428997 (difference 1.89290e-01)
      ... (39 such rows)
      y1 - x1 changes sign 0 time(s) in the interior, expected exactly 1 (the azeotrope) -- a y column that is a copy of x, or x plus a constant, cannot cross
      dew row y1 = 5.00000000e-02 is refused (dewNotConverged) -- the witness case is chosen so every node resolves
      ... (34 such rows)

    75 lines.  PREDICTED: the equilibrium arm and the azeotrope arm.
    OBSERVED: those, plus 35 REFUSED dew rows -- because the dew inversion
    brackets on the bubble table's y column and then evaluates the real
    equilibrium map, so a falsified y column makes the bracket disagree with
    the map and the bisection stalls.  The op then published the refusal
    rather than a number, which is the behaviour the status column is for;
    the gate reads a refusal in the witness case as a failure because this
    case is chosen so every node resolves.

Sabotage 3 -- the dew inversion replaced by pairing rows by index (`nd.x1 =
xStar` -> `nd.x1 = bubble[j].x1`, same for T and for the priced liquid):

    check_enthalpy_concentration: FAILED
      dew row y1 = 0.025: its own (x1, y1) is not an equilibrium pair -- y_eq(0.025) = 0.21428997 against the published y1 = 0.025 (difference 1.89290e-01)
      ... (39 such rows, one per interior dew node)

    40 lines, and every one of them is arm (e).  PREDICTED: arm (e) AND arm
    (c), because a row pairing the wrong liquid with the vapour should have
    priced an enthalpy that does not belong.  OBSERVED: arms (b), (c) and
    (d) were SILENT -- zero hits.  The reason is worth keeping, and it is
    the reason this gate has an equilibrium arm at all: arm (c) recomputes
    h_liquid AT THE ROW'S OWN x1, so a row that is internally consistent
    about the WRONG liquid satisfies it perfectly.  An enthalpy check alone
    would have waved a table of mispaired tie lines straight through -- the
    diagram would have closed, looked smooth, and been wrong everywhere.

Sabotage 4 -- the datum gate disarmed (`if (false)` on the refusal throw):

    check_enthalpy_concentration: FAILED
      probe 'no-datum' (Dichloroethane): expected a non-zero exit, got 0
      probe 'no-datum' (Dichloroethane): the run did not carry the enthalpyConcentration refusal
      probe 'no-datum' (Dichloroethane): a refused run must write NO table, but probe.csv exists
      probe 'no-vapour-leg' (sucrose): expected a non-zero exit, got 0
      probe 'no-vapour-leg' (sucrose): the run did not carry the enthalpyConcentration refusal
      probe 'no-vapour-leg' (sucrose): a refused run must write NO table, but probe.csv exists

    The FIRST run of this sabotage exposed a defect IN THIS GATE.  The
    "did not name the component" arm did not fire, because it searched the
    WHOLE run output and the banner prints every component name -- so that
    arm would have passed with the refusal entirely deleted.  It now reads
    the name and the remedy out of the refusal TEXT alone, and the output
    above is from the re-run.  Also observed, and the reason the up-front
    gate earns its place: with it disarmed the run did not crash.  It exited
    0 and wrote a full table of `enthalpyRefused` rows, because priceNode
    catches the kernel's throw per node.  A table of refusals is not an
    answer, and a low-level throw quoted 41 times is not the remedy.

Sabotage 5 -- the sidecar's datum statement altered
(`enthalpy_datum,elements-298.15K` -> `enthalpy_datum,sensible-298.15K`):

    check_enthalpy_concentration: FAILED
      the sidecar states enthalpy_datum = 'sensible-298.15K'; the two published columns are computed by H_liquid_formation / H_stream_formation, which are on 'elements-298.15K'

Sabotage 6 -- the record parser pointed at a directory that does not exist
(`constant/components` -> `constant/componentsXX`), i.e. the branch that must
refuse rather than fall back on numbers kept in this file:

    check_enthalpy_concentration FAILED: this gate recomputes the locus from the case's OWN sealed records and could not read one of them -- [Errno 2] No such file or directory: '.../constant/componentsXX/ethanol.dat'.  It will not fall back on a copy of the numbers kept here, because that copy is exactly what would mask a record edit.

    A refusal path nobody has watched fire is a comment.
"""

import csv
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/props/scan/hxy01_ethanol_water_1atm"
CSV = CASE / "enthalpyConcentration.csv"
META = CASE / "enthalpyConcentration.meta"
PROPS = ROOT / "choupoProps"

P_PA = 101325.0
TREF = 298.15

COLUMNS = ["x1", "y1", "T_K", "h_liquid_J_per_mol",
           "H_vapour_J_per_mol", "role", "status"]

#  The sidecar must SAY these -- a table that does not state its own axis
#  leaves the next consumer to assume one.
META_MUST_HAVE = {
    "enthalpy_datum": "elements-298.15K",
    "component1": "ethanol",
    "component2": "water",
    "excess_enthalpy_included": "0",
}
META_MUST_MENTION = {
    "liquid_route": "H_liquid_formation",
    "vapour_route": "H_stream_formation",
    "tie_contract": "interpolate nothing",
    "saturation_kernel": "inversion",
}

#  ---- the records, PARSED FROM THE CASE'S OWN SEALED COPIES --------------
#
#  Not transcribed into this file.  A gate that carries its own copy of a
#  curated number is a second home for it, and the two drift; worse, an edit
#  to the record would then be MASKED by the gate instead of caught.  So the
#  Antoine coefficients, the NRTL pair and every enthalpy datum below are
#  read out of the sealed case, and a field this script cannot find REFUSES
#  rather than defaulting.
COMPONENT_DIR = CASE / "constant" / "components"
PAIR_FILE = CASE / "constant" / "parameters" / "NRTL" / "ethanol-water.dat"


def _strip_comments(text):
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    return re.sub(r"//[^\n]*", " ", text)


def _scalar(text, key, where):
    m = re.search(r"(?<![A-Za-z0-9_])" + re.escape(key) + r"\s+(-?[0-9][^;\s]*)\s*;",
                  text)
    if not m:
        raise LookupError(f"'{key}' not found in {where}")
    return float(m.group(1))


def _block(text, name, where):
    m = re.search(re.escape(name) + r"\s*\{", text)
    if not m:
        raise LookupError(f"block '{name}' not found in {where}")
    i = m.end()
    depth = 1
    while depth:
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
        i += 1
    return text[m.end():i - 1]


def _coeffs(text, where):
    m = re.search(r"coefficients\s*\(([^)]*)\)", text)
    if not m:
        raise LookupError(f"'coefficients (...)' not found in {where}")
    return [float(t) for t in m.group(1).split()]


def read_component(name):
    path = COMPONENT_DIR / f"{name}.dat"
    text = _strip_comments(path.read_text())
    where = str(path.relative_to(ROOT))
    return dict(
        Tc=_scalar(text, "Tc", where),
        Tb=_scalar(text, "Tb", where),
        HvapTb=_scalar(text, "HvapTb", where),
        Hf=_scalar(_block(text, "standardThermochemistry", where),
                   "dHf_298", where),
        antoine=_coeffs(_block(text, "vaporPressure", where), where),
        cp_ig=_coeffs(_block(text, "idealGasHeatCapacity", where), where),
        cp_liq=_coeffs(_block(text, "liquidHeatCapacity", where), where),
    )


def read_pair():
    text = _strip_comments(PAIR_FILE.read_text())
    where = str(PAIR_FILE.relative_to(ROOT))
    par = _block(text, "parameters", where)
    if re.search(r"\bi\s+ethanol\s*;", par) is None:
        raise LookupError(f"{where}: the pair block does not declare "
                          "i = ethanol, so the sign convention this gate "
                          "assumes is not the record's")
    return dict(a_ij=_scalar(par, "a_ij", where), b_ij=_scalar(par, "b_ij", where),
                a_ji=_scalar(par, "a_ji", where), b_ji=_scalar(par, "b_ji", where),
                alpha=_scalar(par, "alpha", where))


REC = {}
PAIR = {}

#  (g) THE FINDING, pinned both ways.  lambda at a pure end is the state
#  surface's own heat of vaporisation at the boiling point; it does not equal
#  the record's declared HvapTb, and the gap is recorded rather than tuned.
#  A window this tight fires on any change to either leg -- which is the
#  point: closing the gap is a decision somebody has to take here, in
#  writing, not a number that quietly moves.
LAMBDA_PIN = {
    "ethanol": (40679.0, 40680.2),
    "water": (41487.1, 41488.3),
}

TOL_T = 1.0e-3          # K
TOL_Y = 1.0e-6          # mole fraction
TOL_H = 1.0             # J/mol  (the sensible-datum offset is ~2.4e5)
TOL_EQ = 1.0e-6         # mole fraction, for the tie / incidence arms


# ---------------------------------------------------------------------------
#  An independent implementation of the same equations.
# ---------------------------------------------------------------------------
def psat(name, T):
    a, b, c = REC[name]["antoine"]
    return 10.0 ** (a - b / (T + c)) * 1.0e5


def gamma(T, x1):
    """Binary NRTL, component 1 = ethanol."""
    x2 = 1.0 - x1
    t12 = PAIR["a_ij"] + PAIR["b_ij"] / T
    t21 = PAIR["a_ji"] + PAIR["b_ji"] / T
    g12 = math.exp(-PAIR["alpha"] * t12)
    g21 = math.exp(-PAIR["alpha"] * t21)
    d1 = x1 + x2 * g21
    d2 = x2 + x1 * g12
    ln1 = x2 ** 2 * (t21 * (g21 / d1) ** 2 + t12 * g12 / d2 ** 2)
    ln2 = x1 ** 2 * (t12 * (g12 / d2) ** 2 + t21 * g21 / d1 ** 2)
    return math.exp(ln1), math.exp(ln2)


def bubble(x1):
    """Bubble temperature and equilibrium vapour of liquid x1, by bisection."""
    def f(T):
        g1, g2 = gamma(T, x1)
        return g1 * x1 * psat("ethanol", T) + g2 * (1.0 - x1) * psat("water", T) - P_PA
    lo, hi = 250.0, 500.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) < 0.0:
            lo = mid
        else:
            hi = mid
    T = 0.5 * (lo + hi)
    g1, _ = gamma(T, x1)
    return T, g1 * x1 * psat("ethanol", T) / P_PA


def cp_integral(coeffs, T, Tref=TREF):
    def anti(t):
        s, p = 0.0, t
        for k, a in enumerate(coeffs):
            s += a * p / (k + 1)
            p *= t
        return s
    return anti(T) - anti(Tref)


def hvap_watson(name, T):
    r = REC[name]
    return r["HvapTb"] * ((r["Tc"] - T) / (r["Tc"] - r["Tb"])) ** 0.38


def h_liquid(T, x1):
    """Elements datum: Hf_298 - Hvap(298.15) + INT Cp_liquid dT."""
    out = 0.0
    for name, x in (("ethanol", x1), ("water", 1.0 - x1)):
        if x <= 0.0:
            continue
        r = REC[name]
        out += x * (r["Hf"] - hvap_watson(name, TREF)
                    + cp_integral(r["cp_liq"], T))
    return out


def h_vapour(T, y1):
    """Elements datum: Hf_298 + INT Cp_idealGas dT."""
    out = 0.0
    for name, y in (("ethanol", y1), ("water", 1.0 - y1)):
        r = REC[name]
        out += y * (r["Hf"] + cp_integral(r["cp_ig"], T))
    return out


# ---------------------------------------------------------------------------
#  The refusal probes.
# ---------------------------------------------------------------------------
PROBE_PROPS = """operations
(
    {
        name   hxy;
        type   enthalpyConcentration;
        state  { P 1 atm; }
        grid   { n 4; }
        output { file probe.csv; }
    }
);
"""

PROBE_CONTROL = """application   choupoProps;
description   "enthalpyConcentration refusal probe";
verbosity     2;
"""

PROBE_THERMO = """recordType    thermophysicalPropertySystem;
schemaVersion 2;
components ( %s water );
equilibrium
{
    formulation gammaPhi;
    liquid { activityModel { model ideal; } standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
"""

#  (label, component, the remedy the refusal must name).  Both are REAL
#  catalogue records, so the probe exercises the same load path a case does.
PROBES = [
    ("no-datum", "Dichloroethane", "standardThermochemistry"),
    ("no-vapour-leg", "sucrose", "idealGasHeatCapacity"),
]


def run_probes(failures):
    for label, comp, remedy in PROBES:
        tmp = Path(tempfile.mkdtemp(prefix="choupo-hxy-probe-"))
        try:
            (tmp / "system").mkdir()
            (tmp / "constant").mkdir()
            (tmp / "system" / "controlDict").write_text(PROBE_CONTROL)
            (tmp / "system" / "propsDict").write_text(PROBE_PROPS)
            (tmp / "constant" / "thermoPhysPropDict").write_text(
                PROBE_THERMO % comp)
            env = dict(os.environ, CHOUPO_HOME=str(ROOT))
            r = subprocess.run([str(PROPS)], cwd=tmp, env=env,
                               capture_output=True, text=True, timeout=300)
            out = r.stdout + r.stderr
            if r.returncode == 0:
                failures.append(f"probe '{label}' ({comp}): expected a "
                                f"non-zero exit, got 0")
            #  Read the component name and the remedy out of THE REFUSAL
            #  TEXT, not out of the whole run.  Sabotage 4 showed why: the
            #  banner already prints every component name, so a
            #  `comp in out` test passes with the refusal entirely gone.
            marker = "enthalpyConcentration: REFUSED"
            if marker not in out:
                failures.append(f"probe '{label}' ({comp}): the run did not "
                                f"carry the enthalpyConcentration refusal")
            else:
                text = out[out.index(marker):]
                if comp not in text:
                    failures.append(f"probe '{label}' ({comp}): the refusal "
                                    f"did not name the component")
                if remedy not in text:
                    failures.append(f"probe '{label}' ({comp}): the refusal "
                                    f"did not name the remedy ({remedy})")
            if (tmp / "probe.csv").exists():
                failures.append(f"probe '{label}' ({comp}): a refused run "
                                f"must write NO table, but probe.csv exists")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------------------
def main():
    failures = []

    if not PROPS.exists():
        print(f"check_enthalpy_concentration FAILED: {PROPS} is absent -- "
              "this gate runs the engine and cannot report on a build that "
              "does not exist.")
        return 1
    if not CASE.is_dir():
        print(f"check_enthalpy_concentration FAILED: the witness case "
              f"{CASE.relative_to(ROOT)} does not exist -- a scan over "
              "nothing is not a clean verdict.")
        return 1

    try:
        REC["ethanol"] = read_component("ethanol")
        REC["water"] = read_component("water")
        PAIR.update(read_pair())
    except (LookupError, OSError) as exc:
        print("check_enthalpy_concentration FAILED: this gate recomputes the "
              "locus from the case's OWN sealed records and could not read "
              f"one of them -- {exc}.  It will not fall back on a copy of "
              "the numbers kept here, because that copy is exactly what "
              "would mask a record edit.")
        return 1

    #  Run the witness IN PLACE.  Reading a committed artefact would pin the
    #  artefact, not the engine that produces it.
    r = subprocess.run([str(PROPS)], cwd=CASE, capture_output=True,
                       text=True, timeout=900)
    if r.returncode != 0:
        print("check_enthalpy_concentration FAILED: the witness case did not "
              f"run (exit {r.returncode}):\n" + (r.stdout + r.stderr)[-2000:])
        return 1

    # ---- (a) schema and sidecar ----------------------------------------
    with CSV.open() as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames != COLUMNS:
            failures.append(f"the table's columns are {reader.fieldnames}, "
                            f"expected {COLUMNS}")
            rows = []
        else:
            rows = list(reader)

    if not META.exists():
        failures.append(f"the sidecar {META.name} was not written -- the "
                        "table then states neither its datum nor what it "
                        "omits")
        meta = {}
    else:
        meta = {}
        with META.open() as fh:
            mr = csv.reader(fh)
            head = next(mr, None)
            if head != ["key", "value"]:
                failures.append(f"the sidecar header is {head}, expected "
                                "['key', 'value']")
            for row in mr:
                if len(row) >= 2:
                    meta[row[0]] = row[1]

    for k, want in META_MUST_HAVE.items():
        got = meta.get(k)
        if got != want:
            if k == "enthalpy_datum":
                failures.append(
                    f"the sidecar states enthalpy_datum = '{got}'; the two "
                    "published columns are computed by H_liquid_formation / "
                    "H_stream_formation, which are on 'elements-298.15K'")
            else:
                failures.append(f"the sidecar states {k} = '{got}', "
                                f"expected '{want}'")
    for k, needle in META_MUST_MENTION.items():
        if needle not in meta.get(k, ""):
            failures.append(f"the sidecar's '{k}' does not mention "
                            f"'{needle}' -- it is: {meta.get(k)!r}")

    # ---- (b)(c)(d)(e) the locus, recomputed ----------------------------
    bub = [row for row in rows if row["role"] == "bubble"]
    dew = [row for row in rows if row["role"] == "dew"]
    if not bub or not dew:
        failures.append(f"the table carries {len(bub)} bubble and {len(dew)} "
                        "dew rows; both roles must be present")

    signChanges = 0
    prevSign = None
    for row in bub:
        if row["status"] != "ok":
            failures.append(f"bubble row x1 = {row['x1']} is refused "
                            f"({row['status']}) -- the witness case is chosen "
                            "so every node resolves")
            continue
        x1 = float(row["x1"])
        T, y = bubble(x1)
        if abs(T - float(row["T_K"])) > TOL_T:
            failures.append(f"bubble row x1 = {x1:g}: T published "
                            f"{float(row['T_K']):.6f} K, recomputed "
                            f"{T:.6f} K")
        if abs(y - float(row["y1"])) > TOL_Y:
            failures.append(f"bubble row x1 = {x1:g}: y1 published "
                            f"{float(row['y1']):.8g}, recomputed {y:.8f} "
                            f"(difference {abs(y - float(row['y1'])):.5e})")
        hl = h_liquid(T, x1)
        if abs(hl - float(row["h_liquid_J_per_mol"])) > TOL_H:
            failures.append(
                f"bubble row x1 = {x1:g}: h_liquid published "
                f"{float(row['h_liquid_J_per_mol']):.6g} J/mol, recomputed "
                f"{hl:.5f} J/mol on the elements datum (difference "
                f"{abs(hl - float(row['h_liquid_J_per_mol'])):.5e})")
        hv = h_vapour(T, y)
        if abs(hv - float(row["H_vapour_J_per_mol"])) > TOL_H:
            failures.append(
                f"bubble row x1 = {x1:g}: H_vapour published "
                f"{float(row['H_vapour_J_per_mol']):.6g} J/mol, recomputed "
                f"{hv:.5f} J/mol on the elements datum (difference "
                f"{abs(hv - float(row['H_vapour_J_per_mol'])):.5e})")
        if 0.0 < x1 < 1.0:
            s = float(row["y1"]) - x1
            sign = 1 if s > 0 else (-1 if s < 0 else 0)
            if prevSign is not None and sign != 0 and sign != prevSign:
                signChanges += 1
            if sign != 0:
                prevSign = sign

    if signChanges != 1:
        failures.append(
            f"y1 - x1 changes sign {signChanges} time(s) in the interior, "
            "expected exactly 1 (the azeotrope) -- a y column that is a copy "
            "of x, or x plus a constant, cannot cross")

    for row in dew:
        if row["status"] != "ok":
            failures.append(f"dew row y1 = {row['y1']} is refused "
                            f"({row['status']}) -- the witness case is chosen "
                            "so every node resolves")
            continue
        x1 = float(row["x1"])
        y1 = float(row["y1"])
        T, yEq = bubble(x1)
        #  (e) the row's OWN two ends must be an equilibrium pair: that is
        #  what makes the tie end ON the saturated-vapour curve.
        if abs(yEq - y1) > TOL_EQ:
            failures.append(
                f"dew row y1 = {y1:g}: its own (x1, y1) is not an "
                f"equilibrium pair -- y_eq({x1:.8g}) = {yEq:.8f} against the "
                f"published y1 = {y1:g} (difference {abs(yEq - y1):.5e})")
        if abs(T - float(row["T_K"])) > TOL_T:
            failures.append(f"dew row y1 = {y1:g}: T published "
                            f"{float(row['T_K']):.6f} K, recomputed "
                            f"{T:.6f} K")
        hl = h_liquid(T, x1)
        if abs(hl - float(row["h_liquid_J_per_mol"])) > TOL_H:
            failures.append(
                f"dew row y1 = {y1:g}: h_liquid published "
                f"{float(row['h_liquid_J_per_mol']):.6g} J/mol, recomputed "
                f"{hl:.5f} J/mol on the elements datum (difference "
                f"{abs(hl - float(row['h_liquid_J_per_mol'])):.5e})")
        hv = h_vapour(T, y1)
        if abs(hv - float(row["H_vapour_J_per_mol"])) > TOL_H:
            failures.append(
                f"dew row y1 = {y1:g}: H_vapour published "
                f"{float(row['H_vapour_J_per_mol']):.6g} J/mol, recomputed "
                f"{hv:.5f} J/mol on the elements datum (difference "
                f"{abs(hv - float(row['H_vapour_J_per_mol'])):.5e})")

    # ---- (g) the pure-end latent heats, pinned both ways ----------------
    #  x1 = 0 is pure water, x1 = 1 pure ethanol.
    ends = {"water": 0.0, "ethanol": 1.0}
    for name, xTarget in ends.items():
        hit = [row for row in bub
               if row["status"] == "ok" and abs(float(row["x1"]) - xTarget) < 1e-12]
        if not hit:
            failures.append(f"the table carries no solved pure-{name} node "
                            f"(x1 = {xTarget:g}), so the state surface's own "
                            "heat of vaporisation there is pinned by nothing")
            continue
        lam = (float(hit[0]["H_vapour_J_per_mol"])
               - float(hit[0]["h_liquid_J_per_mol"]))
        lo, hi = LAMBDA_PIN[name]
        if not (lo <= lam <= hi):
            failures.append(
                f"pure-end lambda({name}) = {lam:.1f} J/mol is outside its "
                f"pinned window [{lo}, {hi}].  This number is the state "
                f"surface's OWN heat of vaporisation at the boiling point "
                f"and it deliberately does not equal the record's declared "
                f"HvapTb ({REC[name]['HvapTb']:.0f} J/mol) -- the liquid leg "
                f"takes the Watson transition at 298.15 K and then "
                f"integrates the declared liquid Cp.  If a slice closed that "
                f"gap on purpose, move the window HERE and say so; if it "
                f"moved on its own, it is a regression.")

    # ---- (f) the refusals ----------------------------------------------
    run_probes(failures)

    if failures:
        print("check_enthalpy_concentration: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print("check_enthalpy_concentration: OK -- the enthalpy-concentration "
          f"locus of {CASE.name} ({len(bub)} bubble + {len(dew)} dew rows) "
          "reproduces an INDEPENDENT Python recomputation of the same "
          "equations from the component and pair records: the bubble "
          f"temperatures to {TOL_T} K, the equilibrium vapour to {TOL_Y}, "
          f"and BOTH enthalpy columns to {TOL_H} J/mol on the elements "
          "datum (a sensible-datum surface would sit ~2.4e5 J/mol away).  "
          "Every solved row carries both ends of one tie line, y1 - x1 "
          "crosses zero exactly once (the azeotrope), and every dew row's "
          "own (x1, y1) is an equilibrium pair, so the ties end ON the "
          "saturated-vapour curve.  The sidecar states the datum, both "
          "kernels, the tie contract and the H^E omission.  Two refusal "
          "probes built from real catalogue records (Dichloroethane, "
          "sucrose) exit non-zero, name the component and the remedy, and "
          "write no table.  The pure-end heats of vaporisation are pinned "
          "both ways against the records' declared HvapTb (+5.50 % ethanol, "
          "+2.04 % water -- a recorded finding, never tuned).  NOT covered: "
          "any comparison with MEASURED h-x-y data (this is verification, "
          "not validation); any formulation other than gammaPhi/NRTL/ideal "
          "vapour; and the construction itself -- no difference point and no "
          "lever arm is computed anywhere in this gate.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
