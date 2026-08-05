#!/usr/bin/env python3
"""Gate: a reactant with no declared forward `order` is REFUSED, in every reactor.

    bin/curate/check_forward_order.py

WHY THIS EXISTS.  Until 2026-08-05 all four reactors and the shared RateLaw
read the forward reaction order as

    order[i] = lookupScalarOrDefault("order", 0.0)

so a reactant whose `order` the author forgot got exponent 0, dropped out of
the forward product (c^0 = 1), and the reaction ran at a rate that did not
depend on one of its own reactants.  Exit 0, a plausible number, wrong
physics -- the exact shape invariant I5 forbids.

THE ASYMMETRY IS THE POINT, and it is why the fix is a refusal and not a
better default.  Two lines apart in RateLaw::fromDict, the REVERSE order
already defaulted meaningfully:

    orderRev[i] = lookupScalarOrDefault("orderRev", nu[i] > 0 ? nu[i] : 0)

and it is entitled to, because detailed balance FIXES the reverse order at
the product stoichiometry.  The forward order is not fixed by anything: a
species with nu = -1 may enter the rate law to the power 0, 1/2, 1 or 2.
That is a fact about the MECHANISM, so the engine has no standing to invent
it -- and 0 is the worst possible guess, because it is not "no claim" but
the specific and unusual claim that the rate is zeroth order in that
reactant.

FIVE HOMES FOR ONE DECISION.  RateLaw, CSTR, PFR, BatchReactor and
DynamicCSTR each read the key with its own default.  That is the arity
doctrine applied to a DECISION rather than a value, and the tree records
what it cost: a comment in BatchReactor.cpp explained that requiring the key
THERE alone made the same shared reaction library legal in a CSTR and
illegal in a batch vessel, so the requirement was dropped.  The diagnosis
was right and the remedy was backwards -- it made the loose reading uniform
instead of the strict one.  All five now call Reaction::forwardOrder.

WHAT THIS GATE CHECKS.

  (a) THE REFUSAL FIRES IN ALL FOUR REACTORS.  Each negative takes a real
      tutorial, deletes `order` from ONE reactant, and asserts the run is
      refused with the named message.  Four cases, because a single home is
      a claim about reach and one probe cannot test reach.

  (b) THE TWO PERMISSIVE BRANCHES SURVIVE.  A gate that only checked the
      refusal would pass if `forwardOrder` refused everything, so:
        * an explicit `order 0;` is HONOURED (cstr01 declares exactly that
          on aceticAcid and must still run and agree with its golden);
        * a PRODUCT with no `order` is NOT refused (products carry no
          forward order; that is the absence of a claim, not a hidden one).

  (c) THE MESSAGE CARRIES A REMEDY.  I5 asks for a refusal by name WITH a
      remedy, and a refusal that only says "invalid" is not one.

NOTE ON THE CORPUS.  When this landed, ZERO kinetic reactions in the corpus
omitted `order` on a reactant, so no golden moved.  The defect was latent --
which is not the same as harmless: it was waiting for the first user who
wrote a reaction from a textbook and left the order to the default.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"

#  (label, tutorial, binary, reactant whose `order` we delete, reactions file)
NEGATIVES = [
    ("cstr",        "tutorials/steady/reactors/cstr01_first_order",
     "choupoSolve", "ethanol", "constant/reactions"),
    ("pfr",         "tutorials/steady/reactors/pfr01_first_order",
     "choupoSolve", None,      "constant/reactions"),
    ("batchReactor", "tutorials/batch/reactor/batch01_first_order",
     "choupoBatch",  None,     "constant/reactions"),
    ("dynamicCSTR", "tutorials/ctrl/ctrl01_cstr_temp_control",
     "choupoCtrl",   "compA",  "constant/reactions"),
]

#  The refusal must say all of this, not merely fail.
MUST_SAY = ["declares no `order`", "REMEDY", "order 1;", "order 0;"]

ENTRY = re.compile(r'\{[^{}]*\bnu\s+(-?[\d.eE+]+)[^{}]*\}')


def strip_order(text, want_component):
    """Delete `order ...;` from ONE reactant entry.  Returns (text, which)."""
    out, which = [], None
    pos = 0
    for m in ENTRY.finditer(text):
        entry = m.group(0)
        nu = float(m.group(1))
        comp = re.search(r'\bcomponent\s+(\w+)', entry)
        name = comp.group(1) if comp else None
        if (which is None and nu < 0 and "order" in entry
                and (want_component is None or name == want_component)):
            new = re.sub(r'\s*order\s+[-\d.eE+]+\s*;', '', entry)
            out.append(text[pos:m.start()]); out.append(new)
            pos = m.end(); which = name
    out.append(text[pos:])
    return "".join(out), which


def run(binary, case):
    p = subprocess.run([str(BUILD / binary), str(case)],
                       capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    failures, checked = [], []

    for label, rel, binary, comp, rxnrel in NEGATIVES:
        src = ROOT / rel
        if not src.is_dir():
            failures.append(f"{label}: tutorial {rel} is missing")
            continue
        if not (BUILD / binary).exists():
            failures.append(f"{label}: {binary} not built")
            continue
        with tempfile.TemporaryDirectory() as td:
            dst = Path(td) / src.name
            shutil.copytree(src, dst)
            rxn = dst / rxnrel
            text = rxn.read_text()
            new, which = strip_order(text, comp)
            if which is None:
                failures.append(f"{label}: could not find a reactant carrying "
                                f"`order` in {rel}/{rxnrel} -- the probe is "
                                "stale, not the engine")
                continue
            rxn.write_text(new)
            rc, out = run(binary, dst)
            if rc == 0:
                failures.append(
                    f"{label}: dropping `order` from the reactant '{which}' "
                    "was ACCEPTED (exit 0).  That reactant is now absent from "
                    "the forward rate law and the run reported a number "
                    "anyway.")
                continue
            missing = [s for s in MUST_SAY if s not in out]
            if missing:
                failures.append(
                    f"{label}: refused, but the message omits {missing} -- a "
                    "refusal without a remedy is not a refusal (I5)")
                continue
            checked.append(f"{label} ({which})")

    #  (b1) an EXPLICIT `order 0;` must still be honoured.  cstr01 declares it
    #       on aceticAcid; if forwardOrder ever refuses a declared zero, this
    #       case stops running and the gate says so.
    c = ROOT / "tutorials/steady/reactors/cstr01_first_order"
    if "order 0;" not in (c / "constant/reactions").read_text():
        failures.append("cstr01 no longer declares `order 0;` -- the positive "
                        "control is gone, re-point it at a case that does")
    else:
        rc, out = run("choupoSolve", c)
        if rc != 0:
            failures.append("cstr01 declares an explicit `order 0;` on a "
                            "reactant and no longer runs -- an explicit "
                            "zeroth-order claim is legitimate and must be "
                            "honoured")

    #  (b2) a PRODUCT with no `order` must NOT be refused.  Delete it from a
    #       product entry and require the run to still succeed.
    with tempfile.TemporaryDirectory() as td:
        dst = Path(td) / "cstr01"
        shutil.copytree(c, dst)
        rxn = dst / "constant/reactions"
        text = rxn.read_text()
        done = False
        out_parts, pos = [], 0
        for m in ENTRY.finditer(text):
            entry, nu = m.group(0), float(m.group(1))
            if not done and nu > 0 and "order" in entry:
                out_parts.append(text[pos:m.start()])
                out_parts.append(re.sub(r'\s*order\s+[-\d.eE+]+\s*;', '', entry))
                pos = m.end(); done = True
        out_parts.append(text[pos:])
        if not done:
            failures.append("cstr01 has no product entry carrying `order` -- "
                            "the permissive-branch probe is stale")
        else:
            rxn.write_text("".join(out_parts))
            rc, out = run("choupoSolve", dst)
            if rc != 0:
                failures.append(
                    "a PRODUCT with no `order` was refused.  Products carry "
                    "no forward order; refusing them would make the rule "
                    "about the key's presence rather than about the claim it "
                    "hides.\n        " + out.strip().splitlines()[-1][:160])

    if failures:
        print("check_forward_order: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print(f"check_forward_order: OK -- an undeclared forward order on a "
          f"reactant is refused with its remedy in all {len(checked)} reactor "
          f"kinds ({', '.join(checked)}); an explicit `order 0;` is still "
          "honoured and a product with no order is still accepted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
