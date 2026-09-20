#!/usr/bin/env python3
"""Gate: an ELECTRODIALYSIS STACK is a record, and its limiting current is a
PREDICTION -- not a declared velocity and not a declared transport number.
    bin/curate/check_ed_stack.py

WHY THIS EXISTS.  Until 2026-09-16 an `electrodialysisStack` operation typed
its own geometry and, among it, a `linearVelocity` -- a SECOND HOME, because
the unit already receives the diluate flow on its inlet stream and the
crossflow velocity is that flow divided by the channel section of the
channels running in parallel.  An author could declare a velocity that
contradicted the flow and nothing noticed, while the velocity sets the
mass-transfer coefficient and therefore the limiting current.  And the
limiting current itself was computed from a counter-ion transport number the
MEMBRANE record declared, measured in a different solution at a different
temperature.  Both are closed: `stack <name>;` names a `kind edStack` record
that carries the hardware and the stack's own Sherwood correlation, the
velocity is derived and printed with its arithmetic, and the limiting current
comes from the linearised Nernst-Planck model of

    V. Geraldes, M.D. Afonso, "Limiting current density in the
    electrodialysis of multi-ionic solutions", J. Membr. Sci. 360 (2010)
    499-508, doi:10.1016/j.memsci.2010.05.054

which computes its own limiting transport numbers and REMOVES a parameter.

WHAT THIS GATE CHECKS (every witness is RUN here; nothing is read from a
stale converged/):
  (a) THE RECORDS AGAINST THEIR SOURCES.  Every `kind edStack` record in
      data/standards/assets/ carries the required keys, declares no
      derivative of `activeArea` and no velocity, uses an accepted
      `spacerType` / `massTransfer.model` / `velocityBasis`, and matches the
      TABLE below -- for EUR2C-7P18 a second, independent transcription of
      the same sections of the same paper; for EurodiaED-100P-50 what its
      owner stated -- read from the .dat by this gate's own parser, never
      through the engine.  Every value the TABLE marks an estimate carries
      `origin estimated` + `reviewStatus unverified` + a non-empty note, every
      value it marks `measured` carries `origin measured` + the same review
      status and note, and no value the source states is marked an estimate.
      Two structural rules ride here: a record whose source names no membrane
      pair must not name one (and one whose source does, must), and EXACTLY
      ONE of channelWidth and channelLength is stored where neither is
      stated -- storing a back-calculated length beside a back-calculated
      width is two homes for one guess, and the second reads like a
      declaration.
  (b) THE DERIVED VELOCITY, recomputed from the case's OWN declared flow.
      For every unit of ed03 and ed04: the diluate feed's water molar flow is
      read from the case's `0/` file, converted to a volumetric flow on the
      same dilute-carrier density the unit announces, and divided by
      (cellPairs / hydraulicPasses) * channelWidth * channelHeight.  That must
      equal the published `u_superficial` to 1e-9, `u_interstitial` must be it
      over the record's spacer porosity, and `Re` must be u h / nu with nu
      from the same water viscosity the run used (recovered from `Sc` and
      `D_eff`).  The PASS DIVISION is exercised by a twin of ed03 whose record
      is rewritten to 7 passes: one channel per pass, so u must rise 7x.
  (c) THE REFUSALS, built from the witnesses in a temp dir: `stack` beside
      `linearVelocity`; `stack` beside `membraneArea`; an unknown stack name
      (the message must carry the registered list); an unknown
      `limitingCurrent { model }` word (the message must carry the accepted
      list); `model GeraldesAfonso2010` declared on a case with no stack;
      `membrane` declared beside a record that NAMES a pair; and NO
      `membrane` on a case whose record names none.  The last two point in
      opposite directions and which way is the RECORD's to decide.
  (d) EQ. 15 REDUCES TO EQ. 16.  ed03 is a single salt, so the engine
      publishes both: they must agree to 1e-12 relative, AND this gate
      recomputes each of them independently in Python from the published
      per-ion diffusivities and concentrations.
  (e) D_eff AND THE LIMITING TRANSPORT NUMBERS, recomputed in Python.  Three
      ways, all on ed04's MgCl2 + MgSO4: from the paper's SALT-indexed
      Eq. (A13) on the engine's own per-ion values (which must equal the
      engine's ion-fraction form to 1e-10 -- the identity the engine claims);
      from the paper's OWN Table 3 diffusivities at 20 C (which must land
      within 1 % -- the Stokes-Einstein correction reaching the paper's
      table); and Eqs. (12)/(13) for every ion at both membranes.
  (f) ed04's ANCHORS AGAINST TABLE 4, printed with the deviation.  Each of
      the six MgCl2 + MgSO4 rows is compared with its measured limiting
      current density and must lie inside 13 %, the larger of the two average
      relative deviations the paper itself reports.  The table is printed
      whether or not it passes.
  (g) THE ANNOUNCEMENTS.  ed03 and ed04 print one `[estimate] stack` line per
      estimate the record carries and none for any other key, each reaching
      the result JSON as a `provenance` advisory; both name the limiting-
      current model and say whether it was declared or defaulted; ed01, which
      names no stack, prints BOTH legacy lines (the declared velocity the
      engine could not check, and the CowanBrown fallback with the reason).
      A twin of ed03 at 320 K prints the `[limit]` line for T_max and STILL
      EXITS 0; a twin of ed05 at a tenth of its flow sits far below the
      Reynolds band its correlation was fitted over and prints the
      `[extrapolation]` line, also at exit 0.  No witness prints either.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
It does not check that an estimate is a GOOD estimate (nobody here has
weighed a EUR2C spacer coupon).  It does not check the transcription against
the PDF itself (the table is a human's second reading).  It says nothing
about the single-salt MgCl2 or NaCl rows of Table 4, which no case runs.  It
does not check the ohmic drop, the Nernst back-EMF or the Faraday transfer --
those are ed01's goldens' business.  The `leveque` branch of a record's
massTransfer block is reached by no record and no case.  The `interstitial`
velocity basis is declared by no record.  `dP_max`, `flow_max` and the pH
band are declared by no record and are therefore never checked against a run.
Nothing here is tested OVER TIME: the batch recirculating rig that shows this
same limiting current FALLING with a depleting diluate arrived 2026-09-16 and
is `check_ed_batch`'s subject, not this gate's.

SABOTAGE-VERIFIED 2026-09-16 (engine and record edits BY HAND, rebuilt where
C++ moved, run, restored; the gate never patches a source).  TWO of the nine
did not do what was predicted, and both are recorded as MEASURED:
  S1  EUR2C-7P18.dat activeArea 0.140 -> 0.070 m2         CAUGHT by (a):
      "activeArea = 0.07 vs the paper's 0.14".
  S2  EUR2C-7P18.dat massTransfer.c provenance origin estimated -> literature
                                                          CAUGHT by (a) (a
      value the paper POSTULATES is marked as one it states) and by (g) on
      both witnesses (3 announced estimates and 3 advisories against 4).
  S3  the `[estimate]` loop in ElectrodialysisStack.cpp deleted
                                                          CAUGHT by (g) on
      ed03 and ed04 (0 lines, 0 advisories, against 4 expected).
  S4  the velocity derivation divided by cellPairs instead of
      cellPairs/hydraulicPasses                           SURVIVED every
      shipped witness, because EUR2C-7P18 has ONE hydraulic pass and the two
      are then the SAME NUMBER.  That is why arm (b) builds a 7-pass twin
      with a case-local copy of the record: with it the arm catches the
      sabotage at once ("u must be 7x: 7.911e-2 vs 5.538e-1").  A guard whose
      only case satisfies it is a guard nothing tests -- the diafiltration
      lesson of 2026-08-25, met again here.
  S5  the `stack` + inline `linearVelocity` refusal removed  CAUGHT by (c):
      the probe ran to exit 0 with a velocity declared beside the record.
  S6  effectiveDiffusivity: the anion equivalent fraction taken on the CATION
      equivalent total                                    SURVIVED, and the
      sabotage was the defective thing, not the gate: an electroneutral
      solution has eqCat == eqAn EXACTLY, so that edit changes no arithmetic
      at all.  Worth knowing about the code rather than about the gate --
      the divisor is interchangeable on any feed the unit accepts.
  S6b effectiveDiffusivity: the inner weight (z_i + |z_j|) written as
      (z_i - |z_j|)                                       CAUGHT by (e):
      "the paper's salt-indexed Eq. A13 gives 9.140e-10 but the engine's
      ion-fraction form gives 1.796e-10", and by the 80 % departure from
      Table 3.  It also made the engine REFUSE ed03 outright (a NaCl feed
      gives a zero numerator), which arms (b) and (g) reported as a twin that
      would not run -- and two things were fixed because of it: the engine
      now refuses a non-positive or non-finite Eq. A13 result by name instead
      of publishing a null, and arm (b) reports a missing KPI as a named
      failure instead of raising a TypeError.  A gate must report, not crash.
  S7  limitingTransportNumbers: the co-ions given 1/n instead of 0
                                                          CAUGHT by (e)
      (t_lim_cem_Cl 0.3333 against 0) and by (d) (Eq. 15 no longer reduces to
      Eq. 16 on ed03: 956.32 against 643.04).
  S8  the Stokes-Einstein correction disabled (seFactor forced to 1)
                                                          CAUGHT by (e) (the
      engine's D_eff lands 15.0 % from the paper's own Table 3 value, against
      the 1 % the arm allows) and by (f) (every ed04 deviation rises; ED1 to
      +20.0 %, outside the paper's own 13 % band).
  S9  the limits check deleted                            CAUGHT by (g): the
      320 K twin printed no [limit] line.
  S10 EurodiaED-100P-50.dat channelWidth provenance origin estimated ->
      measured                                            CAUGHT by (a) (a
      value NOBODY stated marked as one its owner did) and by (g) (ed05
      announced 2 estimates against the table's 3).
  S11 EurodiaED-100P-50.dat given a `channelLength 1.68 m;` beside its
      back-calculated width                               CAUGHT by (a): a
      length its source does not state, stored beside the width it would be
      derived from.
  S12 the `validity { Re ( ... ); }` window never read (hasReBand forced
      false)                                              CAUGHT by (g): the
      tenth-flow twin printed no [extrapolation] line.

A TENTH edit was made and is NOT a sabotage: the A13 identity of arm (e) was
first written at 1e-12 and reported a failure whose two printed numbers were
identical, because the result JSON carries 12 significant figures and the
engine's own D_eff therefore arrives already rounded at ~8e-13 relative.  The
threshold is 1e-10 -- still eight orders tighter than any formula error -- and
the message now prints the relative gap.  A failure whose numbers look equal
teaches the reader nothing.

THE WORD IS `estimated`, spelled out here because the engine is tolerant.
`core/Origin.H::originFromWord` accepts BOTH `estimate` and `estimated`
and maps them onto the same Origin, so no run can tell you which one a
record used.  These records shipped with `estimate` -- a word no other
record in the tree writes, and the one `originWord()` never renders back
-- so check_origin_census (the vocabulary's own gate) refused them from
the day they landed while this gate asserted the same word and passed.
The records were normalised to `estimated` on 2026-09-18 and this reader
follows them.  Two gates testing one word is two homes; they now agree,
and the census is the one that decides what the vocabulary is.
"""
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
BUILD = ROOT / "build" / "linux64Gcc"
ASSETS = ROOT / "data/standards/assets"
ED01 = ROOT / "tutorials/steady/electrodialysis/ed01_nacl_desalination"
ED03 = ROOT / "tutorials/steady/electrodialysis/ed03_stack_record"
ED04 = ROOT / "tutorials/steady/electrodialysis/ed04_limiting_current_multiionic"
ED05 = ROOT / "tutorials/steady/electrodialysis/ed05_industrial_stack"
MW_WATER = 0.0180153          # kg/mol, the unit's own molality closure
RHO_CARRIER = 1000.0          # kg/m3, the dilute-carrier density the unit announces
FARADAY = 96485.33212

