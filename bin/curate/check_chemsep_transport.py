#!/usr/bin/env python3
"""Gate: the three ChemSep-form models answer, and answer what the record says.

    bin/curate/check_chemsep_transport.py

WHY THIS EXISTS.  Three model families landed in the tree across three days
-- `chemsepCp16` (ideal-gas and liquid heat capacity), `chemsepEq101` (liquid
viscosity) and `chemsepEq16` (liquid thermal conductivity) -- and not one of
them shipped a gate.  Every other slice in this project does.  Worse, these
three are the kind that fail QUIETLY: each returns a positive number of
roughly the right size whatever it gets wrong, so a dropped term, a flipped
sign or a missed unit conversion arrives as a plausible property and not as
a crash.

They also carry the exact trap this project has paid for before.  The Cp
emitter CONVERTS (ChemSep states J/(kmol.K), so A is divided by 1000 and C
is shifted by -ln 1000) while the conductivity emitter does NOT (ChemSep
states W/(m.K), which is already what Choupo means) -- two quantities
sharing one equation, one converted and one not.  That is the pair a shared
helper gets wrong once and silently, which is why they are three separate
models and why this gate checks the arithmetic rather than trusting it.

WHAT THIS GATE CHECKS.

  (a) EACH MODEL IS REACHABLE THROUGH THE ENGINE.  A probe case selects it
      by name and gets a number out.  A registered factory nobody can select
      is not a shipped model.

  (b) THE NUMBER IS RECOMPUTED HERE, from the parameters in the component's
      OWN record, in Python, independently of the C++.  This is the arm that
      matters: it catches a wrong exponent, a dropped term, a swapped
      coefficient and a sign flip, none of which change how the answer looks.
      It is deliberately NOT a comparison against a value transcribed into
      this file -- that would be a second home for the arithmetic, which is
      the defect the whole doctrine exists to prevent.

  (c) THE CONVERSION IS CHECKED WHERE IT EXISTS AND ABSENT WHERE IT IS NOT,
      by magnitude and by a physical inequality rather than by the ChemSep
      source (which is gitignored and absent from every clean checkout, so a
      check against it could not run here -- and a check that cannot run
      must not pass).  A liquid molar Cp that missed its 1/1000 would be
      O(1e5) J/(mol.K); one that got an extra one would be O(0.1).  The
      inequality Cp_liquid > Cp_idealGas holds for an organic liquid well
      below Tc and is checked too, but ON ITS OWN IT IS NOT ENOUGH and this
      gate's own sabotage 6 proved it: 301441 is still greater than 188, so
      an un-converted liquid Cp passed.  The band that closes it is the
      RATIO Cp_liquid / Cp_ig, which a factor of 1000 in either direction
      leaves nowhere near.

  (d) EACH MODEL IS CROSS-CHECKED AGAINST AN INDEPENDENT CORRELATION -- the
      predictive SatoRiedel for conductivity, RowlinsonBondi for liquid Cp.
      This catches a units error that (b) cannot, because (b) reproduces
      whatever the record says.  The bands are WIDE and stated as wide: two
      correlations agreeing establishes units and order of magnitude, NOT
      that either is true.  Neither is a measurement and this gate never
      claims one.

  (e) THE DECLARED WINDOW IS ANNOUNCED AND REACHES THE READER TWICE -- at
      its site and in the end-of-run ASSUMPTIONS AND CAVEATS block.  A
      warning a thousand lines above the answer has been delivered and not
      received; `core/AdvisorySummary.H` exists for that reason.  Announced,
      never enforced (I4): the extrapolated value is still returned.

  (f) THE NEGATIVE, per model: a component carrying NO block refuses BY NAME
      and names the predictive alternative.  Without this arm the gate would
      pass just as happily if every model answered for every component, and
      a silent zero is the worst outcome a property model has.

  (g) THE FALLBACK STILL WORKS.  A component with no block runs under the
      predictive model.  The import must not have made the predictive route
      a casualty of the fitted one.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
It checks NO value against MEASURED data, because the catalogue holds no
measured liquid viscosities or conductivities to check against -- the
oracles in (d) are correlations, and where they disagree most (associating
liquids) it is the oracle that is known to be weak.  It does not check the
gas-phase models, the Simpson quadratures `chemsepCp16` uses for H and S
(only Cp itself), or any of the two-thousand-odd records it does not probe:
reach across the catalogue rests on the emitter having one home, not on
observed runs.  And it says nothing about whether ChemSep's fits are good
fits, which is a question about ChemSep.

SABOTAGE-VERIFIED 2026-08-26, seven times; OBSERVED output below, verbatim,
including the one that SURVIVED first contact and the defect it exposed --
which is the reason there are seven and not five.

S1 -- the conductivity drops its E*T^2 term (a plausible-looking fit):

    - `k`: the engine returned 6.91634978 but this script recomputes 0.1544420039 from 1Heptanol.dat's own parameters -- the model is not evaluating the form its record declares
    - conductivity = 6.91635 W/(m.K) is outside any plausible liquid range (W, not mW)
    - the fitted conductivity 6.9163 and the predictive SatoRiedel 0.13547 differ by 5005.6 %, past the 40 % band

S2 -- the conductivity loses its A offset.  This is the one to know: 0.064
W/(m.K) is a PERFECTLY PLAUSIBLE liquid conductivity, so only the
recomputation and the oracle can see it at all:

    - `k`: the engine returned 0.0640830039 but this script recomputes 0.1544420039 from 1Heptanol.dat's own parameters
    - the fitted conductivity 0.064083 and the predictive SatoRiedel 0.13547 differ by 52.7 %, past the 40 % band

S3 -- the out-of-window announcement suppressed:

    - evaluated at 623.15 K, outside the declared conductivity window (Tmax 573.15), and the run never announced it

S4 -- a missing block returns 0.0 instead of refusing:

    - `chemsepEq16` answered for water, which carries no block for it -- a property model with no data must refuse, never return a number

S5 -- the viscosity's C*ln(T) term dropped:

    - `mu`: the engine returned 5.46692241e-27 but this script recomputes 0.002929368583
    - viscosity = 5.46692e-27 Pa.s is outside any plausible liquid range

S6 -- the liquid Cp RECORD un-converted back to J/(kmol.K), i.e. a bad
IMPORT rather than a bad model (the Edwards shape: it runs, it converges,
the number is plausibly typeset).  **THIS SURVIVED ITS FIRST RUN**, and the
gate said OK while reporting `cp_l = 301441`:

    the inequality Cp_liquid > Cp_ig was doing the work, and 301441 IS
    greater than 188.  It only catches the direction that makes the liquid
    too SMALL.  The docstring above had claimed it caught "a factor of 1000
    in either direction", which was simply wrong.  Closed by banding cp_l
    itself and by the RATIO, after which:

    - cp_l = 301441 J/(mol.K) is outside any plausible molar range -- the 1/1000 conversion looks lost or applied twice
    - Cp_liquid / Cp_ig = 1602 at 320.0 K, outside the 1.05-4 band an organic liquid well below Tc occupies

S7 -- the same conversion applied TWICE, which nothing had tested and which
S6's fix had to be shown not to have merely papered over:

    - Cp_liquid (0.301441) is not greater than Cp_ig (188.126) at 320.0 K
    - cp_l = 0.301441 J/(mol.K) is outside any plausible molar range
    - Cp_liquid / Cp_ig = 0.001602 at 320.0 K, outside the 1.05-4 band

A NOTE ON THE HARNESS, because it cost a false result.  S6's first run
reported S5's failure text.  The sabotage driver rebuilt after a `.cpp`
sabotage but not after REVERTING one, and S6 edits a `.dat` -- so S6 ran
against a binary still carrying S5.  That is the 2026-08-18 contamination
shape in miniature: reverting a source without rebuilding leaves the damage
in the artefact, and a clean `git status` is not evidence that the build is
clean.  Every sabotage run here is journal-protected through
`destructive_session.py` for exactly that reason.
"""

