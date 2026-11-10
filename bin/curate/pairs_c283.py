#!/usr/bin/env python3
"""pairs_c283 -- `bin/choupo-curate pair` under DEV.md 4c C283 (amended) and C284.

    bin/choupo-curate pair A B [--plan] [--declare-only] [--resume] [--no-commit]
    bin/choupo-curate pair A B --promote
    bin/choupo-curate pairs --list [--top N]          the ranked candidates, by class
    bin/choupo-curate pairs --declare [--top N]       write every declaration (no fit)
    bin/choupo-curate pairs --run [--top N]           fit every declared case
    bin/choupo-curate pairs --promote                 promote every accepted case
    bin/choupo-curate pair A B --rule c282 ...        the C282 pilot chain, unchanged

This module is loaded by bin/choupo-curate for its `pair` and `pairs`
subcommands; every helper it uses (identity, extraction, fetch, seal, the
record header) is that tool's, imported, so the two chains cannot read one
article two ways.  What it changes is the RULE, and only the rule, each item
a decision already taken:

  C284 (Vitor, 2026-11-10: "os componentes tem classificacoes e os binarios
  so se devem fazer para compostos que os aceitem").  An NRTL pair is fitted
  only when BOTH components are volatile molecular liquids, read from the
  component RECORD, never from a name: no `role nonvolatile;`, no `role
  solute;` (a Henry solute), no `dissociatesTo` (an electrolyte), no declared
  charge (an ion), no solid (`referenceState pureSolid` or `solidPhases {}`),
  a `vaporPressure {}` model present, and every measured temperature below
  each component's own Tc.  Any other pair is REFUSED BY NAME with its class.
  A component whose vapour pressure is still `model AmbroseWalton` is NOT
  refused by class: its pair waits for C281's refit (a pair regressed on an
  estimated curve would absorb that curve's error and break when it is
  replaced), and is listed as waiting -- the C282 pilot's own filter.

  C283 amended (Vitor: "Eu usaria os dados dos laboratorios todos!
  Eventualmente descarto blatant outliers!").  EVERY usable laboratory's
  bubble-temperature series is fitted -- no study is held out, and the C16
  one-study-fit / other-study-held-out partition and its uncertainty band are
  RETIRED as the acceptance test.  The objective is `twoStage` (least squares,
  then minimax; temperature absolute, in K) through fitParameters' own
  `objective {}` home.  After the least-squares stage a point whose |T_model -
  T| exceeds OUTLIER_K = 3 K is DISCARDED BY NAME: written into the case as
  `discard ( <row> ... );` on its evidence entry (the engine skips those rows
  and announces them), listed with DOI, row, x, P, T and the residual in the
  case header, and the fit is repeated without them.  ACCEPTED when the
  largest |T_model - T| over the kept points is below ACCEPT_K = 1 K.  (C283's
  5 % relative clause judges composition; a T_bubble fit has no composition
  residual, so only the temperature clause applies, and the declaration says
  so.)  The record carries the verdict in a `curation {}` block; the engine's
  `validation {}` block states, truthfully, that nothing was held out.

  Promotion keeps C282's: autoPromoted, humanReviewed false, promotedBy, the
  DOIs and sha256 sums, `fittedInCase`; ONLY an accepted fit that predicts ONE
  liquid across its validity span (check_regressed_pairs arm f) is promoted.
  No measured series in the tree (constant/archiveDatasets + fetch).
"""
import importlib.machinery
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_loader = importlib.machinery.SourceFileLoader("choupo_curate", str(ROOT / "bin" / "choupo-curate"))
_spec = importlib.util.spec_from_loader("choupo_curate", _loader)
cc = importlib.util.module_from_spec(_spec)
_loader.exec_module(cc)
crp = cc.crp

OUTLIER_K = 3.0          # C283 amended: three times the band, in temperature 3 K
ACCEPT_K = 1.0           # C283: the maximum absolute error in T, kelvin
FIRST_NUMBER = 100       # C284 cases start at curate100 (the vp cases own < 100)
RULE = "DEV.md 4c C283 (amended) + C284"
MARK = "THE RULE (DEV.md 4c C283 amended, C284)"
COMP = ROOT / "data" / "standards" / "components"


#  Components ARCHIVED by a coordinator's ruling: no pair containing one is
#  fitted, promoted or started (DEV.md 4c, the coordinator session,
#  2026-11-10: acetic acid is archived this month -- its vapour dimerises).
ARCHIVED = {"aceticAcid": "acetic acid archived (DEV.md 4c)"}


class Refused(Exception):
    pass


def refuse(msg):
    raise Refused(msg)


# --------------------------------------------------------------------------
#  C284: the class of a component, from its RECORD
# --------------------------------------------------------------------------
def _top_level(text):
    t = crp.strip_comments(text)
    out, d = [], 0
    for ch in t:
        if ch == "{":
            d += 1
        elif ch == "}":
            d -= 1
        elif d == 0:
            out.append(ch)
    return "".join(out)


def component_class(comp):
    """(class word, Tc or None, vapour-pressure model).  class 'volatileLiquid'
    is the one that accepts an activity-coefficient pair."""
    p = COMP / f"{comp}.dat"
    if not p.exists():
        return "notInCatalogue", None, None
    raw = p.read_text(errors="replace")
    s, top = crp.strip_comments(raw), _top_level(raw)
    role = crp.word(top, "role")
    vp = crp.block(s, "vaporPressure")
    vpm = crp.word(vp, "model") if vp is not None else None
    Tc = crp.num(top, "Tc")
    if role == "nonvolatile":
        return "nonvolatile (role nonvolatile)", Tc, vpm
    if role == "solute":
        return "Henry solute (role solute)", Tc, vpm
    if re.search(r"(^|\s)dissociatesTo\s*\{", s):
        return "electrolyte (dissociatesTo)", Tc, vpm
    if re.search(r"(^|\s)(charge|z)\s+[-+]?\d", top):
        return "ion (a declared charge)", Tc, vpm
    if re.search(r"referenceState\s+pureSolid", s) or re.search(r"(^|\s)solidPhases\s*\{", s):
        return "solid (referenceState pureSolid / solidPhases)", Tc, vpm
    if vp is None:
        return "no vapour pressure (no vaporPressure {} model)", Tc, vpm
    if Tc is None:
        return "no critical temperature (Tc) in the record", Tc, vpm
    return "volatileLiquid", Tc, vpm


