#!/usr/bin/env python3
"""Gate: the Bell-Delaware shell-side rating reproduces its textbook worked example.

    bin/curate/check_bell_delaware.py

WHY THIS EXISTS (DEV.md 4c C214 W2).  `heatExchanger` rated a shell-and-tube
bundle with Kern's one-line shell correlation.  `model BellDelaware;` rates
the same declared bundle with the design-course method: the cross-flow ideal
bank corrected for the baffle cut (Jc), the leakages (JL), the bundle bypass
(JB) and the sealing strips, and a shell pressure drop that sums the
cross-flow and window zones.  A rating method that nothing reproduces is a
number with a citation; this gate holds it to the ONE thing that can show it
is the book's method -- the book's own worked example, step by step.

SOURCE OF THE ANCHOR.  G. F. Hewitt, G. L. Shires, T. R. Bott, *Process Heat
Transfer* (CRC Press, 1994), Example 6.2 (pp. 280-285) on the geometry and
the light-hydrocarbon stream of Example 6.1 (p. 273).  The scan the project
reads is the curator's own copy (data/local/books, gitignored); this gate
carries the PRINTED NUMBERS, cited by page, and no text.  Where the OCR
dropped a digit it was recovered from the book's own arithmetic, not typed:
  * "0.03050" (window pressure drop, step 5) against "0.03058" two lines
    above it: the arithmetic of step 5(i) gives 0.03058, the printed
    window dp of 165 Pa agrees with 0.03058 (165.3) and not with 0.03050.
  * the K_f equation's signs (Eq 6.22): the example's own arithmetic fixes
    them (0.267 + 0.1187 - 0.0211 + 0.0011 = 0.3657).
  * Table 2.5's staggered 10-300 row has one digit read from one occurrence;
    that row is REFUSED by name, not carried.

WHAT THE BOOK GETS WRONG, AND THE GATE SAYS SO.  Example 6.2 prints
S_m = 0.01667 m2; Eq 6.9 at the Example 6.1 geometry gives 0.016622 (0.29 %
lower).  The bench therefore runs TWICE: op `book` starts from the PRINTED S_m
(a bench-only override the unit refuses) and must reproduce EVERY printed
digit; op `exact` starts from the geometry and must agree with the book on
every step that does not depend on S_m, and sit within 1 % on those that do.
J_L = 0.58, J_B = 0.92, R_L = 0.33, R_B = 0.76 are Bell's CHART readings in
this method (Figs 6.8-6.11) and are declared; the book prints no equation.

ARMS.
  (a) `book` reproduces every printed step (S_m taken as printed) within the
      larger of the printed half-unit and 0.25 % -- the book rounds its
      intermediates (L_c to 0.1349 m, Re to 2.097e4, dp_c/dp_w to whole
      pascals); (a2) an independent Python replay of the book's formulas on
      its OWN rounded intermediates gives every printed downstream digit.
  (b) `exact` equals the independent Python evaluation of Eq 6.9, agrees on
      the S_m-free steps to the printed digits and on the rest within 1 %.
  (c) REFUSALS BY NAME, each fired through the real reader: JL/JB absent;
      baffle cut outside 15-45 %; the Hewitt bank on a rotated-square layout;
      the staggered Re 10-300 row; the Serth 45-degree Re 10-100 row;
      pressure drop on triangular pitch; at P_T/D_o != 1.25; at cross-flow
      Re < 2000; one of RL/RB declared alone; `SmPrinted` in a unit.
  (d) THE UNIT: `heatExchanger04_bell_delaware_rating` runs `model
      BellDelaware;`, publishes the J factors, and its h_outer equals
      h_ideal x Jc x JL x JB; the chart coordinates the unit publishes equal
      the bench's (they depend on the geometry alone); the Kern KPI names
      (f_shell, Nu_shell) are NOT published for the Bell path.
  (e) THE SERTH IDEAL BANK is an ARITHMETIC anchor (no worked example of
      Serth's was seen): its h is recomputed here from Table 6.1's printed
      coefficients, and the run says it is an arithmetic anchor.
  (f) THE ANCHOR CAN FAIL: a 1 % change of Jc is rejected by the comparator
      of arm (a) (negative control), and the source documents its citations.

NOT COVERED, stated so the OK line cannot imply it: nothing here is a
measurement.  The example fixes the method's ARITHMETIC against the book;
that the method predicts a real exchanger is the literature's claim (Bell
1963, Taborek 1983), not this gate's.  J_L/J_B/R_L/R_B are not computed.
The triangular K_f, the laminar window equation and Eq 6.21 are not carried.

SABOTAGE-VERIFIED 2026-11-04, by hand on BellDelaware.cpp (each restored
byte-identical and rebuilt, the gate green again):

S1 -- Jc = 0.55 + 0.72 Fc changed to 0.73 (a 0.6 % move of one J factor):

    (a) book: Jc: computed 1.02214 vs printed 1.016 (tolerance 0.00254)
    (a) book: h_shell: computed 773.692 vs printed 769 (tolerance 1.9225)

S2 -- the sign of Eq 6.22's second term flipped (the term whose sign the OCR
dropped and only the example's arithmetic fixes):

    (a) book: Kf: computed 0.407906 vs printed 0.3657 (tolerance 0.00091425)
    (a) book: dP_shell: computed 4801.73 vs printed 4501 (tolerance 11.2525)
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[2]
BENCH = ROOT / "tutorials/props/heat/bellDelaware01_hewitt_example62"
UNIT = ROOT / "tutorials/steady/heat/heatExchanger04_bell_delaware_rating"
PROPS = ROOT / "choupoProps"
SOLVE = ROOT / "choupoSolve"
KERNEL_H = ROOT / "src/unitOperations/heatTransfer/htc/BellDelaware.H"
KERNEL_C = ROOT / "src/unitOperations/heatTransfer/htc/BellDelaware.cpp"

#  The book rounds its INTERMEDIATES before the next step (L_c to 0.1349 m,
#  so F_c prints 0.6470 where the exact 0.25 D_s gives 0.6468; Re to 2.097e4
#  before the ideal h, which prints 1418 where 1418.5 follows; dp_c and dp_w
#  to 233 and 165 Pa before the shell total, 4501 against 4508).  The engine
#  carries full precision, so each step is held to the larger of the printed
#  half-unit and ROUNDING of the value -- measured worst case 0.17 % -- and
#  arm (a2) shows the book's printed digits follow EXACTLY when the formulas
#  are fed the book's own rounded intermediates.
ROUNDING = 0.0025

#  Hewitt Example 6.2: (key, printed value, half-unit tolerance, "S_m-free").
PRINTED = [
    ("Sm",           0.01667, 5e-6,  False),
    ("Vmax",         0.4535,  5e-5,  False),
    ("Re",           2.097e4, 5.0,   False),
    ("Pr",           7.481,   5e-4,  True),
    ("h_ideal",      1418.0,  0.5,   False),
    ("Fc",           0.6470,  5e-5,  True),
    ("Jc",           1.016,   5e-4,  True),
    ("Ssb",          0.002827, 5e-7, True),
    ("Stb",          0.004153, 5e-7, True),
    ("leakageRatio", 0.4187,  5e-5,  False),
    ("leakageSplit", 0.4050,  5e-4,  False),
    ("Fbp",          0.2666,  5e-5,  False),
    ("h_shell",      769.0,   0.5,   False),
    ("Kf",           0.3657,  5e-5,  False),
    ("Nc",           8.5,     0.05,  True),
    ("dp_cross",     233.0,   0.5,   False),
    ("Ncw",          3.4,     0.05,  True),
    ("Sw",           0.03058, 5e-6,  True),
    ("dp_window",    165.0,   0.5,   False),
    ("dP_shell",     4501.0,  1.5,   False),
]


def run(binary, cwd, env_extra=None):
    import os
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(binary)] + (["."] if binary == SOLVE else []),
                       cwd=str(cwd), env=env, capture_output=True,
                       text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    return json.loads(m.group(1)) if m else None


def bench_ops(out):
    js = result_json(out) or {}
    return {o["name"]: o.get("diagnostics", {})
            for o in js.get("operationResults", [])}


def probe(case, edit, binary=PROPS, rel="system/propsDict"):
    d = Path(tempfile.mkdtemp(prefix="bd_probe_"))
    try:
        dst = d / "case"
        shutil.copytree(case, dst)
        f = dst / rel
        f.write_text(edit(f.read_text()))
        return run(binary, dst)
    finally:
        shutil.rmtree(d, ignore_errors=True)


def compare_printed(diag, keys_filter=None, scale=1.0):
    bad = []
    for key, val, tol, _free in PRINTED:
        if keys_filter is not None and not keys_filter(key, _free):
            continue
        got = diag.get(key)
        if got is None:
            bad.append(f"{key}: not published")
        elif abs(got - val) > max(tol, ROUNDING * abs(val)):
            bad.append(f"{key}: computed {got:.6g} vs printed {val:g} "
                       f"(tolerance {max(tol, ROUNDING * abs(val)):g})")
    return bad


def exact_python():
    """Eq 6.9 / 6.13-6.18, 6.27-6.28 re-evaluated here, independently."""
    import math
    Ds, Do, PT, LB, NT = 0.5398, 0.0254, 0.03175, 0.1270, 158
    Dotl = Ds - 0.035
    Sm = LB * (Ds - Dotl + (Dotl - Do) / PT * (PT - Do))
    Lc = 0.25 * Ds
    x = (Ds - 2 * Lc) / Dotl
    Fc = (math.pi + 2 * x * math.sin(math.acos(x)) - 2 * math.acos(x)) / math.pi
    return Sm, Fc


def main():
    fails = []
    for b in (PROPS, SOLVE):
        if not b.exists():
            print(f"check_bell_delaware: FAIL -- {b} missing; run `make all`")
            return 1

    rc, out = run(PROPS, BENCH)
    if rc != 0:
        print(f"check_bell_delaware: FAIL -- the bench case exited {rc}\n"
              + out[-1200:])
        return 1
    ops = bench_ops(out)
    book, exact = ops.get("book", {}), ops.get("exact", {})
    if not book or not exact:
        print("check_bell_delaware: FAIL -- the bench published no `book` / "
              "`exact` diagnostics")
        return 1

    # ---- (a) every printed step, from the printed S_m -------------------
    for b in compare_printed(book):
        fails.append("(a) book: " + b)

    # ---- (a2) the book's own rounding, replayed independently --------------
    import math
    pi = math.pi
    def rnd(v, d):
        return round(v, d)
    Fc_b = 0.6470                                   # printed
    checks = [
        ("J_c = 0.55 + 0.72 F_c", 0.55 + 0.72 * Fc_b, 1.016, 5e-4),
        ("h = h_c Jc JL JB", 1418 * 1.016 * 0.58 * 0.92, 769.0, 0.5),
        ("V_max = M/(rho S_m)", 5.5188 / (730 * 0.01667), 0.4535, 5e-5),
        ("Re", 730 * 0.4535 * 0.0254 / 401e-6, 2.097e4, 5.0),
        ("Pr", 2470 * 401e-6 / 0.1324, 7.481, 5e-4),
        ("h_c (Table 2.5 in-line)",
         0.211 * 2.097e4 ** 0.651 * 7.481 ** 0.34 * 0.1324 / 0.0254, 1418.0, 1.0),
        ("K_f (Eq 6.22)", 0.267 + 0.249e4 / 2.097e4 - 0.927e7 / 2.097e4 ** 2
         + 0.10e11 / 2.097e4 ** 3, 0.3657, 5e-5),
        ("dp_c = N_c K_f (rho V^2/2)", 8.5 * 0.3657 * 0.5 * 730 * 0.4535 ** 2,
         233.0, 0.5),
        ("N_cw = 0.8 L_c/P_TP", 0.8 * 0.1349 / 0.03175, 3.4, 0.05),
        ("dp_w (Eq 6.26)", (2 + 0.6 * 3.4) * 5.5188 ** 2
         / (2 * 0.01667 * 0.03058 * 730), 165.0, 0.5),
        ("dP_s (Eq 6.31)", (35 * 233 * 0.76 + 36 * 165) * 0.33
         + 2 * 233 * 0.76 * (1 + 3.4 / 8.5), 4501.0, 0.5),
    ]
    for tag, got, want, tol in checks:
        if abs(got - want) > tol:
            fails.append(f"(a2) replay of the book's rounded chain: {tag} = "
                         f"{got:.6g}, printed {want:g}")

    # ---- (b) from the geometry --------------------------------------------
    Sm_py, Fc_py = exact_python()
    if abs(exact["Sm"] - Sm_py) > 1e-9:
        fails.append(f"(b) exact: S_m {exact['Sm']:.9g} != independent Eq 6.9 "
                     f"{Sm_py:.9g}")
    if abs(exact["Fc"] - Fc_py) > 1e-12:
        fails.append("(b) exact: F_c differs from the independent Eq 6.13")
    slip = (0.01667 - Sm_py) / Sm_py
    if not (0.002 < slip < 0.004):
        fails.append(f"(b) the book's S_m slip is {100*slip:.3f} %, expected "
                     "about 0.29 %: the anchor's premise changed")
    for b in compare_printed(exact, lambda k, free: free):
        fails.append("(b) exact (S_m-free steps): " + b)
    for key, val, _tol, free in PRINTED:
        if not free and key not in ("Sm",):
            got = exact.get(key)
            if got is None or abs(got - val) / abs(val) > 0.01:
                fails.append(f"(b) exact: {key} {got} not within 1 % of the "
                             f"printed {val:g}")

    # ---- (c) refusals by name ------------------------------------------------
    def sub(a, b, count=0):
        return lambda t: t.replace(a, b) if count == 0 else t.replace(a, b, count)

    cases = [
        ("JL/JB absent", sub("JL 0.58;  JB 0.92;", ""),
         ["JL/JB correlation not carried", "Fig 6.8"]),
        ("baffle cut 10 %", sub("baffleCutPercent     25;",
                                "baffleCutPercent     10;"),
         ["15 to 45 %"]),
        ("Hewitt bank on rotated square", sub("tubePattern    square;",
                                              "tubePattern    rotatedSquare;"),
         ["not carried for rotated-square"]),
        ("staggered Re 10-300", lambda t: t.replace("tubePattern    square;",
                                                    "tubePattern    triangular;")
                                          .replace("mdot    5.5188 kg/s;",
                                                   "mdot    0.05 kg/s;")
                                          .replace("SmPrinted            0.01667 m2;", ""),
         ["staggered", "not carried"]),
        ("Serth 45 deg Re 10-100", lambda t: t.replace("tubePattern    square;",
                                                       "tubePattern    rotatedSquare;")
                                             .replace("idealBank            Hewitt;",
                                                      "idealBank            Serth;")
                                             .replace("mdot    5.5188 kg/s;",
                                                      "mdot    0.0131 kg/s;")
                                             .replace("SmPrinted            0.01667 m2;", ""),
         ["Serth j-factor row", "0.498"]),
        ("dP on triangular pitch", lambda t: t.replace("tubePattern    square;",
                                                       "tubePattern    triangular;")
                                             .replace("SmPrinted            0.01667 m2;", ""),
         ["square pitch only"]),
        ("dP at P_T/D_o = 1.5", lambda t: t.replace("tubePitch      0.03175 m;",
                                                    "tubePitch      0.0381 m;")
                                          .replace("SmPrinted            0.01667 m2;", ""),
         ["1.25 only"]),
        ("dP at Re < 2000", lambda t: t.replace("mdot    5.5188 kg/s;",
                                                "mdot    0.4 kg/s;")
                                      .replace("SmPrinted            0.01667 m2;", ""),
         ["Eq 6.21"]),
        ("RL without RB", sub("RL 0.33;  RB 0.76;", "RL 0.33;"),
         ["declare both RL"]),
    ]
    for tag, edit, needles in cases:
        rc, o = probe(BENCH, edit)
        if rc == 0:
            fails.append(f"(c) {tag}: RAN to exit 0, expected a refusal")
            continue
        for n in needles:
            if n not in o:
                fails.append(f"(c) {tag}: refusal does not name '{n}'")
                break
    # SmPrinted in a UNIT is refused
    rc, o = probe(UNIT, sub("idealBank            Hewitt;",
                            "idealBank            Hewitt;\n SmPrinted 0.01667 m2;"),
                  SOLVE, "system/flowsheetDict")
    if rc == 0 or "bench-only" not in o:
        fails.append("(c) SmPrinted in a unit was not refused as bench-only")

    # ---- (d) the unit --------------------------------------------------------
    rc, uo = run(SOLVE, UNIT)
    if rc != 0:
        fails.append(f"(d) heatExchanger04 exited {rc}: {uo[-400:]}")
    else:
        js = result_json(uo) or {}
        kp = (js.get("kpis") or {}).get("hx", {})
        need = ["BD_Jc", "BD_JL", "BD_JB", "BD_h_ideal", "h_outer",
                "BD_Fbp", "BD_leakageSplit", "dP_shell_kPa", "BD_Kf"]
        miss = [k for k in need if k not in kp]
        if miss:
            fails.append("(d) unit KPIs missing: " + ", ".join(miss))
        else:
            h = kp["BD_h_ideal"] * kp["BD_Jc"] * kp["BD_JL"] * kp["BD_JB"]
            if abs(h - kp["h_outer"]) > 1e-9 * h:
                fails.append("(d) h_outer != h_ideal x Jc x JL x JB")
            if abs(kp["BD_Fbp"] - exact["Fbp"]) > 1e-12 \
               or abs(kp["BD_leakageSplit"] - exact["leakageSplit"]) > 1e-12:
                fails.append("(d) chart coordinates differ from the bench's "
                             "(they depend on the geometry alone)")
            if "f_shell" in kp or "Nu_shell" in kp:
                fails.append("(d) the Bell path publishes Kern's f_shell / "
                             "Nu_shell")

    # ---- (e) the Serth bank, an arithmetic anchor --------------------------
    import math
    rc, so = probe(BENCH, lambda t: t.replace("idealBank            Hewitt;",
                                              "idealBank            Serth;")
                                     .replace("RL 0.33;  RB 0.76;", ""))
    sd = bench_ops(so).get("exact", {}) if rc == 0 else {}
    if rc != 0 or not sd:
        fails.append("(e) the Serth ideal bank did not run: " + so[-300:])
    else:
        Re, Pr, Sm = sd["Re"], sd["Pr"], sd["Sm"]
        # square, Re 1e4-1e5: a3 1.187 a4 0.370, a1 0.370 a2 -0.395
        a = 1.187 / (1 + 0.14 * Re ** 0.370)
        j = 0.370 * (1.33 / 1.25) ** a * Re ** -0.395
        hid = j * 2470 * (5.5188 / Sm) * Pr ** (-2 / 3)
        if abs(hid - sd["h_ideal"]) > 1e-6 * hid:
            fails.append(f"(e) Serth h_ideal {sd['h_ideal']:.6g} != "
                         f"recomputed {hid:.6g}")
        if "ARITHMETIC anchor" not in so:
            fails.append("(e) the Serth run does not say it is an arithmetic "
                         "anchor")

    # ---- (f) the negative control and the source ----------------------------
    pert = dict(book)
    pert["Jc"] *= 1.01
    pert["h_shell"] *= 1.01
    if not compare_printed(pert):
        fails.append("(f) the comparator accepted a 1 % change of Jc: the "
                     "gate cannot fail")
    hdr = KERNEL_H.read_text()
    for needle in ("Hewitt, Shires & Bott", "Serth", "EXAMPLE 6.2"):
        if needle not in hdr:
            fails.append(f"(f) BellDelaware.H does not cite '{needle}'")
    src = KERNEL_C.read_text()
    if "JL/JB correlation not carried" not in src:
        fails.append("(f) the JL/JB refusal is gone from the kernel")
    if re.search(r"\bJL\s*=\s*[^;]*(std::exp|std::pow)", src):
        fails.append("(f) the kernel computes JL by a correlation nobody "
                     "carried")

    if fails:
        print("check_bell_delaware: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_bell_delaware: OK -- Hewitt Example 6.2 reproduced "
          f"({len(PRINTED)} printed steps reproduced from the printed S_m "
          "within the book's own rounding of its intermediates (<= 0.25 %), "
          "and every printed downstream digit EXACTLY when its rounded "
          "intermediates are replayed independently; the geometry-only run "
          "agrees on the S_m-free steps "
          f"and within 1 % on the rest, the book's S_m being {100*slip:.2f} % "
          "above its own Eq 6.9); JL/JB/RL/RB are declared chart readings "
          "and absent ones refuse by name; 9 refusals fire through the real "
          "reader; the unit publishes the J factors and h_outer = h_ideal x "
          "Jc x JL x JB; the Serth bank is an arithmetic anchor, said so")
    return 0


if __name__ == "__main__":
    sys.exit(main())
