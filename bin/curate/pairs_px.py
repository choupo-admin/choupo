#!/usr/bin/env python3
"""pairs_px -- NRTL pairs from isothermal bubble-PRESSURE (P-x) data (DEV.md 4c C291).

    bin/curate/pairs_px.py census                     every bubbleP block, accepted / refused by reason
    bin/curate/pairs_px.py list [--top N]             the ranked candidate pairs, by status
    bin/curate/pairs_px.py declare [--top N] [--skip K]
                                                      write N declarations (no fit), no commit
    bin/curate/pairs_px.py run [--only STEMS]          fit every declared, not yet fitted case
    bin/curate/pairs_px.py promote [--only STEMS]      promote every accepted, one-liquid case

The MIRROR of bin/curate/pairs_c283.py (the bubble-TEMPERATURE pipeline), which
it imports READ-ONLY for the class filter, the fit driver and the outlier
bookkeeping; every helper of bin/choupo-curate (identity, fetch, seal, record
header) is that tool's, so the two chains cannot read one article two ways.
What changes is the RESIDUAL and the ACCEPTANCE, and only those:

  * the measurement is the bubble PRESSURE of a binary at a STATED temperature
    (`bin/choupo-thermoml extract-px`: a block with no stated per-point
    uncertainty, a temperature that varies across its points, a vapour
    composition with no liquid one, or more than two components REFUSES by
    name); fitParameters `kind P_bubble`, whose residual is RELATIVE,
    (P_model - P)/P, under `objective twoStage` (least squares, then minimax);
  * every usable laboratory and every temperature of the pair is fitted
    TOGETHER (NRTL tau = b/T carries the temperature); none is held out;
  * after the least-squares stage a point whose relative pressure error
    exceeds OUTLIER_PCT = 20 % is DISCARDED BY NAME (`discard` on its evidence
    entry, listed in the case header) and the fit repeated without it;
  * the acceptance is GRADED on the maximum relative pressure error over the
    KEPT points, C285/C286's factors in per cent: <= 5 clean, (5, 10] warning,
    (10, 20] severe, > 20 refused; a pair that predicts two liquids inside its
    validity span (check_regressed_pairs arm f) is not promoted whatever its
    grade; a record built on ONE temperature or ONE laboratory says so in its
    `curation {}` block.  The grade is voiced by src/thermo/FitGrade.H through
    the record's provenance (`fitGrade`, `fitGradeMaxRelativeError_pct`).

The class filter is C284's (both components volatile molecular liquids, every
measured temperature below each Tc, no acetic acid, no pair already in
data/standards/parameters/ in ANY model, and -- stated default of this
pipeline -- every measured pressure at or below PMAX_KPA, because the vapour
is the ideal gas).  No measured series is
kept in the tree (constant/archiveDatasets + `bin/choupo-curate fetch`).
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

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pairs_c283 as pc   # read-only: class filter, fit driver, normalise

cc = pc.cc
crp = pc.crp
ROOT = pc.ROOT

_l = importlib.machinery.SourceFileLoader("choupo_thermoml", str(ROOT / "bin" / "choupo-thermoml"))
_s = importlib.util.spec_from_loader("choupo_thermoml", _l)
tm = importlib.util.module_from_spec(_s)
_l.exec_module(tm)

PMAX_KPA = 110.0          # stated default: the vapour is the ideal gas
OUTLIER_PCT = 20.0        # blatant outlier: relative pressure error after least squares
MAJORITY = 0.5            # a study with more than this share of blatant points is discarded whole
GRADES = ("clean", "warning", "severe", "refused")
GRADE_PCT = pc.GRADE_PCT   # ONE home (pairs_c283)
MARK = "THE RULE (DEV.md 4c C291, bubble-pressure pairs)"
RULE = "DEV.md 4c C291 (bubble-pressure pairs; every laboratory, graded by C285)"
MIN_INTERIOR = cc.MIN_INTERIOR
OTHER_WORKTREES = ("pairs-batch",)     # a parallel general's claims, read-only


def grade_of(mx_pct, nan=0):
    if nan or mx_pct != mx_pct:
        return "refused"
    for g, lim in zip(GRADES, GRADE_PCT):
        if mx_pct <= lim:
            return g
    return GRADES[-1]


GRADED_TEXT = (
    "THE GRADED ACCEPTANCE (DEV.md 4c C285, in per cent of P): max |P_model - P|/P "
    f"over the KEPT points is GRADED -- clean up to {GRADE_PCT[0]:g} %, warning up to "
    f"{GRADE_PCT[1]:g} %, severe up to {GRADE_PCT[2]:g} %, refused above; a point with "
    "no bubble pressure refuses.  Every grade but refused is accepted and promoted "
    "(autoPromoted, humanReviewed false) with `fitGrade` and its max relative error in "
    "the record's provenance; the engine voices a warning or a severe grade on every "
    "run that reads the pair.  A pair that splits ONE liquid inside its validity span "
    "is not promoted, whatever its grade (arm f).")


class Refused(Exception):
    pass


def refuse(msg):
    raise Refused(msg)


# --------------------------------------------------------------------------
#  the census: every bubbleP block through the extractor's own refusals
# --------------------------------------------------------------------------
def index_blocks():
    return json.loads((cc.cache_root() / "vleIndex.json").read_text())["blocks"]


_ROOTS = {}


def _try_block(r):
    """('ok', rec) or ('refused', reason) by the extractor's own reader."""
    f = r["file"]
    if f not in _ROOTS:
        _ROOTS.clear()
        _ROOTS[f] = tm.ET.parse(cc.cache_root() / f).getroot()
    root = _ROOTS[f]
    poms = tm.find_all(root, "PureOrMixtureData")
    try:
        rec = tm._one_bubbleP_block(root, poms[r["block"]], tm.compounds_published(root),
                                    tm.find_text(root, "sDOI"), False)
    except tm.BubbleRefusal as ex:
        return "refused", str(ex)
    return "ok", rec


def reason_key(why):
    w = re.sub(r"[0-9.]+", "N", why).split(":")[0].split(";")[0].split("(")[0]
    return w.strip()[:90]


def is_p_block(r):
    pn = [p[0].lower() for p in r["properties"]]
    return len(r["compounds"]) == 2 and any(
        n.startswith("vapor or sublimation pressure") for n in pn)