#  THE TABLE: a second transcription of Geraldes & Afonso (2010), in SI.
#  Section 3.1 for the stack and the channel, section 3.4 for the correlation.
#  A key listed under `estimates` is one the PAPER DOES NOT STATE.
TABLE = {
    "EUR2C-7P18": {
        "manufacturer": "Eurodia Industrie",
        "membranes": "CMX_AMX",
        "source": "10.1016/j.memsci.2010.05.054",
        "values": {
            "cellPairs": 7.0,             # seven cells (3.1)
            "activeArea": 7 * 0.020,      # 0.020 m2 per membrane x 7 cell pairs (3.1)
            "channelHeight": 7.7e-4,      # spacer thickness (3.1)
            "channelWidth": 0.114,        # W (3.1)
            "channelLength": 0.175,       # L (3.1)
            "hydraulicPasses": 1.0,       # "parallel path" (3.1)
        },
        "words": {"spacerType": "mesh"},
        "massTransfer": {"model": "powerLaw", "a": 0.29, "b": 0.5,
                         "velocityBasis": "superficial"},
        "estimates": {"spacerPorosity": 0.90, "massTransfer.c": 0.33,
                      "limits.i_max": 200.0, "limits.T_max": 313.15},
        "absentLimits": ["dP_max", "flow_max", "pH_min", "pH_max"],
        "declaresLength": True,
        "declaresMembranes": True,
    },
    #  Vitor Geraldes' own industrial unit -- facts from operating experience,
    #  not a document, so the TABLE holds what he stated and marks the rest.
    #  He gave no channel width and no length, so EXACTLY ONE of the two is
    #  stored (the width, as the estimate) and the length is derived.
    "EurodiaED-100P-50": {
        "manufacturer": "Eurodia Industrie",
        "membranes": None,            # the source names no pair: the CASE declares it
        "source": "personal communication",
        "values": {
            "cellPairs": 100.0,
            "activeArea": 50.0,
            "channelHeight": 0.7e-3,
            "hydraulicPasses": 2.0,
        },
        "words": {"spacerType": "zigZag"},
        "massTransfer": {"model": "powerLaw", "a": 0.29, "b": 0.5,
                         "velocityBasis": "superficial"},
        "reBand": (50.0, 86.0),
        "estimates": {"channelWidth": 0.298, "spacerPorosity": 0.90,
                      "massTransfer.c": 0.33},
        "measured": ["cellPairs", "activeArea", "channelHeight", "spacerType",
                     "hydraulicPasses"],
        "absentLimits": ["dP_max", "flow_max", "i_max", "T_max", "pH_min", "pH_max"],
        "noLimits": True,
        "declaresLength": False,
        "declaresMembranes": False,
    },
}

