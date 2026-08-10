#!/usr/bin/env python3
"""Gate: the Marcilla LLS anchor contact -- brine + halite reproduced, and
the water/1-butanol MISCIBILITY verdict of the corpus UNIFAC table pinned
in BOTH directions.

    bin/curate/check_marcilla_lls.py

WHY THIS EXISTS.  `marcilla01_lls_tie_triangle` charges a published
experimental mixture (Marcilla, Ruiz & Olaya 1995, Table 10A row 4) whose
measured answer is THREE phases at once: an aqueous brine, a butanol-rich
organic liquid, and solid NaCl (Table 10B row 4).  The engine's answer
under the corpus models is brine + solid halite and ONE fluid liquid,
because the corpus UNIFAC is the VLE parameterisation (Hansen 1991) and
under it water/1-butanol is fully miscible at 25 C -- the binary g_mix
curve stays convex, so the Gibbs decision correctly refuses the split.
That disagreement is the case's finding, recorded and never tuned; the
named remedies (UNIQUAC on the reactive backbone -- vlle01's fitted pair
is already in-tree -- or a UNIFAC-LLE set per Magnussen 1981, or fitted
NRTL pairs) live in the case README.

A finding pinned in prose goes stale silently, so this gate pins it
executably, in both directions:

  (A1) THE REPRODUCED HALF STAYS REPRODUCED.  A fresh run of marcilla01
       converges with solid NaCl formed (halite complementarity through
       the one solid-equilibrium mechanism), no vapour (V/F = 0 at 25 C,
       1 atm), and NO organic decomposition on the liquid stream (the
       one-fluid-liquid verdict).
  (A2) THE EXTRAPOLATION IS ANNOUNCED.  Davies runs at I ~ 3.6 mol/kg
       here, seven times its trust band; the run must say so (advisory),
       because the brine saturation is INDICATIVE, not quantitative --
       the model holds ~3.6 mol/kg against the measured 6.14.
  (A3) THE WET ORGANIC IS DECLARED AND ANNOUNCED.  Water is a member of
       the declared organic phase (the machinery built against this
       case); the resolver must announce the wet-organic contract (ionic
       a_w factor in the equality, molality on the aqueous water alone).
  (A4) THE STALE-PIN, the arm that fires on PROGRESS: a scratch
       propertyScanBinary sweep of water/1-butanol under the SAME corpus
       UNIFAC table must still report MISCIBILITY (split = 0).  The day a
       curated UNIFAC-LLE set or an NRTL pair opens the gap, this arm
       fails ON PURPOSE with the instruction to upgrade marcilla01 from a
       finding witness to a full tie-triangle witness.

WHAT THIS GATE DOES **NOT** COVER, stated so the green line cannot imply
it: it does not validate one number of the brine against Marcilla (Davies
out of band makes that comparison indicative only), and it cannot see a
wet-organic split that is merely WRONG -- no corpus case exercises a
PRESENT wet organic yet (that witness is blocked on the same curation
gap A4 watches).

SABOTAGE-VERIFIED 2026-08-10, twice; OBSERVED output recorded (not the
output that was hoped for):

Sabotage 1 -- halite removed from the case's chemistryDict
(`solidPhases ( );`), so nothing may precipitate:

    check_marcilla_lls: FAILED
      A1: no solid NaCl on the liquid stream (solids absent or zero) --
      the brine+halite half of the anchor stopped reproducing

Sabotage 2 -- the A4 probe pointed at water/benzene (a pair the same
UNIFAC table DOES split), standing in for the day a curated set opens
water/1-butanol:

    check_marcilla_lls: FAILED
      A4: the corpus activity surface now SPLITS the probe binary
      (split = 1) -- the model-side gap this witness records has been
      closed by curation.  Upgrade marcilla01_lls_tie_triangle to
      witness the full Table 10B tie-triangle (organic vertex included)
      and re-record its golden; this gate's pin must then move with it.

Both restored; the gate passed again after restoration.

The sabotage protocol also caught THIS GATE's first draft: A4's probe
declared a single-liquid gammaPhi package, and propertyScanBinary's
`split` diagnostic comes from the LL flash -- which cannot split anything
over one declared liquid.  The benzene sabotage came back GREEN (split = 0
for a pair the table demonstrably splits): a permanently-green arm, the
check_true_ions shape, found before it shipped because the sabotage was
actually run rather than assumed.  The probe now declares two liquid
phases (gammaGamma), and the benzene sabotage fires as recorded above.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE = os.path.join(ROOT, "tutorials", "steady", "flash",
                    "marcilla01_lls_tie_triangle")
SOLVE = os.path.join(ROOT, "build", "linux64Gcc", "choupoSolve")
PROPS = os.path.join(ROOT, "build", "linux64Gcc", "choupoProps")

ENV = dict(os.environ, CHOUPO_HOME=ROOT)

fails = []


def run(binary, cwd):
    p = subprocess.run([binary], cwd=cwd, env=ENV,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def result_json(text):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  text, re.S)
    return json.loads(m.group(1)) if m else None


# ---- A1..A3: one fresh run of the witness --------------------------------
rc, out = run(SOLVE, CASE)
res = result_json(out)
if rc != 0 or res is None or not res.get("converged"):
    fails.append("A1: marcilla01 did not run to a converged result "
                 f"(exit {rc})")
else:
    liq = res["streams"].get("liquid", {})
    solids = liq.get("solids", {})
    if not solids.get("NaCl", 0.0) > 0.0:
        fails.append("A1: no solid NaCl on the liquid stream (solids absent"
                     " or zero) -- the brine+halite half of the anchor"
                     " stopped reproducing")
    if res["kpis"]["flash01"].get("V_over_F", 1.0) != 0.0:
        fails.append("A1: a vapour phase formed at 25 C / 1 atm"
                     " (V_over_F != 0)")
    if "organicLiquid" in liq:
        fails.append("A1: the liquid stream carries an organic"
                     " decomposition -- the one-fluid-liquid verdict this"
                     " gate pins has changed.  If this is the curated"
                     " UNIFAC-LLE/NRTL upgrade, move the pin: witness the"
                     " full tie-triangle instead.")
    davies = [a for a in res.get("advisories", [])
              if "Davies" in a.get("message", "")
              and "beyond" in a.get("message", "")]
    if not davies:
        fails.append("A2: the Davies out-of-band advisory is absent -- the"
                     " brine extrapolation must be announced")
    if "WET organic" not in out:
        fails.append("A3: the wet-organic resolver announcement is absent"
                     " (water is a declared member; the contract must be"
                     " stated every run)")

# ---- A4: the stale-pin probe (scratch case, corpus table) ----------------
PROBE_SOLUTE = os.environ.get("CHOUPO_MARCILLA_PROBE", "nButanol")

tmp = tempfile.mkdtemp(prefix="marcilla_gate_")
try:
    os.makedirs(os.path.join(tmp, "system"))
    os.makedirs(os.path.join(tmp, "constant"))
    with open(os.path.join(tmp, "system", "controlDict"), "w") as f:
        f.write('application   choupoProps;\n'
                'description   "gate probe: binary water/%s LLE under the'
                ' corpus UNIFAC table";\nverbosity     1;\n' % PROBE_SOLUTE)
    #  TWO NAMED LIQUID PHASES, deliberately: propertyScanBinary's `split`
    #  diagnostic comes from the LL flash, and an LL flash over a package
    #  that declares ONE liquid cannot split ANYTHING -- the first draft of
    #  this arm probed a single-liquid gammaPhi package and reported
    #  split = 0 for water/benzene too, which the same UNIFAC table
    #  demonstrably splits.  A pin that cannot fire pins nothing
    #  (the check_true_ions shape); the sabotage protocol caught it before
    #  it shipped.
    with open(os.path.join(tmp, "constant", "thermoPhysPropDict"), "w") as f:
        f.write("recordType    thermophysicalPropertySystem;\n"
                "schemaVersion 2;\n"
                "components    ( water  %s );\n"
                "equilibrium\n{\n    formulation gammaGamma;\n"
                "    liquid { activityModel { model UNIFAC; } }\n"
                "    liquidPhases\n    (\n"
                "        { name waterRich; }\n"
                "        { name organicRich; }\n    );\n}\n" % PROBE_SOLUTE)
    with open(os.path.join(tmp, "system", "propsDict"), "w") as f:
        f.write("operations\n(\n"
                "    { name probe; type propertyScanBinary;\n"
                "      state { T 298.15 K; P 1 atm; }\n"
                "      grid  { n 41; }\n"
                "      output { file probe.csv; } }\n);\n")
    rc, out = run(PROPS, tmp)
    res = result_json(out)
    if rc != 0 or res is None:
        fails.append(f"A4: the miscibility probe did not run (exit {rc})")
    else:
        m = re.search(r'"name": "probe".*?"split": ([0-9.]+)', out, re.S)
        if not m:
            fails.append("A4: the probe emitted no split diagnostic")
        elif float(m.group(1)) != 0.0:
            fails.append("A4: the corpus activity surface now SPLITS the"
                         " probe binary (split = 1) -- the model-side gap"
                         " this witness records has been closed by curation."
                         "  Upgrade marcilla01_lls_tie_triangle to witness"
                         " the full Table 10B tie-triangle (organic vertex"
                         " included) and re-record its golden; this gate's"
                         " pin must then move with it.")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if fails:
    print("check_marcilla_lls: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("check_marcilla_lls: OK -- brine + solid halite reproduced (one fluid"
      " liquid, V/F = 0), Davies extrapolation announced, wet-organic"
      " contract announced, and the water/1-butanol MISCIBILITY verdict of"
      " the corpus UNIFAC table still stands (the stale-pin arm fires the"
      " day curation opens the gap).  NOT covered: quantitative brine"
      " agreement (Davies out of band), and any PRESENT wet-organic split"
      " (no corpus case can exercise one until the same curation lands).")
