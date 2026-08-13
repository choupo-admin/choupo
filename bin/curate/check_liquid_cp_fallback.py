#!/usr/bin/env python3
"""Gate: ONE answer for a missing liquid heat capacity, and the two refusals
that must survive it.

    bin/curate/check_liquid_cp_fallback.py

WHY THIS EXISTS.  Until 2026-08-13 the engine gave TWO different answers to
the identical question.  `ThermoPackage::speciesPhaseEnthalpy` -- the
formation-datum leg -- handled a component with no `liquidHeatCapacity` by an
ANNOUNCED Watson-slope fallback, documenting it in place as the right
treatment for "a permanent / supercritical gas (H2, N2) appearing as a
dissolved trace in a liquid stream" until the dissolved-gas Henry rung exists.
`Component::Hliq_pure` -- the sensible leg, reached through
`ThermoPackage::Hliquid` -- REFUSED HARD on exactly that condition.

Same component, same missing datum, two behaviours in one run.  It stayed
invisible until a flowsheet used both legs: the acetone plant's column C1
converged (7 Newton iterations, |F| 2.1e-10) and then refused to price its
condenser over a hydrogen mole fraction of order 1e-9 -- in a run whose own
log had already announced the fallback for that very component, four lines
earlier.  That is the arity doctrine one layer up from a value with two
homes: a DECISION with two homes.

Both legs now take the fallback.  This gate pins that, and -- more important
-- pins the two cases that must go on refusing, because the danger of turning
a refusal into an answer is that it turns EVERY refusal into an answer.

  (A1) THE FALLBACK EXISTS AND ANNOUNCES.  A component with no liquid Cp but
       with an ideal-gas Cp returns a liquid enthalpy, and the run says so at
       its site (`[thermo] <name>: ... ANNOUNCED Watson-slope fallback`).
       Silence would make this a silent crutch, which is the one thing the
       numerical-honesty doctrine forbids outright.

  (A2) THE VALUE IS THE DOCUMENTED FORM, not something adjacent: the sensible
       liquid leg equals Cp_ig integrated from Tref minus the Watson latent
       heat.  Recomputed here from the record's own Tc / Tb / HvapTb rather
       than read back from the engine.

  (A3) A NONVOLATILE STILL REFUSES.  "A nonvolatile salt must NEVER route its
       enthalpy through the ideal-gas reference" is settled doctrine
       (2026-06-29, and `bin/curate/check_ion_pins.py` guards the data side).
       A dissolved salt has no vaporisation leg to subtract and takes the
       solid/aqueous rung; handing it the fallback would give it precisely the
       reference the doctrine forbids.  The refusal must name the role.

  (A4) A COMPONENT WITH NEITHER Cp STILL REFUSES, naming both blocks.  There
       is nothing to integrate on any rung and the remedy is data.

  (A5) THE ANNOUNCEMENT IS ONCE PER COMPONENT, not once per call.  The leg is
       reached inside column and flash inner loops; an advisory per evaluation
       would flood the caveat surface that exists to be read.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it:

  * It does NOT claim the fallback is PHYSICALLY right.  Above Tc the Watson
    latent heat is zero, so a dissolved permanent gas is priced at its
    ideal-gas enthalpy -- zero heat of solution, a zero-order approximation.
    The honest home is the dissolved-gas Henry rung, named in
    ThermoPackage.cpp and NOT built.  What is checked is that the engine makes
    ONE approximation loudly instead of two silently disagreeing.
  * It does not measure the error that approximation carries in any case.
  * It does not check the OTHER leg (speciesPhaseEnthalpy), which was already
    correct and is not touched.

SABOTAGE-VERIFIED 2026-08-13, twice, and BOTH sabotages first came back
GREEN against a gate that was measuring something adjacent to its subject.
That is the entry worth reading here; the OBSERVED output is recorded.

Sabotage 1 -- the nonvolatile guard disabled:

    check_liquid_cp_fallback: FAILED
      A3: a component declared `role nonvolatile;` with no liquidHeatCapacity
      returned a liquid enthalpy instead of refusing -- the ideal-gas
      reference is forbidden for a nonvolatile (settled 2026-06-29)

  Its FIRST run reported OK -- because the edit did not compile, so the gate
  ran against the previous binary.  A sabotage that fails to build is not a
  sabotage; the build is now verified before the verdict is read.

Sabotage 2 -- this leg's announcement suppressed, leaving the fallback silent:

    check_liquid_cp_fallback: FAILED
      A1: the fallback produced a value and announced NOTHING -- a silent
      crutch is the one thing the numerical-honesty doctrine forbids outright
      A5: the fallback announced 0 times for one component -- it must announce
      EXACTLY once

  Its FIRST run reported OK too, and printed "announced 0 time(s)" while
  doing so.  Two holes, both mine:
    * A1 accepted ANY advisory naming the component and liquidHeatCapacity --
      which the FORMATION leg also emits -- so it passed on a neighbour's
      evidence.  A check that accepts someone else's advisory is not checking
      its subject.
    * A5 tested `> 1` only, so SILENCE passed.  A bound with one open end is
      half a check, and the open end was the direction that matters.
  Both closed; the sabotage then failed on both arms.

Both restored; the gate passed again after each.

"""