# --------------------------------------------------------------------------
#  the candidates
# --------------------------------------------------------------------------
def candidates(pmax=110.0):
    """Every archive pair of two catalogue components with an isobaric
    bubble-T block at or below pmax, classified.  Ranked by independent
    studies (articles with a declared uncertainty), then points."""
    rows = json.loads((cc.cache_root() / "vleIndex.json").read_text())["blocks"]
    pairs = {}
    for r in rows:
        if r["geometry"] != "bubbleT" or not r["P_kPa"] or r["P_kPa"][1] > pmax:
            continue
        if len(r["compounds"]) != 2 or any(not c.get("component") for c in r["compounds"]):
            continue
        k = tuple(sorted(c["component"] for c in r["compounds"]))
        if k[0] == k[1]:
            continue
        pairs.setdefault(k, []).append(r)
    out = []
    for k, rs in pairs.items():
        ud = [r for r in rs if r["uncertaintyDeclared"]]
        e = {"pair": k, "studies": len({r["doi"] for r in ud}),
             "points": sum(r["points"] for r in ud), "Tmax": max(r["T_K"][1] for r in rs),
             "status": "candidate", "why": ""}
        have = cc.existing_records(*k)
        arch = [ARCHIVED[c] for c in k if c in ARCHIVED]
        if arch:
            e["status"], e["why"] = "excluded", arch[0]
        elif have:
            e["status"], e["why"] = "present", ", ".join(have)
        else:
            for c in k:
                cl, Tc, vpm = component_class(c)
                if cl != "volatileLiquid":
                    e["status"], e["why"] = "refusedByClass", f"{c}: {cl}"
                    break
                if e["Tmax"] >= Tc:
                    e["status"], e["why"] = ("refusedByClass",
                                             f"{c}: supercritical in the data (T up to "
                                             f"{e['Tmax']:g} K, Tc {Tc:g} K)")
                    break
            else:
                aw = [c for c in k if component_class(c)[2] == "AmbroseWalton"]
                if aw:
                    e["status"], e["why"] = ("waitsOnC281", ", ".join(aw) +
                                             ": vapour pressure still model AmbroseWalton")
                elif not ud:
                    e["status"], e["why"] = "noUncertainty", "no block declares an uncertainty"
        out.append(e)
    out.sort(key=lambda e: (-e["studies"], -e["points"], e["pair"]))
    return out


# --------------------------------------------------------------------------
#  the plan: identity, class, studies (no partition, no band)
# --------------------------------------------------------------------------
def plan(a, b, pmax, work):
    try:
        ca, cb = cc.identity(a), cc.identity(b)
    except SystemExit:
        refuse(f"identity: {a} or {b} does not join the archive by InChIKey")
    a, b = ca[0], cb[0]
    if a == b:
        refuse("a pair needs two different components")
    for c in (a, b):
        if c in ARCHIVED:
            refuse("EXCLUDED: " + ARCHIVED[c])
    for c in (a, b):
        cl, Tc, vpm = component_class(c)
        if cl != "volatileLiquid":
            refuse(f"CLASS: {c} is {cl} -- an NRTL pair is fitted only between two "
                   "volatile molecular liquids (DEV.md 4c C284)")
        if vpm == "AmbroseWalton":
            refuse(f"WAITS ON C281: {c}'s vapour pressure is still `model "
                   "AmbroseWalton`, an estimate; a pair fitted on it would absorb its "
                   "error and break when C281 replaces it")
    have = cc.existing_records(a, b)
    if have:
        refuse(f"PRESENT: the pair {a} + {b} already has a catalogue record: "
               f"{', '.join(have)} -- never overwritten")
    blocks = cc.blocks_for((ca[2], cb[2]), pmax)
    if not blocks:
        refuse(f"no isobaric bubble-temperature block for {a} + {b} at or below "
               f"{pmax} kPa in the archive index")
    ext = work / "extracts"
    ext.mkdir(parents=True, exist_ok=True)
    studies, aside = [], []
    for r in blocks:
        xml = cc.cache_root() / r["file"]
        tag = f"doi {r['doi']} block {r['block']}"
        if not r["uncertaintyDeclared"]:
            aside.append((tag, "declares no uncertainty"))
            continue
        d = work / f"b{len(studies) + len(aside)}"
        path, why = cc.extract(xml, r["block"], d)
        if path is None:
            aside.append((tag, "extract-vle refused it: " + why))
            continue
        ds = cc.read_dataset(path)
        if ds["U"] is None:
            aside.append((tag, "its uncertainty is partial or not one per point"))
            continue
        if ds["n"] < cc.MIN_INTERIOR:
            aside.append((tag, f"only {ds['n']} interior point(s) (< {cc.MIN_INTERIOR})"))
            continue
        if any(s["doi"] == r["doi"] for s in studies):
            aside.append((tag, "a second block of the same article (one block per "
                          "study, the C282 extraction rule)"))
            continue
        studies.append({"doi": r["doi"], "block": r["block"], "file": r["file"],
                        "xml": xml, "path": path, "authors": r["authors"],
                        "year": r.get("year"), "xOf": None, **ds})
    if not studies:
        refuse(f"NO USABLE STUDY for {a} + {b}: " +
               "; ".join(f"{t}: {w}" for t, w in aside))
    studies.sort(key=lambda s: (-s["n"], s["doi"]))
    #  ORIENTATION: the mole fraction of the member the largest study reports;
    #  a study reporting the other member is extracted again with --x-of
    #  (x = 1 - x', exact for a binary, said in the file's header).
    c1 = studies[0]["x"]
    c2 = b if c1 == a else a
    for k, s in enumerate(studies):
        if s["x"] != c1:
            path, why = cc.extract(s["xml"], s["block"], work / f"r{k}", x_of=c1)
            if path is None:
                refuse(f"extract-vle --x-of {c1} refused doi {s['doi']}: {why}")
            ds = cc.read_dataset(path)
            s.update(ds, path=path, xOf=c1)
    for s in studies:
        final = ext / s["path"].name
        shutil.move(str(s["path"]), final)
        s["path"] = final
    Tmax = max(max(s["T"]) for s in studies)
    for c in (c1, c2):
        Tc = component_class(c)[1]
        if Tmax >= Tc:
            refuse(f"CLASS: {c} is supercritical in the data (T up to {Tmax:g} K, its "
                   f"Tc {Tc:g} K) -- a pair is fitted only below each component's Tc")
    return {"c1": c1, "c2": c2, "ident": {ca[0]: ca, cb[0]: cb},
            "studies": studies, "aside": aside, "fit": studies[0]}


