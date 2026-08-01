#!/usr/bin/env python3
"""Solute-basis gate: a single-salt model is asked about the salt, and says
what else is in the liquid.

WHY THIS EXISTS.  Every failure this guards against is invisible to a
golden-master KPI check, because every one of them produces a plausible
number.

  * The evaporator handed its Pitzer water activity the molality of
    EVERYTHING dissolved, salt and sugar summed together.  a_w came back, the
    BPE came back, the duty closed.  It was the boiling-point rise of a
    liquid that does not exist.
  * The batch crystalliser divided the dissolved salt by the WATER mass while
    its c_sat came back on the resolver's mixed-solvent basis.  Two
    denominators, one ratio, called a supersaturation -- and growth and
    nucleation are both powers of (S-1), so it is the single most
    consequential number in that model.
  * The two announcements about what the saturation leaves out lived at the
    steady crystalliser's print site, so the batch crystalliser -- calling
    the same resolver, reaching the same gaps -- said nothing.

None of those had a case that could see them.  Three now exist, and this
gate reads the runs:

  1. evaporator09 (brine + sucrose): the omission is announced by name and
     magnitude, and the BPE line quotes the SALT molality, not the total.
  2. evaporator06 (clean brine): the SAME announcement is ABSENT.  A note
     that fires unconditionally says nothing.
  3. crystalliser09 (KCl out of a bitartrate liquor): the identical sentence,
     from the shared measurement, in a different unit.
  4. crystalliser12 (Pitzer + antisolvent): drowning-out that moves nothing
     is announced as such; crystalliser06 (eNRTL + the same antisolvent) does
     move m_sat and must NOT carry that line -- while both carry the D3
     standard-state statement.
  5. batch14: the resolver's notes reach the BATCH unit too, and its S0 is
     printed on the mixed-solvent basis (1.240, not the water-only 1.592);
     batch13, one component apart, prints neither note and names water alone.

Contract: CLAUDE.md (no silent crutch), the D3 ADR
docs/design/standard-state-transfer-adr.md, and
src/thermo/electrolyte/UnmodelledSolutes.H.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

bad = []


def run(binary, case):
    #  choupoSolve takes -case; choupoBatch takes the directory positionally.
    argv = ([str(ROOT / binary), "-case", str(ROOT / case)]
            if binary == "choupoSolve"
            else [str(ROOT / binary), str(ROOT / case)])
    p = subprocess.run(argv, capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def load(binary, case):
    rc, out = run(binary, case)
    if rc != 0:
        bad.append(f"{case}: exited {rc} -- this gate needs the case to run."
                   f"  Tail:\n{out[-1500:]}")
        return None
    return out


NOTE = r"\[unmodelledSolutes\]"

# ---- 1. evaporator09: the omission is named, sized, and does not enter -----
out = load("choupoSolve", "tutorials/steady/evaporation/evaporator09_nacl_sucrose_brine")
if out is not None:
    m = re.search(NOTE + r" the liquid carries ([0-9.eE+-]+) mol/kg of dissolved "
                  r"([A-Za-z0-9_, ]+?) -- not '([A-Za-z0-9_]+)'", out)
    if not m:
        bad.append("evaporator09: the unmodelledSolutes announcement did NOT fire."
                   "  A brine carrying 0.95 mol/kg of sucrose under a single-salt"
                   " NaCl model is exactly the case it exists for.")
    else:
        mol, names, salt = float(m.group(1)), m.group(2), m.group(3)
        if "sucrose" not in names:
            bad.append(f"evaporator09: the announcement names '{names}', not sucrose.")
        if salt != "NaCl":
            bad.append(f"evaporator09: the announcement calls the model's salt "
                       f"'{salt}'; the package declares NaCl.")
        if not (0.9 < mol < 1.0):
            bad.append(f"evaporator09: the unmodelled molality reads {mol} mol/kg;"
                       " the charge puts it near 0.952.  Either the composition"
                       " moved or the measurement is on the wrong basis.")

    #  The BPE must be computed from the SALT's molality.  Both numbers are in
    #  the run, so the gate can tell them apart rather than trust a comment.
    mb = re.search(r"BPE = electrolyte a_w\(m=([0-9.]+)\)", out)
    mk = re.search(r'"molality": ([0-9.]+)', out)
    ms = re.search(r'"molality_salt": ([0-9.]+)', out)
    if not (mb and mk and ms):
        bad.append("evaporator09: could not read back the BPE molality, the"
                   " colligative `molality` KPI and `molality_salt` -- all three"
                   " must be published for the distinction to be checkable.")
    else:
        aw_m, total, salt_m = float(mb.group(1)), float(mk.group(1)), float(ms.group(1))
        if abs(aw_m - salt_m) > 1e-4:
            bad.append(f"evaporator09: a_w was evaluated at m = {aw_m} but the salt"
                       f" molality is {salt_m}.  The electrolyte model must be"
                       " asked about its own salt.")
        if total - salt_m < 0.5:
            bad.append(f"evaporator09: the colligative molality ({total}) and the"
                       f" salt molality ({salt_m}) are nearly equal, so this case"
                       " no longer distinguishes the two bases -- the sucrose"
                       " loading must stay large enough to matter.")

# ---- 2. the negative witness: a clean brine says nothing -------------------
out = load("choupoSolve", "tutorials/steady/evaporation/evaporator06_nacl_pitzer")
if out is not None and re.search(NOTE, out):
    bad.append("evaporator06: the unmodelledSolutes announcement fired on a"
               " liquor whose only solute IS the model's salt.  A note that"
               " cannot stay silent is not a note.")

# ---- 3. the same sentence, a different unit --------------------------------
out = load("choupoSolve", "tutorials/steady/crystallisation/crystalliser09_KHT_KCl_series")
if out is not None:
    m = re.search(NOTE + r".*?not '([A-Za-z0-9_]+)'", out, re.S)
    if not m:
        bad.append("crystalliser09: crystallising KCl out of a liquor that still"
                   " holds bitartrate, with no statement that the model prices"
                   " none of it.")
    elif "potassiumBitartrate" not in out.split("[unmodelledSolutes]")[1][:400]:
        bad.append("crystalliser09: the announcement fired but does not name"
                   " potassiumBitartrate -- the solute it is about.")

# ---- 4. drowning-out: announced only when it moves nothing -----------------
out = load("choupoSolve",
           "tutorials/steady/crystallisation/crystalliser12_nacl_pitzer_antisolvent")
if out is not None:
    if "[drowningOut] m_sat is UNCHANGED" not in out:
        bad.append("crystalliser12: pairwise Pitzer has no mixed-solvent term, so"
                   " its m_sat comes back equal to the aqueous datum -- and the"
                   " run must say so instead of printing a drowning-out that"
                   " drowns nothing.")
    if "[standardState]" not in out:
        bad.append("crystalliser12: the D3 transfer term is absent and must be"
                   " announced, never silently zero.")
    if re.search(r"Drowning-out \(pitzer", out) is None:
        bad.append("crystalliser12: the drowning-out line must name the model that"
                   " actually ran (pitzer), not a hardcoded one.")

out = load("choupoSolve", "tutorials/steady/crystallisation/crystalliser06_nacl_antisolvent")
if out is not None:
    if "[drowningOut] m_sat is UNCHANGED" in out:
        bad.append("crystalliser06: eNRTL DOES carry a mixed-solvent term and moves"
                   " m_sat 6.14 -> 0.885 mol/kg, so the UNCHANGED note must not"
                   " fire here.  It is detected by comparing, not by model name.")
    if "[standardState]" not in out:
        bad.append("crystalliser06: the D3 statement applies to every mixed-solvent"
                   " saturation, whatever gamma_pm did.")

# ---- 5. the notes reach the batch unit, and S0 names its basis -------------
out = load("choupoBatch",
           "tutorials/batch/crystallisation/batch14_nacl_pitzer_antisolvent")
if out is not None:
    for tag in ("[drowningOut]", "[standardState]"):
        if f"[BatchCrystalliser] {tag}" not in out:
            bad.append(f"batch14: the resolver's {tag} note did not reach the batch"
                       " crystalliser.  The saturation is shared; its gaps travel"
                       " with it or the two units diverge again.")
    m = re.search(r"\[BatchCrystalliser\] S0 = ([0-9.]+).*?per kg of ([^)]+)\)", out)
    if not m:
        bad.append("batch14: S0 is not printed with its solvent basis.  It is the"
                   " number growth and nucleation are powers of; it cannot be the"
                   " one quantity the run keeps to itself.")
    else:
        s0, basis = float(m.group(1)), m.group(2).strip()
        if "ethanol" not in basis:
            bad.append(f"batch14: S0 is on the '{basis}' basis.  c_sat comes back"
                       " from the resolver on water + ethanol, so the numerator"
                       " must be too -- the water-only reading is 1.592 against"
                       " the consistent 1.240.")
        if not (1.23 < s0 < 1.25):
            bad.append(f"batch14: S0 = {s0}.  The charge is built for 1.240; 1.59"
                       " is the water-only misreading this case exists to catch.")

out = load("choupoBatch", "tutorials/batch/crystallisation/batch13_nacl_pitzer")
if out is not None:
    if "[drowningOut]" in out or "[standardState]" in out:
        bad.append("batch13: no antisolvent is present, so neither mixed-solvent"
                   " note may fire.")
    m = re.search(r"\[BatchCrystalliser\] S0 = [0-9.]+.*?per kg of ([^)]+)\)", out)
    if m and m.group(1).strip() != "water":
        bad.append(f"batch13: S0 basis reads '{m.group(1).strip()}'; with one"
                   " solvent it must be water alone.")

if bad:
    print("check_solute_basis: FAIL")
    for b in bad:
        print("  - " + b)
    sys.exit(1)
print("check_solute_basis: ok  (single-salt models asked about their own salt;"
      " what they omit is named, sized, and only when it is there)")