def census():
    from collections import Counter
    rows = [r for r in index_blocks() if is_p_block(r)]
    rows.sort(key=lambda r: (r["file"], r["block"]))
    cnt, ok, det = Counter(), 0, []
    for r in rows:
        st, x = _try_block(r)
        if st == "ok":
            ok += 1
        else:
            cnt[reason_key(x)] += 1
    return len(rows), ok, cnt


# --------------------------------------------------------------------------
#  the candidates
# --------------------------------------------------------------------------
def other_claims():
    """Pairs another general holds (catalogue records or case names) in its
    worktree, read-only: a pair in both would collide at integration."""
    out = set()
    for w in OTHER_WORKTREES:
        base = ROOT.parent / w
        if not base.is_dir():
            continue
        for p in (base / "data" / "standards" / "parameters").rglob("*.dat"):
            parts = p.stem.split("-")
            if len(parts) >= 2:
                out.add(frozenset(parts[-2:]))
        for p, a, b in cc.curation_roots.pair_cases(base):   # every pair case (C295, C296)
            out.add(frozenset((a, b)))
    return out


def candidates(pmax=PMAX_KPA):
    rows = [r for r in index_blocks() if r["geometry"] == "bubbleP" and len(r["compounds"]) == 2
            and all(c.get("component") for c in r["compounds"])]
    claims = other_claims()
    pairs = {}
    for r in rows:
        k = tuple(sorted(c["component"] for c in r["compounds"]))
        if k[0] != k[1]:
            pairs.setdefault(k, []).append(r)
    out = []
    for k, rs in pairs.items():
        e = {"pair": k, "status": "candidate", "why": "", "studies": 0, "points": 0}
        good = []
        for r in rs:
            if not (r["P_kPa"] and r["P_kPa"][1] <= pmax):
                continue
            st, x = _try_block(r)
            if st != "ok":
                continue
            n_int = sum(1 for p in x["points"] if 0.0 < p[0] < 1.0)
            if n_int < MIN_INTERIOR:
                continue
            good.append((r, x, n_int))
        e["studies"] = len({r["doi"] for r, _, _ in good})
        e["points"] = sum(n for _, _, n in good)
        e["Tmax"] = max([max(p[1] for p in x["points"]) for _, x, _ in good] or [0])
        arch = [pc.ARCHIVED[c] for c in k if c in pc.ARCHIVED]
        have = cc.existing_records(*k)
        if arch:
            e["status"], e["why"] = "excluded", arch[0]
        elif have:
            e["status"], e["why"] = "present", ", ".join(have)
        elif frozenset(k) in claims:
            e["status"], e["why"] = "claimedByC290", "another general holds the pair"
        elif not good:
            e["status"], e["why"] = "noUsableBlock", "no isothermal block with a stated uncertainty, >= 5 interior points, P <= %g kPa" % pmax
        else:
            for c in k:
                cl, Tc, vpm = pc.component_class(c)
                if cl != "volatileLiquid":
                    e["status"], e["why"] = "refusedByClass", f"{c}: {cl}"
                    break
                if e["Tmax"] >= Tc:
                    e["status"], e["why"] = ("refusedByClass", f"{c}: supercritical in the data "
                                             f"(T up to {e['Tmax']:g} K, Tc {Tc:g} K)")
                    break
            else:
                aw = [c for c in k if pc.component_class(c)[2] == "AmbroseWalton"]
                if aw:
                    e["status"], e["why"] = "waitsOnC281", ", ".join(aw) + ": vapour pressure still AmbroseWalton"
        out.append(e)
    out.sort(key=lambda e: (-e["points"], -e["studies"], e["pair"]))
    return out


# --------------------------------------------------------------------------
#  datasets
# --------------------------------------------------------------------------
def read_dataset(path):
    t = path.read_text()
    cols = re.findall(r"\{\s*name\s+(\S+?);", t[t.index("\ncolumns"):t.index("\ndata")])
    xcomp = re.match(r"x\[(.+)\]", cols[0]).group(1)
    d = t[t.index("\ndata"):]
    rows = [l.split() for l in d.splitlines() if l.strip() and l.strip()[0].isdigit()]
    iP = cols.index("Pressure")
    m = re.search(r"^temperature\s+([0-9.eE+-]+)\s+K;", t, re.M)
    u = re.search(r"P_bubble\s*\{[^}]*values\s*\(([^)]*)\)", t, re.S)
    U = [float(v) for v in u.group(1).split()] if u else None
    return {"x": xcomp, "n": len(rows), "P_kPa_list": [float(r[iP]) for r in rows],
            "T_K": float(m.group(1)) if m else None, "U": U}