# --------------------------------------------------------------------------
#  the case
# --------------------------------------------------------------------------
def next_number():
    n = [int(m.group(1)) for p in cc.CURATION.iterdir()
         if (m := re.match(r"curate(\d+)_", p.name))]
    return max([FIRST_NUMBER - 1] + n) + 1


def decl_text(pl, case_rel):
    t = cc.decl_text(dict(pl, held=pl["studies"][1] if len(pl["studies"]) > 1 else pl["fit"]),
                     case_rel)
    #  cc.decl_text writes the C282 pair (fit, held out); here every study is
    #  role fit, so the datasets list is rebuilt from the same lines.
    head = t[:t.index("datasets\n(")]
    lines = ["datasets", "("]
    for s in pl["studies"]:
        one = cc.decl_text(dict(pl, fit=s, held=s), case_rel)
        blk = one[one.index("datasets\n(\n") + len("datasets\n(\n"):]
        blk = blk[:blk.index("\n    }\n") + len("\n    }\n")]
        if s.get("xOf"):
            blk = blk.replace("        filter        ( --interior-only );\n",
                              "        filter        ( --interior-only );\n"
                              f"        xOf           {s['xOf']};   // the article reports the other member; x = 1 - x'\n")
            blk = blk.replace("--interior-only --into <dir>",
                              f"--interior-only --x-of {s['xOf']} --into <dir>")
        lines.append(blk.rstrip("\n").replace("role          fit;   // informational: the operation declares it",
                                              "role          fit;   // C283: every laboratory is fitted"))
    lines += [");", ""]
    return head + "\n".join(lines)


def _pressure(s):
    return s["P_kPa"] if s["isobars"] is None else max(s["isobars"])


def fit_op(name, c1, c2, studies, start, method, discards=None, proposal=None,
           parity="parity.csv", log=None):
    discards = discards or {}
    ev = ""
    for s in studies:
        f = f"{cc.EXTRACTS}/{s['path'].name}"
        d = discards.get(s["path"].name)
        ev += f"""            {{
                dataset  "{f}";
                role     fit;
"""
        if d:
            ev += f"                discard  ( {' '.join(str(r) for r in d)} );   // C283 outliers, by name in the header\n"
        ev += "            }\n"
    out = f"            parity     {parity};\n"
    if log:
        out = f"            fit_log    {log};\n" + out
    if proposal:
        out += f"            proposal   {proposal};\n"
    path = f"equilibrium.liquid.activityModel.binaryParameters.{c1}-{c2}"
    return f"""    {{
        name        {name};
        type        fitParameters;

        parameters
        (
            {{ path  {path}.b_ij;  initial {start[0]};  min -3000;  max 3000; }}
            {{ path  {path}.b_ji;  initial {start[1]};  min -3000;  max 3000; }}
        );

        evidence
        (
{ev}        );

        objective {{ method {method};  scale {{ T_bubble absolute; }} }}
        residual
        {{
            kind        T_bubble;
            components  ( {c1} {c2} );
            weighting   uncertainty;
        }}

        options
        {{
            maxIter      80;
            tolerance    1.0e-6;
            fdStep       1.0e-4;
            lambda0      1.0e-3;
        }}

        output
        {{
{out}        }}
    }}
"""


