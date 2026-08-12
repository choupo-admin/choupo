#!/usr/bin/env python3
"""Rowlinson-Bondi liquid-Cp gate (built 2026-08-12).

WHY THE MODEL EXISTS.  `HeatCapacityModel` registered `polynomial` and `NASA7`
and nothing else, so a structurally-known-but-uncurated molecule had no liquid
heat capacity and could not enter an energy balance.  That is what blocked the
rigorous column in the 2026-08-11 agent test.  Rowlinson-Bondi closes it from
Tc, omega and the ideal-gas Cp -- nothing measured.

THE ARMS.

  A1  THE CORRELATION IS THE PUBLISHED ONE.  The departure (Cp_L - Cp_ig) is
      recomputed here from Poling 5th ed. Eq. 6-8.4 in Python, independently of
      the C++, over a grid of (Tr, omega), and must agree to 1e-9 relative.
      An engine checked against a transcription of itself checks nothing, so
      the constants are typed out again from the equation rather than read
      from the source.

  A2  THE POLE IS REFUSED, NOT RETURNED.  Two terms carry 1/(1 - Tr).  At
      Tr >= 1 there is no liquid at all, so the call REFUSES by name rather
      than returning an arbitrarily large number wearing units.

  A3  NO IDEAL-GAS Cp, NO ANSWER.  The correlation predicts a DEPARTURE.  With
      no curve to depart from, returning the departure alone would be wrong by
      the whole ideal-gas term -- plausible, and silently wrong.  It refuses,
      naming both remedies.

  A4  OUTSIDE THE WINDOW IT ANNOUNCES AND STILL RETURNS (doctrine I4), and
      INSIDE it stays quiet.  Both directions are checked: an announcement
      that fires everywhere is the same as none.

  A5  H IS THE INTEGRAL OF Cp.  The model integrates the ideal-gas part
      exactly through the nested model and quadratures only the departure.
      Checked against an independent finer quadrature computed here.

  A6  THE ACCURACY IS MEASURED AND PINNED BOTH WAYS.  Rowlinson-Bondi is
      compared against every standards component that carries a CURATED
      polynomial liquid Cp plus Tc, omega and an ideal-gas Cp -- 86 components,
      429 points across Tr 0.45..0.85.  OBSERVED 2026-08-12 with the shipped
      binary, not remembered:

          global AAD 10.5 %,  median 3.5 %

          best   neopentane 0.4 %, hexamethyldisiloxane 0.8 %, MDM 0.8 %,
                 nDodecane 0.8 %, R11 0.8 %, diethylEther 1.0 %
          worst  ParaHydrogen 83.5 %, methanol 67.3 %, ethanol 50.3 %,
                 SF6 44.3 %, OrthoDeuterium 43.9 %, D2 43.1 %

      A NOTE ON THESE NUMBERS, because they moved once and the reason is the
      same lesson as S3.  An interim run reported 350 points / 9.7 % / 3.0 %,
      and that was the BROKEN PROBE talking: the interleaved caveat split its
      own ROW lines, so eighty comparisons were silently dropped and the
      surviving population was not the one described.  A measurement is only
      as good as the instrument that took it, and a smaller sample that
      happens to look tidier is exactly what a broken instrument produces.

      The split is what corresponding states predicts: excellent for
      non-polar, poor for hydrogen-bonding, useless for quantum fluids.

      BOTH ENDS ARE PINNED, deliberately.  A regression that broke the
      non-polar end fires; and so does a "fix" that suddenly made the alcohols
      look good, because that would mean the comparison stopped comparing
      (a curated record silently rerouted to the predictive model would show
      exactly that).  A one-sided pin would catch the first and welcome the
      second.

  A7  THE COMPONENT-LEVEL INJECTION WORKS.  Tc, omega and the ideal-gas Cp
      live on the COMPONENT; the liquid-Cp block gets them injected by
      Component::Component.  Every other arm builds the model directly, so
      this is the ONE arm that proves a real `.dat` reaches the correlation --
      without it the model could be perfect and unreachable.  ONE component
      (nDecane), so it proves the wiring exists, not that it is right for
      every record shape.

WHAT THIS GATE DOES NOT CLAIM.  It does not say the correlation is good enough
for any particular process -- that is a sensitivity question about a specific
answer, and a receipt on a value cannot settle it.  And it does not flag WHICH
compounds will be poorly served: the correlation cannot know it is looking at
an alcohol.  The structural fact that COULD tell it -- an `OH` group in the
UNIFAC decomposition the lake already carries -- is NOT wired, and that is a
named gap, not an oversight.  It matters more than it sounds, because
Ambrose-Walton's vapour pressure fails on the SAME molecules: the two weakest
rungs of the predictive ladder are weak together, on exactly the alcohols and
acids an ordinary separation case is made of.

NOTE ON WHERE THE REFUSALS ARE TESTED.  Through the probe, not through a case,
and that was learned the hard way: a probe component driven through choupoProps
first had to satisfy `role`, `vaporPressure` and `standardThermochemistry` --
three refusals with nothing to do with a liquid heat capacity.  A test that
must first satisfy unrelated contracts reports their failures as this model's.

SABOTAGE-VERIFIED (2026-08-12), three sabotages, observed output transcribed:

  S1  One constant of the correlation moved (0.49 -> 0.59):
        check_rowlinson_bondi: FAIL
          - A1: Tr=0.30 omega=0.00 -- engine 20.1946419187,
            published equation 19.0068615451
          ... and every other (Tr, omega) point.
      A1 is the arm that would catch a mistyped equation, which is the most
      likely way a correlation goes wrong in this codebase.

  S2  Return the pole instead of refusing (`if (false)`):
        check_rowlinson_bondi: FAIL
          - A2: at T > Tc the model did not refuse by name -- the 1/(1-Tr)
            pole would otherwise return a very large number as if it were a
            heat capacity

  S3  Collapse the declared window (TrHigh 0.85 -> 0.50), so the
      extrapolation caveat fires almost everywhere:
        check_rowlinson_bondi: FAIL
          - A4: Tr = 0.60 announced an extrapolation INSIDE the declared
            window -- an announcement that fires everywhere is the same as none
          - A5: the probe did not report H and S
      The A5 line was COLLATERAL, and chasing it found a real defect in the
      PROBE rather than in the model.  `cout << "H " << m->H(...)` streams the
      marker before the call runs, so the caveat the call prints lands between
      them and splits the probe's own line in two:

          H [cp] component 'probe': RowlinsonBondi liquid Cp evaluated at ...
          15688.9693611

      The first guess written here was "the caveat floods the channel".  That
      was wrong, and it was checked before it was published: the cause is
      EVALUATION ORDER inside one `<<` chain.  The probe now computes first
      and prints after, in every mode.  Any probe that streams a marker beside
      a computed value can have its own output split by whatever that
      computation says.

Exit 1 listing failures."""
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
PROBE = BUILD / "rowlinsonBondiProbe"
SRC = ROOT / "bin" / "curate" / "_rowlinsonBondiProbe.cpp"
PROPS = BUILD / "choupoProps"
R_GAS = 8.31446261815324

