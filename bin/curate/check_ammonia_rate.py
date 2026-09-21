#!/usr/bin/env python3
"""Gate: the ammonia rate law is a cited object, and every refusal it promises fires.

    bin/curate/check_ammonia_rate.py

WHY THIS EXISTS.  `tutorials/plant/ammonia03_quench_converter` draws the
cold-shot trajectory of Dyson & Simon's Figure 2 with EQUILIBRIUM beds, and
its own README states the consequence: an equilibrium model cannot see where
the quench enters, cannot size a bed, and rewards over-quenching into a region
a real catalyst is dead in.  `DysonSimon1968` is the rate law that closes
those seams, built the way this tree builds correlations -- a declared
validity window, a `citation()` a reader can check, and `verify()` anchors
that each say what KIND of claim they are.

WHAT THIS GATE CHECKS, on `tutorials/props/kinetics/ammoniaRate01_dyson_simon`:

  (a) THE WITNESS RUNS AND EVERY ANCHOR PASSES, and each anchor is printed
      with its KIND.  A `theory` anchor is an identity; an `arithmetic`
      anchor is the closed form at a stated point against a literal and
      proves a TRANSCRIPTION, never a physics.

  (b) NOTHING IS MEASURED BY CHOUPO, and the run says so.  No anchor may
      carry the word `measured`: the data these equations were fitted to are
      Nielsen, Kjaer and Hansen's and are not in this tree.

  (c) INDEPENDENT RECOMPUTATION.  This gate re-implements Eqs 2, 6-8, 19 and
      39 from the paper's coefficients and reproduces the witness's published
      diagnostics.  It is a SECOND IMPLEMENTATION, so it catches an algebra
      error -- a wrong power, a misplaced parenthesis, the wrong gamma on the
      wrong species.  It CANNOT catch a mistyped coefficient, because both
      implementations were typed from the same page; that is what the page
      renders in the session record were for, and no gate can replace them.

  (d) EVERY REFUSAL FIRES, BY NAME, on a throwaway copy of the witness:
      no particle size, a 12 mm particle, a pressure outside 150-300 atm, a
      gas with no ammonia, and a composition that does not sum to one (which
      must REFUSE rather than normalise).

  (e) xi = 1 BELOW 6 mm IS THE AUTHORS' POSITION AND SAYS SO, and it says it
      apart from the eta = 1 the four reactors announce -- those say the
      correction is UNPRICED, this says the authors priced it and found it
      unity.  Two sentences that sound alike and mean opposite things.

  (f) THE PRESSURE INTERPOLATION IS ANNOUNCED with both tabulated endpoints,
      and is NOT announced when the pressure is one of the three columns.

  (g) THE LOCUS DESCENDS, and a maximum found on the swept window's edge is
      reported as an edge rather than as a maximum.

  (h) AN UNPHYSICAL xi IS ANNOUNCED AND NOT CLAMPED.  At the lowest
      conversion the cubic leaves (0, 1]; the published value must still be
      the cubic's.

  (i) THE TRANSCRIBED STATES ARE HELD TO THEIR SOURCE.  The witness declares
      three gases copied from ammonia03's converged answer -- a SECOND HOME
      for somebody else's number.  This arm RUNS ammonia03 and compares.

WHAT THIS DOES NOT CHECK, said plainly:

  * whether the rate law is RIGHT.  Nothing in this tree measures an ammonia
    rate, and the agreement of these equations with Nielsen's data is the
    authors' claim, tested by them, in 1968.
  * any bed.  Nothing here integrates a reactor, and the four reactors that
    announce eta = 1 are untouched by this slice.
  * the T and eta domain of Table I.  The paper does not state one, so this
    gate cannot check a window that does not exist -- which is exactly why
    arm (h) exists.

SABOTAGES PERFORMED, and what each one MEASURED (2026-09-21).  Two did not do
what was predicted, and both are recorded as they happened.

  S1   Table I's 300 atm b2 sign flipped.  CAUGHT -- but NOT by arm (c) as
       predicted: the witness's own anchor A4 throws first, so the gate
       reported `the witness exited 1` and arm (c) never ran.  A sabotage
       that trips an anchor MASKS the recomputation behind it, which is why
       S1b exists.
  S1b  Table I's 150 atm b4 moved -26.42469 -> -26.40000, a coefficient NO
       anchor reads.  SURVIVED the first version of this gate: every anchor
       passed and arm (c) only recomputed the locus, which runs at exactly
       300 atm.  Arm (c) now ALSO recomputes the three declared states, which
       sit at 200 bar and therefore read the 150 atm column THROUGH the
       interpolation rule.  Caught, all three points, at the 8th digit.
  S2   Eq 2's 2001.6 -> 2000.6.  Caught (anchor A3, witness exits 1).
  S3   an undeclared particle defaults to 8 mm.  Caught by arm (d1).
  S4   xi clamped into (0, 1].  Caught by arms (c) and (h) together -- (h)
       because every published xi then lies in range, (c) because the clamped
       value no longer equals the cubic.
  S5   a composition that does not close is silently normalised.  Caught by
       arm (d5).
  S6   the `NOTHING ABOVE IS MEASURED BY CHOUPO` sentence removed.  Caught by
       arm (b).
  S7   the pressure interpolation replaced by nearest-column.  Caught by arm
       (c) at all three declared states.
  S8   a declared composition moved away from ammonia03's converged answer.
       Caught by arm (i).
  S9   the sub-6 mm xi = 1 stripped of its attribution.  Caught by arm (e),
       both halves -- the attribution AND the separation from the reactors'
       own eta = 1.
  S10  a maximum sitting on the swept window's edge no longer reported as an
       edge.  Caught by arm (g).
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
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials/props/kinetics/ammoniaRate01_dyson_simon"
PLANT = ROOT / "tutorials/plant/ammonia03_quench_converter"

# --------------------------------------------------------------------------
#  A SECOND IMPLEMENTATION, typed here from the paper's equations.  It catches
#  an ALGEBRA error in the engine's copy -- a wrong power, a misplaced
#  parenthesis, gamma_NH3 used where gamma_N2 belongs.  It cannot catch a
#  mistyped COEFFICIENT, because both copies were typed from the same page.
# --------------------------------------------------------------------------
def Ka(T):
    return 10.0 ** (-2.691122 * math.log10(T) - 5.519265e-5 * T
                    + 1.848863e-7 * T * T + 2001.6 / T + 2.6899)

def gH2(T, P):
    return math.exp(math.exp(-3.8402 * T ** 0.125 + 0.541) * P
                    - math.exp(-0.1263 * math.sqrt(T) - 15.980) * P * P
                    + 300.0 * math.exp(-0.011901 * T - 5.941)
                    * (math.exp(-P / 300.0) - 1.0))

def gN2(T, P):
    return (0.93431737 + 0.3101804e-3 * T + 0.295896e-3 * P
            - 0.2707279e-6 * T * T + 0.4775207e-6 * P * P)

def gNH3(T, P):
    return (0.1438996 + 0.2028538e-2 * T - 0.4487672e-3 * P
            - 0.1142945e-5 * T * T + 0.2761216e-6 * P * P)

TABLE_I = {
    150.0: (-17.539096, 0.07697849, 6.900548, -1.082790e-4, -26.42469,
            4.927648e-8, 38.93727),
    225.0: (-8.2125534, 0.03774149, 6.190112, -5.354571e-5, -20.86963,
            2.379142e-8, 27.88403),
    300.0: (-4.6757259, 0.02354872, 4.687353, -3.463308e-5, -11.28031,
            1.540881e-8, 10.46627),
}

def xi(P, T, eta):
    b = TABLE_I[P]
    return (b[0] + b[1] * T + b[2] * eta + b[3] * T * T + b[4] * eta * eta
            + b[5] * T ** 3 + b[6] * eta ** 3)

REF_INERT = 0.127
REF_N2 = (1.0 - REF_INERT) / 4.0

def reference(eta):
    n1 = REF_N2 * (1.0 - eta)
    n2 = 3.0 * REF_N2 * (1.0 - eta)
    n3 = 2.0 * REF_N2 * eta
    tot = n1 + n2 + n3 + REF_INERT
    return n1 / tot, n2 / tot, n3 / tot, REF_INERT / tot

def V3(T, P, x):
    x1, x2, x3, _ = x
    a1 = x1 * gN2(T, P) * P
    a2 = x2 * gH2(T, P) * P
    a3 = x3 * gNH3(T, P) * P
    K = Ka(T)
    return (1.7698e15 * math.exp(-40765.0 / (1.987 * T))
            * (K * K * a1 * a2 ** 1.5 / a3 - a3 / a2 ** 1.5))


def run(binary, case, timeout=600):
    p = subprocess.run([str(binary)], cwd=str(case), capture_output=True,
                       text=True, timeout=timeout)
    out = p.stdout + p.stderr
    js = None
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    return p.returncode, out, js


def diagnostics(js, opname):
    for op in (js or {}).get("operationResults", []):
        if op.get("name") == opname:
            return op.get("diagnostics", {})
    return {}


def probe(edit, label, fails, expect):
    """Copy the witness, apply `edit` to its propsDict text, run it, and
    require a REFUSAL whose message contains `expect`."""
    with tempfile.TemporaryDirectory() as td:
        dst = Path(td) / "case"
        shutil.copytree(CASE, dst,
                        ignore=shutil.ignore_patterns("reports", "converged"))
        pd = dst / "system/propsDict"
        pd.write_text(edit(pd.read_text()))
        rc, out, _ = run(PROPS, dst)
        if rc == 0:
            fails.append(f"{label}: ran to exit 0 -- no refusal at all")
            return
        if expect not in out:
            fails.append(f"{label}: refused, but the message does not name "
                         f"`{expect}`; a refusal that does not say what to do "
                         f"is an error message.  Got: ...{out[-200:]}")


def main() -> int:
    fails, notes = [], []
    if not PROPS.exists() or not SOLVE.exists():
        print("check_ammonia_rate: FAIL -- binaries missing; run `make all`")
        return 1

    rc, out, js = run(PROPS, CASE)
    if rc != 0:
        print(f"check_ammonia_rate: FAIL -- the witness exited {rc}\n{out[-900:]}")
        return 1
    diag = diagnostics(js, "dysonSimon")
    if not diag:
        print("check_ammonia_rate: FAIL -- the witness published no "
              "diagnostics; nothing below can be checked")
        return 1

    # ---- (a) every anchor passes, and each is printed with its KIND -------
    n = int(diag.get("anchorCount", 0))
    if n < 5:
        fails.append(f"only {n} anchor(s) -- the family lost one")
    for i in range(1, n + 1):
        if diag.get(f"anchor{i}_pass", 0.0) != 1.0:
            fails.append(f"anchor {i} FAILED its own check")
    #  ONLY the self-check block.  A run prints plenty of other
    #  bracketed prefixes -- [unphysical], [interpolated], [unmarked] --
    #  and a pattern that swept the whole log would report those as
    #  anchor KINDS and make this gate's own claim line false.
    block = out.split("---- self-check", 1)[-1].split(
        "NOTHING ABOVE IS MEASURED", 1)[0]
    kinds = set(re.findall(r"^\s*\[(\w+)\s*\]", block, re.M))
    for k in ("theory", "arithmetic"):
        if k not in kinds:
            fails.append(f"no anchor is labelled `{k}` -- the output does not "
                         "say what KIND of claim each anchor is")
    notes.append(f"{n} anchors, all passing, labelled {sorted(kinds)}")

    # ---- (b) nothing is measured by us -----------------------------------
    if "NOTHING ABOVE IS MEASURED BY CHOUPO" not in out:
        fails.append("the run does not state that no anchor here is measured")
    if re.search(r"^\s*\[\s*measured\s*\]", out, re.M):
        fails.append("an anchor calls itself `measured` -- nothing in this "
                     "tree measures an ammonia rate")

    # ---- (c) independent recomputation -----------------------------------
    for k in (1, 2, 3):
        eta = diag.get(f"locus{k}_eta")
        T = diag.get(f"locus{k}_T_maxRate_K")
        if eta is None or T is None:
            fails.append(f"locus point {k} was not published")
            continue
        mine = V3(T, 300.0, reference(eta))
        theirs = diag[f"locus{k}_V3_max"]
        if abs(mine - theirs) > 1e-6 * abs(mine):
            fails.append(f"locus {k}: Eq 19 recomputed here gives {mine:.6g}, "
                         f"the engine published {theirs:.6g}")
        mx = xi(300.0, T, eta)
        if abs(mx - diag[f"locus{k}_xi"]) > 1e-9:
            fails.append(f"locus {k}: Eq 39 recomputed here gives {mx:.8g}, "
                         f"the engine published {diag[f'locus{k}_xi']:.8g}")
    #  THE DECLARED POINTS run at 200 bar, which is BETWEEN Table I's 150 and
    #  225 atm columns -- so recomputing them is the only arm that reads the
    #  150 atm column at all, and the only one that prices the interpolation
    #  rule rather than trusting the sentence that announces it.
    for label in ("bed1Inlet", "bed1Outlet", "bed3Outlet"):
        eta = diag.get(label + "_eta")
        if eta is None:
            fails.append(f"declared point `{label}` published no eta")
            continue
        P = 200e5 / 101325.0
        w = (P - 150.0) / (225.0 - 150.0)
        T = float(re.search(r"label\s+" + label + r";\s*T\s+([0-9.]+)",
                            (CASE / "system/propsDict").read_text()).group(1))
        mine = xi(150.0, T, eta) + w * (xi(225.0, T, eta) - xi(150.0, T, eta))
        if abs(mine - diag[label + "_xi"]) > 1e-9:
            fails.append(f"{label}: xi interpolated here gives {mine:.8g}, "
                         f"the engine published {diag[label + '_xi']:.8g}")
    notes.append("Eqs 2/6-8/19/39 reproduced by a second implementation at "
                 "every published locus point AND at all three declared states, the latter through the pressure interpolation (an ALGEBRA check; both copies "
                 "were typed from the same page, so a mistyped COEFFICIENT "
                 "survives it)")

    # ---- (d) the refusals ------------------------------------------------
    probe(lambda t: re.sub(r"catalyst\s*\{[^}]*\}", "", t),
          "(d1) no particle size", fails, "particleDiameter")
    probe(lambda t: t.replace("particleDiameter 8 mm", "particleDiameter 12 mm"),
          "(d2) a 12 mm particle", fails, "6 to 10 mm")
    probe(lambda t: t.replace("pressure     300 atm", "pressure     400 atm"),
          "(d3) 400 atm", fails, "150, 225 and 300 atm")
    probe(lambda t: t.replace("NH3 0.0111202", "NH3 0.0000000").replace(
                              "N2 0.2393446", "N2 0.2504648"),
          "(d4) a gas with no ammonia", fails, "divides by X_NH3")
    probe(lambda t: t.replace("inert 0.0232896", "inert 0.0432896"),
          "(d5) a composition that does not close", fails, "NOT normalised")

    # ---- (e) xi = 1 below 6 mm is THEIRS ---------------------------------
    with tempfile.TemporaryDirectory() as td:
        dst = Path(td) / "case"
        shutil.copytree(CASE, dst,
                        ignore=shutil.ignore_patterns("reports", "converged"))
        pd = dst / "system/propsDict"
        pd.write_text(pd.read_text().replace("particleDiameter 8 mm",
                                             "particleDiameter 3 mm"))
        rc2, out2, js2 = run(PROPS, dst)
        if rc2 != 0:
            fails.append("(e) a 3 mm particle refused; below 6 mm the authors "
                         "need no correction and the case must run")
        else:
            d2 = diagnostics(js2, "dysonSimon")
            for k in (1, 2, 3):
                if abs(d2.get(f"locus{k}_xi", 0.0) - 1.0) > 1e-12:
                    fails.append(f"(e) xi is not exactly 1 below 6 mm "
                                 f"(locus {k}: {d2.get(f'locus{k}_xi')})")
            if "THE AUTHORS' position" not in out2:
                fails.append("(e) xi = 1 below 6 mm is not attributed to the "
                             "authors -- unattributed it reads like our own "
                             "assumption, which is the opposite claim")
            if "UNPRICED" not in out2:
                fails.append("(e) the run does not separate this xi = 1 from "
                             "the eta = 1 the reactors announce; the two "
                             "sentences sound alike and mean opposite things")

    # ---- (f) the interpolation is announced, and only when it happens ----
    if "LINEARLY INTERPOLATED" not in out:
        fails.append("(f) the declared points sit at 200 bar, between Table "
                     "I's 150 and 225 atm columns, and no interpolation was "
                     "announced")
    locus_block = out.split("the locus of maximum rate", 1)[-1].split(
        "the rate at declared states", 1)[0]
    if "LINEARLY INTERPOLATED" in locus_block:
        fails.append("(f) the locus runs at exactly 300 atm -- one of Table "
                     "I's own columns -- and still announced an interpolation")

    # ---- (g) the locus descends ------------------------------------------
    if diag.get("locusDescends", 0.0) != 1.0:
        fails.append("(g) the locus of maximum rate does not descend with "
                     "conversion -- which is the whole reason a converter is "
                     "quenched")
    if "ON THE EDGE" not in out:
        fails.append("(g) no maximum was reported as sitting on the swept "
                     "window's edge; the witness's lowest conversion does, "
                     "and an edge reported as a maximum is an artefact")

    # ---- (h) an unphysical xi is announced and NOT clamped ---------------
    if "[unphysical]" not in out:
        fails.append("(h) no unphysical xi was announced; the witness's "
                     "lowest conversion drives Eq 39's cubic out of (0, 1]")
    if not any(diag.get(f"locus{k}_xi", 1.0) <= 0.0 or
               diag.get(f"locus{k}_xi", 1.0) > 1.0 for k in (1, 2, 3)):
        fails.append("(h) every published xi lies in (0, 1] -- either the "
                     "witness moved, or the value is being CLAMPED, which "
                     "would hide that the cubic left its region")

    # ---- (i) the transcribed states are held to their source -------------
    rcp, outp, jsp = run(SOLVE, PLANT, timeout=900)
    if rcp != 0 or not jsp:
        fails.append("(i) ammonia03 could not be run, so the transcribed "
                     "states cannot be held to their source -- and a check "
                     "that cannot run must not pass")
    else:
        st = jsp["streams"]
        want = {"bed1Inlet": "preheatedFeed", "bed1Outlet": "bed1Out",
                "bed3Outlet": "hotEffluent"}
        pd = (CASE / "system/propsDict").read_text()
        for label, stream in want.items():
            m = re.search(r"label\s+" + label + r";\s*T\s+([0-9.]+)\s*K;"
                          r"\s*P\s+[^;]+;\s*composition\s*\{([^}]*)\}", pd, re.S)
            if not m:
                fails.append(f"(i) point `{label}` is not declared in the "
                             "witness, so nothing holds it to ammonia03")
                continue
            T_decl = float(m.group(1))
            comp = dict(re.findall(r"(\w+)\s+([0-9.]+)\s*;", m.group(2)))
            src = st[stream]
            if abs(T_decl - src["T"]) > 0.02:
                fails.append(f"(i) `{label}` declares T = {T_decl} K; "
                             f"ammonia03's {stream} is at {src['T']:.4f} K")
            for sp, key in (("N2", "N2"), ("H2", "H2"), ("NH3", "NH3"),
                            ("inert", "Ar")):
                got = src["composition"][key]
                dec = float(comp[sp])
                if abs(got - dec) > 1e-6:
                    fails.append(f"(i) `{label}` declares {sp} = {dec}; "
                                 f"ammonia03's {stream} carries {got:.6f}")
        notes.append("the three transcribed gases still match ammonia03's "
                     "converged answer (a transcription is a second home, so "
                     "it is held to its source rather than trusted)")

    if fails:
        print("check_ammonia_rate: FAILED")
        for f in fails:
            print("  - " + f)
        return 1

    print("check_ammonia_rate: OK -- " + "; ".join(notes)
          + ".  NOT CHECKED: whether the rate law is RIGHT (nothing in this "
            "tree measures an ammonia rate; the agreement with Nielsen, Kjaer "
            "and Hansen's data is the authors' claim, made in 1968), any bed "
            "(nothing here integrates a reactor, and the four reactors that "
            "announce eta = 1 are untouched by this slice), and the T and eta "
            "domain of Table I -- the paper states none, which is why arm (h) "
            "exists at all.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
