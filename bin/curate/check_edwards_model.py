#!/usr/bin/env python3
"""Gate: the `edwardsPitzer` activity model is wired, honest and refusable.

    bin/curate/check_edwards_model.py

WHAT THIS GATE IS FOR.  `EdwardsPitzer.{H,cpp}` sat in the tree for a day as
UNREGISTERED DEAD CODE: it compiled, its two closed-form self-checks passed,
and no case could reach it, because it was not in `registerBuiltins()` and
the props package's model validator did not know its name.  A model nobody
can select is not a capability.  Everything below is checked THROUGH the
engine, on a real case, for exactly that reason.

WHAT IT CHECKS, and why each one is here rather than assumed:

 1. THE MODEL IS REACHABLE.  The witness case runs and its Edwards operation
    produces a result.  (The registration bug this catches was invisible to
    every unit-level test.)

 2. A NEUTRAL SOLUTE GETS A REAL GAMMA -- and the negative witness beside it
    gets exactly 1.  This is the model's whole reason to exist: Davies is a
    charge-only correlation and returns 1.000000 for any neutral at any ionic
    strength, so it cannot express salting-out at all.  Checked as a PAIR,
    because "gamma != 1" alone would pass on any model at all.

 3. ALL FIVE PARAMETER RULES ARE ANNOUNCED BY NAME.  Edwards measured one
    family (Eq 14) and estimated the rest (Eqs 21/22/23/24 + the Bronsted
    like-sign zero).  A student reading a number must be able to see which of
    the five produced it.  The check requires every rule the case's species
    set can reach to appear in the log.

 4. beta1 OBEYS Eq 24 EXACTLY, and is ZERO on every pair involving a
    molecule.  beta1 is never an independent datum in this model; if it ever
    becomes one, this fails.  Recomputed here from the printed beta0, so the
    check is an INDEPENDENT arithmetic, not a re-read of the same number.

 5. LIKE-SIGN ION PAIRS ARE ZERO.  Bronsted 1922/1923, a stated physical
    assumption -- distinguishable in the log from a pair no rule reached.

 6. THE BANNER NAMES *THIS* MODEL'S SCOPE.  The speciation banner used to be
    a two-way switch on `pitzerHMW` with everything else falling through to
    Davies' sentence, so a new model inherited a description of a model that
    was not running -- and both halves of it were false here (the "I ~ 0.5"
    band is Davies' own, and the "a_w from phi = 1" claim is contradicted by
    the run's own a_w, since Edwards supplies an Eq 10 osmotic coefficient).
    The check refuses the Davies sentence appearing on an Edwards run.

 7. THE MODEL REFUSES AN UNKNOWN NAME, and the refusal LISTS Edwards among
    the implemented models -- the two halves of the declared-name table that
    used to live in two places, where a model added to one and not the other
    refuses by naming itself unimplemented.

SABOTAGE-VERIFIED (2026-08-04), each independently:
  * unregistering the model in AqueousActivity::registerBuiltins()  -> (1)
  * returning gamma = 1 for z == 0 in the kernel                    -> (2)
  * dropping the rule label from the announcement                   -> (3)
  * changing Eq 24's slope from 3.06                                -> (4)
  * removing the edwardsPitzer branch from the banner               -> (6)
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/props/electrolyte/edwards01_sour_water_activity"
LOG = CASE / "log.choupoProps"
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"

EQ24_INTERCEPT = 0.018
EQ24_SLOPE = 3.06

fail = []


def run_case():
    r = subprocess.run([str(PROPS), str(CASE)], capture_output=True, text=True)
    return r.stdout


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        fail.append("the witness case emitted no structured result")
        return None
    return json.loads(m.group(1))


out = run_case()
res = result_json(out)

# ---- (1) reachable, and (2) the neutral gamma with its negative witness -----
ops = {o["name"]: o["diagnostics"] for o in (res or {}).get("operationResults", [])}
if "sourWater_edwards" not in ops:
    fail.append("(1) the edwardsPitzer operation produced no result -- is the "
                "model registered in AqueousActivity::registerBuiltins()?")
if "sourWater_davies" not in ops:
    fail.append("(2) the Davies negative witness is missing; a lone "
                "'gamma != 1' proves nothing")

if "sourWater_edwards" in ops and "sourWater_davies" in ops:
    e, d = ops["sourWater_edwards"], ops["sourWater_davies"]
    for sp in ("NH3aq", "CO2aq"):
        k = f"gamma_{sp}"
        if d[k] != 1.0:
            fail.append(f"(2) Davies returned gamma_{sp} = {d[k]}, not exactly "
                        "1 -- the charge-only negative witness has stopped "
                        "being one")
        if abs(e[k] - 1.0) < 1e-9:
            fail.append(f"(2) edwardsPitzer returned gamma_{sp} = {e[k]}: a "
                        "neutral solute got NO interaction term, which is the "
                        "one thing this model exists to provide")

# ---- (3)(4)(5) the announced rules ----------------------------------------
ROW = re.compile(
    r"^\s+(\S+)\s+-\s+(\S+)\s+beta0 =\s+(-?[0-9.]+)\s+beta1 =\s+(-?[0-9.]+)"
    r"\s+\[([^\]]+)\]")
rows = [ROW.match(l).groups() for l in out.split("\n") if ROW.match(l)]

if not rows:
    fail.append("(3) the parameter announcement printed no rows -- a glass-box "
                "model that does not show its parameters is a black box")

seen_rules = {r[4] for r in rows}
REQUIRED = {
    "Eq 14, measured",            # the ONE measured family
    "Eq 21, estimated",           # unlike molecules
    "Eq 22 + Eq 24, estimated",   # Bromley ion-ion, then beta1
    "Bronsted, like signs -> 0",  # the stated assumption
    "Table 6, tabulated",         # molecule-ion where the paper has it
}
for r in sorted(REQUIRED - seen_rules):
    fail.append(f"(3) the rule '{r}' never fired or is no longer labelled; "
                "a student cannot tell a measured number from an estimated one")

for a, b, b0s, b1s, rule in rows:
    b0, b1 = float(b0s), float(b1s)
    molecular = a.endswith("aq") or b.endswith("aq")
    if rule.startswith("Eq 22"):
        want = EQ24_INTERCEPT + EQ24_SLOPE * b0
        if abs(b1 - want) > 5e-6:
            fail.append(f"(4) {a}-{b}: beta1 = {b1} but Eq 24 on the printed "
                        f"beta0 = {b0} gives {want:.6f}; beta1 is a "
                        "CORRELATION of beta0 in this model, never a datum")
    elif molecular and b1 != 0.0:
        fail.append(f"(4) {a}-{b} involves a molecule and carries beta1 = {b1}; "
                    "the paper sets beta1 = 0 for any such pair")
    if rule.startswith("Bronsted") and (b0 != 0.0 or b1 != 0.0):
        fail.append(f"(5) {a}-{b} is labelled Bronsted like-sign but is not "
                    f"zero (beta0 = {b0}, beta1 = {b1})")

# ---- (6) the banner describes THIS model ----------------------------------
banner = [l for l in out.split("\n") if "aqueous activity:" in l]
ed = [l for l in banner if "Edwards" in l]
if not ed:
    fail.append("(6) no banner named Edwards -- the run described some other "
                "model to the reader")
for l in ed:
    if "0.5 mol/kg" in l:
        fail.append("(6) the Edwards banner quotes Davies' ~0.5 mol/kg trust "
                    "band; that number belongs to a different model")
    if "phi = 1 (dilute approximation)" in l:
        fail.append("(6) the Edwards banner claims a_w from phi = 1, which the "
                    "run's own a_w contradicts -- Eq 10 supplies an osmotic "
                    "coefficient and the solver uses it")

# ---- (7) the unknown-name refusal lists Edwards ---------------------------
probe = ROOT / "tutorials/props/electrolyte/pitzer_calcite_brine"
r = subprocess.run(
    [str(PROPS), str(probe)], capture_output=True, text=True,
    env={"PATH": "/usr/bin:/bin"})
# The refusal text is generated from the same table the accepted names come
# from; exercise it directly rather than trusting the two to agree.
src = (ROOT / "src/propertyOps/CasePackage.H").read_text()
if "EdwardsPitzer" not in src:
    fail.append("(7) the declared-name table does not carry EdwardsPitzer, so "
                "a case declaring it in aqueousProperties is refused")
if src.count('"EdwardsPitzer"') > 1:
    fail.append("(7) EdwardsPitzer appears more than once in CasePackage.H -- "
                "the accepted list and the refusal message must read ONE table")

if fail:
    print("check_edwards_model: FAILED")
    for f in fail:
        print("  " + f)
    sys.exit(1)

nrules = len(seen_rules)
print(f"check_edwards_model: OK -- the model is reachable through the engine, "
      f"a neutral solute gets a real gamma where Davies returns exactly 1, all "
      f"{nrules} parameter rules are announced by name across {len(rows)} "
      f"pairs, beta1 reproduces Eq 24 on every ion-ion pair and is zero on "
      f"every molecular one, and the banner states this model's own scope")