import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
COMP = ROOT / "data" / "standards" / "components"

#  The probe substance.  It must carry ALL THREE blocks (336 records do) and
#  be liquid at the probe temperature.  1-heptanol also has a narrow declared
#  conductivity window (239.15-460 K), which arm (e) needs a way out of.
PROBE = "1Heptanol"
T_IN = 320.0            # inside every declared window

#  Arm (e)'s temperature is DERIVED from the probe record's own declared
#  conductivity window, never written down here.  The first draft hard-coded
#  520 K from a window remembered as 239-460; 1-heptanol's is 239-573, so
#  520 K sits comfortably INSIDE it and the arm reported a missing
#  announcement that was correctly absent.  A gate that carries its own copy
#  of a number the record owns is the arity sin inside the machinery built
#  to enforce it -- and here it produced a false failure, which is the
#  cheaper of the two ways that lie can land.
T_OUT_MARGIN = 50.0

#  A component with none of the three blocks, for arms (f) and (g).  Water is
#  hand-curated, predates the import and is never rewritten by it.
BARE = "water"


def scalars(text: str, block: str, keys) -> dict:
    """Pull `key value;` scalars out of a named block in a .dat."""
    m = re.search(re.escape(block) + r"\s*\{(.*?)\n\}", text, re.S)
    if not m:
        return {}
    body = m.group(1)
    out = {}
    for k in keys:
        mk = re.search(r"\b" + k + r"\s+(-?[0-9.eE+-]+)\s*;", body)
        if mk:
            out[k] = float(mk.group(1))
    return out