import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOLVE = os.path.join(ROOT, "build", "linux64Gcc", "choupoSolve")
STD = os.path.join(ROOT, "data", "standards", "components")
ENV = dict(os.environ, CHOUPO_HOME=ROOT)

fails = []
notes = {}


def run(cwd):
    p = subprocess.run([SOLVE], cwd=cwd, env=ENV, capture_output=True,
                       text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def result_json(text):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  text, re.S)
    return json.loads(m.group(1)) if m else None


def probe(tmp, record_text, comps):
    """A minimal STEADY case whose one unit reaches the SENSIBLE liquid leg.

    A `valve` is the exerciser, and the choice matters: it calls
    `ThermoPackage::Hliquid` unconditionally (Valve.cpp, `Hin`), which is the
    leg this gate is about.  The first probe written here used a props
    `propertyPoint` and its `H_real`, which routes through the FORMATION leg
    (`speciesPhaseEnthalpy`) instead -- so it exercised the leg that was
    already correct, and reported green on the nonvolatile refusal by simply
    never asking for it.  Found by running it: a probe that does not reach the
    code under test is the check_true_ions shape.
    """
    os.makedirs(os.path.join(tmp, "system"), exist_ok=True)
    os.makedirs(os.path.join(tmp, "constant", "components"), exist_ok=True)
    os.makedirs(os.path.join(tmp, "0"), exist_ok=True)
    open(os.path.join(tmp, "probe.cho"), "w").close()
    with open(os.path.join(tmp, "system", "controlDict"), "w") as fh:
        fh.write("application choupoSolve;\ndescription \"probe\";\nverbosity 3;\n")
    with open(os.path.join(tmp, "constant", "thermoPhysPropDict"), "w") as fh:
        fh.write("recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
                 "components ( %s );\n"
                 "equilibrium { formulation gammaPhi;"
                 " liquid { activityModel { model ideal; } standardState pureLiquid; }"
                 " vapour { fugacityModel idealGas; } }\n" % " ".join(comps))
    with open(os.path.join(tmp, "constant", "components",
                           comps[0] + ".dat"), "w") as fh:
        fh.write(record_text)
    with open(os.path.join(tmp, "system", "flowsheetDict"), "w") as fh:
        fh.write("units ( { name v; type valve; in feed; outputs ( out );"
                 " operation { P 1.0 bar; } } );\n")
    flows = "\n".join("    %s 1.0 kmol/h;" % c for c in comps)
    with open(os.path.join(tmp, "0", "feed"), "w") as fh:
        fh.write("componentMolarFlows\n{\n%s\n}\n\nT 330 K;\nP 5 bar;\n" % flows)
    with open(os.path.join(tmp, "0", "out"), "w") as fh:
        fh.write("componentMolarFlows\n{\n%s\n}\n\nT 330 K;\nP 1 bar;\n" % flows)
    return run(tmp)


# --- The synthetic records.  Built here rather than borrowed from the
#     catalogue: a probe that depends on a curated record silently stops
#     testing the day that record gains the field (the check_ice_freezing
#     lesson, where a negative's subject did not exist).
BASE = """name        {name};
formula     XH2;
MW          20.0;
Tc          300.0;
Pc          40.0;
omega       0.1;
Tb          200.0;
HvapTb      12000.0;
{role}
vaporPressure {{ model Antoine; coefficients (5.0 1500.0 -30.0); Trange (150 290); }}
{cpig}
standardThermochemistry {{ dHf_298 0.0; s_298 150.0; }}
"""
CPIG = ("idealGasHeatCapacity { model polynomial;"
        " coefficients (30.0 0.01 0.0 0.0); Trange (100 1000); }")

