#!/usr/bin/env python3
"""electrolyte_span_arms -- the ELECTROLYTE arms of the pair-span gate
(EL-01 / EL-02 of docs/reviews/2026-11-12-electrolyte-models, 2026-11-12).

Called by check_regressed_pairs.py after arm (g) (a molecular pair used
outside its span is announced); runnable alone:

    bin/curate/electrolyte_span_arms.py        # exit 0 + one OK line, or 1

ARM (m)  AN eNRTL PAIR OFF ITS SPAN IS ANNOUNCED.  Every record under
         data/standards/parameters/eNRTL/ declares
         provenance.validity.temperature (the temperature of its data); NaCl
         asked for gamma/phi at 373.15 K by the package route prints exactly
         ONE `[pair-span] eNRTL pair Na-Cl:` line that says BELOW/ABOVE, names
         the 298.15/T scaling as the engine's own and not a fitted law, and
         lands in the result JSON's advisories (category validity); asked at
         298.15 K it prints none.
ARM (n)  THREE PITZER ROUTES, ONE LINE.  Na-SO4 (a pair with no temperature
         dependence) at 373.15 K through the pitzerActivity op, the package
         route (electrolyteActivity) and the pitzerHMW speciation route: each
         prints exactly one `[pair-span] Pitzer pair Na-SO4:` line, the three
         lines are IDENTICAL, each is in the advisories, and at 298.15 K none
         prints.
ARM (o)  THE FIT-GRADE SENTENCE READS THE RECORD.  A capped record that holds
         points out (eNRTL Na-SO4: 10 fitted, 3 held out) says so ("3 points
         held out") and does NOT say "nothing held out"; a capped record with
         `heldOut none;` (NRTL oCresol-pXylene) keeps the old sentence.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "choupoProps"
ENRTL_DIR = ROOT / "data" / "standards" / "parameters" / "eNRTL"

HEAD = ('application choupoProps;\ndescription "electrolyte span probe";\n'
        'verbosity 2;\n')


def _thermo(model, components, hmw=False):
    if hmw:
        return ("recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
                "components ( water );\naqueousProperties\n{\n"
                "    activityCoefficients { model PitzerHMW;"
                " referenceBasis aqueousMolality; }\n}\n")
    return ("recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
            f"components ( {components} );\n"
            "equilibrium\n{\n    formulation electrolyteGammaPhi;\n"
            f"    aqueous {{ activityModel {{ model {model}; }}"
            " compositionBasis molality; }\n"
            "    vapour { fugacityModel idealGas; }\n}\n"
            "caloric\n{\n    energyBasis elementsDatum;\n"
            "    aqueous { enthalpyRoute ionicReferencePlusExcess; }\n"
            "    vapour { enthalpyRoute idealGasCp; }\n}\n")


def run_case(tmp, name, thermo, ops):
    case = tmp / name
    (case / "system").mkdir(parents=True)
    (case / "constant").mkdir()
    (case / "system" / "controlDict").write_text(HEAD)
    (case / "system" / "propsDict").write_text("operations\n(\n" + ops + ");\n")
    (case / "constant" / "thermoPhysPropDict").write_text(thermo)
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(PROPS), "."], cwd=str(case), env=env,
                       capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def span_lines(out, tag):
    return [ln for ln in out.splitlines()
            if ln.startswith("[pair-span] " + tag)]


def advisories(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1)).get("advisories", [])
    except json.JSONDecodeError:
        return None


def _pkg_op(T, name="g"):
    return (f"    {{ name {name}; type electrolyteActivity; temperature {T};"
            " molality { from 1.0; to 1.0; n 1; }"
            f" output {{ file {name}.csv; }} }}\n")


def arm_m(tmp, fails):
    bad = []
    recs = sorted(ENRTL_DIR.glob("*.dat"))
    for f in recs:
        t = f.read_text()
        if not re.search(r"validity\s*\{[^}]*temperature\s*\{\s*min\s+[\d.]+\s*K?\s*;"
                         r"\s*max\s+[\d.]+\s*K?\s*;", t, re.S):
            bad.append(f.name)
    if bad:
        fails.append("arm (m): eNRTL record(s) that state no temperature "
                     f"validity: {', '.join(bad)}")
    rc, out = run_case(tmp, "m-hot", _thermo("eNRTL", "water NaCl"),
                       _pkg_op(373.15))
    if rc != 0:
        fails.append(f"arm (m): the 373.15 K probe exited {rc}: {out[-300:]}")
        return len(recs)
    lines = span_lines(out, "eNRTL pair Na-Cl:")
    if len(lines) != 1:
        fails.append(f"arm (m): {len(lines)} `[pair-span] eNRTL pair Na-Cl:` "
                     "line(s) at 373.15 K, the ruling is ONE per pair per run")
    else:
        for need in ("ABOVE its declared validity span", "298.15/T",
                     "engine's own simplification",
                     "NOT a fitted temperature dependence"):
            if need not in lines[0]:
                fails.append(f"arm (m): the eNRTL line lacks `{need}`: "
                             f"{lines[0][:200]}")
    adv = advisories(out)
    if adv is None or not any(a.get("locus") == "eNRTL pair 'Na-Cl'"
                              and a.get("category") == "validity" for a in adv):
        fails.append("arm (m): the eNRTL announcement is not in the result "
                     "JSON's advisories")
    rc2, out2 = run_case(tmp, "m-25", _thermo("eNRTL", "water NaCl"),
                         _pkg_op(298.15))
    if rc2 != 0 or "[pair-span]" in out2:
        fails.append("arm (m): asked at 298.15 K the run exited "
                     f"{rc2} or still printed a `[pair-span]` line")
    return len(recs)


def arm_n(tmp, fails):
    tag = "Pitzer pair Na-SO4:"
    hot, cold = 373.15, 298.15
    routes = {
        "pitzerActivity": (_thermo("Pitzer", "water Na2SO4"),
            "    { name r; type pitzerActivity; cation Na; anion SO4;"
            " temperature {T}; molality { from 1.0; to 1.0; n 1; }"
            " output { file r.csv; } }\n"),
        "package": (_thermo("Pitzer", "water Na2SO4"), "PKG"),
        "pitzerHMW": (_thermo(None, None, hmw=True),
            "    { name r; type speciate; temperature {T};"
            " analyticalTotals { Na 2.0 mol/kg; SO4 1.0 mol/kg; }"
            " pH 7.0; diagSpecies ( Na SO4 ); output { file r.csv; } }\n"),
    }
    texts = {}
    for route, (thermo, ops) in routes.items():
        for T in (hot, cold):
            o = _pkg_op(T) if ops == "PKG" else ops.replace("{T}", str(T))
            rc, out = run_case(tmp, f"n-{route}-{T:g}", thermo, o)
            if rc != 0:
                fails.append(f"arm (n) {route} at {T} K exited {rc} -- the "
                             f"arm cannot run, so it must not pass: {out[-300:]}")
                continue
            lines = span_lines(out, tag)
            if T == cold:
                if lines:
                    fails.append(f"arm (n) {route}: printed a `[pair-span]` "
                                 "line at 298.15 K, inside the 25 C span")
                continue
            if len(lines) != 1:
                fails.append(f"arm (n) {route}: {len(lines)} `[pair-span] "
                             f"{tag}` line(s) at 373.15 K, ONE is the ruling")
                continue
            texts[route] = lines[0]
            adv = advisories(out)
            if adv is None or not any(a.get("locus") == "Pitzer pair 'Na-SO4'"
                                      and a.get("category") == "validity"
                                      for a in adv):
                fails.append(f"arm (n) {route}: the announcement is not in "
                             "the result JSON's advisories")
    if len(set(texts.values())) > 1:
        fails.append("arm (n): the three routes print DIFFERENT lines: "
                     + " | ".join(f"{k}: {v[:120]}" for k, v in texts.items()))
    elif texts and "no temperature dependence of its own" not in \
            next(iter(texts.values())):
        fails.append("arm (n): the line does not say the record carries no "
                     "temperature dependence")
    return len(texts)


def arm_o(tmp, fails):
    """The fit-grade sentence with and without held-out points."""
    # (1) held-out block: eNRTL Na-SO4 (10 fitted, 3 held out)
    rc, out = run_case(tmp, "o-enrtl", _thermo("eNRTL", "water Na2SO4"),
                       _pkg_op(298.15))
    fg = [ln for ln in out.splitlines() if ln.startswith("[fit-grade] ")
          and "Na-SO4" in ln]
    if rc != 0 or not fg:
        fails.append(f"arm (o): no `[fit-grade]` line for eNRTL Na-SO4 "
                     f"(exit {rc}): {out[-300:]}")
    else:
        if "3 points held out" not in fg[0]:
            fails.append("arm (o): eNRTL Na-SO4 holds 3 points out and the "
                         f"sentence does not say so: {fg[0][:260]}")
        if "nothing held out" in fg[0]:
            fails.append("arm (o): the sentence says `nothing held out` of a "
                         "record that held 3 points out")
    # (2) `heldOut none;`: an NRTL record keeps the old sentence
    case = tmp / "o-nrtl"
    (case / "system").mkdir(parents=True)
    (case / "constant").mkdir()
    (case / "system" / "controlDict").write_text(HEAD)
    (case / "system" / "propsDict").write_text(
        "operations\n(\n    { name g; type activityCoefficients;"
        " temperature 298.15; composition { oCresol 0.5; pXylene 0.5; } }\n);\n")
    (case / "constant" / "thermoPhysPropDict").write_text(
        "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
        "components ( oCresol pXylene );\nequilibrium\n{\n"
        "    formulation gammaPhi;\n"
        "    liquid { activityModel { model NRTL; } standardState pureLiquid; }\n"
        "    vapour { fugacityModel idealGas; }\n}\n")
    p = subprocess.run([str(PROPS), "."], cwd=str(case),
                       env=dict(os.environ, CHOUPO_HOME=str(ROOT)),
                       capture_output=True, text=True, timeout=300)
    fg2 = [ln for ln in (p.stdout + p.stderr).splitlines()
           if ln.startswith("[fit-grade] ") and "oCresol" in ln]
    if p.returncode != 0 or not fg2:
        fails.append("arm (o): no `[fit-grade]` line for NRTL oCresol-pXylene "
                     f"(exit {p.returncode})")
    elif "with nothing held out" not in fg2[0]:
        fails.append("arm (o): a record with `heldOut none;` lost the "
                     f"`nothing held out` sentence: {fg2[0][:260]}")
    return 2


def run_arms(tmp, fails):
    """Returns (eNRTL records held, Pitzer routes compared, grade sentences)."""
    return arm_m(tmp, fails), arm_n(tmp, fails), arm_o(tmp, fails)


def main():
    if not PROPS.exists():
        print("electrolyte_span_arms: FAILED -- choupoProps is not built")
        return 1
    fails = []
    tmp = Path(tempfile.mkdtemp(prefix="choupo-elspan-"))
    try:
        n_rec, n_route, n_grade = run_arms(tmp, fails)
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
    if fails:
        print("electrolyte_span_arms: FAILED")
        for f in fails:
            print("  - " + f)
        return 1
    print(f"electrolyte_span_arms: OK -- {n_rec} eNRTL record(s) declare their "
          "temperature validity and an eNRTL pair off it is announced once "
          f"(arm m); {n_route} Pitzer routes print the same line for a pair "
          "with no temperature dependence (arm n); the fit-grade sentence "
          "reads the record's held-out points (arm o)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