failures = []


def build_probe():
    cmd = ["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}",
           str(SRC), str(BUILD / "libchoupo.so"),
           "-Wl,-rpath," + str(BUILD), "-o", str(PROBE)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, r.stderr[-1500:]


def departure_py(Tr, omega):
    """Poling, Prausnitz & O'Connell 5th ed., Eq. 6-8.4 -- typed out from the
    equation, NOT read from the C++, so the two are independent."""
    u = 1.0 - Tr
    return R_GAS * (1.586 + 0.49 / u
                    + omega * (4.2775 + 6.3 * u ** (1.0 / 3.0) / Tr
                               + 0.4355 / u))


def props_case(tmp, tag, body, ops):
    d = tmp / tag
    (d / "system").mkdir(parents=True)
    (d / "constant").mkdir(parents=True)
    (d / "constant" / "thermoPhysPropDict").write_text(body)
    (d / "system" / "controlDict").write_text(
        "recordType controlDict;\napplication choupoProps;\n"
        "description \"rowlinson-bondi gate probe\";\nverbosity 3;\n")
    (d / "system" / "propsDict").write_text(ops)
    return d


def run(binary, case):
    p = subprocess.run([str(binary), "."], cwd=str(case), capture_output=True,
                       text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


if not SRC.exists():
    print("check_rowlinson_bondi: FAILED\n  probe source is missing.")
    sys.exit(1)
rc, err = build_probe()
if rc != 0:
    print("check_rowlinson_bondi: FAILED\n  the probe did not compile -- the "
          "HeatCapacityModel surface or the library moved.  A CHECK THAT "
          "CANNOT RUN MUST NOT PASS.\n" + err)
    sys.exit(1)


def probe(*args, timeout=900):
    p = subprocess.run([str(PROBE), *args], capture_output=True, text=True,
                       timeout=timeout)
    return p.stdout + p.stderr


# ---- A1: the departure against an independent transcription ---------------
for ln in probe("formula").splitlines():
    f = ln.split()
    if len(f) != 4 or f[0] != "DEP":
        continue
    omega, Tr, got = float(f[1]), float(f[2]), float(f[3])
    want = departure_py(Tr, omega)
    if abs(got - want) > 1e-9 * max(1.0, abs(want)):
        failures.append("A1: Tr=%.2f omega=%.2f -- engine %.12g, published "
                        "equation %.12g" % (Tr, omega, got, want))

# ---- A2: the pole refuses -------------------------------------------------
out = probe("refuse-pole")
if "REFUSED" not in out or "no liquid there" not in out:
    failures.append("A2: at T > Tc the model did not refuse by name -- the "
                    "1/(1-Tr) pole would otherwise return a very large "
                    "number as if it were a heat capacity")
if "still returned" in out:
    failures.append("A2: the extrapolation caveat printed above the refusal, "
                    "so the run says the value was returned one line before "
                    "refusing to return it")

# ---- A3: no ideal-gas Cp refuses, naming both remedies --------------------
out = probe("refuse-noig")
if "REFUSED" not in out or "DEPARTURE" not in out:
    failures.append("A3: with no ideal-gas Cp the model did not refuse naming "
                    "the departure")
if "polynomial" not in out or "Joback" not in out:
    failures.append("A3: the refusal does not carry both remedies")

# ---- A4: announce outside, silent inside ---------------------------------
if "OUTSIDE the correlation" not in probe("announce", "470"):
    failures.append("A4: Tr = 0.94 did not announce the extrapolation")
if "OUTSIDE the correlation" in probe("announce", "300"):
    failures.append("A4: Tr = 0.60 announced an extrapolation INSIDE the "
                    "declared window -- an announcement that fires "
                    "everywhere is the same as none")

# ---- A5: H and S are the integrals ---------------------------------------
out = probe("integral")
gotH = gotS = None
for ln in out.splitlines():
    f = ln.split()
    if len(f) == 2 and f[0] == "H":
        gotH = float(f[1])
    if len(f) == 2 and f[0] == "S":
        gotS = float(f[1])
if gotH is None or gotS is None:
    failures.append("A5: the probe did not report H and S")
else:
    #  Independent, much finer quadrature over the SAME integrand: ideal-gas
    #  Cp = 100 J/(mol K) flat (so its exact integral is trivial to write) plus
    #  the departure.
    n = 20000
    Tref, T, Tc, om = 300.0, 400.0, 500.0, 0.3
    h = (T - Tref) / n
    accH = accS = 0.0
    for i in range(n + 1):
        t = Tref + i * h
        w = 1.0 if i in (0, n) else (4.0 if i % 2 else 2.0)
        d = departure_py(t / Tc, om)
        accH += w * d
        accS += w * d / t
    refH = 100.0 * (T - Tref) + accH * h / 3.0
    refS = 100.0 * math.log(T / Tref) + accS * h / 3.0
    if abs(gotH - refH) > 1e-6 * abs(refH):
        failures.append("A5: H = %.10g, independent quadrature %.10g"
                        % (gotH, refH))
    if abs(gotS - refS) > 1e-6 * abs(refS):
        failures.append("A5: S = %.10g, independent quadrature %.10g"
                        % (gotS, refS))

# ---- A6: the measured accuracy, pinned at BOTH ends ----------------------
per = {}
for ln in probe("sweep", str(ROOT / "data")).splitlines():
    f = ln.split()
    if len(f) != 6 or f[0] != "ROW":
        continue
    name, cur, pre = f[1], float(f[4]), float(f[5])
    if cur > 0:
        per.setdefault(name, []).append(abs(pre - cur) / cur * 100.0)

if len(per) < 60:
    failures.append("A6: only %d component(s) could be compared -- the anchor "
                    "population collapsed, so any accuracy number here "
                    "describes something else" % len(per))
else:
    mean_of = {k: sum(v) / len(v) for k, v in per.items()}
    for name, bound in (("neopentane", 2.0), ("nDodecane", 3.0),
                        ("diethylEther", 3.0), ("cyclohexane", 4.0)):
        if name in mean_of and mean_of[name] > bound:
            failures.append("A6: %s deviates %.1f %% (bound %.1f %%) -- the "
                            "non-polar end regressed" % (name, mean_of[name], bound))
    for name, floor in (("methanol", 25.0), ("ethanol", 20.0), ("water", 12.0)):
        if name in mean_of and mean_of[name] < floor:
            failures.append("A6: %s deviates only %.1f %% -- corresponding "
                            "states does NOT describe a hydrogen-bonding "
                            "liquid this well, so the curated and predicted "
                            "curves are probably no longer two different "
                            "things" % (name, mean_of[name]))

# ---- A7: the component-level injection, through a real record ------------
with tempfile.TemporaryDirectory() as td:
    tmp = Path(td)
    src = ROOT / "data" / "standards" / "components" / "nDecane.dat"
    txt = src.read_text()
    #  Same component, liquid Cp switched to the correlation.  Everything the
    #  model needs (Tc, omega, ideal-gas Cp) stays where it already lives -- on
    #  the component -- so a run that produces a number proves the injection.
    txt2 = re.sub(r"liquidHeatCapacity\s*\{[^{}]*(\{[^{}]*\}[^{}]*)*\}",
                  "liquidHeatCapacity { model RowlinsonBondi; }", txt, count=1)
    if "RowlinsonBondi" not in txt2:
        failures.append("A7: could not rewrite nDecane's liquidHeatCapacity "
                        "block -- the record shape changed and this arm is "
                        "no longer testing the injection")
    else:
        cdir = tmp / "case" / "constant" / "components"
        cdir.mkdir(parents=True)
        (cdir / "nDecane.dat").write_text(txt2)
        (tmp / "case" / "system").mkdir(parents=True)
        (tmp / "case" / "constant" / "thermoPhysPropDict").write_text(
            "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
            "components ( nDecane );\nequilibrium\n{\n"
            "  formulation gammaPhi;\n"
            "  liquid { activityModel ideal; standardState pureLiquid; }\n"
            "  vapour { fugacityModel idealGas; }\n}\n")
        (tmp / "case" / "system" / "controlDict").write_text(
            "recordType controlDict;\napplication choupoProps;\n"
            "description \"injection arm\";\nverbosity 3;\n")
        (tmp / "case" / "system" / "propsDict").write_text(
            "operations\n(\n  { name p; type propertyPoint;"
            " state { T 400 K; P 1 bar; composition { nDecane 1.0; } }"
            " properties ( H_real ); }\n);\n")
        p = subprocess.run([str(PROPS), "."], cwd=str(tmp / "case"),
                           capture_output=True, text=True, timeout=900)
        out = p.stdout + p.stderr
        if p.returncode != 0:
            failures.append("A7: a component whose ONLY liquid-Cp route is "
                            "RowlinsonBondi did not run -- Tc/omega/Cp_ig are "
                            "not reaching the model from the component: "
                            + out.strip().splitlines()[-1][:200])

if failures:
    print("check_rowlinson_bondi: FAIL")
    for f in failures:
        print("  - " + f)
    sys.exit(1)

n_comp = len(per)
n_pt = sum(len(v) for v in per.values())
allp = [d for v in per.values() for d in v]
mean = sum(allp) / len(allp) if allp else 0.0
srt = sorted(allp)
med = srt[len(srt) // 2] if srt else 0.0
print("check_rowlinson_bondi: OK -- the departure reproduces Poling Eq. 6-8.4 "
      "from an independent transcription; the Tr >= 1 pole refuses by name "
      "rather than returning a large number; a missing ideal-gas Cp refuses "
      "naming the departure and both remedies; the window announces outside "
      "and stays quiet inside.  MEASURED against %d curated liquid-Cp "
      "components over %d points: AAD %.1f %%, median %.1f %% -- excellent "
      "for non-polar (neopentane, siloxanes, n-alkanes ~1 %%) and POOR for "
      "hydrogen-bonding (methanol, ethanol, water 30-70 %%), pinned at BOTH "
      "ends so neither a regression nor a comparison that stopped comparing "
      "passes.  NOT CHECKED: whether the correlation is good enough for any "
      "particular process (a sensitivity question, not a receipt), and the "
      "structural flag that could warn on an -OH molecule is NOT wired."
      % (n_comp, n_pt, mean, med))