def plan(a, b, pmax, work):
    try:
        ca, cb = cc.identity(a), cc.identity(b)
    except SystemExit:
        refuse(f"identity: {a} or {b} does not join the archive by InChIKey")
    a, b = ca[0], cb[0]
    for c in (a, b):
        if c in pc.ARCHIVED:
            refuse("EXCLUDED: " + pc.ARCHIVED[c])
        cl, Tc, vpm = pc.component_class(c)
        if cl != "volatileLiquid":
            refuse(f"CLASS: {c} is {cl} -- an NRTL pair is fitted only between two volatile "
                   "molecular liquids (DEV.md 4c C284)")
        if vpm == "AmbroseWalton":
            refuse(f"WAITS ON C281: {c}'s vapour pressure is still `model AmbroseWalton`")
    have = cc.existing_records(a, b)
    if have:
        refuse(f"PRESENT: the pair already has a catalogue record: {', '.join(have)}")
    keys = {ca[2], cb[2]}
    ix = {e["doi"]: e.get("authors", []) for e in
          json.loads((cc.cache_root() / "index.json").read_text())["entries"]}
    blocks = [dict(r, authors=ix.get(r["doi"], [])) for r in index_blocks()
              if r["geometry"] == "bubbleP" and len(r["compounds"]) == 2
              and {c.get("inchiKey") for c in r["compounds"]} == keys
              and r["P_kPa"] and r["P_kPa"][1] <= pmax]
    blocks.sort(key=lambda r: (r["doi"], r["block"]))
    studies, aside = [], []
    ext = work / "extracts"
    ext.mkdir(parents=True, exist_ok=True)
    for r in blocks:
        tag = f"doi {r['doi']} block {r['block']}"
        st, x = _try_block(r)
        if st != "ok":
            aside.append((tag, "extract-px refused it: " + x))
            continue
        d = work / f"b{len(studies) + len(aside)}"
        path, why = cc.extract_px(cc.cache_root() / r["file"], r["block"], d)
        if path is None:
            aside.append((tag, "extract-px refused it: " + why))
            continue
        ds = read_dataset(path)
        if ds["n"] < MIN_INTERIOR:
            aside.append((tag, f"only {ds['n']} interior point(s) (< {MIN_INTERIOR})"))
            continue
        studies.append({"doi": r["doi"], "block": r["block"], "file": r["file"],
                        "xml": cc.cache_root() / r["file"], "path": path, "xOf": None, **ds})
    if not studies:
        refuse(f"NO USABLE STUDY for {a} + {b}: " + "; ".join(f"{t}: {w}" for t, w in aside))
    studies.sort(key=lambda s: (-s["n"], s["doi"], s["block"]))
    c1 = studies[0]["x"]
    c2 = b if c1 == a else a
    for k, s in enumerate(studies):
        if s["x"] != c1:
            path, why = cc.extract_px(s["xml"], s["block"], work / f"r{k}", x_of=c1)
            if path is None:
                refuse(f"extract-px --x-of {c1} refused doi {s['doi']}: {why}")
            s.update(read_dataset(path), path=path, xOf=c1)
    for s in studies:
        final = ext / s["path"].name
        shutil.move(str(s["path"]), final)
        s["path"] = final
    Tmax = max(s["T_K"] for s in studies)
    for c in (c1, c2):
        if Tmax >= pc.component_class(c)[1]:
            refuse(f"CLASS: {c} is supercritical in the data (T up to {Tmax:g} K)")
    return {"c1": c1, "c2": c2, "ident": {ca[0]: ca, cb[0]: cb}, "studies": studies, "aside": aside}


# --------------------------------------------------------------------------
#  the case
# --------------------------------------------------------------------------
def decl_text(pl, case_rel):
    lines = [
        "/*--------------------------------*- Choupo -*--------------------------------*\\",
        f"  constant/archiveDatasets -- WHERE the measurements of {case_rel.split('/')[-1]}",
        "  come from, and how to regenerate them.  NO MEASURED POINT IS IN THIS TREE",
        "  (Vitor, 2026-11-10: the measured series are not copied; only the fitted",
        "  parameters are kept).  `bin/choupo-curate fetch <case>` writes each",
        f"  dataset into {cc.EXTRACTS}/ (gitignored): the article file is taken from",
        "  the local ThermoML cache when it holds it, else from the NIST URL below,",
        "  and BOTH sha256 sums are checked -- a mismatch refuses, an unreachable",
        "  NIST is reported NOT RUN, never a pass.  The extractor is `extract-px`",
        "  (a bubble-PRESSURE block at a stated temperature, DEV.md 4c C291).",
        "\\*-----------------------------------------------------------------------------*/",
        "", "recordType    archiveDatasets;", "", "archive", "{",
        f'    tarball   "{cc.ARCHIVE}";', f'    doi       "{cc.ARCHIVE_DOI}";',
        '    note      "the finding aid; each article file is also served one by one at the NIST URL";',
        "}", "", "datasets", "(",
    ]
    for s in pl["studies"]:
        lines += [
            "    {",
            f'        file          "{cc.EXTRACTS}/{s["path"].name}";',
            "        role          fit;   // C283: every laboratory is fitted",
            f'        doi           "{s["doi"]}";',
            f'        url           "{cc.NIST.format(doi=s["doi"], ext="xml")}";',
            f'        page          "{cc.NIST.format(doi=s["doi"], ext="json")}";',
            f'        articleFile   "{Path(s["file"]).name}";',
            f'        articleSha256 "{cc.sha_file(s["xml"])}";',
            f"        block         {s['block']};",
            "        extractor     bubblePressure;",
        ]
        if s.get("xOf"):
            lines.append(f"        xOf           {s['xOf']};   // the article reports the other member; x = 1 - x'")
        lines += [
            f'        extract       "bin/choupo-thermoml extract-px <article file> --block {s["block"]}'
            + (f" --x-of {s['xOf']}" if s.get("xOf") else "") + ' --into <dir>";',
            f'        sha256        "{cc.sha_file(s["path"])}";',
            "        identity", "        {"]
        for comp in (pl["c1"], pl["c2"]):
            _, cas, key = pl["ident"][comp]
            lines.append(f'            {comp:<14} {{ cas "{cas}"; inchiKey "{key}"; }}')
        lines += ["        }", "    }"]
    lines += [");", ""]
    return "\n".join(lines)