tmp = tempfile.mkdtemp(prefix="choupo-liqcp-")
try:
    # ---- A1/A2/A5: the fallback fires, announces once, and has the value ---
    d = os.path.join(tmp, "ok")
    rc, out = probe(d, BASE.format(name="probeGas", role="", cpig=CPIG),
                    ["probeGas", "water"])
    res = result_json(out)
    if rc != 0 or res is None:
        fails.append("A1: the fallback case did not run (exit %d) -- a"
                     " component with an ideal-gas Cp and no liquid Cp must"
                     " return a liquid enthalpy, not refuse" % rc)
    else:
        #  MATCH THIS LEG'S OWN LOCUS.  The first version accepted any
        #  advisory mentioning the component and liquidHeatCapacity -- which
        #  the FORMATION leg also emits for the same component -- so sabotage
        #  2 (this leg's announcement suppressed) came back GREEN on someone
        #  else's advisory.  A check that accepts a neighbour's evidence is
        #  not checking its subject.
        hits = [a for a in res.get("advisories", [])
                if a.get("locus", "").startswith("liquidEnthalpy probeGas")]
        if not hits:
            fails.append("A1: the fallback produced a value and announced"
                         " NOTHING -- a silent crutch is the one thing the"
                         " numerical-honesty doctrine forbids outright")
        #  COUNT THE SITE LINE OF THIS LEG ONLY.  The first counter here
        #  matched every line mentioning the component and reported FOUR
        #  announcements for one component, which read as a flood and was
        #  arithmetic: the run legitimately prints the site line for BOTH legs
        #  (formation and sensible -- two different quantities taking the same
        #  approximation, and a reader should see both), plus the caveat
        #  summary replays each advisory once at the end by design.  Six
        #  lines, one announcement per leg.  Second time in this slice a check
        #  measured something adjacent to what it claimed.
        n_log = len([l for l in out.splitlines()
                     if l.startswith("[thermo] probeGas:")
                     and "sensible liquid leg" in l])
        notes["announcements"] = n_log
        #  EXACTLY ONE, both ways.  `> 1` alone let SILENCE pass: sabotage 2
        #  printed "announced 0 time(s)" and exited 0.  A bound with one open
        #  end is half a check.
        if n_log != 1:
            fails.append("A5: the fallback announced %d times for one"
                         " component -- it must announce EXACTLY once: more"
                         " floods the caveat surface that exists to be read,"
                         " and none makes this a silent crutch" % n_log)

        # A2: recompute the documented form independently.
        #     Cp_ig integrated 298.15 -> 330, minus Watson at 330 K.
        Tref, T = 298.15, 330.0
        a0, a1 = 30.0, 0.01
        h_ig = a0 * (T - Tref) + 0.5 * a1 * (T * T - Tref * Tref)
        Tc, Tb, HvTb = 300.0, 200.0, 12000.0
        hvap = 0.0 if T >= Tc else HvTb * ((Tc - T) / (Tc - Tb)) ** 0.38
        notes["expected"] = h_ig - hvap
        if not math.isclose(hvap, 0.0):
            fails.append("A2: the probe was built so that T > Tc and the"
                         " Watson term is zero; it is not, so the check below"
                         " is measuring something else")

    # ---- A3: a NONVOLATILE must still refuse -----------------------------
    d = os.path.join(tmp, "nonvol")
    rc, out = probe(d, BASE.format(name="probeSalt", role="role nonvolatile;",
                                   cpig=CPIG), ["probeSalt", "water"])
    if rc == 0:
        fails.append("A3: a component declared `role nonvolatile;` with no"
                     " liquidHeatCapacity returned a liquid enthalpy instead"
                     " of refusing -- the ideal-gas reference is forbidden for"
                     " a nonvolatile (settled 2026-06-29)")
    elif "nonvolatile" not in out:
        fails.append("A3: the nonvolatile refusal does not name the role, so"
                     " a reader cannot tell it apart from a plain missing-data"
                     " refusal and will add the wrong block")

    # ---- A4: neither Cp -> still refuses, naming both blocks --------------
    d = os.path.join(tmp, "nocp")
    rc, out = probe(d, BASE.format(name="probeBare", role="", cpig=""),
                    ["probeBare", "water"])
    if rc == 0:
        fails.append("A4: a component with NEITHER a liquid nor an ideal-gas"
                     " heat capacity returned an enthalpy -- there is no rung"
                     " to integrate and the remedy is data, not a branch")
    elif not ("idealGasHeatCapacity" in out and "liquidHeatCapacity" in out):
        fails.append("A4: the no-Cp refusal does not name both blocks, so it"
                     " does not tell the reader which of the two to add")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if fails:
    print("check_liquid_cp_fallback: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("check_liquid_cp_fallback: OK -- a missing liquid heat capacity now has"
      " ONE answer instead of two.  The sensible leg takes the same"
      " Watson-slope fallback the formation-datum leg already used"
      " (Cp_ig integrated minus dHvap; above Tc that is the ideal-gas"
      " enthalpy, expected %.4f J/mol on the probe), announced %d time(s) --"
      " once per component, not once per call.  BOTH refusals survive: a"
      " `role nonvolatile;` component still refuses NAMING the role (the"
      " ideal-gas reference is forbidden for it), and a component with"
      " neither heat capacity still refuses naming both blocks."
      "  NOT CHECKED: whether the fallback is physically right -- it prices a"
      " dissolved permanent gas at zero heat of solution, and the honest home"
      " is the dissolved-gas Henry rung, named in ThermoPackage.cpp and NOT"
      " built; nor the size of that error in any case."
      % (notes.get("expected", float("nan")), notes.get("announcements", 0)))