def props_text(pl, case_name, stem, unifac, discards=None, outlier_txt=None):
    c1, c2, st = pl["c1"], pl["c2"], pl["studies"]
    aside = "\n".join(cc.wrap(f"- {t}: {w}", indent="      ") for t, w in pl["aside"]) \
        or "      (none)"
    ranked = "\n".join(
        f"      {s['doi']:<30} block {s['block']:<3} {s['n']:>3} pts  "
        + (f"{s['P_kPa']:g} kPa" if s["isobars"] is None else
           f"{len(s['isobars'])} isobars {min(s['isobars']):g}-{max(s['isobars']):g} kPa")
        + f"  {min(s['T']):.2f}-{max(s['T']):.2f} K  U {min(s['U']):g}-{max(s['U']):g} K"
        + (f"\n        (reports x of the other member: written as x[{c1}] = 1 - x by --x-of)"
           if s.get("xOf") else "")
        for s in st)
    outl = outlier_txt or "not yet run."
    P = _pressure(pl["fit"])
    hdr = f"""/*--------------------------------*- Choupo -*--------------------------------*\\
|       \\|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\\\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\\\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\\\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \\|/    P roperties    |  Tutorial case file -- part of Choupo         |
|        |     O ptimization  |                                               |
\\*-----------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------*\\
  {case_name} -- AN NRTL PAIR FROM EVERY LABORATORY'S MEASUREMENTS.

  WRITTEN BY bin/choupo-curate pair {c1} {c2} (DEV.md 4c C284, the bulk run;
  record docs/design/binary-pairs-from-open-measurements.md section 10).

  THE DECLARATION -- WRITTEN AND COMMITTED BEFORE ANY FIT RAN (several
  declarations of the bulk run share one commit).

  IDENTITY.  {c1} (CAS {pl['ident'][c1][1]}, InChIKey {pl['ident'][c1][2]})
  + {c2} (CAS {pl['ident'][c2][1]}, InChIKey {pl['ident'][c2][2]}), joined
  to the archive through identity.json -- never by name.  CLASS (C284): both
  records are volatile molecular liquids (no role nonvolatile/solute, no
  dissociatesTo, no charge, no solid, a vapour-pressure model), and every
  measured temperature lies below both critical temperatures.

  NO MEASURED SERIES IN THIS TREE.  constant/archiveDatasets names each
  dataset (DOI, NIST URL, article sha256, extraction selector, extract
  sha256); `bin/choupo-curate fetch` writes the points into
  {cc.EXTRACTS}/, which is gitignored.

  STUDIES: every bubble-temperature block of the pair at or below 110 kPa
  with a declared uncertainty ({len(st) + len(pl['aside'])} block(s)).  FITTED, ALL OF THEM
  ({len(st)}):
{ranked}
  SET ASIDE BY THE EXTRACTION RULES, BY NAME:
{aside}

  {MARK}.  Every laboratory above is
  fitted; none is held out (the C16 partition and its band are retired as
  the acceptance test).  NRTL, a_ij = a_ji = 0, alpha = 0.30 fixed: two
  parameters (b_ij, b_ji); each point weighted by 1/U, U its own stated
  expanded uncertainty.  Objective twoStage (least squares, then minimax;
  T_bubble absolute, in K).  OUTLIERS: after a least-squares stage over every
  point, a point with |T_model - T| > {OUTLIER_K:g} K is discarded BY
  NAME (`discard` on its evidence entry, listed below) and the fit repeated
  without it.  ACCEPTED when max |T_model - T| over the KEPT points is below
  {ACCEPT_K:g} K.  C283's 5 % relative clause judges composition; this fit has no
  composition residual, so only the temperature clause applies.  A pair
  that splits ONE liquid inside its validity span is not promoted (arm f).
  Two starts: (0, 0) and (800, -400).

  OUTLIERS DISCARDED AFTER THE LEAST-SQUARES STAGE:
  @@OUTLIERS-BEGIN@@
{cc.wrap(outl, indent="      ")}
  @@OUTLIERS-END@@

  @@RESULT-BEGIN@@
  WHAT THE RUN FOUND: not yet run.
  @@RESULT-END@@

  WHAT IS NOT CLAIMED.  The pair is correct at these pressures and in this
  frame (ideal-gas vapour, the catalogue's own vapour-pressure records); the
  measurements were transcribed by the archive and have NOT been read back
  against the articles (the CHECKLIST that `fetch` writes is the aid).
\\*---------------------------------------------------------------------------*/

operations
(
"""
    body = fit_op("fit_nrtl", c1, c2, st, (0, 0), "twoStage", discards,
                  proposal=f"{stem}.proposal.dat", parity="parity.csv",
                  log="fit_history.csv")
    body += fit_op("fit_nrtl_start2", c1, c2, st, (800, -400), "twoStage", discards,
                   parity="parity_start2.csv")
    models = ["ideal"] + (["UNIFAC"] if unifac else []) + ["NRTL"]
    for m in models:
        th = ("model NRTL; /* no inline pair: the case's own record */"
              if m == "NRTL" else f"model {m};")
        body += f"""    {{
        name        txy_{m.lower()};
        type        propertyScan1D;
        vary        {{ variable x[{c1}];  from 0.0;  to 1.0;  n 101; }}
        state       {{ P {P:g} kPa;  composition {{ {c1} 0.5;  {c2} 0.5; }} }}
        thermo
        {{
            equilibrium {{ liquid {{ activityModel {{ {th} }} }} }}
        }}
        properties  ( T_bubble  y_eq_{c1} );
        output      {{ file txy_{m.lower()}.csv; }}
    }}
"""
    body += ");\n\nexperimental\n(\n"
    for k, s in enumerate(st):
        if s["isobars"] is None and abs(s["P_kPa"] - P) <= 0.01 * P:
            body += f"""    {{
        name      study{k + 1};
        component {c1};
        kind      txy;
        models    ( {'  '.join('txy_' + m.lower() for m in models)} );
        dataset   "{cc.EXTRACTS}/{s['path'].name}";
        source    "IN-SAMPLE (fitted): doi {s['doi']}";
    }}
"""
    body += ");\n"
    return hdr + body