def fit_op(name, c1, c2, studies, start, discards=None, proposal=None, parity="parity.csv", log=None):
    discards = discards or {}
    ev = ""
    for s in studies:
        f = f"{cc.EXTRACTS}/{s['path'].name}"
        ev += f"            {{\n                dataset  \"{f}\";\n                role     fit;\n"
        d = discards.get(s["path"].name)
        if d:
            ev += f"                discard  ( {' '.join(str(r) for r in d)} );   // C291 outliers, by name in the header\n"
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

        objective {{ method twoStage;  scale {{ P_bubble relative; }} }}
        residual
        {{
            kind        P_bubble;
            components  ( {c1} {c2} );
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


def props_text(pl, case_name, stem, discards=None, outlier_txt=None):
    c1, c2, st = pl["c1"], pl["c2"], pl["studies"]
    aside = "\n".join(cc.wrap(f"- {t}: {w}", indent="      ") for t, w in pl["aside"]) or "      (none)"
    ranked = "\n".join(
        f"      {s['doi']:<30} block {s['block']:<3} {s['n']:>3} pts  {s['T_K']:g} K  "
        f"{min(s['P_kPa_list']):g}-{max(s['P_kPa_list']):g} kPa  U {min(s['U']):g}-{max(s['U']):g} kPa"
        + (f"\n        (reports x of the other member: written as x[{c1}] = 1 - x by --x-of)"
           if s.get("xOf") else "") for s in st)
    nT = len({s["T_K"] for s in st})
    nL = len({s["doi"] for s in st})
    outl = outlier_txt or "not yet run."
    hdr = f"""/*--------------------------------*- Choupo -*--------------------------------*\\
|       \\|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\\\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\\\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\\\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \\|/    P roperties    |  Tutorial case file -- part of Choupo         |
|        |     O ptimization  |                                               |
\\*-----------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------*\\
  {case_name} -- AN NRTL PAIR FROM EVERY LABORATORY'S BUBBLE PRESSURES.

  WRITTEN BY bin/curate/pairs_px.py (DEV.md 4c C291, the P-x mirror of the
  C284 bubble-temperature pipeline; record
  docs/design/binary-pairs-from-open-measurements.md section 12).

  THE DECLARATION -- WRITTEN AND COMMITTED BEFORE ANY FIT RAN (several
  declarations of a batch share one commit).

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

  STUDIES: every isothermal bubble-pressure block of the pair at or below
  {PMAX_KPA:g} kPa that states an uncertainty on every point.  FITTED, ALL OF THEM
  ({len(st)} block(s), {nL} laboratory(ies), {nT} temperature(s)):
{ranked}
  SET ASIDE BY THE EXTRACTION RULES, BY NAME:
{aside}

  {MARK}.  Every block above is
  fitted together; none is held out.  NRTL, a_ij = a_ji = 0, alpha = 0.30
  fixed: two parameters (b_ij, b_ji), so tau = b/T carries the temperature
  dependence.  The residual is the bubble PRESSURE at each point's stated
  temperature, RELATIVE, (P_model - P)/P; objective twoStage (least squares,
  then minimax; P_bubble relative).  OUTLIERS: after a least-squares stage over
  every point, a point with |P_model - P|/P > {OUTLIER_PCT:g} % is discarded BY NAME
  (`discard` on its evidence entry, listed below) and the fit repeated
  without it; a STUDY with more than half of its points beyond {OUTLIER_PCT:g} % is
  discarded whole, by name (it contradicts the model and the other
  laboratories as a whole, e.g. a composition labelled as the other member's).
  {GRADED_TEXT}
  Two starts: (0, 0) and (800, -400).  The per-point uncertainty U (kPa) is
  kept in each dataset and is information: this residual is already relative.

  OUTLIERS DISCARDED AFTER THE LEAST-SQUARES STAGE:
  @@OUTLIERS-BEGIN@@
{cc.wrap(outl, indent="      ")}
  @@OUTLIERS-END@@

  @@RESULT-BEGIN@@
  WHAT THE RUN FOUND: not yet run.
  @@RESULT-END@@

  WHAT IS NOT CLAIMED.  The pair is correct at these temperatures in this
  frame (ideal-gas vapour, the catalogue's own vapour-pressure records); the
  measurements were transcribed by the archive and have NOT been read back
  against the articles (the CHECKLIST that `fetch` writes is the aid).
\\*---------------------------------------------------------------------------*/

operations
(
"""
    body = fit_op("fit_nrtl", c1, c2, st, (0, 0), discards, proposal=f"{stem}.proposal.dat",
                  parity="parity.csv", log="fit_history.csv")
    body += fit_op("fit_nrtl_start2", c1, c2, st, (800, -400), discards, parity="parity_start2.csv")
    body += ");\n"
    return hdr + body


def write_case(pl, kind="Px"):
    c1, c2 = pl["c1"], pl["c2"]
    try:
        case = cc.curation_roots.new_pair_case_dir(c1, c2, kind)
    except FileExistsError as ex:
        refuse(str(ex))
    name = cc.label(case)
    stem = "-".join(sorted((c1, c2)))
    (case / "system").mkdir(parents=True)
    (case / "constant").mkdir()
    (case / f"{case.name}.cho").write_text("")
    (case / "system" / "controlDict").write_text(f"""/*  {name}: an NRTL pair for {c1} + {c2} regressed by bin/curate/pairs_px.py
    to EVERY laboratory's measured bubble PRESSURES (DEV.md 4c C291).  See
    system/propsDict for the declaration and the result.  */

application   choupoProps;
description   "NRTL {c1}-{c2} regressed to every laboratory's measured bubble pressures (ThermoML locates, the articles source), graded by max relative pressure error (clean 5 %, warning 10 %, severe 20 %, refused above; C285, C291)";
verbosity     2;
""")
    hdr = f"""/*---------------------------------------------------------------------------*\\
  {name} -- the thermophysical system: gamma-phi at LOW PRESSURE.
    * vapour: IDEAL GAS (fugacity coefficient 1, no Poynting term);
    * pure components: the catalogue's own vapour-pressure records, UNCHANGED;
    * liquid: NRTL, tau_ij = a_ij + b_ij/T, alpha 0.30 FIXED.
  The inline pair is the FIT'S STARTING POINT (zero = ideal mixing); the
  regressed pair is the record under constant/parameters/NRTL/ (or, once
  promoted, the catalogue's, sealed into this case).
\\*---------------------------------------------------------------------------*/

"""
    (case / "constant" / "thermoPhysPropDict").write_text(cc.thermo_dict(c1, c2, hdr))
    (case / "constant" / "archiveDatasets").write_text(decl_text(pl, case.relative_to(ROOT).as_posix()))
    (case / "system" / "propsDict").write_text(props_text(pl, name, stem))
    ex = case / cc.EXTRACTS
    ex.mkdir(parents=True)
    for s in pl["studies"]:
        shutil.copy(s["path"], ex / s["path"].name)
    return case, stem


def px_cases():
    """Every P-x case this module wrote: (case, c1, c2, record stem)."""
    out = []
    for p, a, b in cc.curation_roots.pair_cases():
        if (p / cc.DECL).exists() and MARK in (p / "system" / "propsDict").read_text():
            out.append((p, a, b, cc.curation_roots.pair_stem(a, b)))
    return out


def case_of(a, b):
    for p, x, y, _ in px_cases():
        if {x, y} == {a, b}:
            return p
    return None


# --------------------------------------------------------------------------
#  the run
# --------------------------------------------------------------------------
def point_map(case, files, discards):
    out = []
    for f in files:
        ds = read_dataset(case / cc.EXTRACTS / f)
        for r in range(1, ds["n"] + 1):
            if r not in discards.get(f, []):
                out.append((f, r))
    return out


def outliers_of(case, rows, files):
    """rows: [x, T, P_exp_Pa, P_model_Pa, res_rel]."""
    pm = point_map(case, files, {})
    if len(pm) != len(rows):
        refuse(f"{cc.label(case)}: the least-squares stage loaded {len(rows)} points and the "
               f"extracts list {len(pm)} -- the outliers cannot be named")
    doi = {s["file"].split("/")[-1]: s["doi"] for s in cc.parse_decl(case)}
    found, lines = {}, []
    for (f, r), row in zip(pm, rows):
        x, T, P, Pm, res = row
        if not (abs(res) * 100.0 <= OUTLIER_PCT):       # a NaN model is no bubble pressure
            found.setdefault(f, []).append(r)
            lines.append(f"doi {doi.get(f, f)} row {r}: x {x:.4f}, T {T:.2f} K, P {P / 1000:.3f} kPa, "
                         + ("the model finds no bubble pressure" if res != res
                            else f"dP/P {100 * res:+.1f} %"))
    #  A STUDY WHOSE MAJORITY IS BLATANT is not a set of outliers but a study
    #  that contradicts the model and the other laboratories as a whole (the
    #  first run found one whose liquid composition is evidently the other
    #  member's: its x = 0 pressure is the OTHER component's vapour pressure).
    #  It is discarded WHOLE, by name, with the count (DEV.md 4c C291).
    sizes = {}
    for f, r in pm:
        sizes[f] = sizes.get(f, 0) + 1
    for f in list(found):
        if len(found[f]) > MAJORITY * sizes[f]:
            lines.append(f"doi {doi.get(f, f)}: {len(found[f])} of its {sizes[f]} points lie beyond "
                         f"{OUTLIER_PCT:g} % (more than half): the WHOLE study is discarded")
            found[f] = list(range(1, sizes[f] + 1))
    return found, lines


def stats(rows):
    r = [abs(v[4]) * 100.0 for v in rows]
    nan = sum(1 for v in r if v != v)
    r = [v for v in r if v == v]
    return (max(r) if r else float("nan"), sum(r) / len(r) if r else float("nan"), len(r), nan)


def contributing(case):
    """The (doi, T) of every declared dataset that keeps at least one point
    after the case's declared discards: a study discarded whole is evidence
    that was looked at, not evidence the pair rests on."""
    disc = pc.declared_discards(case)
    out = []
    for d in cc.parse_decl(case) or []:
        ds = read_dataset(case / d["file"])
        if len(disc.get(Path(d["file"]).name, [])) < ds["n"]:
            out.append((d["doi"], ds["T_K"]))
    return out


def declared_discards(case):
    return pc.declared_discards(case)


def curation_block(verdict, n_kept, n_drop, mx, mean, nan, grade, one_liquid, nT, nL):
    return (f"curation\n{{\n"
            f'    rule            "{RULE}";\n'
            f"    evidence        allLaboratories;   // every block fitted, none held out\n"
            f"    objective       twoStage;\n"
            f"    residual        P_bubble;\n"
            f"    residualScale   relative;   // (P_model - P)/P at each point's stated T\n"
            f"    outlierLimit_pct {OUTLIER_PCT:g};   // |P_model - P|/P after the least-squares stage\n"
            f"    outliersDropped {n_drop};\n"
            f"    pointsKept      {n_kept};\n"
            f"    noBubblePoint   {nan};\n"
            f"    maxRelError_pct {mx:.4f};\n"
            f"    meanRelError_pct {mean:.4f};\n"
            f"    acceptance      graded;   // max relative pressure error over the kept points, DEV.md 4c C285 (C291)\n"
            f"    gradeLimits_pct ({GRADE_PCT[0]:g} {GRADE_PCT[1]:g} {GRADE_PCT[2]:g});   // upper limits of clean / warning / severe; above, refused\n"
            f"    grade           {grade};\n"
            f"    oneLiquid       {'true' if one_liquid else 'false'};   // arm (f) over the validity span; a pair that splits ONE liquid is never promoted\n"
            f"    temperatures    {nT};   // distinct stated temperatures in the evidence\n"
            f"    laboratories    {nL};   // distinct articles in the evidence\n"
            f"    singleTemperature {'true' if nT == 1 else 'false'};   // true: b/T was fitted at ONE temperature\n"
            f"    singleLaboratory  {'true' if nL == 1 else 'false'};   // true: ONE laboratory's data, nothing to cross-check it\n"
            f"    verdict         {verdict};\n}}\n")


def readback_op(c1, c2, P_kPa):
    """The pair AS THE CASE'S OWN RECORD (or the catalogue's, once promoted):
    a T-x scan at a pressure inside the data, thermo `model NRTL` with no
    inline pair.  It is what loads the record through the pair loader (so the
    engine voices autoPromoted and a warning / severe grade) -- the fit ops
    run on the inline starting pair.  Appended by the run, after the fits."""
    return f"""    {{
        name        txy_nrtl;
        type        propertyScan1D;
        vary        {{ variable x[{c1}];  from 0.0;  to 1.0;  n 101; }}
        state       {{ P {P_kPa:g} kPa;  composition {{ {c1} 0.5;  {c2} 0.5; }} }}
        thermo
        {{
            equilibrium {{ liquid {{ activityModel {{ model NRTL; /* no inline pair: the case's own record */ }} }} }}
        }}
        properties  ( T_bubble  y_eq_{c1} );
        output      {{ file txy_nrtl.csv; }}
    }}
"""


def readback_P(case):
    """A pressure inside the data: the median measured pressure of the case's
    largest dataset, kPa."""
    best = None
    for d in cc.parse_decl(case) or []:
        ds = read_dataset(case / d["file"])
        if best is None or ds["n"] > best["n"]:
            best = ds
    v = sorted(best["P_kPa_list"])
    return v[len(v) // 2]


def append_readback(case, c1, c2):
    pd = case / "system" / "propsDict"
    t = pd.read_text()
    if "name        txy_nrtl;" in t:
        return False
    k = t.rindex(");")
    pd.write_text(t[:k] + readback_op(c1, c2, readback_P(case)) + t[k:])
    return True


def run(case, pl):
    c1, c2 = pl["c1"], pl["c2"]
    stem = "-".join(sorted((c1, c2)))
    case_rel = case.relative_to(ROOT).as_posix()
    rc = cc.fetch(case, quiet=True)
    if rc:
        refuse(f"fetch of {case_rel} returned {rc}")
    files = pc.evidence_files(case)
    decl = cc.parse_decl(case) or []
    if sorted(Path(d["file"]).name for d in decl) != sorted(files):
        refuse(f"{case_rel}: archiveDatasets declares {len(decl)} dataset(s) and the fit reads {len(files)}")
    rc, out, rows, _ = pc.fit_only(case, "leastSquares", keep_discards=False)
    if rc != 0 or not rows:
        refuse(f"the least-squares stage of {case_rel} exited {rc}: {out[-600:]}")
    found, lines = outliers_of(case, rows, files)
    n_drop = sum(len(v) for v in found.values())
    if n_drop >= len(rows):
        refuse(f"{case_rel}: every point is a blatant outlier or in a discarded study -- nothing is left to fit")
    otxt = (f"{n_drop} point(s) of {len(rows)}: " + "; ".join(lines)) if n_drop else \
        f"none: every one of the {len(rows)} points lies within {OUTLIER_PCT:g} % after the least-squares stage."
    pd = case / "system" / "propsDict"
    new = props_text(pl, cc.label(case), stem, discards=found, outlier_txt=otxt)
    if normalise(new) != normalise(pd.read_text()):
        refuse(f"{cc.label(case)}: the declaration on disk differs from the one the rules give "
               "-- a declaration is never rewritten after it was committed")
    pd.write_text(new)
    rc, out, rows, ptext = pc.fit_only(case, "twoStage")
    if rc != 0 or ptext is None:
        refuse(f"the fit of {case_rel} exited {rc} / wrote no proposal: {out[-600:]}")
    mx, mean, n_kept, nan = stats(rows)
    rf, split = cc.stability(ptext, stem)
    grade = grade_of(mx, nan)
    accepted = grade != "refused"
    verdict = "accepted" if accepted else "notAccepted"
    live = [s for s in pl["studies"] if len(found.get(s["path"].name, [])) < s["n"]]
    nT = len({s["T_K"] for s in live})
    nL = len({s["doi"] for s in live})
    nb = f" ({nan} point(s) with no bubble pressure)" if nan else ""
    if not accepted:
        reason = (f"NOT PROMOTABLE: fit grade refused -- max |dP|/P {mx:.2f} % over the {n_kept} "
                  f"kept points is above {GRADE_PCT[-1]:g} %{nb}")
    elif split:
        reason = (f"NOT PROMOTABLE (fit grade {grade}, max |dP|/P {mx:.2f} %): the pair splits ONE "
                  "liquid inside its own validity span (check_regressed_pairs arm f) -- "
                  + split[0].split(": ", 1)[1])
    elif pc.promotion_refusal(grade):
        reason = (f"NOT PROMOTED (max |dP|/P {mx:.2f} % over the {n_kept} kept points, one liquid "
                  "across the validity span): " + pc.promotion_refusal(grade))
    else:
        reason = (f"PROMOTABLE by `bin/curate/pairs_px.py promote`: fit grade {grade} -- max "
                  f"|dP|/P {mx:.2f} % over the {n_kept} kept points (limits {GRADE_PCT[0]:g} / "
                  f"{GRADE_PCT[1]:g} / {GRADE_PCT[2]:g} %), one liquid across the validity span")
    caveat = ""
    if nT == 1:
        caveat += "  SINGLE TEMPERATURE: b/T was fitted at one temperature; its extrapolation is untested."
    if nL == 1:
        caveat += "  SINGLE LABORATORY: one article's data, nothing to cross-check it."
    hdr = cc.record_header(stem, c1, c2, case_rel,
                           "reviewStatus interim: a case-local record, regressed and not read back.\n"
                           "  Fitted on EVERY laboratory (C291), so the `validation {}` block says, "
                           "truthfully,\n  that nothing was held out; the acceptance is the "
                           "`curation {}` block.",
                           cc.wrap(reason + caveat, indent="  ") + "\n")
    hdr = hdr.replace("to measured\n  bubble temperatures.", "to measured\n  bubble PRESSURES at stated temperatures (P-x, DEV.md 4c C291).")
    hdr = hdr.replace("The two articles named under `evidence` are the", "The articles named under `evidence` are the")
    rec = cc.record_from_proposal(ptext, hdr, cc.case_record_fields(case_rel))
    rec = rec.rstrip("\n") + "\n\n" + curation_block(verdict, n_kept, n_drop, mx, mean, nan, grade,
                                                        not split, nT, nL)
    rp = case / "constant" / "parameters" / "NRTL" / f"{stem}.dat"
    rp.parent.mkdir(parents=True, exist_ok=True)
    rp.write_text(rec)
    append_readback(case, c1, c2)
    cc.seal(case)
    rc, out, js = cc.run_props(case)
    if rc != 0:
        refuse(f"the sealed case {case_rel} exited {rc}: {out[-600:]}")
    d1 = (cc.op_result(js, "fit_nrtl") or {}).get("diagnostics", {})
    d2 = (cc.op_result(js, "fit_nrtl_start2") or {}).get("diagnostics", {})
    keys = sorted(k for k in d1 if k.endswith(".b_ij") or k.endswith(".b_ji"))
    b1, b2 = [d1[k] for k in keys], [d2.get(k) for k in keys]
    same = all(x is not None and abs(x - y) <= 1e-2 * max(1, abs(y)) for x, y in zip(b2, b1))
    txt = (f"WHAT THE RUN FOUND (pinned in `expected`; measured, not argued).  fit_nrtl: "
           f"b_ij = {b1[0]:.1f} K, b_ji = {b1[1]:.1f} K over {n_kept} kept points of "
           f"{len(pl['studies'])} block(s), {nL} laboratory(ies), {nT} temperature(s) "
           f"({n_drop} discarded): max |dP|/P {mx:.2f} %, mean {mean:.2f} %, graded {grade} "
           f"-> {verdict}.  fit_nrtl_start2 lands on "
           f"{'the same pair' if same else 'A DIFFERENT pair'} ({b2[0]:.1f}, {b2[1]:.1f}).  "
           + reason + caveat)
    t = pd.read_text()
    t = re.sub(r"@@RESULT-BEGIN@@.*?@@RESULT-END@@",
               lambda m: "@@RESULT-BEGIN@@\n" + cc.wrap(txt) + "\n  @@RESULT-END@@", t, flags=re.S)
    pd.write_text(t)
    return {"verdict": verdict, "split": bool(split), "max": mx, "mean": mean, "kept": n_kept,
            "dropped": n_drop, "grade": grade, "nT": nT, "nL": nL, "reason": reason,
            "case": cc.label(case), "same": same}


# --------------------------------------------------------------------------
#  promotion
# --------------------------------------------------------------------------
def promoted_text(text, case, stem, i, j):
    case_rel = case.relative_to(ROOT).as_posix()
    cur = crp.block(crp.strip_comments(text), "curation") or ""
    grade = crp.word(cur, "grade")
    mx = crp.num(cur, "maxRelError_pct")
    if grade not in GRADES[:3]:
        refuse(f"{stem}: curation grade `{grade}` -- a refused fit is not promoted")
    one = []
    if crp.word(cur, "singleTemperature") == "true":
        one.append("ONE temperature")
    if crp.word(cur, "singleLaboratory") == "true":
        one.append("ONE laboratory")
    #  DEV.md 4c C300 rule 2: an in-sample clean on one temperature or one
    #  laboratory, with nothing held out, is CAPPED at warning (pc.cap_grade).
    applied, caps = pc.cap_grade(grade, int(crp.num(cur, "temperatures") or 0),
                                 int(crp.num(cur, "laboratories") or 0))
    note = (f"  CAUTION: this record rests on {' and '.join(one)}.\n") if one else ""
    hdr = cc.record_header(
        stem, i, j, case_rel,
        "reviewStatus autoPromoted; review { by none; }: PROMOTED AUTOMATICALLY by\n"
        "  its fitting pipeline (every laboratory fitted to the bubble pressure, outliers beyond\n"
        f"  {OUTLIER_PCT:g} % discarded by name, max |P_model - P|/P over the kept points GRADED\n"
        f"  clean / warning / severe at {GRADE_PCT[0]:g} / {GRADE_PCT[1]:g} / {GRADE_PCT[2]:g} % -- "
        "DEV.md 4c C283 amended, C285, C291;\n"
        f"  THIS fit: {grade} in-sample, {mx:.4f} %"
        + (f", CAPPED at {applied} by C300 ({' and '.join(caps)})" if caps else "")
        + "; one liquid across its validity span), and NO\n"
        "  HUMAN HAS REVIEWED IT.  The engine says so on every run that reads it, and\n"
        "  voices a warning or a severe grade beside it.\n" + note +
        "  Nothing was held out: the `validation {}` block says so, and the acceptance\n"
        "  is the `curation {}` block.  A curator who reads the series back against the\n"
        "  articles records it in the `review {}` block (DEV.md 4c C297).  Revert with\n"
        f"  `bin/choupo-curate revert {stem}`.")
    hdr = hdr.replace("to measured\n  bubble temperatures.", "to measured\n  bubble PRESSURES at stated temperatures (P-x, DEV.md 4c C291).")
    hdr = hdr.replace("The two articles named under `evidence` are the", "The articles named under `evidence` are the")
    body = cc.body_of(text)
    gl = (f"    fitGrade      {applied};   // DEV.md 4c C285 (C291): max |P_model - P|/P over the kept "
          f"points, graded {GRADE_PCT[0]:g} / {GRADE_PCT[1]:g} / {GRADE_PCT[2]:g} %\n"
          + pc.BASIS_LINE + pc.cap_line(caps) +
          f"    fitGradeMaxRelativeError_pct {mx:.4f};\n")
    body = re.sub(r"(\n    reviewStatus\s+)interim;",
                  lambda m: m.group(1) + "autoPromoted;\n" + pc.REVIEW_NONE + gl
                  + f'    promotedBy    "{PROMOTED_BY}";\n'
                  + f'    promotedDate  "{date.today().isoformat()}";', body, count=1)
    return hdr + body


PROMOTED_BY = "bin/curate/pairs_px.py promote"


def promote(a, b):
    case = case_of(a, b)
    if case is None:
        refuse(f"no C291 case for {a} + {b}")
    recs = list((case / "constant" / "parameters" / "NRTL").glob("*.dat"))
    if len(recs) != 1:
        refuse(f"{cc.label(case)} carries {len(recs)} NRTL records; expected its one")
    rp = recs[0]
    text = rp.read_text()
    if cc.existing_records(a, b, model="NRTL"):
        refuse(f"a catalogue record for {a} + {b} already exists")
    cur = crp.block(crp.strip_comments(text), "curation") or ""
    if crp.word(cur, "verdict") != "accepted":
        refuse(f"{rp.stem}: curation verdict `{crp.word(cur, 'verdict')}` -- only an accepted fit is promoted")
    if pc.promotion_refusal(crp.word(cur, "grade")):
        refuse(f"{rp.stem}: NOT PROMOTED: " + pc.promotion_refusal(crp.word(cur, "grade")))
    rf, split = cc.stability(text, rp.stem)
    if split:
        refuse(f"{rp.stem}: " + split[0])
    dest = cc.STD_NRTL / f"{rp.stem}.dat"
    if dest.exists():
        refuse(f"{dest.relative_to(ROOT)} exists -- never overwritten")
    mxg = crp.num(cur, "maxRelError_pct")
    blk = ("@@RESULT-BEGIN@@", "@@RESULT-END@@", "bin/curate/pairs_px.py promote")
    ideal = pc.ideal_guard(case, "px", crp.word(cur, "grade"), mxg, rp.stem, blk)
    dest.write_text(pc.stamp_ideal(promoted_text(text, case, rp.stem, rf["i"], rf["j"]),
                                   "px", mxg, ideal))
    rp.unlink()
    try:
        cc.seal(case)
    except SystemExit:
        dest.unlink()
        rp.write_text(text)
        cc.seal(case)
        raise
    pc.restate_severe_result(case, *blk, kind="px", mx=mxg, ideal=ideal)
    cc.mark_result(case, "PROMOTABLE by `bin/curate/pairs_px.py promote`:",
                   f"PROMOTED on {date.today().isoformat()} into {dest.relative_to(ROOT).as_posix()} "
                   "as reviewStatus autoPromoted, review by none, because:")
    pv = crp.block(crp.strip_comments(dest.read_text()), "provenance") or ""
    cc.say(f"pairs_px: PROMOTED {dest.relative_to(ROOT)} (fitGrade {crp.word(pv, 'fitGrade')})")


# --------------------------------------------------------------------------
#  the command line
# --------------------------------------------------------------------------
def normalise(t):
    """pairs_c283.normalise, and the read-back op the run appends is not part
    of the declaration either."""
    t = pc.normalise(t)
    return re.sub(r"    \{\n        name        txy_nrtl;.*?\n    \}\n", "", t, flags=re.S)


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(prog="pairs_px")
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("census")
    l = sp.add_parser("list")
    l.add_argument("--top", type=int, default=60)
    d = sp.add_parser("declare")
    d.add_argument("--top", type=int, default=50)
    d.add_argument("--skip", type=int, default=0)
    d.add_argument("--json")
    r = sp.add_parser("run")
    r.add_argument("--only", nargs="*")
    r.add_argument("--json")
    rb = sp.add_parser("readback")
    rb.add_argument("--only", nargs="*")
    p = sp.add_parser("promote")
    p.add_argument("--only", nargs="*")
    a = ap.parse_args(argv)
    if a.cmd == "census":
        n, ok, cnt = census()
        print(f"bubble-pressure blocks of two compounds in the index: {n}; interpretable by extract-px: {ok}")
        for k, v in cnt.most_common():
            print(f"  {v:>5}  {k}")
        return 0
    allc = candidates()
    if a.cmd == "list":
        from collections import Counter
        cnt = Counter(e["status"] for e in allc)
        print(f"bubble-pressure pairs: {len(allc)}; " + ", ".join(f"{k} {v}" for k, v in sorted(cnt.items())))
        cls = Counter(e["why"].split(": ", 1)[1].split(" (")[0] for e in allc if e["status"] == "refusedByClass")
        print("  refused by class: " + ", ".join(f"{k} {v}" for k, v in cls.most_common()))
        for k, e in enumerate([e for e in allc if e["status"] == "candidate"][:a.top]):
            print(f"  {k + 1:>3} {e['pair'][0]} + {e['pair'][1]}: {e['studies']} studies, {e['points']} points")
        return 0
    cand = [e for e in allc if e["status"] == "candidate"]
    out = []
    if a.cmd == "declare":
        todo = cand[a.skip:a.skip + a.top]
        for e in todo:
            x, y = e["pair"]
            rec = {"pair": [x, y]}
            work = Path(tempfile.mkdtemp(prefix="pairs-px-"))
            try:
                if case_of(x, y):
                    rec["outcome"] = "declared already"
                else:
                    pl = plan(x, y, PMAX_KPA, work)
                    case, _ = write_case(pl)
                    rec["outcome"], rec["case"] = "declared", cc.label(case)
            except Refused as ex:
                rec["outcome"] = "refused: " + str(ex)
            except SystemExit as ex:
                rec["outcome"] = f"refused (exit {ex.code})"
            finally:
                shutil.rmtree(work, ignore_errors=True)
            print(f"[{x} + {y}] {rec['outcome'][:300]}", flush=True)
            out.append(rec)
        if a.json:
            Path(a.json).write_text(json.dumps(out, indent=1))
        return 0
    if a.cmd == "readback":
        for case, x, y, num in px_cases():
            if a.only and num not in a.only:
                continue
            if append_readback(case, x, y):
                cc.seal(case)
                rc, o, js = cc.run_props(case)
                cc.say(f"[{cc.label(case)}] read-back op appended; sealed case exit {rc}")
        return 0
    cases = px_cases()
    if a.only:
        want = set(a.only)
        cases = [c for c in cases if c[3] in want]
    for case, x, y, num in cases:
        rec = {"case": cc.label(case), "pair": [x, y]}
        work = Path(tempfile.mkdtemp(prefix="pairs-px-"))
        try:
            rps = list((case / "constant" / "parameters" / "NRTL").glob("*.dat"))
            promoted = cc.existing_records(x, y, model="NRTL")
            if a.cmd == "run":
                if rps or promoted:
                    rec["outcome"] = "ran already"
                else:
                    pl = plan(x, y, PMAX_KPA, work)
                    if normalise((case / cc.DECL).read_text()) != normalise(
                            decl_text(pl, case.relative_to(ROOT).as_posix())):
                        refuse(f"{cc.label(case)}'s dataset declaration differs from the one the rules give now")
                    for s in pl["studies"]:
                        (case / cc.EXTRACTS).mkdir(parents=True, exist_ok=True)
                        shutil.copy(s["path"], case / cc.EXTRACTS / s["path"].name)
                    rec.update(run(case, pl))
                    rec["outcome"] = "ran"
            else:
                cur = crp.block(crp.strip_comments(rps[0].read_text()), "curation") if rps else None
                if promoted:
                    rec["outcome"] = "promoted already"
                elif not rps or cur is None:
                    rec["outcome"] = "not run"
                elif crp.word(cur, "verdict") != "accepted":
                    rec["outcome"] = f"notAccepted (grade {crp.word(cur, 'grade')})"
                else:
                    try:
                        promote(x, y)
                        rec["outcome"] = f"promoted (grade {crp.word(cur, 'grade')})"
                    except (Refused, SystemExit) as ex:
                        rec["outcome"] = f"not promoted: {ex}"
        except Refused as ex:
            rec["outcome"] = "refused: " + str(ex)
        except SystemExit as ex:
            rec["outcome"] = f"refused (exit {ex.code})"
        except Exception as ex:   # noqa: BLE001
            rec["outcome"] = f"error: {type(ex).__name__}: {ex}"
        finally:
            shutil.rmtree(work, ignore_errors=True)
        print(f"[{cc.label(case)}] {rec['outcome'][:300]}"
              + (f"  {rec['verdict']} grade {rec['grade']} max {rec['max']:.2f} %"
                 f"{' SPLITS' if rec.get('split') else ''}" if "verdict" in rec else ""), flush=True)
        out.append(rec)
        if getattr(a, "json", None):
            Path(a.json).write_text(json.dumps(out, indent=1, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
