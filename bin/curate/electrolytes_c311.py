#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""THE ELECTROLYTE CAMPAIGN (DEV.md 4c C311): Pitzer and eNRTL, salt by salt,
fitted to the NBS/NIST-evaluated mean activity and osmotic coefficients.

    electrolytes_c311.py build <transcription.json>   write the cases
    electrolytes_c311.py run [--jobs N] [stem ...]    run them (proposals)
    electrolytes_c311.py promote [stem ...]           write the records
    electrolytes_c311.py table                        one line per salt

WHERE THE NUMBERS COME FROM.  Four evaluations, each the primary source of
the RECOMMENDED values it tabulates (the evaluation is the recommendation;
the measurements behind it are its own references):

  HW1972  W. J. Hamer and Y.-C. Wu, J. Phys. Chem. Ref. Data 1 (1972) 1047,
          doi:10.1063/1.3253108 -- uni-univalent electrolytes, 25 C.
  GN1978  R. N. Goldberg and R. L. Nuttall, J. Phys. Chem. Ref. Data 7
          (1978) 263, doi:10.1063/1.555569 -- the alkaline-earth halides.
  G1981a  R. N. Goldberg, J. Phys. Chem. Ref. Data 10 (1981) 1,
          doi:10.1063/1.555639 -- bi-univalent compounds of zinc, cadmium.
  G1981b  R. N. Goldberg, J. Phys. Chem. Ref. Data 10 (1981) 671,
          doi:10.1063/1.555646 -- thirty-six uni-bivalent electrolytes.

The transcription (`build`'s argument) is read ONCE, to write each case's
`constant/experiments/<stem>.dat`; from then on that file is the one home of
the numbers, with its table, page and method of transcription in its header.

THE RULES, stated once, here:

  WINDOW   points from 0.1 mol/kg up to an ionic strength of 6 mol/kg (and
           never past a row the source marks saturated, supersaturated or
           taken from another author).  Below 0.1 the Debye-Hueckel term
           decides gamma and the parameters are not identifiable; above
           I = 6 the three-parameter Pitzer form is past the range its
           authors fitted it to.  The record's validity is that window, at
           298.15 K.
  HELD OUT every 4th point (0-based index % 4 == 3), interleaved, never the
           first or the last row, so the window is the fit's.
           They are points of the SAME evaluation: they show the model does
           not merely pass through what it saw, and they cannot contradict
           the evaluation.  They are recorded beside the grade, never in its
           place, and never called a validation.
  MODELS   Pitzer (HMW form): beta0, beta1, Cphi; alpha1 2.0, alpha2 12, b
           1.2; beta2 only for a 2:2 salt (alpha1 1.4).  eNRTL: tau_m_ca,
           tau_ca_m; alpha 0.2 fixed (the project's eNRTL convention, Chen &
           Evans 1986).  The closed forms are the engine's own
           (PitzerSingleSalt.H, ENRTLSingleSalt.H) through `electrolyteFit`.
  GRADE    the largest relative error, gamma_pm or phi, over the fitted
           points: clean <= 2 % < warning <= 5 % < severe <= 10 % < refused.
           Why these limits: the evaluations quote standard deviations of
           0.1-0.5 % on gamma at 25 C, so a model off by more than 2 %
           somewhere is visibly worse than its evidence; 5 % is the bound an
           engineering estimate still uses; past 10 % the model's shape does
           not describe the salt.
  CAP      (DEV.md 4c C300 rule 2) every point is at ONE temperature, from ONE
           evaluation: an in-sample clean is capped at warning, with
           `fitGradeCap ( singleTemperature singleLaboratory );`.  The
           interleaved held-out set does NOT lift the cap: it shares its
           source's identity (the engine's evidence contract refuses one DOI
           in both roles, EvidencePartition R3), so it cannot contradict it.
  PROMOTE  clean or warning (in-sample, before the cap), into
           data/standards/parameters/Pitzer/pairs/<c>-<a>.dat or
           parameters/eNRTL/<c>-<a>.dat -- unless the catalogue already holds
           a record for that salt (it is kept; this fit stays in its case as
           a comparison), or a shipped case would see the new record and its
           golden would move (listed in HELD_FOR_GOLDENS with the case).
           severe: the record stays in its case's constant/ only.  refused:
           no record anywhere.