def write_case(pl, number):
    c1, c2 = pl["c1"], pl["c2"]
    name = f"curate{number:02d}_nrtl_{c1}_{c2}"
    case = cc.CURATION / name
    if case.exists():
        refuse(f"{case.relative_to(ROOT)} exists -- never overwritten")
    stem = "-".join(sorted((c1, c2)))
    (case / "system").mkdir(parents=True)
    (case / "constant").mkdir()
    (case / f"{name}.cho").write_text("")
    (case / "system" / "controlDict").write_text(f"""/*  {name}: an NRTL pair for {c1} + {c2} regressed by bin/choupo-curate to
    EVERY laboratory's measured bubble temperatures (DEV.md 4c C283 amended,
    C284).  See system/propsDict for the declaration and the result.  */

application   choupoProps;
description   "NRTL {c1}-{c2} regressed by the curation pipeline to every laboratory's measured bubble temperatures (ThermoML locates, the articles source), accepted at max |dT| < 1 K";
verbosity     2;
""")
    hdr = f"""/*---------------------------------------------------------------------------*\\
  {name} -- the thermophysical system: gamma-phi at LOW PRESSURE.
    * vapour: IDEAL GAS (fugacity coefficient 1, no Poynting term);
    * pure components: the catalogue's own vapour-pressure records, UNCHANGED;
    * liquid: NRTL, tau_ij = a_ij + b_ij/T, alpha 0.30 FIXED.
  The inline pair is the FIT'S STARTING POINT (zero = ideal mixing); the
  regressed pair is the record under constant/parameters/NRTL/ (or, once
  promoted, the catalogue's, sealed into this case), read by the scans.
\\*---------------------------------------------------------------------------*/

"""
    (case / "constant" / "thermoPhysPropDict").write_text(cc.thermo_dict(c1, c2, hdr))
    (case / "constant" / "archiveDatasets").write_text(
        decl_text(pl, case.relative_to(ROOT).as_posix()))
    unifac = cc.has_unifac(c1) and cc.has_unifac(c2)
    (case / "system" / "propsDict").write_text(props_text(pl, name, stem, unifac))
    ex = case / cc.EXTRACTS
    ex.mkdir(parents=True)
    for s in pl["studies"]:
        shutil.copy(s["path"], ex / s["path"].name)
    return case, stem


def case_of(c1, c2):
    """The C283 case of the pair (a C282 pilot case of the same pair is not
    it: it stays as the pilot wrote it)."""
    for p in sorted(cc.CURATION.iterdir()):
        if re.match(rf"curate\d+_nrtl_({re.escape(c1)}_{re.escape(c2)}|"
                    rf"{re.escape(c2)}_{re.escape(c1)})$", p.name) \
                and (p / cc.DECL).exists() and is_c283(p):
            return p
    return None


def is_c283(case):
    return MARK in (case / "system" / "propsDict").read_text()


def normalise(t):
    t = re.sub(r"@@RESULT-BEGIN@@.*?@@RESULT-END@@", "", t, flags=re.S)
    t = re.sub(r"@@OUTLIERS-BEGIN@@.*?@@OUTLIERS-END@@", "", t, flags=re.S)
    return re.sub(r"\n\s*discard  \([^)]*\);[^\n]*", "", t)


# --------------------------------------------------------------------------
#  the run: stage A (least squares, outliers), stage B (twoStage), record
# --------------------------------------------------------------------------
def fit_only(case, method, keep_discards=True):
    """Run the case's fit_nrtl ALONE in a scratch copy with objective
    `method`; return (exit, output, parity rows, proposal text)."""
    work = Path(tempfile.mkdtemp(prefix="choupo-curate-c283-"))
    try:
        sc = work / case.name
        shutil.copytree(case, sc, ignore=shutil.ignore_patterns("expected"))
        t = (sc / "system" / "propsDict").read_text()
        i = t.index("    {\n        name        fit_nrtl_start2;")
        t = t[:i] + ");\n"
        if method != "twoStage":
            t = t.replace("method twoStage;", f"method {method};")
        if not keep_discards:
            t = re.sub(r"\n\s*discard  \([^)]*\);[^\n]*", "", t)
        (sc / "system" / "propsDict").write_text(t)
        for stale in sc.glob("*.proposal.dat"):
            stale.unlink()
        rc, out, js = cc.run_props(sc)
        par = sc / "parity.csv"
        rows = []
        if par.exists():
            for l in par.read_text().splitlines()[1:]:
                if l.strip():
                    rows.append([float(v) for v in l.split(",")])
        props = list(sc.glob("*.proposal.dat"))
        return rc, out, rows, (props[0].read_text() if props else None)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def point_map(case, studies_files, discards):
    """[(file, row)] in the order the engine loads the kept fit points."""
    out = []
    for f in studies_files:
        ds = cc.read_dataset(case / cc.EXTRACTS / f)
        for r in range(1, ds["n"] + 1):
            if r not in discards.get(f, []):
                out.append((f, r))
    return out


def evidence_files(case):
    t = crp.strip_comments((case / "system" / "propsDict").read_text())
    op = t[t.index("fit_nrtl;"):t.index("fit_nrtl_start2;")]
    return [Path(m).name for m in re.findall(r'dataset\s+"([^"]+)"', op)]


def outliers_of(case, rows, files):
    pm = point_map(case, files, {})
    if len(pm) != len(rows):
        refuse(f"{case.name}: the least-squares stage loaded {len(rows)} points and the "
               f"extracts list {len(pm)} -- the outliers cannot be named")
    doi = {s["file"].split("/")[-1]: s["doi"] for s in cc.parse_decl(case)}
    found = {}
    lines = []
    for (f, r), row in zip(pm, rows):
        x, P, T, Tm, res = row
        bad = not (abs(res) <= OUTLIER_K)          # a NaN model is no bubble point
        if bad:
            found.setdefault(f, []).append(r)
            lines.append(f"doi {doi.get(f, f)} row {r}: x {x:.4f}, P {P / 1000:.3f} kPa, "
                         f"T {T:.2f} K, " + ("the model finds no bubble point"
                                              if res != res else f"dT {res:+.2f} K"))
    return found, lines


def stats(rows):
    r = [abs(v[4]) for v in rows]
    nan = sum(1 for v in r if v != v)
    r = [v for v in r if v == v]
    return (max(r) if r else float("nan"), sum(r) / len(r) if r else float("nan"),
            len(r), nan)


