#!/usr/bin/env python3
"""Gate: the ammonia rate law every case DECLARES is Dyson & Simon's, and its anchors hold.

    bin/curate/check_ammonia_rate.py

WHY THIS EXISTS.  `tutorials/plant/ammonia03_quench_converter` draws the
cold-shot trajectory of Dyson & Simon's Figure 2 with EQUILIBRIUM beds and
says, in its own README, what that cannot do; the rate law closes those
seams.  Until 2026-10-12 the law was compiled into the engine
(`DysonSimon1968`, with `verify()` anchors).  Since DEV.md 4c C67 (Vitor's
ruling: the kinetics live in the case) it is WRITTEN in each case that uses
it, as `kinetics { type expression; }` in constant/reactions -- three
copies:

    tutorials/props/kinetics/ammoniaRate01_dyson_simon      (+ Eq 39 / Table I)
    tutorials/plant/ammoniaReactor04_kineticSizing
    tutorials/plant/greenAmmonia03_basicDesign

A law with three homes is held together HERE, and the anchors that used to
live in the engine live HERE now -- one home for the numbers is the case;
one home for the checks is this gate.

WHAT THIS GATE CHECKS:

  (a) THE BENCH RUNS and publishes the rate, eta, xi and Eq 40 at the locus
      and at the declared states.

  (b) THE THREE COPIES ARE ONE LAW: every parameter and definition the three
      share (k0_18, k0_19, E, R_DS, the unit references, Eq 2's Ka, Eqs 6-8's
      gammas, the activities, Eq 19's two terms, the Arrhenius factors) is
      textually identical across the three files.

  (c) INDEPENDENT RECOMPUTATION.  This gate re-implements Eqs 2, 6-8, 19 and
      39 from the paper's coefficients and reproduces the bench's published
      diagnostics at every locus point and at the three declared states (the
      latter through Table I's pressure interpolation).  A SECOND
      IMPLEMENTATION catches an algebra error in a declared formula -- a wrong
      power, a misplaced parenthesis, the wrong gamma on the wrong species.
      It cannot catch a mistyped COEFFICIENT typed the same way twice.

  (d) THE ANCHORS, evaluated ON EACH CASE'S DECLARED LAW through the bench
      (the case's own constant/reactions, copied into a throwaway bench):
        A1 theory      forward/reverse == (Ka/Q)^2 at 700 K, 300 atm, eta 0.2
        A2 theory      the rate is zero at the law's own equilibrium T*
                       (the two reactor laws, which declare their legs)
        A3 arithmetic  Ka(700 K) == 8.8060688324288414e-3 (Eq 2's literal)
        A4 arithmetic  xi(300 atm, 700 K, eta 0.2) == 0.69337909 (bench law)
        A5 theory      xi falls with pressure at 700 K, eta 0.2 (bench law;
                       the only check reading all 21 Table I constants)
      NOTHING HERE IS MEASURED BY CHOUPO.  A `theory` anchor is an identity;
      an `arithmetic` anchor is the closed form at a stated point against a
      literal and proves a TRANSCRIPTION, never a physics.  The tree holds no
      published rate point of the paper's own: these are the anchors that
      existed, moved from the engine to here.

  (e) THE REFUSALS THE LAW DECLARES FIRE, by name, on a throwaway copy of
      the bench: no particle declared, a 12 mm particle (Eq 39 was fitted
      for 6-10 mm -- `outside refuse`), a pressure outside Table I's three
      columns (a table is never extrapolated), a gas with no ammonia (Eq 19
      divides by it: non-finite, refused naming the definition), and a
      composition that does not sum to one (refused, never normalised).

  (f) THE PRESSURE INTERPOLATION IS ANNOUNCED at the declared states (200
      bar, between Table I's 150 and 225 atm columns) and NOT at the locus
      (300 atm, a column of its own).

  (g) THE LOCUS DESCENDS, and a maximum found on the swept window's edge is
      reported as an edge rather than as a maximum.

  (h) AN UNPHYSICAL xi IS ANNOUNCED AND NOT CLAMPED (the law's `validity`
      entry for xi, `outside announce`; the published value stays the
      cubic's).

  (i) THE TRANSCRIBED STATES ARE HELD TO THEIR SOURCE: the bench's three
      declared gases are copied from ammonia03's converged answer -- a SECOND
      HOME for somebody else's number -- so this arm RUNS ammonia03.

WHAT THIS DOES NOT CHECK, said plainly:

  * whether the rate law is RIGHT.  Nothing in this tree measures an ammonia
    rate; the agreement with Nielsen, Kjaer and Hansen's data is the
    authors' claim, made in 1968.
  * any bed integration -- the PFR's march is `check_pfr_ergun`'s and the
    goldens'.
  * the T and eta domain of Table I -- the paper states none, which is why
    arm (h) exists at all.

RETIRED ARM, with its reason: the old (e), "xi = 1 below 6 mm is THE
AUTHORS' position".  Below 6 mm the authors need no correction, which is a
DIFFERENT LAW to write (Eq 19 alone, as the two reactor cases do), not a
branch inside the bench's; the expression grammar has no branch, by design.

SABOTAGES PERFORMED BY HAND, 2026-10-12 (this rewrite; the eleven of
2026-09-21 were against the compiled law, which is retired):

  A-S1  Eq 2's 2001.6 -> 2000.6 in greenAmmonia03's copy ONLY.  CAUGHT by
        (b) -- the copies differ -- and by A3 on that copy.
  A-S2  Table I's 150 atm b4 -26.42469 -> -26.40000 in the bench's copy, a
        constant no anchor reads.  CAUGHT by (c) at all three declared
        states (they sit at 200 bar and read the 150 atm column through the
        interpolation).
  A-S3  the bench's `xi` validity window removed.  CAUGHT by (h).
  A-S4  Eq 19's reverse term aH2^1.5 -> aH2^1.4, CONSISTENTLY in all three
        copies, so (b) passes.  CAUGHT by (c) and by A1 on every copy.
  A-S5  the 6-10 mm particle window declared `outside announce`.  CAUGHT by
        (e2).
  S7    (engine) a table point interpolated instead of returned exactly.
        CAUGHT by (f): the locus at 300 atm announced an interpolation.
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
LAWS = {
    "bench": CASE / "constant/reactions",
    "ammoniaReactor04_kineticSizing":
        ROOT / "tutorials/plant/ammoniaReactor04_kineticSizing/constant/reactions",
    "greenAmmonia03_basicDesign":
        ROOT / "tutorials/plant/greenAmmonia03_basicDesign/constant/reactions",
}
SHARED = ("k0_19", "k0_18", "E", "R_DS", "Kelvin", "atmosphere",
          "TK", "Patm", "Ka", "gH2", "gN2", "gNH3", "aN2", "aH2", "aNH3",
          "fwd", "rev", "k18", "k19")

# --------------------------------------------------------------------------
#  A SECOND IMPLEMENTATION, typed here from the paper's equations.
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


def declared(text):
    """name -> normalised declaration, for every parameter and definition."""
    out = {}
    for name in SHARED:
        m = re.search(r"^\s*" + name + r'\s+("[^"]*"|[^;"]+);', text, re.M)
        if m:
            out[name] = re.sub(r"\s+", " ", m.group(1).strip())
    return out


PROBE_DICT = """operations
(
    {{
        name      probe;
        type      rateLawBench;
        reaction  ammoniaSynthesis;
        report    ( {report} );
        points    ( {points} );
    }}
);
"""

def point(label, T, P_atm, eta):
    x1, x2, x3, x4 = reference(eta)
    return (f"{{ label {label}; T {T!r} K; P {P_atm!r} atm; composition {{ "
            f"N2 {x1!r}; H2 {x2!r}; NH3 {x3!r}; inert {x4!r}; }} }}")

def probe_case(td, reactions_text, report, points):
    dst = Path(td) / "case"
    shutil.copytree(CASE, dst, ignore=shutil.ignore_patterns("reports", "converged"))
    (dst / "constant/reactions").write_text(reactions_text)
    rep = " ".join(f"{{ name {n}; unit {u}; }}" for n, u in report)
    (dst / "system/propsDict").write_text(
        PROBE_DICT.format(report=rep, points=" ".join(points)))
    return dst


def refusal(edit_props, edit_rx, label, fails, expect):
    with tempfile.TemporaryDirectory() as td:
        dst = Path(td) / "case"
        shutil.copytree(CASE, dst, ignore=shutil.ignore_patterns("reports", "converged"))
        pd, rx = dst / "system/propsDict", dst / "constant/reactions"
        pd.write_text(edit_props(pd.read_text()))
        rx.write_text(edit_rx(rx.read_text()))
        rc, out, _ = run(PROPS, dst)
        if rc == 0:
            fails.append(f"{label}: ran to exit 0 -- no refusal at all")
        elif expect not in out:
            fails.append(f"{label}: refused, but the message does not name "
                         f"`{expect}`.  Got: ...{out[-240:]}")


def main() -> int:
    fails, notes = [], []
    if not PROPS.exists() or not SOLVE.exists():
        print("check_ammonia_rate: FAIL -- binaries missing; run `make all`")
        return 1

    # ---- (a) the bench runs ---------------------------------------------
    rc, out, js = run(PROPS, CASE)
    if rc != 0:
        print(f"check_ammonia_rate: FAIL -- the bench exited {rc}\n{out[-900:]}")
        return 1
    diag = diagnostics(js, "dysonSimon")
    if not diag:
        print("check_ammonia_rate: FAIL -- the bench published no "
              "diagnostics; nothing below can be checked")
        return 1

    # ---- (b) the three copies are one law -------------------------------
    texts = {k: p.read_text() for k, p in LAWS.items()}
    decl = {k: declared(t) for k, t in texts.items()}
    for name in SHARED:
        vals = {k: d.get(name) for k, d in decl.items()}
        if None in vals.values():
            fails.append(f"(b) `{name}` is not declared in "
                         + ", ".join(k for k, v in vals.items() if v is None))
        elif len(set(vals.values())) != 1:
            fails.append(f"(b) `{name}` differs between the copies: {vals}")
    for k, t in texts.items():
        if "type     expression;" not in t:
            fails.append(f"(b) {k}'s ammoniaSynthesis is not a `type expression` law")
    notes.append(f"the three declared copies share {len(SHARED)} parameters and "
                 "definitions verbatim")

    # ---- (c) independent recomputation ----------------------------------
    for k in (1, 2, 3):
        eta = diag.get(f"locus{k}_eta")
        T = diag.get(f"locus{k}_T_maxRate_K")
        if eta is None or T is None:
            fails.append(f"locus point {k} was not published")
            continue
        mine = V3(T, 300.0, reference(eta))
        theirs = diag[f"locus{k}_V3_max"]
        if abs(mine - theirs) > 1e-6 * abs(mine):
            fails.append(f"(c) locus {k}: Eq 19 recomputed here gives {mine:.6g}, "
                         f"the bench published {theirs:.6g}")
        mx = xi(300.0, T, eta)
        if abs(mx - diag[f"locus{k}_xi"]) > 1e-9:
            fails.append(f"(c) locus {k}: Eq 39 recomputed here gives {mx:.8g}, "
                         f"the bench published {diag[f'locus{k}_xi']:.8g}")
    pd_text = (CASE / "system/propsDict").read_text()
    for label in ("bed1Inlet", "bed1Outlet", "bed3Outlet"):
        eta = diag.get(label + "_eta")
        if eta is None:
            fails.append(f"(c) declared point `{label}` published no eta")
            continue
        P = 200e5 / 101325.0
        w = (P - 150.0) / (225.0 - 150.0)
        T = float(re.search(r"label\s+" + label + r";\s*T\s+([0-9.]+)", pd_text).group(1))
        mine = xi(150.0, T, eta) + w * (xi(225.0, T, eta) - xi(150.0, T, eta))
        if abs(mine - diag[label + "_xi"]) > 1e-9:
            fails.append(f"(c) {label}: xi interpolated here gives {mine:.8g}, "
                         f"the bench published {diag[label + '_xi']:.8g}")
    notes.append("Eqs 2/6-8/19/39 reproduced by a second implementation at every "
                 "locus point and at the three declared states (an ALGEBRA check)")

    # ---- (d) the anchors, on each case's declared law -------------------
    report = [("Ka", "-"), ("aN2", "-"), ("aH2", "-"), ("aNH3", "-"),
              ("fwd", "-"), ("rev", "-")]
    for k, t in texts.items():
        bench = (k == "bench")
        rep = report + ([("xi", "-")] if bench else [("forward", "kmol/m3/h"),
                                                     ("reverse", "kmol/m3/h")])
        pts = [point("A700", 700.0, 300.0, 0.2)]
        if bench:
            pts += [point("P150", 700.0, 150.0, 0.2), point("P225", 700.0, 225.0, 0.2)]
        with tempfile.TemporaryDirectory() as td:
            rc2, out2, js2 = run(PROPS, probe_case(td, t, rep, pts))
        d = diagnostics(js2, "probe")
        if rc2 != 0 or not d:
            fails.append(f"(d) the anchors could not be evaluated on {k}'s law "
                         f"(exit {rc2}) -- a check that cannot run must not pass\n{out2[-500:]}")
            continue
        Q = d["A700_aNH3"] / (math.sqrt(d["A700_aN2"]) * d["A700_aH2"] ** 1.5)
        lhs = d["A700_fwd"] / d["A700_rev"]
        rhs = (d["A700_Ka"] / Q) ** 2
        if abs(lhs - rhs) > 1e-10 * abs(rhs):
            fails.append(f"(d) A1 theory on {k}: forward/reverse {lhs!r} != (Ka/Q)^2 {rhs!r}")
        if abs(d["A700_Ka"] - 8.8060688324288414e-3) > 1e-12:
            fails.append(f"(d) A3 arithmetic on {k}: Ka(700 K) = {d['A700_Ka']!r}, "
                         "Eq 2's literal is 8.8060688324288414e-3")
        if bench:
            if abs(d["A700_xi"] - 0.69337909) > 1e-8:
                fails.append(f"(d) A4 arithmetic: xi(300 atm, 700 K, 0.2) = "
                             f"{d['A700_xi']!r}, Eq 39's literal is 0.69337909")
            if not (d["P150_xi"] > d["P225_xi"] > d["A700_xi"]):
                fails.append("(d) A5 theory: xi does not fall with pressure "
                             f"({d['P150_xi']}, {d['P225_xi']}, {d['A700_xi']})")
        else:
            Teq = d.get("A700_T_eq_K")
            if Teq is None:
                fails.append(f"(d) A2 on {k}: the law's own equilibrium T* was not located")
            else:
                with tempfile.TemporaryDirectory() as td:
                    rc3, out3, js3 = run(PROPS, probe_case(
                        td, t, rep, [point("Teq", Teq, 300.0, 0.2)]))
                d3 = diagnostics(js3, "probe")
                if rc3 != 0 or not d3:
                    fails.append(f"(d) A2 on {k}: the probe at T* did not run")
                elif abs(d3["Teq_forward"] - d3["Teq_reverse"]) > 1e-9 * abs(d3["Teq_forward"]):
                    fails.append(f"(d) A2 theory on {k}: at T* = {Teq} K forward "
                                 f"{d3['Teq_forward']!r} != reverse {d3['Teq_reverse']!r}")
    notes.append("anchors A1/A3 on all three declared laws, A4/A5 on the bench's "
                 "Eq 39, A2 on the two reactor laws (theory = identity; arithmetic = "
                 "a transcription, never a physics; nothing measured by Choupo)")

    # ---- (e) the refusals the law declares -------------------------------
    same = lambda t: t
    refusal(same, lambda t: re.sub(r"\n\s*dp\s+8\s+mm;[^\n]*", "", t),
            "(e1) no particle", fails, "`dp`")
    refusal(same, lambda t: t.replace("dp          8         mm;", "dp          12        mm;"),
            "(e2) a 12 mm particle", fails, "outside refuse")
    refusal(lambda t: t.replace("pressure     300 atm", "pressure     400 atm"), same,
            "(e3) 400 atm", fails, "OUTSIDE its declared points")
    refusal(lambda t: t.replace("NH3 0.0111202", "NH3 0.0000000").replace(
            "N2 0.2393446", "N2 0.2504648"), same,
            "(e4) a gas with no ammonia", fails, "definition `fwd`")
    refusal(lambda t: t.replace("inert 0.0232896", "inert 0.0432896"), same,
            "(e5) a composition that does not close", fails, "NOT normalised")

    # ---- (f) the interpolation is announced, and only when it happens ----
    if "LINEARLY INTERPOLATED" not in out:
        fails.append("(f) the declared points sit at 200 bar, between Table I's "
                     "150 and 225 atm columns, and no interpolation was announced")
    locus_block = out.split("the locus of maximum", 1)[-1].split(
        "the law at declared states", 1)[0]
    if "LINEARLY INTERPOLATED" in locus_block:
        fails.append("(f) the locus runs at exactly 300 atm -- one of Table I's "
                     "own columns -- and still announced an interpolation")

    # ---- (g) the locus descends -------------------------------------------
    if diag.get("locusDescends", 0.0) != 1.0:
        fails.append("(g) the locus of maximum rate does not descend with "
                     "conversion -- which is the whole reason a converter is quenched")
    if "ON THE EDGE" not in out:
        fails.append("(g) no maximum was reported as sitting on the swept "
                     "window's edge; the lowest conversion does")

    # ---- (h) an unphysical xi is announced and NOT clamped ----------------
    if not re.search(r"\[window\] `xi` = -", out):
        fails.append("(h) no unphysical xi was announced; the lowest conversion "
                     "drives Eq 39's cubic out of (0, 1]")
    if not any(diag.get(f"locus{k}_xi", 1.0) <= 0.0 or
               diag.get(f"locus{k}_xi", 1.0) > 1.0 for k in (1, 2, 3)):
        fails.append("(h) every published xi lies in (0, 1] -- either the "
                     "witness moved, or the value is being CLAMPED")

    # ---- (i) the transcribed states are held to their source -------------
    rcp, outp, jsp = run(SOLVE, PLANT, timeout=900)
    if rcp != 0 or not jsp:
        fails.append("(i) ammonia03 could not be run, so the transcribed states "
                     "cannot be held to their source -- and a check that cannot "
                     "run must not pass")
    else:
        st = jsp["streams"]
        want = {"bed1Inlet": "preheatedFeed", "bed1Outlet": "bed1Out",
                "bed3Outlet": "hotEffluent"}
        for label, stream in want.items():
            m = re.search(r"label\s+" + label + r";\s*T\s+([0-9.]+)\s*K;"
                          r"\s*P\s+[^;]+;\s*composition\s*\{([^}]*)\}", pd_text, re.S)
            if not m:
                fails.append(f"(i) point `{label}` is not declared in the bench")
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
                     "converged answer")

    if fails:
        print("check_ammonia_rate: FAILED")
        for f in fails:
            print("  - " + f)
        return 1

    print("check_ammonia_rate: OK -- " + "; ".join(notes)
          + ".  NOT CHECKED: whether the rate law is RIGHT (nothing in this "
            "tree measures an ammonia rate; the agreement with Nielsen, Kjaer "
            "and Hansen's data is the authors' claim, made in 1968), any bed "
            "integration, and the T and eta domain of Table I -- the paper "
            "states none, which is why arm (h) exists at all.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
