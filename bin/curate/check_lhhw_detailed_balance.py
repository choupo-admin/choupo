#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_lhhw_detailed_balance -- an LHHW law with `reversible true` must
come to rest at the DECLARED Kc (DEV.md 4c C185 item 7).

THE DEFECT.  `RateLaw` runs both legs of an LHHW law on the ADSORBED
activities abar_i = K_i theta_i.  Under `reversible true` the reverse leg was
(k_f / Kc) PROD_{nu>0} abar^nu, so the net rate vanished at
PROD (K_i theta_i)^nu_i = Kc -- an equilibrium shifted by PROD K_i^nu_i, at
exit 0, with a converged answer (an external review reproduced it with
Kc = 1, K = 10 and 1: rate -0.75 at equal concentrations, zero only at
cB/cA = 0.1).  The reverse constant is k_f / (Kc PROD K_i^nu_i); the
derivation is docs/design/an-lhhw-law-balances-at-the-declared-kc.md.

The probe (bin/curate/_lhhwBalanceProbe.cpp, linked against the library this
tree built) evaluates RateLaw::netRate on laws written in memory over the
water-gas shift of tutorials/steady/reactors/cstr02_reversible_wgs, at three
temperatures.  Arms:

  (a) AT THE DECLARED Kc THE NET RATE IS ZERO.  For every reversible law,
      with and without adsorption, |r(PROD c^nu = Kc)| <= 1e-12 of its own
      forward leg (computed by the probe from the declared numbers).  The
      laws put strong UNEQUAL adsorption on reactants only, products only,
      both, and all four species with van 't Hoff temperature dependence --
      a factor missing on one side cannot hide behind a K of one.
  (b) THE SIGN POINTS TO IT.  r > 0 at PROD c^nu = Kc/2 and r < 0 at 2 Kc:
      the zero in (a) is the equilibrium the law moves toward, not a
      degenerate zero (a law whose rate is identically 0 would pass (a)).
  (c) WHAT MUST NOT MOVE DID NOT MOVE.  The power law under detailed balance
      (no adsorption -- every reversible corpus case) and an LHHW law with an
      explicit A_rev/Ea_rev (cstr07/batch07/ctrl07's form) equal the probe's
      recomputation in the engine's own order of operations, with ==.
  (d) THE WITNESS IS A WITNESS.  At least one law and temperature has an
      adsorption shift PROD K_i^nu_i at least a factor 5 from 1 -- the
      size at which the old code was measured to fail (a) -- so the arm
      cannot go quiet by a change of parameters that makes every K cancel.

  (e) NON-MASS-ACTION ORDERS UNDER DETAILED BALANCE ARE REFUSED BY NAME
      (the architect's ruling, C185, 2026-10-31).  With a forward order that
      is not max(-nu, 0), or an `orderRev` that is not max(nu, 0), the
      derived reverse leg puts the zero somewhere other than Kc on EITHER
      path.  RateLaw::fromDict must refuse four such laws (a reactant order,
      an LHHW reactant order, a product forward order, an orderRev), each
      message naming the reaction's `reversible true`, the species, BOTH
      numbers and the remedy (`A_rev`, `type expression`); and must ACCEPT
      the same orders under an explicit reverse, and mass-action orders
      written out -- a refusal that fires on everything is not a rule.
  (f) EVERY NATIVE READER REFUSES THROUGH THE SAME HOME.  Copies of
      cstr02, pfr02 and batch04 (the single-reaction cstr, the
      single-reaction pfr, the batch vessel's own forms: the three readers
      that derive the reverse leg from Kc without RateLaw) with CO's order
      set to 0.5 must each exit non-zero naming CO, 0.5 and the remedy.

WHAT IS NOT CHECKED.  Whether a reactor INTEGRATES to the zero: that is the
reactor's, and the zero it integrates to is what this gate holds.  A rate law
registered from a case's code/ that reads `reversible` itself is outside the
ruling's reach until it calls Reaction::refuseNonMassActionDetailedBalance.

Exit 1 naming the arm that failed.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
PROBE = BUILD / "lhhwBalanceProbe"
SRC = ROOT / "bin" / "curate" / "_lhhwBalanceProbe.cpp"
CASE = ROOT / "tutorials" / "steady" / "reactors" / "cstr02_reversible_wgs"

TOL_ZERO = 1e-12

# The readers that derive the reverse leg from Kc WITHOUT RateLaw, each
# reached by one witness on its single-reaction path.
NATIVE = [
    ("steady/reactors/cstr02_reversible_wgs", "choupoSolve"),
    ("steady/reactors/pfr02_reversible_wgs", "choupoSolve"),
    ("batch/reactor/batch04_reversible_wgs", "choupoBatch"),
]


def build_probe():
    cmd = ["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}",
           str(SRC), str(BUILD / "libchoupo.so"),
           "-Wl,-rpath," + str(BUILD), "-o", str(PROBE)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, r.stderr[-1200:]


def main() -> int:
    if not (BUILD / "libchoupo.so").exists():
        print("check_lhhw_detailed_balance: FAILED\n  no libchoupo.so in "
              f"{BUILD} -- build the tree first.  A check that cannot run "
              "must not pass.")
        return 1
    rc, err = build_probe()
    if rc != 0:
        print("check_lhhw_detailed_balance: FAILED\n  probe did not compile "
              "-- the RateLaw surface or the library moved.\n" + err)
        return 1
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(PROBE), str(CASE)], capture_output=True,
                       text=True, timeout=300, env=env)
    if r.returncode != 0:
        print(f"check_lhhw_detailed_balance: FAILED\n  probe exited "
              f"{r.returncode}\n" + r.stdout[-800:] + r.stderr[-800:])
        return 1
    try:
        got = json.loads(r.stdout)
    except json.JSONDecodeError:
        print("check_lhhw_detailed_balance: FAILED\n  probe output is not "
              "JSON:\n" + r.stdout[-600:])
        return 1

    fail = []
    nZero = nSign = nRef = 0
    worst = 0.0
    maxShift = 1.0
    for law in got["laws"]:
        for p in law["points"]:
            tag = f"{law['name']} at T = {p['T']:g} K"
            if law["reversible"]:
                rel = abs(p["atEq"]) / abs(p["rf"])
                worst = max(worst, rel)
                if not rel <= TOL_ZERO:
                    fail.append(
                        f"(a) {tag}: r = {p['atEq']:.6e} at PROD c^nu = Kc "
                        f"({p['Kc']:.6e}), {rel:.3e} of the forward leg -- "
                        "the law does not come to rest at the declared "
                        "equilibrium (adsorption shift PROD K^nu = "
                        f"{p['adsShift']:.6g})")
                else:
                    nZero += 1
                if not (p["below"] > 0.0 and p["above"] < 0.0):
                    fail.append(
                        f"(b) {tag}: r(Kc/2) = {p['below']:.6e}, r(2 Kc) = "
                        f"{p['above']:.6e} -- the rate does not point toward "
                        "the declared equilibrium from both sides")
                else:
                    nSign += 1
                if law["adsorbs"]:
                    s = p["adsShift"]
                    maxShift = max(maxShift, s, 1.0 / s)
            if "reference" in p:
                if p["atEq"] != p["reference"]:
                    fail.append(
                        f"(c) {tag}: netRate = {p['atEq']!r} against the "
                        f"recomputation {p['reference']!r} -- arithmetic that "
                        "C185 item 7 must not touch moved")
                else:
                    nRef += 1

    if maxShift < 5.0:
        fail.append(f"(d) the largest adsorption shift is {maxShift:.3g}; "
                    "below 5 the witnesses cannot tell a balanced law from "
                    "a shifted one")
    if nZero == 0 or nRef == 0:
        fail.append("the probe evaluated no reversible law or no reference "
                    "-- a gate with nothing to check must not pass")

    # ---- (e) the ruling, through RateLaw ------------------------------------
    #  name -> (species, key, declared, needed)
    EXPECT = {
        "powerLaw_reactant_order_half": ("CO", "order", "0.5", "1"),
        "lhhw_reactant_order_two": ("water", "order", "2", "1"),
        "powerLaw_product_forward_order": ("CO2", "order", "1", "0"),
        "powerLaw_orderRev_two": ("H2", "orderRev", "2", "1"),
    }
    nRefused = nAccepted = 0
    seen = set()
    for rf in got.get("refusals", []):
        seen.add(rf["name"])
        if not rf["mustRefuse"]:
            if rf["refused"]:
                fail.append(f"(e) {rf['name']} was REFUSED and must be "
                            "accepted (an explicit reverse, or mass-action "
                            "orders written out): " + rf["message"][:300])
            else:
                nAccepted += 1
            continue
        if not rf["refused"]:
            fail.append(f"(e) {rf['name']}: `reversible true` with a "
                        "non-mass-action order was ACCEPTED -- a law that "
                        "cannot reach its own declared equilibrium")
            continue
        sp, key, val, want = EXPECT[rf["name"]]
        msg = rf["message"]
        missing = [w for w in (
            "reversible true", f"species '{sp}'", f"`{key} {val};`",
            f"needs {want}", "A_rev", "type expression") if w not in msg]
        if missing:
            fail.append(f"(e) {rf['name']}: refused, but the message does not "
                        f"name {missing}:\n      " + msg[:400])
        else:
            nRefused += 1
    for name in list(EXPECT) + ["explicitReverse_nonElementary_accepted",
                                "massAction_declared_accepted"]:
        if name not in seen:
            fail.append(f"(e) the probe did not evaluate {name}")

    # ---- (f) the three native readers, behaviourally -----------------------
    nNative = 0
    with tempfile.TemporaryDirectory(prefix="lhhwdb_") as tmp:
        for rel, binary in NATIVE:
            src = ROOT / "tutorials" / rel
            dst = Path(tmp) / src.name
            shutil.copytree(src, dst)
            rx = dst / "constant" / "reactions"
            text = rx.read_text()
            new = re.sub(r"(\{\s*component\s+CO;\s*nu\s+-1;\s*order\s+)1(\s*;)",
                         r"\g<1>0.5\2", text, count=1)
            if new == text:
                fail.append(f"(f) {rel}: could not set CO's order to 0.5 -- "
                            "the witness's reactions file moved")
                continue
            rx.write_text(new)
            r = subprocess.run([str(BUILD / binary), str(dst)],
                               capture_output=True, text=True, timeout=300,
                               env=env, cwd=dst)
            out = r.stdout + r.stderr
            missing = [w for w in ("reversible true", "species 'CO'",
                                   "`order 0.5;`", "needs 1", "A_rev")
                       if w not in out]
            if r.returncode == 0:
                fail.append(f"(f) {rel} ({binary}) with CO order 0.5 under "
                            "`reversible true` exited 0 -- this reader does "
                            "not refuse")
            elif missing:
                fail.append(f"(f) {rel} ({binary}) exited {r.returncode} but "
                            f"its output does not name {missing}:\n      "
                            + out[-500:])
            else:
                nNative += 1

    if fail:
        print("check_lhhw_detailed_balance: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print(f"check_lhhw_detailed_balance: OK -- {nZero} reversible "
          f"(law, T) points rest at the declared Kc (worst |r|/r_f = "
          f"{worst:.1e}, adsorption shifts up to x{maxShift:.3g}), {nSign} "
          f"point toward it from both sides, {nRef} unmoved laws (power law, "
          "explicit reverse) equal their recomputation bit for bit; "
          f"{nRefused} non-mass-action laws under `reversible true` refused "
          f"by name through RateLaw and {nAccepted} legitimate ones accepted; "
          f"{nNative} of {len(NATIVE)} native readers (single-reaction cstr, "
          "single-reaction pfr, batch vessel) refuse through the same home; "
          "NOT checked: reactor integration, laws registered from a case's "
          "code/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