#  Table 3: ionic diffusivities at infinite dilution and 20.0 C [m2/s].
TABLE3 = {"Na": 1.16e-9, "Mg": 0.613e-9, "Cl": 1.77e-9, "SO4": 0.923e-9}

#  Table 4, the MgCl2 + MgSO4 rows: unit -> (Re the paper printed,
#  average cation concentration equiv./m3, measured i_lim A/m2).
TABLE4 = {
    "ED1": (50, 9.38, 34.3), "ED2": (61, 9.43, 37.6), "ED3": (86, 9.54, 42.9),
    "ED4": (50, 18.7, 71.2), "ED5": (61, 18.8, 81.9), "ED6": (86, 19.0, 93.5),
}
ANCHOR_BAND = 0.13            # the paper's own larger average deviation (4.3)

UNIT = {"m2": 1.0, "cm2": 1e-4, "m": 1.0, "mm": 1e-3, "bar": 1e5, "Pa": 1.0,
        "K": 1.0, "m3/h": 1 / 3600.0, "L/h": 1e-3 / 3600.0, "kmol/h": 1 / 3600.0}


# ---------------------------------------------------------------- parsing
def strip_comments(t):
    """Quote-aware: a doi inside a quoted string carries `//` and is not a
    comment (the paper's URL lives in the record's `source`)."""
    return re.sub(r'("[^"]*")|/\*.*?\*/|//[^\n]*',
                  lambda m: m.group(1) if m.group(1) else "", t, flags=re.S)


def tokens(t):
    return re.findall(r'"[^"]*"|[{}();]|[^\s{}();"]+', t)


def parse_block(toks, i):
    d = {}
    while i < len(toks):
        tk = toks[i]
        if tk == "}":
            return d, i + 1
        key = tk
        i += 1
        if toks[i] == "{":
            sub, i = parse_block(toks, i + 1)
            d[key] = sub
        elif toks[i] == "(":
            j = toks.index(")", i)
            d[key] = [float(x) for x in toks[i + 1:j]]
            i = j + 1
            i += 1
        else:
            j = toks.index(";", i)
            d[key] = toks[i:j]
            i = j + 1
    return d, i


def parse_record(path):
    d, _ = parse_block(tokens(strip_comments(path.read_text())) + ["}"], 0)
    return d


def si(entry):
    v = float(entry[0])
    if len(entry) == 1:
        return v
    if entry[1] not in UNIT:
        raise RuntimeError("unit '%s' not in the gate's table" % entry[1])
    return v * UNIT[entry[1]]


def word(entry):
    return entry[0].strip('"') if entry else ""


def close(a, b, rel=1e-9):
    return abs(a - b) <= rel * max(abs(a), abs(b), 1e-300)


def at(d, dotted):
    """`limits.i_max` -> the entry, or None."""
    cur = d
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


# ---------------------------------------------------------------- running
def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BUILD / "choupoSolve"), str(case)],
                       capture_output=True, text=True, timeout=900, env=env)
    return r.returncode, r.stdout + r.stderr


def result_of(out):
    if "<<<Choupo:result-begin>>>" not in out:
        return None
    return json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                         .split("<<<Choupo:result-end>>>")[0])


def copy_case(src, dst):
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "log.*", "expected", "reports", "design"))


def water_flow_m3_s(stream_file):
    """The diluate feed's volumetric flow, from the case's OWN declaration, on
    the dilute-carrier density the unit announces."""
    d = parse_record(stream_file)
    kmol_h = si(d["componentMolarFlows"]["water"])          # -> kmol/s
    return kmol_h * 1000.0 * MW_WATER / RHO_CARRIER          # m3/s


# ------------------------------------------------- the paper, in Python
def d_eff_salt_indexed(salts):
    """Eq. (A13) as the PAPER indexes it: n salts, salt k made of cation k and
    anion n+k, each with equivalent fraction x_k.
    `salts` = [(x, z_cat, D_cat, z_an, D_an), ...] with z_an < 0."""
    den = sum(x * (zc * Dc + abs(za) * Da) for x, zc, Dc, za, Da in salts)
    num = 0.0
    for x, zc, Dc, _za, _Da in salts:
        inner = sum(xl * (zc + abs(zal)) * Dal
                    for xl, _zcl, _Dcl, zal, Dal in salts)
        num += x * Dc * inner
    return num / den