def curation_block(verdict, n_kept, n_drop, mx, mean, nan):
    return (f"curation\n{{\n"
            f'    rule            "{RULE}";\n'
            f"    evidence        allLaboratories;   // every study fitted, none held out\n"
            f"    objective       twoStage;\n"
            f"    outlierLimit    {OUTLIER_K:g} K;   // |T_model - T| after the least-squares stage\n"
            f"    outliersDropped {n_drop};\n"
            f"    pointsKept      {n_kept};\n"
            f"    noBubblePoint   {nan};\n"
            f"    maxAbsError     {mx:.4f} K;\n"
            f"    meanAbsError    {mean:.4f} K;\n"
            f"    acceptance      {ACCEPT_K:g} K;   // max |T_model - T| over the kept points\n"
            f"    verdict         {verdict};\n}}\n")


def run(case, pl, commit):
    c1, c2 = pl["c1"], pl["c2"]
    stem = "-".join(sorted((c1, c2)))
    case_rel = case.relative_to(ROOT).as_posix()
    rc = cc.fetch(case, quiet=True)
    if rc:
        refuse(f"fetch of {case_rel} returned {rc}")
    files = evidence_files(case)
    decl = cc.parse_decl(case) or []
    if sorted(Path(d["file"]).name for d in decl) != sorted(files):
        refuse(f"{case_rel}: constant/archiveDatasets declares {len(decl)} dataset(s) and "
               f"the fit reads {len(files)} -- every dataset the fit reads must be "
               "declared, so that `fetch` regenerates and verifies it")
    #  STAGE A: least squares over every point
    rc, out, rows, _ = fit_only(case, "leastSquares", keep_discards=False)
    if rc != 0 or not rows:
        refuse(f"the least-squares stage of {case_rel} exited {rc}: {out[-600:]}")
    found, lines = outliers_of(case, rows, files)
    n_drop = sum(len(v) for v in found.values())
    otxt = (f"{n_drop} point(s) of {len(rows)}: " + "; ".join(lines)) if n_drop else \
        f"none: every one of the {len(rows)} points lies within {OUTLIER_K:g} K after the least-squares stage."
    pd = case / "system" / "propsDict"
    unifac = cc.has_unifac(c1) and cc.has_unifac(c2)
    new = props_text(pl, case.name, stem, unifac, discards=found, outlier_txt=otxt)
    if normalise(new) != normalise(pd.read_text()):
        refuse(f"{case.name}: the declaration on disk differs from the one the rules "
               "give -- a declaration is never rewritten after it was committed")
    pd.write_text(new)
    #  STAGE B: twoStage on the kept points
    rc, out, rows, ptext = fit_only(case, "twoStage")
    if rc != 0 or ptext is None:
        refuse(f"the fit of {case_rel} exited {rc} / wrote no proposal: {out[-600:]}")
    mx, mean, n_kept, nan = stats(rows)
    accepted = nan == 0 and mx < ACCEPT_K
    rf, split = cc.stability(ptext, stem)
    verdict = "accepted" if accepted else "notAccepted"
    if not accepted:
        reason = (f"NOT PROMOTABLE: max |dT| {mx:.3f} K over the {n_kept} kept points "
                  f"is not below {ACCEPT_K:g} K" + (f" ({nan} point(s) with no bubble point)" if nan else ""))
    elif split:
        reason = ("NOT PROMOTABLE: the pair splits ONE liquid inside its own validity "
                  "span (check_regressed_pairs arm f) -- " + split[0].split(": ", 1)[1])
    else:
        reason = (f"PROMOTABLE by `bin/choupo-curate pair ... --promote`: max |dT| "
                  f"{mx:.3f} K < {ACCEPT_K:g} K over the {n_kept} kept points, one "
                  "liquid across the validity span")
    hdr = cc.record_header(stem, c1, c2, case_rel,
                           "reviewStatus interim: a case-local record, regressed and "
                           "not read back.  Fitted on EVERY laboratory (C283), so the\n"
                           "  `validation {}` block below says, truthfully, that nothing\n"
                           "  was held out; the acceptance is the `curation {}` block.",
                           cc.wrap(reason, indent="  ") + "\n")
    hdr = hdr.replace("The two articles named under `evidence` are the",
                      "The articles named under `evidence` are the")
    rec = cc.record_from_proposal(ptext, hdr, cc.case_record_fields(case_rel))
    rec = rec.rstrip("\n") + "\n\n" + curation_block(verdict, n_kept, n_drop, mx, mean, nan)
    rp = case / "constant" / "parameters" / "NRTL" / f"{stem}.dat"
    rp.parent.mkdir(parents=True, exist_ok=True)
    rp.write_text(rec)
    cc.seal(case)
    rc, out, js = cc.run_props(case)
    if rc != 0:
        refuse(f"the sealed case {case_rel} exited {rc}: {out[-600:]}")
    f1 = cc.op_result(js, "fit_nrtl") or {}
    f2 = cc.op_result(js, "fit_nrtl_start2") or {}
    d1, d2 = f1.get("diagnostics", {}), f2.get("diagnostics", {})
    keys = sorted(k for k in d1 if k.endswith(".b_ij") or k.endswith(".b_ji"))
    b1 = [d1[k] for k in keys]
    b2 = [d2.get(k) for k in keys]
    same = all(x is not None and abs(x - y) <= 1e-2 * max(1, abs(y)) for x, y in zip(b2, b1))
    txt = (f"WHAT THE RUN FOUND (pinned in `expected`; measured, not argued).  "
           f"fit_nrtl: b_ij = {b1[0]:.1f} K, b_ji = {b1[1]:.1f} K over {n_kept} kept "
           f"points of {len(pl['studies'])} laboratories ({n_drop} discarded): max |dT| "
           f"{mx:.3f} K, mean {mean:.3f} K against the acceptance {ACCEPT_K:g} K -> "
           f"{verdict}.  fit_nrtl_start2 lands on "
           f"{'the same pair' if same else 'A DIFFERENT pair'} "
           f"({b2[0]:.1f}, {b2[1]:.1f}).  {reason}")
    t = pd.read_text()
    t = re.sub(r"@@RESULT-BEGIN@@.*?@@RESULT-END@@",
               "@@RESULT-BEGIN@@\n" + cc.wrap(txt) + "\n  @@RESULT-END@@", t, flags=re.S)
    pd.write_text(t)
    return {"verdict": verdict, "split": bool(split), "max": mx, "mean": mean,
            "kept": n_kept, "dropped": n_drop, "studies": len(pl["studies"]),
            "reason": reason, "same": same, "b": b1, "case": case.name, "nan": nan}