"""
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import curation_roots  # noqa: E402

ROOT = curation_roots.ROOT
CASES = curation_roots.ELECTROLYTES
STD = ROOT / "data" / "standards" / "parameters"
PROPS = ROOT / "choupoProps"

LIMITS = (2, 5, 10)
HELD_EVERY, HELD_OFFSET = 4, 3
IMAX = 6.0
TODAY = "2026-11-11"

SOURCES = {
    "HW1972": dict(
        cite="W. J. Hamer and Y.-C. Wu, Osmotic Coefficients and Mean Activity"
             " Coefficients of Uni-univalent Electrolytes in Water at 25 C,"
             " J. Phys. Chem. Ref. Data 1 (1972) 1047-1100",
        doi="10.1063/1.3253108", pdf="nist-jpcrd-1.3253108.pdf",
        what="Table {table}, p. {page} (m, phi, gamma), the recommended values"),
    "GN1978": dict(
        cite="R. N. Goldberg and R. L. Nuttall, Evaluated Activity and Osmotic"
             " Coefficients for Aqueous Solutions: The Alkaline Earth Metal"
             " Halides, J. Phys. Chem. Ref. Data 7 (1978) 263-310",
        doi="10.1063/1.555569", pdf="nist-jpcrd-1.555569.pdf",
        what="Table {table}, p. {page} (m, gamma, phi, a_w), the recommended values"),
    "G1981a": dict(
        cite="R. N. Goldberg, Evaluated Activity and Osmotic Coefficients for"
             " Aqueous Solutions: Bi-Univalent Compounds of Zinc, Cadmium, and"
             " Ethylene Bis(Trimethylammonium) Chloride and Iodide, J. Phys."
             " Chem. Ref. Data 10 (1981) 1-55",
        doi="10.1063/1.555639", pdf="nist-jpcrd-1.555639.pdf",
        what="the {table} table of recommended values, p. {page} (m, gamma, phi, a_w)"),
    "G1981b": dict(
        cite="R. N. Goldberg, Evaluated Activity and Osmotic Coefficients for"
             " Aqueous Solutions: Thirty-Six Uni-Bivalent Electrolytes, J. Phys."
             " Chem. Ref. Data 10 (1981) 671-764",
        doi="10.1063/1.555646", pdf="nist-jpcrd-1.555646.pdf",
        what="the {table} table of recommended values, p. {page} (m, gamma, phi, a_w)"),
}

#  A new Pitzer record is enumerated by the multi-ion engine (PitzerHMW reads
#  EVERY pair of the ions a case carries).  A salt whose new record a shipped
#  case would read is held here, with the case, until that case's golden is
#  re-recorded by a decision -- the campaign moves no golden.
HELD_FOR_GOLDENS = {}

CHARGE = {}


def charge(ion):
    if ion not in CHARGE:
        txt = (ROOT / "data/standards/species" / f"{ion}.dat").read_text()
        CHARGE[ion] = int(re.search(r"^charge\s+([+-]?\d+)\s*;", txt, re.M).group(1))
    return CHARGE[ion]


def stoich(c, a):
    zc, za = charge(c), -charge(a)
    from math import gcd
    g = gcd(zc, za)
    return zc, za, za // g, zc // g      # zc, |za|, nu_c, nu_a


def ionic_strength(c, a, m):
    zc, za, nc, na = stoich(c, a)
    return 0.5 * (nc * zc * zc + na * za * za) * m


HEADER = """/*--------------------------------*- Choupo -*--------------------------------*\\
{body}
\\*-----------------------------------------------------------------------------*/
"""


def _case_files(stem, ent):
    c, a = stem.split("-")
    src = SOURCES[ent["src"]]
    zc, za, nc, na = stoich(c, a)
    rows = [r for r in ent["rows"]
            if r[0] >= 0.1 - 1e-12 and ionic_strength(c, a, r[0]) <= IMAX + 1e-9]
    where = src["what"].format(table=ent.get("table"), page=ent.get("page"))
    how = ent["how"]
    ds = []
    ds.append(HEADER.format(body=(
        f"  {stem}: mean ionic activity coefficient gamma_pm and osmotic coefficient\n"
        f"  phi of the salt ({c}){nc}({a}){na} in water at 298.15 K -- the EVALUATED\n"
        f"  (recommended) values of\n"
        f"    {src['cite']},\n"
        f"    doi:{src['doi']}, {where}.\n"
        f"  The evaluation is the primary source of these recommended values (its\n"
        f"  own references are the measurements behind them).\n"
        f"  TRANSCRIBED 2026-11-11 (DEV.md 4c C311) from the NIST reprint\n"
        f"  ({src['pdf']}): {how}.\n"
        f"  Rows kept: 0.1 mol/kg up to ionic strength {IMAX:g} mol/kg; a row the\n"
        f"  source marks saturated, supersaturated or from another author is not\n"
        f"  here.  Every 4th row (0-based index % 4 == 3, never the first or the\n"
        f"  last) is HELD OUT by the case (system/propsDict), not by this file.")))
    ds.append("provenance\n{\n"
              f"    source        \"{src['cite']}\";\n"
              f"    doi           \"{src['doi']}\";\n"
              f"    location      \"{where}\";\n"
              "    reviewStatus  transcribed;\n"
              "}\n\n")
    ds.append("temperature 298.15;   // K, every row\n\n")
    ds.append("columns\n(\n    { name m;     unit mol/kg; }\n"
              "    { name gamma; unit -; }       // gamma_pm, molality scale\n"
              "    { name phi;   unit -; }       // molal osmotic coefficient\n);\n\n")
    ds.append("data\n(\n")
    for r in rows:
        m, g, p = r[0], r[1], r[2]
        ds.append(f"    {m:<7g} {g:<8g} {p:<8g}\n")
    ds.append(");\n")

    ops = []
    for model, label in (("pitzer", "Pitzer"), ("eNRTL", "eNRTL")):
        blk = [f"    {{\n        name      fit_{model};\n        type      electrolyteFit;\n",
               f"        cation    {c};   anion {a};\n",
               f"        model     {model};\n",
               f"        dataset   \"constant/experiments/{stem}.dat\";\n",
               f"        heldOut   {{ every {HELD_EVERY}; offset {HELD_OFFSET}; }}\n"]
        if model == "pitzer":
            two2 = (zc == 2 and za == 2)
            blk.append("        pitzer    { alpha1 %s; alpha2 12.0; fitBeta2 %s; }\n"
                       % ("1.4" if two2 else "2.0", "true" if two2 else "false"))
        else:
            blk.append("        eNRTL     { alpha 0.2; }\n")
        blk.append(f"        grade     {{ limits_pct ( {LIMITS[0]} {LIMITS[1]} {LIMITS[2]} ); }}\n")
        blk.append(f"        proposal  {{ file \"{stem}.{model}.proposal.dat\"; }}\n    }}\n")
        ops.append("".join(blk))
    props = HEADER.format(body=(
        f"  {stem} -- the curation case of the salt ({c}){nc}({a}){na} (DEV.md 4c C311).\n"
        f"  Fits Pitzer and eNRTL to its evaluated gamma_pm and phi at 298.15 K\n"
        f"  (constant/experiments/{stem}.dat) and writes the two proposals that\n"
        f"  bin/curate/check_regressed_electrolytes.py holds the catalogue records\n"
        f"  equal to.  Written by bin/curate/electrolytes_c311.py; the rules\n"
        f"  (window, held-out points, grade, cap, promotion) are stated there.")) \
        + "\noperations\n(\n" + "".join(ops) + ");\n"
    control = HEADER.format(body=f"  {stem} -- curation case (DEV.md 4c C311).") + (
        "\napplication   choupoProps;\n"
        f"description   \"{stem}: Pitzer and eNRTL fitted to evaluated gamma_pm and phi, 25 C\";\n"
        "verbosity     2;\n")
    thermo = HEADER.format(body=f"  {stem} -- the solvent; the ions are read by name from species/.") + (
        "\nrecordType    thermophysicalPropertySystem;\nschemaVersion 2;\n\n"
        "components ( water );\n\nequilibrium\n{\n    formulation gammaPhi;\n\n"
        "    liquid\n    {\n        activityModel ideal;\n        standardState pureLiquid;\n    }\n\n"
        "    vapour\n    {\n        fugacityModel idealGas;\n    }\n}\n")
    return {
        f"constant/experiments/{stem}.dat": "".join(ds),
        "system/propsDict": props,
        "system/controlDict": control,
        "constant/thermoPhysPropDict": thermo,
        f"{stem}.cho": "",
    }, rows


def cmd_build(args):
    tr = json.load(open(args[0]))
    for stem, ent in sorted(tr.items()):
        if stem.startswith("_"):
            continue
        files, rows = _case_files(stem, ent)
        case = CASES / stem
        for rel, txt in files.items():
            p = case / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(txt)
        print(f"  {stem:10s} {len(rows):3d} rows  {rows[0][0]:g}-{rows[-1][0]:g} mol/kg")


def stems(args):
    if args:
        return args
    return sorted(p.name for p in CASES.iterdir() if (p / "system/controlDict").is_file())


def run_one(stem):
    case = CASES / stem
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))   # this checkout's catalogue, never the profile's
    p = subprocess.run([str(PROPS), "."], cwd=str(case), env=env,
                       capture_output=True, text=True)
    (case / "log.choupoProps").write_text(p.stdout + p.stderr)
    return stem, p.returncode


def cmd_run(args):
    jobs = 3
    if args and args[0] == "--jobs":
        jobs = int(args[1]); args = args[2:]
    bad = 0
    with ThreadPoolExecutor(max_workers=jobs) as ex:
        for stem, rc in ex.map(run_one, stems(args)):
            print(f"  {stem:10s} exit {rc}")
            bad += rc != 0
    return 1 if bad else 0


def read_proposal(stem, model):
    p = CASES / stem / f"{stem}.{model}.proposal.dat"
    txt = p.read_text()
    out = {"parameters": {}, "fit": {}}
    for blk in ("parameters", "fit"):
        body = re.search(blk + r"\n\{\n(.*?)\n\}", txt, re.S).group(1)
        for k, v in re.findall(r"^\s*(\w+)\s+([^;]+);", body, re.M):
            try:
                out[blk][k] = float(v)
            except ValueError:
                out[blk][k] = v
    return out


def dataset_identity(stem):
    """(citation, doi, location) from the case's own dataset file -- the one
    home of where its numbers came from."""
    txt = (CASES / stem / "constant" / "experiments" / f"{stem}.dat").read_text()
    get = lambda k: re.search(r'^\s*' + k + r'\s+"([^"]*)"\s*;', txt, re.M).group(1)
    return get("source"), get("doi"), get("location")


def record_text(stem, model, prop, where):
    c, a = stem.split("-")
    cite, doi, loc = dataset_identity(stem)
    src = {"cite": cite, "doi": doi}
    zc, za, nc, na = stoich(c, a)
    f = prop["fit"]; pr = prop["parameters"]
    g_in = f["gradeInSample"]
    capped = g_in == "clean"
    grade = "warning" if capped else g_in
    ho = f.get("gradeHeldOut", "none")
    if model == "pitzer":
        rtype, title = "electrolytePairParameters", "Pitzer binary ion-interaction parameters"
        role = ("the beta0 / beta1 / Cphi set (alpha1 %g, b 1.2) of the Pitzer virial\n"
                "  expansion, consumed by the pitzer (single-salt) and pitzerHMW\n"
                "  (multi-ion) activity engines" % pr["alpha1"])
        params = ("    beta0   %.10g;\n    beta1   %.10g;\n    beta2   %.10g;\n"
                  "    Cphi    %.10g;\n    alpha1  %g;\n    alpha2  %g;\n"
                  % (pr["beta0"], pr["beta1"], pr.get("beta2", 0.0), pr["Cphi"],
                     pr["alpha1"], pr["alpha2"]))
        method = "electrolyteFit(pitzer): ln gamma_pm and phi, equal weight, Levenberg-Marquardt"
    else:
        rtype, title = "electrolyteNRTLParameters", "Electrolyte-NRTL binary energy parameters"
        role = ("the water / (%s)(%s) pair taus of the Chen local-composition model,\n"
                "  alpha 0.2 fixed, consumed by the eNRTL activity engine" % (c, a))
        params = ("    tau_m_ca %.10g;\n    tau_ca_m %.10g;\n    alpha    %g;\n"
                  % (pr["tau_m_ca"], pr["tau_ca_m"], pr["alpha"]))
        method = "electrolyteFit(eNRTL): ln gamma_pm and phi, equal weight, Levenberg-Marquardt from 4 starts"
    capline = ("    fitGradeCap   ( singleTemperature singleLaboratory );   // DEV.md 4c C300 rule 2: in-sample clean, capped -- one temperature, one evaluation\n"
               if capped else "")
    hdr = HEADER.format(body=(
        f"  {title} --- ({c}){nc}({a}){na} in water.\n"
        f"  Role: {role}.\n"
        f"  REGRESSED BY CHOUPO (DEV.md 4c C311) to the evaluated gamma_pm and phi\n"
        f"  of {src['cite']}, doi:{src['doi']} ({loc}) -- the evaluation is the\n"
        f"  primary source of those recommended values.  The PARAMETERS are\n"
        f"  Choupo's own work.  Window: {f['molalityMin']:g}-{f['molalityMax']:g} mol/kg at 298.15 K\n"
        f"  ({int(f['nFit'])} points fitted, {int(f['nHeldOut'])} interleaved points held out).\n"
        f"  Outside it the record is an extrapolation; off 25 C it carries no\n"
        f"  temperature extension of its own.\n"
        f"  GRADE: in-sample max error {f['inSampleMax_pct']:.3g} % -> {g_in}"
        + (" (capped at warning: one temperature, one evaluation)" if capped else "")
        + f";\n  the held-out points {f.get('heldOutMax_pct', float('nan')):.3g} % ({ho}).  No human has\n"
        f"  reviewed it.  REPRODUCE: run {where}; its proposal is held equal to this\n"
        f"  record by bin/curate/check_regressed_electrolytes.py."))
    return hdr + f"""recordType {rtype};