def t_lim(ions, cation_exchange):
    """Eqs. (12) / (13).  `ions` = [(name, z, C, D), ...]."""
    s = sum(abs(z) * D * C for _n, z, C, D in ions
            if (z > 0) == cation_exchange)
    return {n: (abs(z) * D * C / s if (z > 0) == cation_exchange else 0.0)
            for n, z, C, D in ions}


def eq15(ions, t, k_c_eff, D_eff):
    sumC = sum(C for _n, _z, C, _D in ions)
    sumT = sum(t[n] / (z * D) for n, z, C, D in ions if t[n] != 0.0)
    return FARADAY * (k_c_eff / D_eff) * sumC / sumT


def eq16(ions, k_c, t_cu_lim):
    cat = [i for i in ions if i[1] > 0][0]
    an = [i for i in ions if i[1] < 0][0]
    C_b = cat[1] * cat[2]
    zD1, zD2 = cat[1] * cat[3], abs(an[1]) * an[3]
    return FARADAY * k_c * C_b / (t_cu_lim - zD1 / (zD1 + zD2))


def ions_of(kpi):
    """[(name, z, C, D), ...] from a unit's published KPIs."""
    out = []
    for k in kpi:
        if not k.startswith("C_ion_"):
            continue
        n = k[len("C_ion_"):]
        z = 1.0 if kpi["t_lim_cem_" + n] > 0 else -1.0    # sign only; magnitude below
        out.append([n, z, kpi[k], kpi["D_ion_" + n]])
    return out