# --------------------------------------------------------------------------
#  promotion
# --------------------------------------------------------------------------
def promote(a, b):
    a, b = cc.identity(a)[0], cc.identity(b)[0]
    for c in (a, b):
        if c in ARCHIVED:
            refuse("EXCLUDED: " + ARCHIVED[c])
    case = case_of(a, b)
    if case is None:
        return cc.promote(a, b)
    recs = list((case / "constant" / "parameters" / "NRTL").glob("*.dat"))
    if len(recs) != 1:
        refuse(f"{case.name} carries {len(recs)} NRTL records; expected its one")
    rp = recs[0]
    text = rp.read_text()
    have = cc.existing_records(a, b)
    if have:
        refuse(f"a catalogue record for {a} + {b} already exists ({', '.join(have)})")
    cur = crp.block(crp.strip_comments(text), "curation") or ""
    if crp.word(cur, "verdict") != "accepted":
        refuse(f"{rp.stem}: curation verdict `{crp.word(cur, 'verdict')}` -- only an "
               "accepted fit is promoted (C283)")
    rf, split = cc.stability(text, rp.stem)
    if split:
        refuse(f"{rp.stem}: " + split[0])
    case_rel = case.relative_to(ROOT).as_posix()
    hdr = cc.record_header(
        rp.stem, rf["i"], rf["j"], case_rel,
        "reviewStatus autoPromoted; humanReviewed false: PROMOTED AUTOMATICALLY by\n"
        "  its fitting pipeline (every laboratory fitted, outliers beyond 3 K\n"
        "  discarded by name, max |T_model - T| over the kept points below 1 K --\n"
        "  DEV.md 4c C283 amended; one liquid across its validity span), and NO\n"
        "  HUMAN HAS REVIEWED IT.  The engine says so on every run that reads it.\n"
        "  Nothing was held out: the `validation {}` block says so, and the\n"
        "  acceptance is the `curation {}` block.  A curator who reads the series\n"
        "  back against the articles marks it `reviewStatus reviewed; humanReviewed\n"
        f"  true;`.  Revert with `bin/choupo-curate revert {rp.stem}`.")
    hdr = hdr.replace("The two articles named under `evidence` are the",
                      "The articles named under `evidence` are the")
    body = cc.body_of(text)
    body = re.sub(r"(\n    reviewStatus\s+)interim;",
                  r"\1autoPromoted;\n    humanReviewed false;\n"
                  f'    promotedBy    "{cc.PROMOTED_BY}";\n'
                  f'    promotedDate  "{date.today().isoformat()}";', body, count=1)
    dest = cc.STD_NRTL / f"{rp.stem}.dat"
    if dest.exists():
        refuse(f"{dest.relative_to(ROOT)} exists -- never overwritten")
    dest.write_text(hdr + body)
    rp.unlink()
    try:
        cc.seal(case)
    except SystemExit:
        dest.unlink()
        rp.write_text(text)
        cc.seal(case)
        raise
    cc.mark_result(case, "PROMOTABLE by `bin/choupo-curate pair ... --promote`:",
                   f"PROMOTED on {date.today().isoformat()} into "
                   f"{dest.relative_to(ROOT).as_posix()} as reviewStatus autoPromoted, "
                   "humanReviewed false, because:")
    cc.say(f"choupo-curate: PROMOTED {dest.relative_to(ROOT)} (autoPromoted, "
           "humanReviewed false)")
    return 0