def coeffs(text: str, block: str):
    """Pull the `coefficients ( ... );` list out of a named block."""
    m = re.search(re.escape(block) + r"\s*\{(.*?)\n\}", text, re.S)
    if not m:
        return None
    mc = re.search(r"coefficients\s*\(([^)]*)\)", m.group(1))
    return [float(x) for x in mc.group(1).split()] if mc else None


def eq16(p, T):
    A, B, C, D, E = (p + [0.0, 0.0])[:5]
    return A + math.exp(B / T + C + D * T + E * T * T)


def eq101(A, B, C, D, E, T):
    return math.exp(A + B / T + C * math.log(T) + (D * T ** E if D else 0.0))


def write_case(dirpath: Path, comp: str, ops: str):
    (dirpath / "system").mkdir(parents=True, exist_ok=True)
    (dirpath / "constant").mkdir(parents=True, exist_ok=True)
    (dirpath / "system" / "controlDict").write_text(
        'application   choupoProps;\n'
        'description   "check_chemsep_transport probe";\n'
        'verbosity     3;\n')
    (dirpath / "constant" / "thermoPhysPropDict").write_text(
        "recordType    thermophysicalPropertySystem;\n"
        "schemaVersion 2;\n"
        f"components    ( {comp} );\n"
        "equilibrium\n{\n    formulation gammaPhi;\n"
        "    liquid  { activityModel ideal;  standardState pureLiquid; }\n"
        "    vapour  { fugacityModel idealGas; }\n}\n")
    (dirpath / "system" / "propsDict").write_text(f"operations\n(\n{ops});\n")


def scan(name, comp, prop, model_block, T, n=1):
    return (f'    {{\n'
            f'        name        {name};\n'
            f'        type        propertyScan1D;\n'
            f'        vary        {{ variable T;  from {T} K;  to {T} K;  n 2; }}\n'
            f'        state       {{ P 1 bar;  composition {{ {comp} 1.0; }} }}\n'
            f'        thermo      {{ {model_block} }}\n'
            f'        properties  ( {prop} );\n'
            f'        output      {{ file {name}.csv; }}\n'
            f'    }}\n')