# ---------------------------------------------------------------- main
def main():
    failures = []
    records = {}

    # ---------------- (a) the record against the paper ---------------------
    for p in sorted(ASSETS.glob("*.dat")):
        d = parse_record(p)
        if word(d.get("kind", [])) != "edStack":
            continue
        name = word(d.get("name", []))
        records[name] = d
        if name not in TABLE:
            failures.append("(a) %s: stack '%s' has no row in this gate's "
                            "transcription table" % (p.name, name))
            continue
        tb = TABLE[name]
        required = ["name", "kind", "manufacturer", "cellPairs", "activeArea",
                    "channelHeight", "channelWidth", "spacerPorosity",
                    "spacerType", "hydraulicPasses", "massTransfer", "provenance"]
        if not tb.get("noLimits"):
            required.append("limits")
        elif "limits" in d:
            failures.append("(a) %s: declares a limits{} block, but nobody has stated "
                            "a ceiling for this unit -- a DESIGN flow is not a maximum" % name)
        for k in required:
            if k not in d:
                failures.append("(a) %s: required key `%s` missing" % (name, k))
        if word(d.get("manufacturer", [])) != tb["manufacturer"]:
            failures.append("(a) %s: manufacturer %r" % (name, word(d.get("manufacturer", []))))
        #  The membrane pair is the record's only where the SOURCE names one.
        if tb["membranes"] is None:
            if "membranes" in d:
                failures.append("(a) %s: names a membrane pair, but its source states "
                                "none and the CASE is meant to declare it" % name)
        elif word(d.get("membranes", [])) != tb["membranes"]:
            failures.append("(a) %s: membranes %r vs the table's %r"
                            % (name, word(d.get("membranes", [])), tb["membranes"]))
        #  EXACTLY ONE of width and length is stored where neither is stated:
        #  the length is activeArea/(cellPairs * channelWidth) and storing a
        #  back-calculated one beside a back-calculated width would be two
        #  homes for one guess, the second reading like a declaration.
        if tb["declaresLength"] and "channelLength" not in d:
            failures.append("(a) %s: its source states a channel length and the "
                            "record does not declare it" % name)
        if not tb["declaresLength"] and "channelLength" in d:
            failures.append("(a) %s: declares a channelLength its source does not "
                            "state -- it is activeArea/(cellPairs x channelWidth), "
                            "derived" % name)
        band = d.get("massTransfer", {}).get("validity", {}).get("Re")
        if "reBand" in tb:
            if band is None or len(band) != 2 or not all(
                    close(a, b, 1e-9) for a, b in zip(band, tb["reBand"])):
                failures.append("(a) %s: massTransfer.validity.Re %s vs the band the "
                                "correlation was fitted over %s"
                                % (name, band, list(tb["reBand"])))
        #  THE TREE NEVER STORES A DERIVATIVE of activeArea, nor a velocity.
        for k in ("areaPerCellPair", "areaPerMembrane", "totalMembraneArea",
                  "membraneArea", "linearVelocity"):
            if k in d:
                failures.append("(a) %s: declares `%s`, which is derived from "
                                "activeArea/cellPairs or from the flow" % (name, k))
        for k, v in tb["values"].items():
            if k in d and not close(si(d[k]), v, 1e-9):
                failures.append("(a) %s: %s = %s vs the paper's %s" % (name, k, si(d[k]), v))
        for k, v in tb["words"].items():
            if word(d.get(k, [])) != v:
                failures.append("(a) %s: %s %r vs the paper's %r" % (name, k, word(d.get(k, [])), v))
        mt = d.get("massTransfer", {})
        for k, v in tb["massTransfer"].items():
            got = word(mt.get(k, [])) if isinstance(v, str) else (si(mt[k]) if k in mt else None)
            if isinstance(v, str):
                if got != v:
                    failures.append("(a) %s: massTransfer.%s %r vs %r" % (name, k, got, v))
            elif got is None or not close(got, v, 1e-9):
                failures.append("(a) %s: massTransfer.%s = %s vs the paper's %s" % (name, k, got, v))
        #  the accepted words, held to the enumerations the engine refuses on
        for key, accepted in (("spacerType", ("mesh", "zigZag", "tortuousPath", "none")),):
            if word(d.get(key, [])) not in accepted:
                failures.append("(a) %s: %s %r is not one of %s"
                                % (name, key, word(d.get(key, [])), list(accepted)))
        if word(mt.get("model", [])) not in ("powerLaw", "leveque"):
            failures.append("(a) %s: massTransfer.model %r is not accepted" % (name, word(mt.get("model", []))))
        if word(mt.get("velocityBasis", [])) not in ("superficial", "interstitial"):
            failures.append("(a) %s: massTransfer.velocityBasis %r is not accepted" % (name, word(mt.get("velocityBasis", []))))
        lim = d.get("limits", {})
        for k in tb.get("absentLimits", []):
            if k in lim:
                failures.append("(a) %s: limits.%s declared but the paper states none" % (name, k))
        prov = d.get("provenance", {})
        if tb["source"] not in word(prov.get("source", [])):
            failures.append("(a) %s: provenance.source does not name %r" % (name, tb["source"]))
        for dotted, v in tb["estimates"].items():
            blk = at(prov, dotted)
            if not isinstance(blk, dict):
                failures.append("(a) %s: `%s` is not stated by the paper and "
                                "carries no provenance block" % (name, dotted))
                continue
            if word(blk.get("origin", [])) != "estimated":
                failures.append("(a) %s: `%s` provenance origin %r, must be `estimated`"
                                % (name, dotted, word(blk.get("origin", []))))
            if word(blk.get("reviewStatus", [])) != "unverified":
                failures.append("(a) %s: `%s` reviewStatus %r, must be `unverified`"
                                % (name, dotted, word(blk.get("reviewStatus", []))))
            note = word(blk.get("notes", []))
            if len(note) < 20 or "verif" not in note:
                failures.append("(a) %s: `%s` carries no note saying how it is to be verified" % (name, dotted))
            got = at(d, dotted)
            if got is not None and not close(si(got), v, 1e-3):
                failures.append("(a) %s: estimate `%s` = %s is not the recorded "
                                "educated value %s" % (name, dotted, si(got), v))
        for dotted in tb.get("measured", []):
            blk = at(prov, dotted)
            if not isinstance(blk, dict):
                failures.append("(a) %s: `%s` comes from operating experience and "
                                "carries no provenance block" % (name, dotted))
                continue
            if word(blk.get("origin", [])) != "measured":
                failures.append("(a) %s: `%s` provenance origin %r, must be "
                                "`measured` (stated by the owner of the unit, not "
                                "read off a document)" % (name, dotted, word(blk.get("origin", []))))
            if word(blk.get("reviewStatus", [])) != "unverified":
                failures.append("(a) %s: `%s` reviewStatus %r, must be `unverified` "
                                "-- a recollection is not a data sheet"
                                % (name, dotted, word(blk.get("reviewStatus", []))))
            note = word(blk.get("notes", []))
            if len(note) < 20 or "verif" not in note:
                failures.append("(a) %s: `%s` carries no note saying how it is to be verified" % (name, dotted))

        def walk_prov(blk, prefix=""):
            for k, sub in blk.items():
                if not isinstance(sub, dict):
                    continue
                dotted = prefix + k
                if "origin" in sub:
                    if word(sub["origin"]) == "estimated" and dotted not in tb["estimates"]:
                        failures.append("(a) %s: `%s` is a value the paper states "
                                        "and is marked as an estimate" % (name, dotted))
                else:
                    walk_prov(sub, dotted + ".")
        walk_prov(prov)
    for name in TABLE:
        if name not in records:
            failures.append("(a) record '%s' not found in %s" % (name, ASSETS))
    if not records:
        print("check_ed_stack: FAILED -- no `kind edStack` record found at all")
        return 1
    REC = records["EUR2C-7P18"]
    IND = records["EurodiaED-100P-50"]

    def geom(rec):
        """(activeArea, cellPairs, h, W, porosity, passes, L) -- the LENGTH
        declared where the source states it, else DERIVED here exactly as the
        engine derives it."""
        A = si(rec["activeArea"]); N = si(rec["cellPairs"])
        h = si(rec["channelHeight"]); w = si(rec["channelWidth"])
        eps = si(rec["spacerPorosity"]); pas = si(rec["hydraulicPasses"])
        L = si(rec["channelLength"]) if "channelLength" in rec else A / (N * w)
        return A, N, h, w, eps, pas, L

    # ---------------- run the witnesses ------------------------------------
    outs = {}
    for case in (ED01, ED03, ED04, ED05):
        rc, out = run(case)
        outs[case] = (rc, out)
        if rc != 0:
            failures.append("%s did not run (exit %d):\n%s" % (case.name, rc, out[-900:]))

    # ---------------- (b) the derived velocity -----------------------------
    def velocity_check(case, unit, stream, rec):
        rc, out = outs[case]
        j = result_of(out) if rc == 0 else None
        if j is None:
            return
        _A, NP, H, W, EPS, PASSES, _L = geom(rec)
        k = j["kpis"][unit]
        missing = [n for n in ("u_superficial", "u_interstitial", "Re", "Sc",
                               "Sh", "k_c_eff", "D_eff")
                   if k.get(n) is None]
        if missing:
            failures.append("(b) %s/%s: the run published no %s -- the predictive"
                            " route did not produce a number" % (case.name, unit, missing))
            return
        Q = water_flow_m3_s(case / "0" / stream)
        u = Q / ((NP / PASSES) * W * H)
        if not close(u, k["u_superficial"], 1e-9):
            failures.append("(b) %s/%s: u = Q/(n W h) = %.9e but the run published %.9e"
                            % (case.name, unit, u, k["u_superficial"]))
        if not close(u / EPS, k["u_interstitial"], 1e-9):
            failures.append("(b) %s/%s: u_interstitial is not u/porosity" % (case.name, unit))
        nu = k["Sc"] * k["D_eff"]
        if not close(k["u_superficial"] * H / nu, k["Re"], 1e-9):
            failures.append("(b) %s/%s: Re is not u h / nu" % (case.name, unit))
        Sh = si(rec["massTransfer"]["a"]) * k["Re"] ** si(rec["massTransfer"]["b"]) \
             * k["Sc"] ** si(rec["massTransfer"]["c"])
        if not close(Sh, k["Sh"], 1e-9):
            failures.append("(b) %s/%s: Sh is not a Re^b Sc^c" % (case.name, unit))
        if not close(k["Sh"] * k["D_eff"] / H, k["k_c_eff"], 1e-9):
            failures.append("(b) %s/%s: k_c_eff is not Sh D_eff / h" % (case.name, unit))

    velocity_check(ED03, "edStack", "diluateFeed", REC)
    velocity_check(ED05, "edStack", "diluateFeed", IND)
    for u in TABLE4:
        velocity_check(ED04, u, u + "dilIn", REC)

    #  THE DERIVED LENGTH, on the record that stores none.  It must be what
    #  activeArea/(cellPairs x channelWidth) gives, the run must SAY it is
    #  derived, and the flow path must be that length times the passes.
    rc, out = outs[ED05]
    if rc == 0:
        _A, _N, _h, _w, _eps, pas, L = geom(IND)
        if "(DERIVED: activeArea / (cellPairs x channelWidth)" not in out:
            failures.append("(b) ed05: the run does not say its channel length is DERIVED")
        if "channel length           %.6f m" % L not in out:
            failures.append("(b) ed05: the channel length printed is not "
                            "activeArea/(cellPairs x channelWidth) = %.6f m" % L)
        if "flow path length         %.4f m" % (L * pas) not in out:
            failures.append("(b) ed05: the flow path is not the channel length x %g passes" % pas)
        if "geometric footprint" in out:
            failures.append("(b) ed05: prints a W*L footprint as a SECOND fact, but its "
                            "length is derived from the area -- the two cannot disagree")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        #  THE PASS DIVISION.  A record with ONE pass cannot tell
        #  cellPairs/passes from cellPairs, so the arm builds a twin whose
        #  case-local record declares 7 passes: one channel per pass, so the
        #  velocity must rise exactly 7x.
        dd = tmp / "passes"
        copy_case(ED03, dd)
        (dd / "constant" / "assets").mkdir(parents=True, exist_ok=True)
        rec = (ASSETS / "EUR2C-7P18.dat").read_text().replace(
            "hydraulicPasses 1;", "hydraulicPasses 7;")
        (dd / "constant" / "assets" / "EUR2C-7P18.dat").write_text(rec)
        rc, out = run(dd)
        j = result_of(out) if rc == 0 else None
        if j is None:
            failures.append("(b) the 7-pass twin did not run (exit %d):\n%s" % (rc, out[-700:]))
        else:
            base = result_of(outs[ED03][1])["kpis"]["edStack"]["u_superficial"]
            got = j["kpis"]["edStack"]["u_superficial"]
            if not close(got, 7.0 * base, 1e-9):
                failures.append("(b) 7 hydraulic passes must divide the channels "
                                "7 ways and raise u 7x: %.9e vs %.9e" % (got, 7.0 * base))
            if "flow path length         1.2250" not in out:
                failures.append("(b) the 7-pass twin does not report a 7x flow path length")

        # ---------------- (c) the refusals ---------------------------------
        def refusal(label, src, mutate, must):
            d2 = tmp / label
            copy_case(src, d2)
            mutate(d2)
            rc, out = run(d2)
            missing = [m for m in must if m not in out]
            if rc == 0 or missing:
                failures.append("(c) %s: exit %d, refusal text missing %s:\n%s"
                                % (label, rc, missing, out[-600:]))

        def add_op(d2, line, case="edStack"):
            p = d2 / "system/flowsheetDict"
            p.write_text(p.read_text().replace(
                "            xi                0.9;",
                "            xi                0.9;\n            " + line, 1))

        refusal("inlineVelocity", ED03, lambda d2: add_op(d2, "linearVelocity 0.05 m/s;"),
                ["`linearVelocity`", "one home", "EUR2C-7P18"])
        refusal("inlineArea", ED03, lambda d2: add_op(d2, "membraneArea 0.2 m2;"),
                ["`membraneArea`", "one home"])
        refusal("unknownStack", ED03,
                lambda d2: (d2 / "system/flowsheetDict").write_text(
                    (d2 / "system/flowsheetDict").read_text().replace("EUR2C-7P18", "EUR2C-7P19")),
                ["EUR2C-7P19", "Registered", "EUR2C-7P18"])
        refusal("unknownModel", ED03,
                lambda d2: add_op(d2, "limitingCurrent { model GeraldesAfonso2011; }"),
                ["GeraldesAfonso2011", "Accepted", "GeraldesAfonso2010", "CowanBrown"])

        def ask_predictive(d2):
            p = d2 / "system/flowsheetDict"
            p.write_text(p.read_text().replace(
                "            membrane          CMX_AMX;",
                "            membrane          CMX_AMX;\n"
                "            limitingCurrent { model GeraldesAfonso2010; }", 1))
        refusal("predictiveWithoutStack", ED01, ask_predictive,
                ["GeraldesAfonso2010", "names no `stack", "CowanBrown"])

        #  THE MEMBRANE PAIR: the refusal points BOTH ways, and which way is
        #  the RECORD's to decide.  EUR2C-7P18 names a pair, so a case that
        #  also names one is refused; EurodiaED-100P-50 names none (its owner
        #  did not state it), so a case that names none is refused.
        refusal("stackPlusMembrane", ED03, lambda d2: add_op(d2, "membrane CMX_AMX;"),
                ["`membrane`", "one home", "EUR2C-7P18"])

        def drop_membrane(d2):
            p = d2 / "system/flowsheetDict"
            p.write_text(re.sub(r"[ \t]*membrane +CMX_AMX;[^\n]*\n", "", p.read_text()))
        refusal("stackNoMembrane", ED05, drop_membrane,
                ["EurodiaED-100P-50", "names no membrane pair", "`membrane <name>;`"])

        #  THE CORRELATION'S VALIDITY WINDOW.  A twin at a tenth of the design
        #  flow sits far below Re 50 and must ANNOUNCE the extrapolation --
        #  announce, never refuse, the posture of every validity window here.
        d2 = tmp / "slow"
        copy_case(ED05, d2)
        for s in ("diluateFeed", "diluate"):
            f = d2 / "0" / s
            f.write_text(f.read_text().replace("water    166.5251203144 kmol/h;",
                                               "water    16.65251203144 kmol/h;")
                                      .replace("Na    0.15 kmol/h;", "Na    0.015 kmol/h;")
                                      .replace("Cl    0.15 kmol/h;", "Cl    0.015 kmol/h;"))
        rc, out = run(d2)
        if rc != 0:
            failures.append("(g) the low-flow twin must EXIT 0 (a validity window "
                            "announces, never refuses); exit %d:\n%s" % (rc, out[-700:]))
        if "[extrapolation] electrodialysisStack" not in out or "OUTSIDE the band" not in out:
            failures.append("(g) the low-flow twin printed no [extrapolation] line, "
                            "although its Re is far below the band the record's "
                            "correlation was fitted over")

        # ---------------- (g) the limit announcement, still exit 0 ---------
        d2 = tmp / "hot"
        copy_case(ED03, d2)
        for s in ("diluateFeed", "concentrateFeed", "diluate", "concentrate"):
            f = d2 / "0" / s
            f.write_text(f.read_text().replace("T               298.15 K;", "T               320.0 K;"))
        rc, out = run(d2)
        if rc != 0:
            failures.append("(g) the 320 K twin must EXIT 0 (a limit announces, "
                            "never refuses); exit %d:\n%s" % (rc, out[-700:]))
        if "[limit] stack 'EUR2C-7P18'" not in out or "T_max" not in out and "maximum operating temperature" not in out:
            failures.append("(g) the 320 K twin printed no [limit] line naming the temperature")

    # ---------------- (d) Eq. 15 reduces to Eq. 16 -------------------------
    rc, out = outs[ED03]
    j = result_of(out) if rc == 0 else None
    if j is not None:
        k = j["kpis"]["edStack"]
        if "i_lim_eq16" not in k:
            failures.append("(d) ed03 is a single salt and published no Eq. 16 value")
        elif not close(k["i_lim_eq16"], k["i_lim_cem"], 1e-12):
            failures.append("(d) ed03: Eq. 16 %.10g does not reduce Eq. 15 %.10g"
                            % (k["i_lim_eq16"], k["i_lim_cem"]))
        ions = [["Na", 1.0, k["C_ion_Na"], k["D_ion_Na"]],
                ["Cl", -1.0, k["C_ion_Cl"], k["D_ion_Cl"]]]
        t = t_lim(ions, True)
        mine15 = eq15(ions, t, k["k_c_eff"], k["D_eff"])
        mine16 = eq16(ions, k["k_c_eff"], t["Na"])
        if not close(mine15, k["i_lim_cem"], 1e-9):
            failures.append("(d) ed03: this gate's Eq. 15 %.10g vs the engine's %.10g"
                            % (mine15, k["i_lim_cem"]))
        if not close(mine16, k["i_lim_eq16"], 1e-9):
            failures.append("(d) ed03: this gate's Eq. 16 %.10g vs the engine's %.10g"
                            % (mine16, k["i_lim_eq16"]))
        print("  [reduction] ed03 single salt: Eq. 15 = %.6f A/m2, Eq. 16 = %.6f A/m2"
              % (k["i_lim_cem"], k["i_lim_eq16"]))

    # ---------------- (e) D_eff and the transport numbers ------------------
    rc, out = outs[ED04]
    j = result_of(out) if rc == 0 else None
    if j is not None:
        k = j["kpis"]["ED1"]
        C = {n: k["C_ion_" + n] for n in ("Mg", "Cl", "SO4")}
        D = {n: k["D_ion_" + n] for n in ("Mg", "Cl", "SO4")}
        Z = {"Mg": 2.0, "Cl": -1.0, "SO4": -2.0}
        #  The paper's SALT indexing for this system: MgCl2 (Mg with Cl) and
        #  MgSO4 (Mg with SO4), equivalent fractions on the total equivalents.
        eqtot = sum(abs(Z[n]) * C[n] for n in ("Cl", "SO4"))
        salts = [(abs(Z["Cl"]) * C["Cl"] / eqtot, Z["Mg"], D["Mg"], Z["Cl"], D["Cl"]),
                 (abs(Z["SO4"]) * C["SO4"] / eqtot, Z["Mg"], D["Mg"], Z["SO4"], D["SO4"])]
        mine = d_eff_salt_indexed(salts)
        #  1e-10, not tighter: the result JSON carries 12 significant figures,
        #  so the engine's own D_eff arrives ALREADY rounded at ~1e-12 relative
        #  and a tighter threshold would be measuring the serialiser.  A real
        #  formula error is O(1).
        if not close(mine, k["D_eff"], 1e-10):
            failures.append("(e) ED1: the paper's salt-indexed Eq. A13 gives %.12e but "
                            "the engine's ion-fraction form gives %.12e (relative gap "
                            "%.3e) -- the identity the engine claims does not hold"
                            % (mine, k["D_eff"], abs(mine - k["D_eff"]) / k["D_eff"]))
        #  and against the paper's OWN Table 3 diffusivities at 20 C
        salts3 = [(abs(Z["Cl"]) * C["Cl"] / eqtot, 2.0, TABLE3["Mg"], -1.0, TABLE3["Cl"]),
                  (abs(Z["SO4"]) * C["SO4"] / eqtot, 2.0, TABLE3["Mg"], -2.0, TABLE3["SO4"])]
        paper = d_eff_salt_indexed(salts3)
        dev = abs(k["D_eff"] - paper) / paper
        if dev > 0.01:
            failures.append("(e) ED1: D_eff %.10e is %.2f %% from the paper's Table 3 "
                            "value %.10e -- the Stokes-Einstein correction is not "
                            "reaching the paper's own table" % (k["D_eff"], 100 * dev, paper))
        print("  [D_eff] ED1: engine %.6e m2/s, Eq. A13 on Table 3's own D at 20 C "
              "%.6e m2/s (%.2f %%)" % (k["D_eff"], paper, 100 * dev))
        ions = [[n, Z[n], C[n], D[n]] for n in ("Mg", "Cl", "SO4")]
        for cem, tag in ((True, "cem"), (False, "aem")):
            mine_t = t_lim(ions, cem)
            for n in ions:
                got = k["t_lim_%s_%s" % (tag, n[0])]
                if not close(mine_t[n[0]], got, 1e-9):
                    failures.append("(e) ED1: t_lim_%s_%s = %.10g, this gate's Eqs. 12/13 give %.10g"
                                    % (tag, n[0], got, mine_t[n[0]]))
        print("  [transport numbers] ED1 CEM: %s | AEM: %s"
              % (", ".join("%s %.5f" % (n, k["t_lim_cem_" + n]) for n in ("Mg", "Cl", "SO4")),
                 ", ".join("%s %.5f" % (n, k["t_lim_aem_" + n]) for n in ("Mg", "Cl", "SO4"))))

        # ---------------- (f) the anchors against Table 4 ------------------
        devs = []
        print("  [Table 4] MgCl2 + MgSO4, 20 C -- engine against the measurement:")
        for u in sorted(TABLE4):
            Re_paper, Cav, meas = TABLE4[u]
            ku = j["kpis"][u]
            d = (ku["i_lim"] - meas) / meas
            devs.append(abs(d))
            print("      %s  Re %2d (paper) / %5.2f (derived from the flow)   "
                  "C1,avg %5.2f eq/m3   i_lim %6.2f vs %5.1f A/m2   %+6.1f %%"
                  % (u, Re_paper, ku["Re"], Cav, ku["i_lim"], meas, 100 * d))
            if abs(d) > ANCHOR_BAND:
                failures.append("(f) %s: i_lim %.3f A/m2 is %+.1f %% from Table 4's "
                                "%.1f A/m2, outside the paper's own %.0f %% band"
                                % (u, ku["i_lim"], 100 * d, meas, 100 * ANCHOR_BAND))
        print("      average |deviation| %.1f %% (the paper reports 9 %% for this system, "
              "section 4.3)" % (100 * sum(devs) / len(devs)))

    # ---------------- (g) the announcements --------------------------------
    def estimate_lines(out, name):
        return re.findall(r"\[estimate\] stack '%s': `([\w.]+)` = \S+ \(SI\) is an "
                          r"ESTIMATE, reviewStatus (\w+) -- (.*)" % re.escape(name), out)

    for case, nunits, sname in ((ED03, 1, "EUR2C-7P18"), (ED04, 6, "EUR2C-7P18"),
                                (ED05, 1, "EurodiaED-100P-50")):
        rc, out = outs[case]
        if rc != 0:
            continue
        rec = records[sname]
        want = set(TABLE[sname]["estimates"])
        lines = estimate_lines(out, sname)
        got = {kk for kk, _, _ in lines}
        if got != want:
            failures.append("(g) %s: announced estimates %s vs the record's %s"
                            % (case.name, sorted(got), sorted(want)))
        for kk, status, note in lines:
            if status != "unverified":
                failures.append("(g) %s: `%s` announced with reviewStatus %s" % (case.name, kk, status))
            rec_note = word(at(rec["provenance"], kk).get("notes", []))
            if rec_note not in note:
                failures.append("(g) %s: the announced note for `%s` is not the record's" % (case.name, kk))
        j2 = result_of(out)
        adv = [a for a in (j2 or {}).get("advisories", [])
               if a.get("category") == "provenance" and a.get("locus") == "stack '%s'" % sname]
        if len(adv) != len(want):
            failures.append("(g) %s: %d provenance advisories on the stack's locus vs %d estimates"
                            % (case.name, len(adv), len(want)))
        if out.count("[limiting current] model GeraldesAfonso2010 selected by default") != nunits:
            failures.append("(g) %s: the limiting-current route is not announced once per unit" % case.name)
        if "[limit] stack" in out:
            failures.append("(g) %s: a witness prints a [limit] line" % case.name)
        if "[extrapolation] electrodialysisStack" in out:
            failures.append("(g) %s: a witness runs outside its correlation's "
                            "validity window" % case.name)
        if "[legacy] electrodialysisStack" in out:
            failures.append("(g) %s: a stack-record case prints a legacy line" % case.name)

    rc, out = outs[ED01]
    if rc == 0:
        for phrase in ("the crossflow velocity was DECLARED",
                       "falls back to the CowanBrown",
                       "names no `stack <name>;` record"):
            if phrase not in out:
                failures.append("(g) ed01 (no stack record) does not announce %r" % phrase)
        if "[estimate] stack" in out:
            failures.append("(g) ed01 names no stack and announced a stack estimate")

    if failures:
        print("check_ed_stack: FAILED")
        for f in failures:
            print("  " + f)
        return 1
    print("check_ed_stack: OK -- 2 `kind edStack` records.  EUR2C-7P18 (a bench unit) "
          "matches a second transcription of Geraldes & Afonso, J. Membr. Sci. 360 (2010) "
          "499-508 on every value the paper states and marks its 4 non-source values "
          "`origin estimated; reviewStatus unverified;` with a note saying how to verify "
          "each; EurodiaED-100P-50 (Vitor Geraldes' own industrial unit, facts from "
          "operating experience) marks its 6 stated values `origin measured; reviewStatus "
          "unverified;` and its 3 unstated ones `origin estimated;`, names NO membrane pair "
          "and stores NO channel length (exactly one of width and length is stored where "
          "neither is stated), declares no limits{} because a DESIGN flow is not a ceiling, "
          "and carries the Reynolds band its borrowed correlation was fitted over.  Neither "
          "record stores a derivative of activeArea or a velocity, and neither marks a "
          "source value as an estimate.  ed03/ed04/ed05 announce exactly their record's "
          "estimates (the record's own note, a provenance advisory each) and name their "
          "limiting-current route, while ed01 -- which names no stack -- announces BOTH "
          "legacy routes; no witness prints a [limit] or [extrapolation] line.  The "
          "published crossflow velocity recomputes from each case's OWN declared diluate "
          "flow and its record's geometry to 1e-9 on all 8 units, including a 7-pass twin "
          "where the channels divide 7 ways; Re, Sh and k_c,eff reproduce from it; ed05's "
          "channel length is DERIVED as activeArea/(cellPairs x channelWidth), said to be "
          "derived, and multiplied by its 2 passes into the flow path.  7 refusals fire by "
          "name (linearVelocity / membraneArea beside `stack`, an unknown stack with the "
          "registered list, an unknown limiting-current model with the accepted list, the "
          "predictive model asked for without a stack, a membrane declared beside a record "
          "that names one, and NO membrane beside a record that names none).  A 320 K twin "
          "prints its [limit] line and a tenth-flow twin its [extrapolation] line, and BOTH "
          "exit 0.  Eq. 15 reduces to Eq. 16 on ed03's single salt to 1e-12 and both "
          "recompute here; ed04's D_eff equals the paper's SALT-indexed Eq. A13 to 1e-10 "
          "(the precision the result JSON carries) and its own Table 3 at 20 C to 1 %; the "
          "limiting transport numbers recompute from Eqs. 12/13; and all 6 MgCl2 + MgSO4 "
          "rows of Table 4 sit inside the paper's own 13 % band, printed with their "
          "deviations.  "
          "NOT CHECKED: whether any estimate is a good one, whether any `measured` fact is "
          "correctly remembered, the transcription against the PDF, Table 4's NaCl and "
          "MgCl2 rows (no case runs them), the ohmic drop / Nernst EMF / Faraday transfer "
          "(ed01's goldens), the `leveque` correlation branch and the `interstitial` "
          "velocity basis (no record uses either), and dP_max / flow_max / the pH band (no "
          "record declares them).  Nothing here says the bench stack's correlation is VALID "
          "on a zig-zag spacer -- only that it is applied inside its own Reynolds band.  "
          "Nothing here runs over TIME: the batch recirculating rig, where this same "
          "limiting current is seen FALLING with a depleting diluate, is check_ed_batch's "
          "subject.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