schemaVersion 1;

model {model};

pair {{ cation {c}; anion {a}; }}

parameters
{{
{params}}}

source "REGRESSED by Choupo (C311) to {src['cite']}, doi:{src['doi']}, {loc}";

provenance
{{
    origin        regressed;
    method        "{method}";
    methodVersion "choupoProps Choupo-dev";
    fittedInCase  "{where}";
    reviewStatus  autoPromoted;
    fitGrade      {grade};   // DEV.md 4c C311: max relative error of gamma_pm or phi over the fitted points, graded 2 / 5 / 10 %
    fitGradeBasis inSample;   // DEV.md 4c C300 rule 1: the residual of the points it was fitted to
{capline}    fitGradeMaxRelativeError_pct {f['inSampleMax_pct']:.4f};
    promotedBy    "bin/curate/electrolytes_c311.py promote";
    promotedDate  "{TODAY}";
    reviewReason  "regressed by bin/curate/electrolytes_c311.py from a hand-checked transcription of an evaluated table; not yet read back by a human";
    reuse         "Choupo's own regression; the evaluated values belong to the cited compilation";
    fitDate       "{TODAY}";
    evidence
    (
        {{
            role      fit;
            dataset   "constant/experiments/{stem}.dat";
            doi       "{src['doi']}";
            provenance evaluated;
        }}
    );
    inSample
    {{
        gammaAAD_pct {f['inSampleGammaAAD_pct']:.4f};
        phiAAD_pct   {f['inSamplePhiAAD_pct']:.4f};
        max_pct      {f['inSampleMax_pct']:.4f};
        nPoints      {int(f['nFit'])};
    }}
    heldOut
    {{
        kind         interleavedSameSource;   // every 4th point of the same evaluation: NOT a validation
        gammaAAD_pct {f.get('heldOutGammaAAD_pct', 0.0):.4f};
        phiAAD_pct   {f.get('heldOutPhiAAD_pct', 0.0):.4f};
        max_pct      {f.get('heldOutMax_pct', 0.0):.4f};
        nPoints      {int(f['nHeldOut'])};
        grade        {ho};
    }}
    validity
    {{
        temperature {{ min 298.15 K; max 298.15 K; }}
        molality    {{ min {f['molalityMin']:g}; max {f['molalityMax']:g}; }}   // mol/kg
        note        "the span of the fitted evaluated values; outside it the salt is an extrapolation";
    }}
    review
    {{
        by none;
    }}
}}
"""


def cmd_promote(args):
    rows = []
    for stem in stems(args):
        where = f"data/curation/electrolytes/{stem}"
        c, a = stem.split("-")
        for model, sub in (("pitzer", "Pitzer/pairs"), ("eNRTL", "eNRTL")):
            prop = read_proposal(stem, model)
            g = prop["fit"]["gradeInSample"]
            std = STD / sub / f"{stem}.dat"
            local = CASES / stem / "constant" / "parameters" / sub / f"{stem}.dat"
            exists = std.is_file() and "C311" not in std.read_text()
            if exists:
                state = "existing record kept"
            elif g == "refused":
                state = "refused"
            elif g == "severe":
                state = "severe (case only)"
            elif model == "pitzer" and stem in HELD_FOR_GOLDENS:
                state = "held: " + HELD_FOR_GOLDENS[stem]
            else:
                state = "promoted"
            txt = record_text(stem, model, prop, where) if g != "refused" else None
            if state == "promoted":
                std.write_text(txt)
                if local.exists():
                    local.unlink()
            elif state.startswith("severe") or state.startswith("held"):
                local.parent.mkdir(parents=True, exist_ok=True)
                local.write_text(txt)
                if std.is_file() and "C311" in std.read_text():
                    std.unlink()
            rows.append((stem, model, g, prop["fit"].get("gradeHeldOut", "-"),
                         prop["fit"]["inSampleMax_pct"], prop["fit"].get("heldOutMax_pct", 0),
                         prop["fit"]["molalityMin"], prop["fit"]["molalityMax"], state))
    for r in rows:
        print("  %-10s %-6s in %-8s held %-8s max %6.2f %% held %6.2f %%  m %g-%g  %s" % r)


def main():
    if len(sys.argv) < 2:
        print(__doc__); return 2
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "build":
        return cmd_build(args)
    if cmd == "run":
        return cmd_run(args)
    if cmd == "promote":
        return cmd_promote(args)
    print(__doc__); return 2


if __name__ == "__main__":
    sys.exit(main() or 0)