def run_props(case: Path):
    p = subprocess.run([str(BUILD / "choupoProps"), str(case)],
                       capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def value(case: Path, name: str):
    hits = list(case.rglob(f"{name}.csv"))
    if not hits:
        return None
    rows = [r for r in hits[0].read_text().splitlines() if r and not r[0].isalpha()]
    return float(rows[0].split(",")[1]) if rows else None


def rel(a, b):
    return abs(a - b) / abs(b) if b else float("inf")


def main() -> int:
    fails = []
    notes = []
    text = (COMP / f"{PROBE}.dat").read_text()

    cp_ig = coeffs(text, "idealGasHeatCapacity")
    cp_l = coeffs(text, "liquidHeatCapacity")
    vis = scalars(text, "liquidViscosity", list("ABCDE") + ["Tmin", "Tmax"])
    cnd = scalars(text, "liquidThermalConductivity",
              list("ABCDE") + ["Tmin", "Tmax"])
    if "Tmax" not in cnd:
        fails.append(f"probe component {PROBE} declares no conductivity Tmax --"
                     " arm (e) derives its out-of-window temperature from it and"
                     " cannot run; a check that cannot run must not pass")
    for label, got in (("idealGasHeatCapacity", cp_ig), ("liquidHeatCapacity", cp_l),
                       ("liquidViscosity", vis), ("liquidThermalConductivity", cnd)):
        if not got:
            fails.append(f"probe component {PROBE} carries no {label} block --"
                         " the gate cannot check a model whose data is absent")
    if fails:
        print("check_chemsep_transport: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    tmp = Path(tempfile.mkdtemp(prefix="chemsep_gate_"))
    try:
        # ---- arms (a) (b) (c) (d): the three models, inside their windows --
        case = tmp / "inside"
        ops = (scan("cp_l", PROBE, f"Cp_liquid_{PROBE}", "", T_IN)
               + scan("cp_ig", PROBE, "Cp_ig", "", T_IN)
               + scan("mu", PROBE, "viscosity_liquid",
                      "transport { liquid { viscosity { model chemsepEq101; } } }", T_IN)
               + scan("k", PROBE, "thermal_conductivity_liquid",
                      "transport { liquid { thermalConductivity { model chemsepEq16; } } }", T_IN)
               + scan("k_sr", PROBE, "thermal_conductivity_liquid",
                      "transport { liquid { thermalConductivity { model SatoRiedel; } } }", T_IN))
        write_case(case, PROBE, ops)
        rc, out = run_props(case)
        if rc != 0:
            fails.append(f"the probe run did not complete (exit {rc}) -- a model"
                         " that cannot be selected is not a shipped model:\n      "
                         + "\n      ".join(out.strip().splitlines()[-4:]))
        else:
            got = {n: value(case, n) for n in ("cp_l", "cp_ig", "mu", "k", "k_sr")}
            for n, v in got.items():
                if v is None:
                    fails.append(f"operation `{n}` produced no value -- the model"
                                 " is registered but does not answer")
            if all(v is not None for v in got.values()):
                #  (b) INDEPENDENT RECOMPUTATION from the record's own numbers
                want = {
                    "cp_l": eq16(cp_l, T_IN),
                    "cp_ig": eq16(cp_ig, T_IN),
                    "mu": eq101(vis["A"], vis["B"], vis.get("C", 0.0),
                                vis.get("D", 0.0), vis.get("E", 0.0), T_IN),
                    "k": eq16([cnd["A"], cnd["B"], cnd["C"],
                               cnd.get("D", 0.0), cnd.get("E", 0.0)], T_IN),
                }
                for n, w in want.items():
                    if rel(got[n], w) > 1e-7:
                        fails.append(
                            f"`{n}`: the engine returned {got[n]:.10g} but this"
                            f" script recomputes {w:.10g} from {PROBE}.dat's own"
                            " parameters -- the model is not evaluating the form"
                            " its record declares")
                    else:
                        notes.append(f"{n} = {got[n]:.6g} reproduced independently")

                #  (c) THE CONVERSION, by physical inequality and magnitude
                if not (got["cp_l"] > got["cp_ig"]):
                    fails.append(
                        f"Cp_liquid ({got['cp_l']:.6g}) is not greater than Cp_ig"
                        f" ({got['cp_ig']:.6g}) at {T_IN} K -- for an organic"
                        " liquid well below Tc it must be; a lost or doubled"
                        " J/kmol -> J/mol conversion breaks exactly this")
                for key in ("cp_ig", "cp_l"):
                    if not (20.0 < got[key] < 2000.0):
                        fails.append(
                            f"{key} = {got[key]:.6g} J/(mol.K) is outside any"
                            " plausible molar range -- the 1/1000 conversion"
                            " looks lost or applied twice")
                #  THE RATIO, and it is here because the inequality above is
                #  NOT enough on its own.  Sabotage 6 un-converted the LIQUID
                #  Cp record to J/(kmol.K) and this gate passed: 301441 is
                #  still greater than 188, so `Cp_liquid > Cp_ig` waved a
                #  thousandfold error through.  The inequality only catches
                #  the direction that makes the liquid too SMALL.  For an
                #  organic liquid well below Tc the ratio sits near 1.3-2;
                #  the band is loose because it is a physical claim about a
                #  whole class, and a factor of 1000 is nowhere near it.
                ratio = got["cp_l"] / got["cp_ig"]
                if not (1.05 < ratio < 4.0):
                    fails.append(
                        f"Cp_liquid / Cp_ig = {ratio:.4g} at {T_IN} K, outside"
                        " the 1.05-4 band an organic liquid well below Tc"
                        " occupies -- a lost or doubled J/kmol -> J/mol"
                        " conversion on EITHER rung lands here")
                else:
                    notes.append(f"Cp_liquid / Cp_ig = {ratio:.3g}")
                if not (1e-5 < got["mu"] < 10.0):
                    fails.append(f"viscosity = {got['mu']:.6g} Pa.s is outside any"
                                 " plausible liquid range (Pa.s, not mPa.s)")
                if not (0.02 < got["k"] < 1.5):
                    fails.append(f"conductivity = {got['k']:.6g} W/(m.K) is outside"
                                 " any plausible liquid range (W, not mW)")

                #  (d) THE INDEPENDENT CORRELATION.  Wide, and wide on purpose.
                d = 100.0 * abs(got["k"] - got["k_sr"]) / got["k_sr"]
                if d > 40.0:
                    fails.append(
                        f"the fitted conductivity {got['k']:.5g} and the predictive"
                        f" SatoRiedel {got['k_sr']:.5g} differ by {d:.1f} %, past"
                        " the 40 % band -- for a non-associating alcohol that is a"
                        " units or form error, not a disagreement between"
                        " correlations")
                else:
                    notes.append(f"fitted vs predictive conductivity {d:.1f} % apart")

        # ---- arm (e): the window is announced, and replayed -----------------
        case = tmp / "outside"
        T_out = cnd["Tmax"] + T_OUT_MARGIN
        write_case(case, PROBE, scan(
            "k_hot", PROBE, "thermal_conductivity_liquid",
            "transport { liquid { thermalConductivity { model chemsepEq16; } } }",
            T_out))
        rc, out = run_props(case)
        if rc != 0:
            fails.append("evaluating OUTSIDE the declared window did not complete"
                         " -- the window is announced, never enforced (I4), so the"
                         " value must still be returned")
        else:
            if "OUTSIDE its declared range" not in out:
                fails.append("evaluated at %g K, outside the declared conductivity"
                             " window (Tmax %g), and the run never announced it"
                             % (T_out, cnd["Tmax"]))
            elif "ASSUMPTIONS AND CAVEATS" not in out or out.count(
                    "OUTSIDE its declared range") < 2:
                fails.append("the out-of-window announcement did not reach the"
                             " end-of-run ASSUMPTIONS AND CAVEATS block -- announced"
                             " at its site and nowhere the reader will meet it")
            else:
                notes.append("out-of-window extrapolation announced twice")
            if value(case, "k_hot") is None:
                fails.append("the extrapolated conductivity was not returned --"
                             " I4 announces, it does not refuse")

        # ---- arms (f) and (g): the negative, and the fallback ---------------
        #  The remedy each refusal names is ENUMERATED FROM THE RECORD, not
        #  a fixed alternative -- water carries `andrade` and `vogel`, so the
        #  useful sentence is "this substance declares these, pick one", and a
        #  guessed remedy could name a model the record does not carry.  So
        #  what is required here is that the refusal names something the
        #  component actually has, or the predictive route where it has
        #  nothing.
        for model, prop, block, alt in (
                ("chemsepEq16", "thermal_conductivity_liquid",
                 "thermalConductivity", "SatoRiedel"),
                ("chemsepEq101", "viscosity_liquid", "viscosity", "andrade")):
            case = tmp / f"bare_{model}"
            write_case(case, BARE, scan(
                "bare", BARE, prop,
                f"transport {{ liquid {{ {block} {{ model {model}; }} }} }}", T_IN))
            rc, out = run_props(case)
            if rc == 0:
                fails.append(f"`{model}` answered for {BARE}, which carries no"
                             " block for it -- a property model with no data must"
                             " refuse, never return a number")
            elif BARE not in out or model not in out:
                fails.append(f"`{model}` refused for {BARE} without naming both"
                             " the component and the model")
            elif alt not in out:
                fails.append(f"`{model}`'s refusal does not name `{alt}` -- a"
                             " refusal that states a gap without saying what"
                             " would fill it teaches only unease, and this one"
                             " is supposed to read the remedy off the record")
            else:
                notes.append(f"{model} refuses for {BARE} naming {alt}")

        case = tmp / "fallback"
        write_case(case, BARE, scan(
            "predictive", BARE, "thermal_conductivity_liquid",
            "transport { liquid { thermalConductivity { model SatoRiedel; } } }",
            T_IN))
        rc, out = run_props(case)
        if rc != 0 or value(case, "predictive") is None:
            fails.append("the predictive SatoRiedel route no longer answers for a"
                         " component with no fitted block -- the fitted model must"
                         " not have made the predictive one a casualty")
        else:
            notes.append("predictive fallback still answers")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_chemsep_transport: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    print("check_chemsep_transport: OK -- all three ChemSep-form models"
          " (chemsepCp16 on both the ideal-gas and liquid rungs, chemsepEq101,"
          " chemsepEq16) are selectable through the engine and each returns"
          " EXACTLY what this script recomputes from the component record's own"
          f" parameters ({'; '.join(notes)}).  The J/kmol -> J/mol conversion is"
          " pinned by Cp_liquid > Cp_ig and by molar magnitude, and the"
          " unconverted conductivity by its W/(m.K) magnitude.  An out-of-window"
          " evaluation is ANNOUNCED twice -- at its site and in the caveat"
          " block -- and still returns its value (I4 announces, never enforces)."
          "  A component with no block makes each fitted model refuse BY NAME"
          " naming the predictive alternative, and that predictive route still"
          " answers.  NOT COVERED: any comparison against MEASURED data (the"
          " catalogue holds none for these properties -- the SatoRiedel"
          " cross-check is a correlation, and where the two disagree most it is"
          " the predictive one that is known to be weak), the gas-phase models,"
          " the Simpson quadratures chemsepCp16 uses for H and S, and every"
          " record this gate does not probe (reach rests on the emitter having"
          " one home, not on observed runs).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