# --------------------------------------------------------------------------
#  the command line
# --------------------------------------------------------------------------
def one(a, b, args, work):
    pl = plan(a, b, args.pmax, work)
    cc.say(f"choupo-curate pair {pl['c1']} {pl['c2']}  (C283/C284)")
    cc.say(f"  studies fitted {len(pl['studies'])}; set aside {len(pl['aside'])}")
    for t, w in pl["aside"]:
        cc.say(f"    aside  {t}: {w}")
    for s in pl["studies"]:
        cc.say(f"    fit    doi {s['doi']} block {s['block']} ({s['n']} pts)")
    if args.plan:
        return pl, None, None
    if args.resume:
        case = case_of(pl["c1"], pl["c2"])
        if case is None:
            refuse("--resume: no case for this pair")
        if normalise((case / cc.DECL).read_text()) != normalise(
                decl_text(pl, case.relative_to(ROOT).as_posix())):
            refuse(f"--resume: {case.name}'s dataset declaration differs from the one "
                   "the rules give now")
        for s in pl["studies"]:
            (case / cc.EXTRACTS).mkdir(parents=True, exist_ok=True)
            shutil.copy(s["path"], case / cc.EXTRACTS / s["path"].name)
    else:
        case, stem = write_case(pl, args.number or next_number())
        cc.say(f"  case     {case.relative_to(ROOT)}")
        if not args.no_commit and not args.declare_only:
            files = [p for p in case.rglob("*") if p.is_file()
                     and cc.EXTRACTS not in p.relative_to(case).as_posix()]
            cc.git(["add", "--"] + [str(p) for p in files])
            cc.git(["commit", "-q", "-m",
                    f"C284: {case.name} -- the declaration, before any fit\n\n"
                    f"bin/choupo-curate pair {pl['c1']} {pl['c2']}: every laboratory "
                    f"({len(pl['studies'])} studies), the C283 outlier and acceptance "
                    "rule, written before the fit runs."])
        if args.declare_only:
            return pl, case, None
    return pl, case, run(case, pl, False)


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(prog="choupo-curate pair|pairs")
    sp = ap.add_subparsers(dest="cmd", required=True)
    p = sp.add_parser("pair")
    p.add_argument("a")
    p.add_argument("b")
    p.add_argument("--pmax", type=float, default=110.0)
    p.add_argument("--number", type=int)
    p.add_argument("--plan", action="store_true")
    p.add_argument("--no-commit", action="store_true")
    p.add_argument("--declare-only", action="store_true")
    p.add_argument("--resume", action="store_true")
    p.add_argument("--promote", action="store_true")
    q = sp.add_parser("pairs")
    q.add_argument("--list", action="store_true")
    q.add_argument("--declare", action="store_true")
    q.add_argument("--run", action="store_true")
    q.add_argument("--promote", action="store_true")
    q.add_argument("--top", type=int, default=60)
    q.add_argument("--pmax", type=float, default=110.0)
    q.add_argument("--json", help="write the batch outcome here")
    a = ap.parse_args(argv)
    if a.cmd == "pair":
        if a.promote:
            try:
                return promote(a.a, a.b)
            except Refused as ex:
                cc.say("choupo-curate: REFUSED\n  " + str(ex))
                return 1
        work = Path(tempfile.mkdtemp(prefix="choupo-curate-"))
        try:
            pl, case, res = one(a.a, a.b, a, work)
            if res:
                cc.say(f"  verdict  {res['verdict']}  (max |dT| {res['max']:.3f} K, mean "
                       f"{res['mean']:.3f} K, {res['kept']} kept, {res['dropped']} discarded)")
                cc.say(f"  {res['reason']}")
            return 0
        except Refused as ex:
            cc.say("choupo-curate: REFUSED\n  " + str(ex))
            return 1
        finally:
            shutil.rmtree(work, ignore_errors=True)
    return batch(a)


def batch(a):
    allc = candidates(a.pmax)
    cand = [e for e in allc if e["status"] == "candidate"]
    if a.list:
        from collections import Counter
        cnt = Counter(e["status"] for e in allc)
        cls = Counter(e["why"].split(": ", 1)[1].split(" (")[0] for e in allc
                      if e["status"] == "refusedByClass")
        cc.say(f"archive pairs of two catalogue components (bubble T <= {a.pmax:g} kPa): "
               f"{len(allc)}; " + ", ".join(f"{k} {v}" for k, v in sorted(cnt.items())))
        cc.say("  refused by class: " + ", ".join(f"{k} {v}" for k, v in sorted(cls.items())))
        for e in allc:
            if e["status"] == "refusedByClass":
                cc.say(f"    REFUSED {e['pair'][0]} + {e['pair'][1]}: {e['why']}")
        for k, e in enumerate(cand[:a.top]):
            cc.say(f"  {k + 1:>3} {e['pair'][0]} + {e['pair'][1]}: {e['studies']} studies, "
                   f"{e['points']} points")
        return 0
    todo = cand[:a.top]
    out = []
    for e in todo:
        x, y = e["pair"]
        rec = {"pair": [x, y], "studies_index": e["studies"]}
        work = Path(tempfile.mkdtemp(prefix="choupo-curate-"))
        try:
            if a.declare:
                ns = type("A", (), dict(pmax=a.pmax, plan=False, resume=False, number=None,
                                        no_commit=True, declare_only=True))()
                if case_of(x, y):
                    rec["outcome"] = "declared already"
                else:
                    pl, case, _ = one(x, y, ns, work)
                    rec["outcome"], rec["case"] = "declared", case.name
            elif a.run:
                case = case_of(x, y)
                if case is None:
                    rec["outcome"] = "no C283 declaration"
                elif list((case / "constant" / "parameters" / "NRTL").glob("*.dat")):
                    rec["outcome"] = "ran already"
                else:
                    ns = type("A", (), dict(pmax=a.pmax, plan=False, resume=True, number=None,
                                            no_commit=True, declare_only=False))()
                    pl, case, res = one(x, y, ns, work)
                    rec.update(res)
                    rec["outcome"] = "ran"
            elif a.promote:
                case = case_of(x, y)
                if case is None:
                    rec["outcome"] = "no case"
                else:
                    rp = list((case / "constant" / "parameters" / "NRTL").glob("*.dat"))
                    cur = crp.block(crp.strip_comments(rp[0].read_text()), "curation") if rp else None
                    if not rp:
                        rec["outcome"] = "not run or promoted already"
                    elif crp.word(cur or "", "verdict") != "accepted":
                        rec["outcome"] = "notAccepted"
                    else:
                        try:
                            promote(x, y)
                            rec["outcome"] = "promoted"
                        except (Refused, SystemExit) as ex:
                            rec["outcome"] = f"not promoted: {ex}"
        except Refused as ex:
            rec["outcome"] = "refused: " + str(ex)
        except SystemExit as ex:
            rec["outcome"] = f"refused (exit {ex.code})"
        except Exception as ex:   # noqa: BLE001 -- one failure never stops the batch
            rec["outcome"] = f"error: {type(ex).__name__}: {ex}"
        finally:
            shutil.rmtree(work, ignore_errors=True)
        cc.say(f"[{x} + {y}] {rec['outcome'][:300]}"
               + (f"  {rec['verdict']} max {rec['max']:.3f} K" if "verdict" in rec else ""))
        out.append(rec)
        if a.json:
            Path(a.json).write_text(json.dumps(out, indent=1, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
