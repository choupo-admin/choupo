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
RULE = "DEV.md 4c C283 (amended) + C284"
MARK = "THE RULE (DEV.md 4c C283 amended, C284)"
COMP = ROOT / "data" / "standards" / "components"

#  THE GRADED ACCEPTANCE (DEV.md 4c C285, Vitor 2026-11-10: "mete mesmo as que
#  estao acima de 5%. Mas acima de 5% - 10% mete um warning, e entre 10 a 20%
#  poe um warning mais severo. Acima de 20% descarta"), applied to pairs by
#  C286 ("Avanca pa!").  The temperature limits are C285's stated default,
#  the same factors: max |T_model - T| over the kept points up to 1 K clean,
#  2 K warning, 4 K severe, refused above; a point with no bubble point
#  refuses.  C283's relative clause, graded 5 / 10 / 20 %, judges composition;
#  a T_bubble fit has no composition residual, so it is declared and unused.
GRADES = ("clean", "warning", "severe", "refused")
#  ONE home of the pair limits (pairs_px.py reads GRADE_PCT from here).  DEV.md
#  4c C334 (second opinion): they do NOT widen -- a bubble P or T error goes
#  straight into relative volatility and stage count.  A severe fit is promoted
#  only if it BEATS THE IDEAL MIXTURE on its own kept points (C334 guard).
GRADE_K = (1.0, 2.0, 4.0)
GRADE_PCT = (5.0, 10.0, 20.0)
GMARK = "THE GRADED ACCEPTANCE (DEV.md 4c C285, applied to pairs by C286)"
RULE_GRADED = "DEV.md 4c C283 (amended) + C284, graded by C285 (C286)"
GRADED_TEXT = (
    GMARK + ": max |T_model - T| over the KEPT points is GRADED -- clean up to "
    f"{GRADE_K[0]:g} K, warning up to {GRADE_K[1]:g} K, severe up to {GRADE_K[2]:g} K, "
    "refused above; a point with no bubble point refuses.  C283's relative clause "
    f"({GRADE_PCT[0]:g} / {GRADE_PCT[1]:g} / {GRADE_PCT[2]:g} %) judges composition; "
    "this fit has no composition residual, so only the temperature clause applies.  "
    "Every grade but refused is accepted and promoted (autoPromoted, humanReviewed "
    "false) with `fitGrade` and its max |dT| in the record's provenance; the engine "
    "voices a warning or a severe grade on every run that reads the pair.  A pair "
    "that splits ONE liquid inside its validity span is not promoted, whatever its "
    "grade (arm f).")
#  The C283/C284 acceptance sentence a graded declaration replaces, as
#  props_text writes it (a re-declaration is checked against it, so the
#  only words that change are the acceptance's).
OLD_ACC = ("without it.  ACCEPTED when max |T_model - T| over the KEPT points is below\n"
           f"  {ACCEPT_K:g} K.  C283's 5 % relative clause judges composition; this fit has no\n"
           "  composition residual, so only the temperature clause applies.  A pair\n"
           "  that splits ONE liquid inside its validity span is not promoted (arm f).")


def grade_of(mx, nan=0):
    """clean / warning / severe / refused: the first upper limit max |dT|
    stays within; a point with no bubble point refuses."""
    if nan or mx != mx:
        return "refused"
    for g, lim in zip(GRADES, GRADE_K):
        if mx <= lim:
            return g
    return GRADES[-1]


#  Components ARCHIVED by a coordinator's ruling: no pair containing one is
#  fitted, promoted or started (DEV.md 4c, the coordinator session,
#  2026-11-10: acetic acid is archived this month -- its vapour dimerises).
ARCHIVED = {"aceticAcid": "acetic acid archived (DEV.md 4c)"}


class Refused(Exception):
    pass


#  DEV.md 4c C300 rules 1 and 2 (2026-11-11), ONE home for both pair tools
#  (pairs_px imports this module) and for the gate that recomputes them
#  (bin/curate/check_regressed_pairs.py).  Rule 1: every grade is the fit
#  reproducing the very points it was fitted to, and the record says so
#  (`fitGradeBasis inSample;`).  Rule 2: `clean` needs evidence able to
#  contradict it -- at least two temperatures AND at least two laboratories,
#  or a held-out set that itself grades clean; otherwise the grade is CAPPED
#  at `warning` and the record names why (`fitGradeCap ( ... );`).  The
#  curation block keeps the in-sample grade the residual earned (`grade`);
#  the provenance carries the grade the catalogue applies (`fitGrade`).
CAP_WORDS = ("singleTemperature", "singleLaboratory")
#  C300 rule 4: a tool writes who reviewed the record, and today that is nobody.
REVIEW_NONE = cc.REVIEW_NONE   # one wording, in bin/choupo-curate
BASIS_LINE = "    fitGradeBasis inSample;   // DEV.md 4c C300 rule 1: the residual of the points it was fitted to\n"


def cap_grade(grade, n_temperatures, n_laboratories, heldout_clean=False):
    """(grade the catalogue applies, [cap words]) -- C300 rule 2.  Only an
    in-sample `clean` is capped; a warning or severe stands as it is."""
    if grade != "clean" or heldout_clean:
        return grade, []
    caps = [w for w, n in zip(CAP_WORDS, (n_temperatures, n_laboratories)) if n < 2]
    return ("warning" if caps else grade), caps


#  DEV.md 4c C333 (Vitor; it REVERSES C300 rule 3): a `severe` fit STAYS in
#  the catalogue, voiced SEVERE by the engine on every run that reads it;
#  only a `refused` fit is discarded.  ONE home, beside cap_grade, read by
#  both pair tools' promotion and by the result line a run writes.  (A pair
#  that splits one liquid inside its validity span stays unpromoted whatever
#  its grade -- a separate test, unchanged.)
NOT_PROMOTED_GRADES = ("refused",)


def promotion_refusal(grade):
    """The reason a fit of in-sample grade `grade` is NOT promoted into
    data/standards, or None when it may be (C286; C333: severe stays)."""
    if grade == "refused":
        return "fit grade refused -- a refused fit is not promoted (C286, C333)"
    return None


_SEVERE_REASON = re.compile(
    r"NOT PROMOTED \((max [^()]*?)\): fit grade severe -- DEV\.md 4c C300 rule 3: a severe "
    r"pair does not enter the default catalogue; its record stays in this curation case's "
    r"constant/, and a case that needs it carries it in its own constant/")


def ideal_max(case, kind):
    """DEV.md 4c C334 guard: the SAME max-error statistic as the fit's own
    (max |dT| in K for `tx`, max |dP|/P in % for `px`) with every activity
    coefficient 1 (Raoult: a_ij = b_ij = 0, the same vapour-pressure records,
    the same kept points), read from the case's OWN fit op run with its
    parameters at their zero start and no iteration (`maxIter 0`, least
    squares): a scratch copy, nothing is written into the case."""
    rc = cc.fetch(case, quiet=True)
    if rc:
        refuse(f"fetch of {cc.label(case)} returned {rc}")
    work = Path(tempfile.mkdtemp(prefix="choupo-curate-c334-"))
    try:
        sc = work / case.name
        shutil.copytree(case, sc, ignore=shutil.ignore_patterns("expected"))
        pdp = sc / "system" / "propsDict"
        t = pdp.read_text()
        i = t.index("    {\n        name        fit_nrtl_start2;")
        t = t[:i] + ");\n"
        j = t.index("name        fit_nrtl;")
        op = t[j:]
        inits = re.findall(r"initial\s+([-0-9.eE+]+);", op)
        if len(inits) != 2 or any(float(v) != 0.0 for v in inits):
            refuse(f"{cc.label(case)}: the fit_nrtl op does not start at zero parameters "
                   f"({inits}) -- the ideal mixture cannot be read from it")
        t = t.replace("method twoStage;", "method leastSquares;")
        t, n = re.subn(r"maxIter\s+\d+;", "maxIter      0;", t)
        if n != 1:
            refuse(f"{cc.label(case)}: expected one maxIter in the fit op, found {n}")
        pdp.write_text(t)
        for stale in sc.glob("*.proposal.dat"):
            stale.unlink()
        rc, out, js = cc.run_props(sc)
        par = sc / "parity.csv"
        rows = []
        if par.exists():
            for l in par.read_text().splitlines()[1:]:
                if l.strip():
                    rows.append([float(v) for v in l.split(",")])
        if not rows:
            refuse(f"{cc.label(case)}: the ideal read-back exited {rc} and wrote no parity rows")
        scale = 100.0 if kind == "px" else 1.0
        r = [abs(v[4]) * scale for v in rows]
        if any(v != v for v in r):
            return float("inf")
        return max(r)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def ideal_guard(case, kind, grade, mx, label, blk=None):
    """C334: None for any grade but severe; for a severe fit the ideal max,
    REFUSED (by name, with both numbers) unless fit < ideal."""
    if grade != "severe":
        return None
    ideal = ideal_max(case, kind)
    unit = "%" if kind == "px" else "K"
    if not mx < ideal:
        if blk:
            restate_severe_result(case, *blk, kind=kind, mx=mx, ideal=ideal, beaten=False)
        refuse(f"{label}: NOT PROMOTED: a severe fit is promoted only if it BEATS THE IDEAL "
               f"MIXTURE on its own kept points (DEV.md 4c C334) -- fit max {mx:.4f} {unit}, "
               f"ideal (gamma = 1) max {ideal:.4f} {unit}")
    return ideal


def stamp_ideal(text, kind, mx, ideal):
    """Write the guard's two numbers into the promoted record's provenance,
    beside the fit's own max-error line."""
    if ideal is None:
        return text
    key = "fitGradeMaxRelativeError_pct" if kind == "px" else "fitGradeMaxTemperatureError_K"
    unit = "%" if kind == "px" else "K"
    new, n = re.subn(rf"(\n    {key} [^\n]*;\n)",
                     lambda m: m.group(1) + f"    fitGradeIdealMax{key[len('fitGradeMax'):]} {ideal:.4f};"
                     f"   // DEV.md 4c C334: the ideal mixture (gamma = 1) on the SAME kept points; a severe fit "
                     f"is promoted only if {mx:.4f} {unit} < {ideal:.4f} {unit}\n", text, count=1)
    if n != 1:
        refuse("stamp_ideal: no fitGradeMax line in the promoted record")
    return new


def restate_severe_result(case, begin, end, phrase, kind=None, mx=None, ideal=None,
                          after=None, beaten=True):
    """DEV.md 4c C334: a case written under the retired C300 rule 3 says `NOT
    PROMOTED ... severe`.  Before the promotion marks the paragraph, that
    sentence is restated in the PROMOTABLE form the promote step rewrites,
    with the guard's two numbers, or -- `beaten` False, the guard having
    refused -- as the guard's refusal.  `after`
    restricts it to the text after that marker (one model of several)."""
    pd = case / "system" / "propsDict"
    x = pd.read_text()
    m = re.search(re.escape(begin) + r"(.*?)" + re.escape(end), x, re.S)
    if not m:
        return
    para = " ".join(m.group(1).split())
    k = para.find(after) if after else 0
    if k < 0:
        return
    unit = "%" if kind == "px" else "K"

    def rep(g):
        if not beaten:
            return (f"NOT PROMOTED ({g.group(1)}): fit grade severe, and a severe fit is promoted "
                    f"only if it BEATS THE IDEAL MIXTURE on its own kept points (DEV.md 4c C334): "
                    f"fit max {mx:.4f} {unit}, ideal (gamma = 1) max {ideal:.4f} {unit}")
        tail = (f"; BEATS THE IDEAL MIXTURE (C334): {mx:.4f} {unit} against ideal {ideal:.4f} {unit}"
                if ideal is not None else "")
        return f"PROMOTABLE by `{phrase}`: fit grade severe -- {g.group(1)}{tail}"

    new = para[:k] + _SEVERE_REASON.sub(rep, para[k:], count=1)
    if new != para:
        pd.write_text(x[:m.start()] + begin + "\n" + cc.wrap(new) + "\n  " + end + x[m.end():])


def cap_line(caps):
    """The provenance line naming the cap, or "" when nothing was capped."""
    if not caps:
        return ""
    return (f"    fitGradeCap   ( {' '.join(caps)} );   // DEV.md 4c C300 rule 2: in-sample "
            "clean, capped -- nothing held out could have contradicted it\n")


def tx_evidence_counts(case):
    """(distinct temperatures, distinct laboratories) of the KEPT bubble-
    temperature points of a C283 case: a study whose every row the case
    discards is evidence that was looked at, not evidence the pair rests on.
    Needs the extracts (`bin/choupo-curate fetch`)."""
    disc = declared_discards(case)
    doi = {Path(s["file"]).name: s["doi"] for s in cc.parse_decl(case) or []}
    temps, labs = set(), set()
    for f in evidence_files(case):
        ds = cc.read_dataset(case / cc.EXTRACTS / f)
        kept = [T for r, T in enumerate(ds["T"], 1) if r not in disc.get(f, [])]
        if kept:
            labs.add(doi.get(f, f))
            temps.update(round(T, 2) for T in kept)
    return len(temps), len(labs)


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
    mine = case_of(a, b)
    if have and not (mine is not None and own_promotion(
            a, b, mine.relative_to(ROOT).as_posix()) is not None):
        refuse(f"PRESENT: the pair {a} + {b} already has a catalogue record: "
               f"{', '.join(have)} -- never overwritten (only a record this pipeline "
               "promoted from the pair's own case is regraded, under C286)")
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


def props_text(pl, case_name, stem, unifac, discards=None, outlier_txt=None,
               graded=False, earlier=None):
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
  record docs/design/binary-pairs-from-open-measurements.md section 11).

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
    if graded:
        if OLD_ACC not in hdr:
            refuse(f"{case_name}: the C283 acceptance sentence is not where the "
                   "template puts it -- the graded declaration cannot be derived")
        hdr = hdr.replace(OLD_ACC, "without it.\n" + cc.wrap(GRADED_TEXT), 1)
        if earlier:
            hdr = hdr.replace(
                "  @@RESULT-END@@\n",
                "  @@RESULT-END@@\n\n  EARLIER FITS, SUPERSEDED BY THIS DECLARATION\n"
                "  @@EARLIER-BEGIN@@\n" + cc.wrap(earlier) + "\n  @@EARLIER-END@@\n", 1)
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


def write_case(pl, kind="Tx"):
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
    (case / "system" / "controlDict").write_text(f"""/*  {name}: an NRTL pair for {c1} + {c2} regressed by bin/choupo-curate to
    EVERY laboratory's measured bubble temperatures (DEV.md 4c C283 amended,
    C284).  See system/propsDict for the declaration and the result.  */

application   choupoProps;
description   "NRTL {c1}-{c2} regressed by the curation pipeline to every laboratory's measured bubble temperatures (ThermoML locates, the articles source), graded by max |dT| (clean 1 K, warning 2 K, severe 4 K, refused above; C285, C286)";
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
    #  C290: a new declaration carries the graded acceptance from the start
    #  (C285, applied to pairs by C286); the C284 form is written only by the
    #  cases that predate it, and re-declared by --redeclare.
    (case / "system" / "propsDict").write_text(props_text(pl, name, stem, unifac, graded=True))
    ex = case / cc.EXTRACTS
    ex.mkdir(parents=True)
    for s in pl["studies"]:
        shutil.copy(s["path"], ex / s["path"].name)
    return case, stem


def case_of(c1, c2):
    """The C283 case of the pair (a C282 pilot case of the same pair is not
    it: it stays as the pilot wrote it)."""
    stem = cc.curation_roots.pair_stem(c1, c2)
    for p, a, b in cc.curation_roots.pair_cases():
        if cc.curation_roots.pair_stem(a, b) == stem \
                and (p / cc.DECL).exists() and is_c283(p):
            return p
    return None


def is_c283(case):
    return MARK in (case / "system" / "propsDict").read_text()


def is_graded(case):
    return GMARK in (case / "system" / "propsDict").read_text()


def own_promotion(c1, c2, case_rel):
    """The catalogue record THIS pipeline promoted from THIS case, or None.
    A graded re-run regrades it in place; any other record of the pair is
    never overwritten."""
    have = cc.existing_records(c1, c2, model="NRTL")
    if len(have) != 1:
        return None
    p = ROOT / have[0]
    t = crp.strip_comments(p.read_text())
    if crp.word(t, "promotedBy") == cc.PROMOTED_BY and crp.word(t, "fittedInCase") == case_rel \
            and crp.word(t, "reviewStatus") == "autoPromoted":
        return p
    return None


def normalise(t):
    t = re.sub(r"@@RESULT-BEGIN@@.*?@@RESULT-END@@", "", t, flags=re.S)
    t = re.sub(r"@@OUTLIERS-BEGIN@@.*?@@OUTLIERS-END@@", "", t, flags=re.S)
    #  DEV.md 4c C294: the other models' declaration, ops and result are a
    #  later declaration on top of the NRTL one, never part of it.
    t = re.sub(r"  @@MODELS-BEGIN@@.*?@@MODELS-RESULT-END@@\n\n", "", t, flags=re.S)
    t = re.sub(r"    // @@C294-OPS-BEGIN@@.*?// @@C294-READBACK-END@@\n", "", t, flags=re.S)
    t = re.sub(r"    // @@C294-OPS-BEGIN@@.*?// @@C294-OPS-END@@\n", "", t, flags=re.S)
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
        refuse(f"{cc.label(case)}: the least-squares stage loaded {len(rows)} points and the "
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


def curation_block(verdict, n_kept, n_drop, mx, mean, nan, grade=None, one_liquid=None):
    if grade is not None:
        acc = ("    acceptance      graded;   // max |T_model - T| over the kept points, "
               "DEV.md 4c C285 (C286)\n"
               f"    gradeLimits_K   ({GRADE_K[0]:g} {GRADE_K[1]:g} {GRADE_K[2]:g});   "
               "// upper limits of clean / warning / severe; above, refused\n"
               f"    grade           {grade};\n"
               f"    oneLiquid       {'true' if one_liquid else 'false'};   // arm (f) over the "
               "validity span; a pair that splits ONE liquid is never promoted, whatever "
               "its grade\n")
        rule = RULE_GRADED
    else:
        acc = (f"    acceptance      {ACCEPT_K:g} K;   // max |T_model - T| over the kept points\n")
        rule = RULE
    return (f"curation\n{{\n"
            f'    rule            "{rule}";\n'
            f"    evidence        allLaboratories;   // every study fitted, none held out\n"
            f"    objective       twoStage;\n"
            f"    outlierLimit    {OUTLIER_K:g} K;   // |T_model - T| after the least-squares stage\n"
            f"    outliersDropped {n_drop};\n"
            f"    pointsKept      {n_kept};\n"
            f"    noBubblePoint   {nan};\n"
            f"    maxAbsError     {mx:.4f} K;\n"
            f"    meanAbsError    {mean:.4f} K;\n"
            + acc +
            f"    verdict         {verdict};\n}}\n")


def run(case, pl, commit):
    c1, c2 = pl["c1"], pl["c2"]
    stem = "-".join(sorted((c1, c2)))
    case_rel = case.relative_to(ROOT).as_posix()
    graded = is_graded(case)
    earlier = cc.earlier_of(case) if graded else None
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
    new = props_text(pl, cc.label(case), stem, unifac, discards=found, outlier_txt=otxt,
                     graded=graded, earlier=earlier)
    if normalise(new) != normalise(pd.read_text()):
        refuse(f"{cc.label(case)}: the declaration on disk differs from the one the rules "
               "give -- a declaration is never rewritten after it was committed")
    pd.write_text(new)
    #  STAGE B: twoStage on the kept points
    rc, out, rows, ptext = fit_only(case, "twoStage")
    if rc != 0 or ptext is None:
        refuse(f"the fit of {case_rel} exited {rc} / wrote no proposal: {out[-600:]}")
    mx, mean, n_kept, nan = stats(rows)
    rf, split = cc.stability(ptext, stem)
    grade = grade_of(mx, nan) if graded else None
    accepted = (grade != "refused") if graded else (nan == 0 and mx < ACCEPT_K)
    verdict = "accepted" if accepted else "notAccepted"
    nb = f" ({nan} point(s) with no bubble point)" if nan else ""
    if not accepted:
        reason = ((f"NOT PROMOTABLE: fit grade refused -- max |dT| {mx:.3f} K over the "
                   f"{n_kept} kept points is above {GRADE_K[-1]:g} K{nb}") if graded else
                  (f"NOT PROMOTABLE: max |dT| {mx:.3f} K over the {n_kept} kept points "
                   f"is not below {ACCEPT_K:g} K{nb}"))
    elif split:
        reason = ((f"NOT PROMOTABLE (fit grade {grade}, max |dT| {mx:.3f} K): " if graded
                   else "NOT PROMOTABLE: ")
                  + "the pair splits ONE liquid inside its own validity "
                  "span (check_regressed_pairs arm f) -- " + split[0].split(": ", 1)[1])
    elif graded and own_promotion(c1, c2, case_rel) is None and promotion_refusal(grade):
        reason = (f"NOT PROMOTED (max |dT| {mx:.3f} K over the {n_kept} kept points, one "
                  "liquid across the validity span): " + promotion_refusal(grade))
    elif graded:
        reason = (f"PROMOTABLE by `bin/choupo-curate pair ... --promote`: fit grade "
                  f"{grade} -- max |dT| {mx:.3f} K over the {n_kept} kept points "
                  f"(limits {GRADE_K[0]:g} / {GRADE_K[1]:g} / {GRADE_K[2]:g} K), one "
                  "liquid across the validity span")
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
    rec = rec.rstrip("\n") + "\n\n" + curation_block(verdict, n_kept, n_drop, mx, mean,
                                                        nan, grade, not split)
    rp = case / "constant" / "parameters" / "NRTL" / f"{stem}.dat"
    own = own_promotion(c1, c2, case_rel) if graded else None
    promoted_now = None
    if own is not None:
        #  THIS pipeline promoted the pair from THIS case before the graded
        #  declaration: it is regraded IN PLACE.  The case carries the
        #  catalogue's sealed copy, never an authored record of its own.
        if not accepted or split:
            refuse(f"{cc.label(case)}: the catalogue record {own.relative_to(ROOT)} was "
                   f"promoted from this case and now {reason} -- revert it by hand "
                   f"(`bin/choupo-curate revert {own.stem}`); never regraded in place")
        old = own.read_text()
        own.write_text(promoted_text(rec, case, stem, rf["i"], rf["j"]))
        try:
            cc.seal(case)
        except (SystemExit, Refused):
            own.write_text(old)
            cc.seal(case)
            raise
        promoted_now = own
    else:
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
    judged = (f"graded {grade} (limits {GRADE_K[0]:g} / {GRADE_K[1]:g} / {GRADE_K[2]:g} K)"
              if graded else f"against the acceptance {ACCEPT_K:g} K")
    tail = reason
    if promoted_now is not None:
        tail = (f"PROMOTED on {date.today().isoformat()} into "
                f"{promoted_now.relative_to(ROOT).as_posix()} as reviewStatus "
                "autoPromoted, humanReviewed false, regraded in place by the C286 "
                "re-run, because: " + reason.split(": ", 1)[1])
    txt = (f"WHAT THE RUN FOUND (pinned in `expected`; measured, not argued).  "
           f"fit_nrtl: b_ij = {b1[0]:.1f} K, b_ji = {b1[1]:.1f} K over {n_kept} kept "
           f"points of {len(pl['studies'])} laboratories ({n_drop} discarded): max |dT| "
           f"{mx:.3f} K, mean {mean:.3f} K, {judged} -> "
           f"{verdict}.  fit_nrtl_start2 lands on "
           f"{'the same pair' if same else 'A DIFFERENT pair'} "
           f"({b2[0]:.1f}, {b2[1]:.1f}).  {tail}")
    t = pd.read_text()
    t = re.sub(r"@@RESULT-BEGIN@@.*?@@RESULT-END@@",
               "@@RESULT-BEGIN@@\n" + cc.wrap(txt) + "\n  @@RESULT-END@@", t, flags=re.S)
    pd.write_text(t)
    return {"verdict": verdict, "split": bool(split), "max": mx, "mean": mean,
            "kept": n_kept, "dropped": n_drop, "studies": len(pl["studies"]),
            "reason": reason, "same": same, "b": b1, "case": cc.label(case), "nan": nan,
            "grade": grade, "regraded": promoted_now is not None}


# --------------------------------------------------------------------------
#  promotion
# --------------------------------------------------------------------------
def promoted_text(text, case, stem, i, j):
    """The catalogue form of an accepted case-local record: autoPromoted,
    `review { by none; }` (C300 rule 4: no `humanReviewed`), and -- under the
    graded acceptance -- the grade, its basis (in-sample, C300 rule 1), the
    cap rule 2 applies and the number that decided it in the record's
    provenance (DEV.md 4c C286, C300)."""
    case_rel = case.relative_to(ROOT).as_posix()
    cur = crp.block(crp.strip_comments(text), "curation") or ""
    grade = crp.word(cur, "grade")
    mx = crp.num(cur, "maxAbsError")
    applied, caps = grade, []
    if grade:
        if grade not in GRADES[:3]:
            refuse(f"{stem}: curation grade `{grade}` -- a refused fit is not promoted")
        nT, nL = tx_evidence_counts(case)
        applied, caps = cap_grade(grade, nT, nL)
        rule_txt = (f"  its fitting pipeline (every laboratory fitted, outliers beyond 3 K\n"
                    f"  discarded by name, max |T_model - T| over the kept points GRADED\n"
                    f"  clean / warning / severe at {GRADE_K[0]:g} / {GRADE_K[1]:g} / "
                    f"{GRADE_K[2]:g} K -- DEV.md 4c C283\n"
                    f"  amended, C285, C286; THIS fit: {grade} in-sample, {mx:.4f} K"
                    + (f", CAPPED at {applied} by C300 ({' and '.join(caps)})" if caps else "")
                    + "; one liquid\n"
                    "  across its validity span), and NO HUMAN HAS REVIEWED IT.  The\n"
                    "  engine says so on every run that reads it, and voices a warning\n"
                    "  or a severe grade beside it.\n")
    else:
        rule_txt = ("  its fitting pipeline (every laboratory fitted, outliers beyond 3 K\n"
                    "  discarded by name, max |T_model - T| over the kept points below 1 K --\n"
                    "  DEV.md 4c C283 amended; one liquid across its validity span), and NO\n"
                    "  HUMAN HAS REVIEWED IT.  The engine says so on every run that reads it.\n")
    hdr = cc.record_header(
        stem, i, j, case_rel,
        "reviewStatus autoPromoted; review { by none; }: PROMOTED AUTOMATICALLY by\n"
        + rule_txt +
        "  Nothing was held out: the `validation {}` block says so, and the\n"
        "  acceptance is the `curation {}` block.  A curator who reads the series\n"
        "  back against the articles records it in the `review {}` block (by,\n"
        "  reviewer, date, checked, verdict; DEV.md 4c C297).  Revert with\n"
        f"  `bin/choupo-curate revert {stem}`.")
    hdr = hdr.replace("The two articles named under `evidence` are the",
                      "The articles named under `evidence` are the")
    body = cc.body_of(text)
    gl = ""
    if grade:
        gl = (f"    fitGrade      {applied};   // DEV.md 4c C285 (C286): max |T_model - T| over "
              f"the kept points, graded {GRADE_K[0]:g} / {GRADE_K[1]:g} / {GRADE_K[2]:g} K\n"
              + BASIS_LINE + cap_line(caps) +
              f"    fitGradeMaxTemperatureError_K {mx:.4f};\n")
    body = re.sub(r"(\n    reviewStatus\s+)interim;",
                  r"\1autoPromoted;\n" + REVIEW_NONE
                  + gl.replace("\\", "\\\\") +
                  f'    promotedBy    "{cc.PROMOTED_BY}";\n'
                  f'    promotedDate  "{date.today().isoformat()}";', body, count=1)
    return hdr + body


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
        refuse(f"{cc.label(case)} carries {len(recs)} NRTL records; expected its one")
    rp = recs[0]
    text = rp.read_text()
    have = cc.existing_records(a, b, model="NRTL")
    if have:
        refuse(f"a catalogue record for {a} + {b} already exists ({', '.join(have)})")
    cur = crp.block(crp.strip_comments(text), "curation") or ""
    if crp.word(cur, "verdict") != "accepted":
        refuse(f"{rp.stem}: curation verdict `{crp.word(cur, 'verdict')}` -- only an "
               "accepted fit is promoted (C283)")
    if is_graded(case) and not crp.word(cur, "grade"):
        refuse(f"{rp.stem}: its case declares the graded acceptance (C286) and the record "
               "carries no curation grade -- re-run the case first")
    if crp.word(cur, "grade") and promotion_refusal(crp.word(cur, "grade")):
        refuse(f"{rp.stem}: NOT PROMOTED: " + promotion_refusal(crp.word(cur, "grade")))
    rf, split = cc.stability(text, rp.stem)
    if split:
        refuse(f"{rp.stem}: " + split[0])
    dest = cc.STD_NRTL / f"{rp.stem}.dat"
    if dest.exists():
        refuse(f"{dest.relative_to(ROOT)} exists -- never overwritten")
    mxg = crp.num(cur, "maxAbsError")
    blk = ("@@RESULT-BEGIN@@", "@@RESULT-END@@", "bin/choupo-curate pair ... --promote")
    ideal = ideal_guard(case, "tx", crp.word(cur, "grade"), mxg, rp.stem, blk)
    dest.write_text(stamp_ideal(promoted_text(text, case, rp.stem, rf["i"], rf["j"]),
                                "tx", mxg, ideal))
    rp.unlink()
    try:
        cc.seal(case)
    except SystemExit:
        dest.unlink()
        rp.write_text(text)
        cc.seal(case)
        raise
    restate_severe_result(case, *blk, kind="tx", mx=mxg, ideal=ideal)
    cc.mark_result(case, "PROMOTABLE by `bin/choupo-curate pair ... --promote`:",
                   f"PROMOTED on {date.today().isoformat()} into "
                   f"{dest.relative_to(ROOT).as_posix()} as reviewStatus autoPromoted, "
                   "review by none, because:")
    pv = crp.block(crp.strip_comments(dest.read_text()), "provenance") or ""
    cc.say(f"choupo-curate: PROMOTED {dest.relative_to(ROOT)} (autoPromoted, "
           "review by none" + (f", fitGrade {crp.word(pv, 'fitGrade')}"
                               if crp.word(pv, "fitGrade") else "") + ")")
    return 0


# --------------------------------------------------------------------------
#  C286: the graded acceptance, declared again over the same evidence
# --------------------------------------------------------------------------
def c283_cases():
    """Every case this module wrote, with its pair as the case declares it
    (i, j), in path order."""
    return [(p, a, b) for p, a, b in cc.curation_roots.pair_cases()
            if (p / cc.DECL).exists() and is_c283(p)]


def declared_discards(case):
    t = crp.strip_comments((case / "system" / "propsDict").read_text())
    op = t[t.index("fit_nrtl;"):t.index("fit_nrtl_start2;")]
    out = {}
    for m in re.finditer(r'dataset\s+"([^"]+)"\s*;\s*role\s+fit\s*;\s*'
                         r'(discard\s*\(([^)]*)\))?', op):
        if m.group(3):
            out[Path(m.group(1)).name] = [int(v) for v in m.group(3).split()]
    return out


def redeclare(case, pl):
    """DEV.md 4c C286: a NEW declaration for a C283/C284 case -- the SAME
    studies (the archiveDatasets the extraction rules give now must be the
    ones already declared: never a re-partition after a result was seen),
    the SAME outlier rule and the SAME discards; only the ACCEPTANCE changes,
    to C285's graded one.  The earlier result is kept in the header.  The
    caller commits it before the case is run again."""
    case_rel = case.relative_to(ROOT).as_posix()
    if is_graded(case):
        refuse(f"--redeclare: {cc.label(case)} already declares the graded acceptance")
    if normalise((case / cc.DECL).read_text()) != normalise(decl_text(pl, case_rel)):
        refuse(f"--redeclare: {cc.label(case)}'s dataset declaration differs from the one the "
               "extraction rules give now -- C286 changes the acceptance only; the "
               "evidence is never re-partitioned")
    pd = case / "system" / "propsDict"
    old = pd.read_text()
    c1, c2 = pl["c1"], pl["c2"]
    stem = "-".join(sorted((c1, c2)))
    unifac = cc.has_unifac(c1) and cc.has_unifac(c2)
    disc = declared_discards(case)
    m = re.search(r"@@OUTLIERS-BEGIN@@(.*?)@@OUTLIERS-END@@", old, re.S)
    otxt = " ".join(m.group(1).split()) if m else None
    if normalise(props_text(pl, cc.label(case), stem, unifac, discards=disc,
                            outlier_txt=otxt)) != normalise(old):
        refuse(f"--redeclare: {cc.label(case)}'s declaration on disk is not the one the C283 "
               "rules give for these studies -- refused rather than rewritten")
    r = re.search(r"@@RESULT-BEGIN@@(.*?)@@RESULT-END@@", old, re.S)
    prev = " ".join(r.group(1).split()) if r else "(no result recorded)"
    earlier = ("C283 amended + C284, the bulk run of 2026-11-10: every laboratory "
               f"fitted, outliers beyond {OUTLIER_K:g} K discarded by name, accepted only "
               f"below {ACCEPT_K:g} K (superseded by the graded acceptance of C285, applied "
               "to pairs by C286; this declaration keeps the same studies, the same "
               "outlier rule and the same discards -- nothing re-partitioned): " + prev)
    new = props_text(pl, cc.label(case), stem, unifac, discards=disc, outlier_txt=otxt,
                     graded=True, earlier=earlier)
    pd.write_text(new)
    cd = case / "system" / "controlDict"
    ct = cd.read_text()
    ct = ct.replace("accepted at max |dT| < 1 K\";",
                    "graded by max |dT| (clean 1 K, warning 2 K, severe 4 K, refused above; C285, C286)\";")
    cd.write_text(ct)
    return [pd, cd]


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
            refuse(f"--resume: {cc.label(case)}'s dataset declaration differs from the one "
                   "the rules give now")
        for s in pl["studies"]:
            (case / cc.EXTRACTS).mkdir(parents=True, exist_ok=True)
            shutil.copy(s["path"], case / cc.EXTRACTS / s["path"].name)
    else:
        case, stem = write_case(pl)
        cc.say(f"  case     {case.relative_to(ROOT)}")
        if not args.no_commit and not args.declare_only:
            files = [p for p in case.rglob("*") if p.is_file()
                     and cc.EXTRACTS not in p.relative_to(case).as_posix()]
            cc.git(["add", "--"] + [str(p) for p in files])
            cc.git(["commit", "-q", "-m",
                    f"C284: {cc.label(case)} -- the declaration, before any fit\n\n"
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
    q.add_argument("--redeclare", action="store_true",
                   help="C286: declare the graded acceptance on every C283 case, "
                        "same evidence, one commit before any re-run")
    q.add_argument("--graded", action="store_true",
                   help="with --run/--promote: walk the C283 cases themselves "
                        "(promoted ones included) instead of the ranked queue")
    q.add_argument("--only", nargs="*", help="with --graded: these pairs only (record stems, e.g. acetone-methanol)")
    q.add_argument("--models", action="store_true",
                   help="DEV.md 4c C294: with --declare / --run / --promote, UNIQUAC and Wilson "
                        "on every pair case's own NRTL evidence and kept points")
    q.add_argument("--jobs", type=int, default=1,
                   help="with --graded --run: run up to N cases at once (cap 4), each a "
                        "separate process writing only inside its own case directory")
    q.add_argument("--no-commit", action="store_true")
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
    if a.models:
        return batch_models(a)
    if a.redeclare or a.graded:
        return batch_graded(a)
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
                ns = type("A", (), dict(pmax=a.pmax, plan=False, resume=False,
                                        no_commit=True, declare_only=True))()
                if case_of(x, y):
                    rec["outcome"] = "declared already"
                else:
                    pl, case, _ = one(x, y, ns, work)
                    rec["outcome"], rec["case"] = "declared", cc.label(case)
            elif a.run:
                case = case_of(x, y)
                if case is None:
                    rec["outcome"] = "no C283 declaration"
                elif list((case / "constant" / "parameters" / "NRTL").glob("*.dat")):
                    rec["outcome"] = "ran already"
                else:
                    ns = type("A", (), dict(pmax=a.pmax, plan=False, resume=True,
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


JOBS_CAP = 4   # the architect, 2026-11-11 (C294): 10 cores, ~5 idle, 7 GB free; one pair-case fit
#  process measured with /usr/bin/time -v at 14 MB peak (choupoProps, a whole P-x case,
#  2.7 s) and its python driver at 32 MB -- memory is not the limit here; check `free -g`
#  before a batch and drop to --jobs 2 below 3 GB available (CLAUDE.md rule 4)


def run_parallel(a, cases):
    """`--graded --run --jobs N` (C290, carried to the curation root): each
    case is run by a CHILD process of this very command (`--only <stem>
    --jobs 1`), at most N at once; a child writes only inside its own case
    directory (fetch, the two fit stages, its case-local record, the seal).
    A case whose pair this pipeline already promoted would be regraded IN
    PLACE -- a shared catalogue record -- so it is left to the serial loop,
    as are promotion, commits and generated files, which never run here.
    Returns (outcomes, cases left for the serial loop)."""
    import concurrent.futures as cf
    jobs = min(a.jobs, JOBS_CAP)
    if a.jobs > JOBS_CAP:
        cc.say(f"--jobs {a.jobs} capped at {JOBS_CAP}")
    safe, serial = [], []
    for c in cases:
        (serial if own_promotion(c[1], c[2], c[0].relative_to(ROOT).as_posix()) is not None
         else safe).append(c)
    tmp = Path(tempfile.mkdtemp(prefix="choupo-curate-jobs-"))

    def child(c):
        stem = cc.curation_roots.pair_stem_of(c[0])
        js = tmp / f"{stem}.json"
        p = subprocess.run([sys.executable, str(ROOT / "bin" / "choupo-curate"), "pairs",
                            "--graded", "--run", "--only", stem, "--no-commit", "--jobs", "1",
                            "--pmax", str(a.pmax), "--json", str(js)],
                           capture_output=True, text=True)
        try:
            rec = json.loads(js.read_text())[0]
        except (OSError, ValueError, IndexError):
            rec = {"case": cc.label(c[0]), "pair": [c[1], c[2]],
                   "outcome": f"error: child exited {p.returncode}: {(p.stdout + p.stderr)[-300:]}"}
        return rec, p.stdout

    out = []
    try:
        with cf.ThreadPoolExecutor(max_workers=jobs) as ex:
            for rec, txt in ex.map(child, safe):    # in case order
                sys.stdout.write("".join(l + "\n" for l in txt.splitlines()
                                         if l.startswith("[")))
                sys.stdout.flush()
                out.append(rec)
                if a.json:
                    Path(a.json).write_text(json.dumps(out, indent=1, default=str))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return out, serial


def batch_graded(a):
    """C286 over the cases this module wrote: --redeclare (every case, one
    commit), then --graded --run (each re-run on its committed declaration;
    a pair this pipeline promoted is regraded in place), then --graded
    --promote (each newly accepted pair)."""
    cases = c283_cases()
    if a.only:
        want = set(a.only)
        cases = [c for c in cases if cc.curation_roots.pair_stem_of(c[0]) in want]
    out, touched = [], []
    if a.run and a.jobs > 1:
        out, cases = run_parallel(a, cases)
    for case, x, y in cases:
        rec = {"case": cc.label(case), "pair": [x, y]}
        work = Path(tempfile.mkdtemp(prefix="choupo-curate-"))
        try:
            if a.redeclare:
                if is_graded(case):
                    rec["outcome"] = "graded already"
                else:
                    pl = plan(x, y, a.pmax, work)
                    touched += redeclare(case, pl)
                    rec["outcome"] = "redeclared"
            elif a.run:
                rps = list((case / "constant" / "parameters" / "NRTL").glob("*.dat"))
                cur = crp.block(crp.strip_comments(rps[0].read_text()), "curation") if rps else None
                if not is_graded(case):
                    rec["outcome"] = "not redeclared"
                elif cur is not None and crp.word(cur, "grade"):
                    rec["outcome"] = "ran already"
                else:
                    pl = plan(x, y, a.pmax, work)
                    if normalise((case / cc.DECL).read_text()) != normalise(
                            decl_text(pl, case.relative_to(ROOT).as_posix())):
                        refuse(f"{cc.label(case)}'s dataset declaration differs from the one "
                               "the rules give now")
                    for s in pl["studies"]:
                        (case / cc.EXTRACTS).mkdir(parents=True, exist_ok=True)
                        shutil.copy(s["path"], case / cc.EXTRACTS / s["path"].name)
                    rec.update(run(case, pl, False))
                    rec["outcome"] = "regraded in place" if rec["regraded"] else "ran"
            elif a.promote:
                rps = list((case / "constant" / "parameters" / "NRTL").glob("*.dat"))
                cur = crp.block(crp.strip_comments(rps[0].read_text()), "curation") if rps else None
                if own_promotion(x, y, case.relative_to(ROOT).as_posix()) is not None:
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
        except Exception as ex:   # noqa: BLE001 -- one failure never stops the batch
            rec["outcome"] = f"error: {type(ex).__name__}: {ex}"
        finally:
            shutil.rmtree(work, ignore_errors=True)
        cc.say(f"[{cc.label(case)}] {rec['outcome'][:300]}"
               + (f"  {rec['verdict']} grade {rec['grade']} max {rec['max']:.3f} K"
                  f"{' SPLITS' if rec.get('split') else ''}" if "verdict" in rec else ""))
        out.append(rec)
        if a.json:
            Path(a.json).write_text(json.dumps(out, indent=1, default=str))
    if a.redeclare and touched and not a.no_commit:
        cc.git(["add", "--"] + [str(p) for p in touched])
        cc.git(["commit", "-q", "-m",
                f"C286: {len(touched) // 2} pair declarations re-declared under the graded "
                "acceptance, before any re-run\n\n"
                "bin/choupo-curate pairs --redeclare (DEV.md 4c C286, applying C285 to the "
                "C284 pairs): the same studies (re-derived by the extraction rules and "
                "refused if they differ -- no re-partition), the same outlier rule (3 K "
                "after a least-squares stage) and the same discards; only the acceptance "
                "changes, max |T_model - T| over the kept points graded clean / warning / "
                "severe at 1 / 2 / 4 K, refused above.  The C284 result is kept in each "
                "header as EARLIER."])
        cc.say(f"committed the declarations: {cc.git(['rev-parse', '--short', 'HEAD']).strip()}")
    return 0


# --------------------------------------------------------------------------
#  DEV.md 4c C294: THE OTHER ACTIVITY MODELS, ON THE SAME EVIDENCE
# --------------------------------------------------------------------------
#  Vitor, 2026-11-10: "Mas esse ajuste e rapido e devia ter sido feito!
#  Eventualmente ate pode melhorar o ajuste!"  Every pair case this module
#  (C283/C284/C290, bubble temperatures) or bin/curate/pairs_px.py (C291,
#  bubble pressures) wrote fits UNIQUAC and Wilson TOO, in the SAME case, on
#  the SAME datasets and the SAME kept points:
#
#    * the outlier discard is decided ONCE, on the NRTL least-squares stage,
#      and reused -- each new fit op is the case's own `fit_nrtl` op copied
#      verbatim (evidence, discards, objective, residual, weighting, options),
#      with only its parameters, its `thermo {}` fragment and its outputs
#      changed.  A model judged on points another model chose to drop is
#      judged on the same footing as the NRTL fit, which is the comparison
#      C294 asks for (never a second outlier pass that would let each model
#      discard what it fits worst);
#    * the fit op carries the model through its own `thermo {}` fragment
#      (PropertyOperation::authoredV2For, the one ThermoOverride merge), so
#      the case's system stays the NRTL one its declaration committed;
#    * UNIQUAC, TWO parameters (the NRTL default's count): tau_ij =
#      exp(-a_ij/T), a_ij and a_ji in K fitted, b and c (the T-linear and T^2
#      terms of src/thermo/activityCoefficient/UNIQUAC.cpp) fixed at 0 -- the
#      constant interaction energy, so the temperature dependence is 1/T as in
#      NRTL's b/T.  r and q are each component's own record (tabulated, or the
#      sum of its UNIFAC groups, bin/curate/uniquac_rq_from_groups.py); a
#      component with neither is reported and UNIQUAC is not fitted;
#    * Wilson, TWO parameters A_ij, A_ji (J/mol), Lambda_ij = (V_j/V_i)
#      exp(-A_ij/RT), V the records' own Vliq.  Wilson CANNOT represent two
#      liquids, so where the NRTL fit of the same evidence splits the liquid
#      inside its validity span (curation `oneLiquid false`) Wilson is NOT
#      fitted and the case says why; a component with no Vliq likewise;
#    * each model gets its OWN record (constant/parameters/<MODEL>/<stem>.dat,
#      `fittedInCase` the same case), its own grade on the kind's limits
#      (1 / 2 / 4 K or 5 / 10 / 20 %), its own arm-(f) one-liquid test, and the
#      C300 rules: `fitGradeBasis inSample`, the cap, `review { by none; }`,
#      and `severe` is not promoted.
#  The residuals of the three models are published side by side, never used
#  to choose one for the student.
MODELS = ("UNIQUAC", "Wilson")
MODEL_MARK = "THE OTHER ACTIVITY MODELS (DEV.md 4c C294)"
MODELS_RULE = "DEV.md 4c C294 (the NRTL case's own evidence and kept points, another activity model)"
MODELS_PROMOTED_BY = "bin/choupo-curate pairs --models --promote"
OPS_BEGIN = "    // @@C294-OPS-BEGIN@@ -- UNIQUAC and Wilson on the NRTL fit's own evidence (DEV.md 4c C294)\n"
OPS_END = "    // @@C294-OPS-END@@\n"
RB_BEGIN = "    // @@C294-READBACK-BEGIN@@ -- each model's record, read as the catalogue reads it\n"
RB_END = "    // @@C294-READBACK-END@@\n"
MSPEC = {
    #  model: (keys, unit, bounds, start1, start2, inline extras)
    "UNIQUAC": (("a_ij", "a_ji"), "K", (-3000, 3000), (0, 0), (300, -150)),
    "Wilson": (("A_ij", "A_ji"), "J/mol", (-30000, 30000), (0, 0), (4000, -2000)),
}
EQUATION = {
    "UNIQUAC": ("  EQUATION: UNIQUAC, tau_ij = exp(-(a_ij + b_ij T + c_ij T^2) / T) [a in K],\n"
                "  Abrams & Prausnitz (src/thermo/activityCoefficient/UNIQUAC.cpp); r and q\n"
                "  each component's own record.  b_ij = b_ji = c_ij = c_ji = 0 FIXED, not\n"
                "  fitted: two parameters a_ij, a_ji (DEV.md 4c C294).\n"),
    "Wilson": ("  EQUATION: Wilson, Lambda_ij = (V_j / V_i) exp(-A_ij / (R T)) [A in J/mol],\n"
               "  V the components' own Vliq (src/thermo/activityCoefficient/Wilson.cpp).\n"
               "  Two parameters A_ij, A_ji (DEV.md 4c C294).  Wilson cannot represent\n"
               "  two liquids.\n"),
}


def case_kind(case):
    t = (case / "system" / "propsDict").read_text()
    if MARK in t:
        return "tx"
    import pairs_px as px
    if px.MARK in t:
        return "px"
    return None


def nrtl_op(t):
    """The case's `fit_nrtl` op, verbatim (from its `{` line to its `}` line)."""
    s = t.index("    {\n        name        fit_nrtl;\n")
    e = t.index("    {\n        name        fit_nrtl_start2;\n", s)
    return t[s:e]


def op_pair(op):
    m = re.search(r"binaryParameters\.(\w+)-(\w+)\.b_ij", op)
    return m.group(1), m.group(2)


def nrtl_record(case):
    """(path, text) of the NRTL record this case's fit produced: its own
    case-local record, or the catalogue's sealed copy once promoted."""
    rps = list((case / "constant" / "parameters" / "NRTL").glob("*.dat"))
    if len(rps) != 1:
        refuse(f"{cc.label(case)} carries {len(rps)} NRTL records; expected its one")
    return rps[0], rps[0].read_text()


def component_text(case, comp):
    p = case / "constant" / "components" / f"{comp}.dat"
    if not p.exists():
        p = COMP / f"{comp}.dat"
    return p.read_text()


def has_rq(text):
    return re.search(r"(?m)^uniquac\s*\{", crp.strip_comments(text)) is not None


def vliq(text):
    m = re.search(r"^\s*Vliq\s+([0-9.eE+-]+)", crp.strip_comments(text), re.M)
    return float(m.group(1)) if m else 0.0


def eligibility(case, c1, c2):
    """{model: None | the reason it is NOT fitted} -- read from the
    component RECORDS in the standards (what a re-seal puts in the case) and
    the NRTL fit's own arm (f) verdict."""
    out = {}
    std = {c: (COMP / f"{c}.dat").read_text() for c in (c1, c2)}
    miss = [c for c in (c1, c2) if not has_rq(std[c])]
    out["UNIQUAC"] = (None if not miss else
                      f"{' and '.join(miss)} carr{'ies' if len(miss) == 1 else 'y'} no UNIQUAC r and q "
                      "(no tabulated value, and no UNIFAC groups to sum them from, "
                      "bin/curate/uniquac_rq_from_groups.py) -- UNIQUAC is not fitted; "
                      "nothing is estimated silently")
    _, nt = nrtl_record(case)
    cur = crp.block(crp.strip_comments(nt), "curation") or ""
    noV = [c for c in (c1, c2) if vliq(std[c]) <= 0.0]
    if noV:
        out["Wilson"] = (f"{' and '.join(noV)} carr{'ies' if len(noV) == 1 else 'y'} no liquid "
                         "molar volume Vliq, which Wilson's Lambda needs -- Wilson is not fitted")
    elif crp.word(cur, "oneLiquid") != "true":
        out["Wilson"] = ("the NRTL fit of this very evidence SPLITS the liquid inside its "
                         "validity span (curation oneLiquid false, arm f); Wilson cannot "
                         "represent two liquids, so a Wilson fit here would hide the split "
                         "-- Wilson is not fitted")
    else:
        out["Wilson"] = None
    return out


def model_op(op, model, name, c1, c2, start, outputs):
    """The NRTL op `op` with only its parameters, thermo fragment and outputs
    changed: the evidence, discards, objective, residual and options stay
    byte-identical (the discard decided once, on NRTL, C294)."""
    keys, _, (lo, hi), _, _ = MSPEC[model]
    path = f"equilibrium.liquid.activityModel.binaryParameters.{c1}-{c2}"
    o = op.replace("        name        fit_nrtl;\n", f"        name        {name};\n", 1)
    par = "".join(f"            {{ path  {path}.{k};  initial {s};  min {lo};  max {hi}; }}\n"
                  for k, s in zip(keys, start))
    o = re.sub(r"        parameters\n        \(\n.*?\n        \);\n",
               lambda m: "        parameters\n        (\n" + par + "        );\n\n"
               "        thermo   // the model, as a fragment of the case's system (C294)\n"
               "        {\n"
               "            equilibrium\n            {\n                liquid\n                {\n"
               "                    activityModel\n                    {\n"
               f"                        model {model};\n"
               "                        binaryParameters   // the FIT'S starting point\n"
               "                        {\n"
               f"                            {c1}-{c2} {{ i {c1}; j {c2}; "
               + " ".join(f"{k} 0;" for k in keys) + " }\n"
               "                        }\n                    }\n"
               "                    standardState pureLiquid;\n"
               "                }\n            }\n        }\n", o, count=1, flags=re.S)
    o = re.sub(r"(discard  \([^)]*\);)[^\n]*",
               r"\1   // the NRTL fit's outliers, reused: decided once (C294)", o)
    o = re.sub(r"        output\n        \{\n.*?\n        \}\n",
               lambda m: "        output\n        {\n" + "".join(
                   f"            {k:<10} {v};\n" for k, v in outputs) + "        }\n",
               o, count=1, flags=re.S)
    if f"name        {name};" not in o or "thermo   // the model" not in o:
        refuse(f"the fit_nrtl op could not be carried to {name} -- its layout moved")
    return o


def model_ops(case, el):
    t = (case / "system" / "propsDict").read_text()
    op = nrtl_op(t)
    c1, c2 = op_pair(op)
    stem = "-".join(sorted((c1, c2)))
    body = ""
    for m in MODELS:
        if el[m] is not None:
            continue
        low = m.lower()
        _, _, _, s1, s2 = MSPEC[m]
        body += model_op(op, m, f"fit_{low}", c1, c2, s1,
                         [("fit_log", f"fit_history_{low}.csv"), ("parity", f"parity_{low}.csv"),
                          ("proposal", f"{stem}.{m}.proposal.dat")])
        body += model_op(op, m, f"fit_{low}_start2", c1, c2, s2,
                         [("parity", f"parity_{low}_start2.csv")])
    return body


def ops_end(t):
    """Index of the `);` that closes the operations list."""
    k = t.find("\n);\n\nexperimental\n(")
    if k < 0:
        k = t.rstrip().rindex("\n);")
    return k + 1


def models_decl_text(el, kind):
    lim = (f"{GRADE_K[0]:g} / {GRADE_K[1]:g} / {GRADE_K[2]:g} K (max |T_model - T|)" if kind == "tx"
           else f"5 / 10 / 20 % (max |P_model - P|/P)")
    lines = (f"{MODEL_MARK}, declared before their fits ran.  The SAME datasets and the "
             "SAME kept points as fit_nrtl: each op below is fit_nrtl copied verbatim -- "
             "evidence, discards, objective, residual, weighting, options -- with only its "
             "parameters, its `thermo {}` fragment (the model) and its outputs changed; the "
             "outlier discard was decided ONCE, on the NRTL least-squares stage, and is "
             "reused, never re-decided per model.  UNIQUAC: two parameters a_ij, a_ji (K), "
             "tau_ij = exp(-a_ij/T), b = c = 0 fixed (the NRTL default's count; temperature "
             "dependence 1/T), r and q each component's own record.  Wilson: two parameters "
             "A_ij, A_ji (J/mol), Lambda_ij = (V_j/V_i) exp(-A_ij/RT), V the records' Vliq.  "
             "Two starts each.  Each model gets its own record (constant/parameters/<MODEL>/), "
             f"its own grade at {lim}, its own one-liquid test (arm f), `fitGradeBasis "
             "inSample`, the C300 cap and `review { by none; }`; a refused grade, "
             "or a split, is not promoted (C333: severe stays).  The three in-sample residuals are published side "
             "by side, never used to choose a model for the student.")
    for m in MODELS:
        lines += f"  {m}: " + ("FITTED." if el[m] is None else "NOT FITTED -- " + el[m] + ".")
    return ("  @@MODELS-BEGIN@@\n" + cc.wrap(lines) + "\n  @@MODELS-END@@\n\n"
            "  @@MODELS-RESULT-BEGIN@@\n  WHAT THE UNIQUAC AND WILSON FITS FOUND: not yet run.\n"
            "  @@MODELS-RESULT-END@@\n\n")


def models_declare(case):
    """Write the C294 declaration into the case (header paragraph + ops).
    Returns the file touched, or None when declared already."""
    pd = case / "system" / "propsDict"
    t = pd.read_text()
    if MODEL_MARK in t:
        return None
    kind = case_kind(case)
    if kind is None:
        refuse(f"{cc.label(case)} was written by neither pair tool (C283/C291) -- not a C294 case")
    op = nrtl_op(t)
    c1, c2 = op_pair(op)
    el = eligibility(case, c1, c2)
    k = t.index("  @@RESULT-BEGIN@@\n")
    t = t[:k] + models_decl_text(el, kind) + t[k:]
    body = model_ops(case, el) if any(v is None for v in el.values()) else ""
    e = ops_end(t)
    t = t[:e] + OPS_BEGIN + body + OPS_END + t[e:]
    pd.write_text(t)
    return pd


def declared_models(case):
    t = (case / "system" / "propsDict").read_text()
    return [m for m in MODELS if f"name        fit_{m.lower()};" in t]


def remove_op(t, name):
    """The propsDict text without op `name` (its `{` line to the next op or
    the C294 end marker)."""
    s = t.index(f"    {{\n        name        {name};\n")
    e = min(k for k in (t.find("    {\n        name", s + 10), t.find(OPS_END, s)) if k > 0)
    return t[:s] + t[e:]


def seal_without_models(case):
    """Re-seal the case on the catalogue's records BEFORE its model fits run.
    bin/choupo-import runs the case to prove the seal moves no number, and a
    declared fit that does not converge would fail that run; so the C294 ops
    are left out for the seal and put back after (the seal claims records,
    never the propsDict)."""
    pd = case / "system" / "propsDict"
    t0 = pd.read_text()
    t = re.sub(re.escape(OPS_BEGIN) + r".*?" + re.escape(OPS_END), OPS_BEGIN + OPS_END, t0, flags=re.S)
    t = re.sub(re.escape(RB_BEGIN) + r".*?" + re.escape(RB_END), "", t, flags=re.S)
    pd.write_text(t)
    try:
        cc.seal(case)
    finally:
        pd.write_text(t0)


def model_fit_only(case, models):
    """Run the fit ops of each model (both starts) in a scratch copy; return
    (rc, output, {model: (rows, proposal text or None)}, {op: diagnostics})."""
    work = Path(tempfile.mkdtemp(prefix="choupo-curate-c294-"))
    try:
        sc = work / case.name
        shutil.copytree(case, sc, ignore=shutil.ignore_patterns("expected"))
        t = (sc / "system" / "propsDict").read_text()
        ops = ""
        for m in models:
            s = t.index(f"    {{\n        name        fit_{m.lower()};\n")
            e = t.index(f"    {{\n        name        fit_{m.lower()}_start2;\n", s)
            e = min(k for k in (t.find("    {\n        name", e + 10), t.find(OPS_END, e)) if k > 0)
            ops += t[s:e]
        b = t.index("operations\n(\n") + len("operations\n(\n")
        t = t[:b] + ops + ");\n"
        (sc / "system" / "propsDict").write_text(t)
        for stale in sc.glob("*.proposal.dat"):
            stale.unlink()
        rc, out, js = cc.run_props(sc)
        res = {}
        for m in models:
            par = sc / f"parity_{m.lower()}.csv"
            rows = []
            if par.exists():
                for l in par.read_text().splitlines()[1:]:
                    if l.strip():
                        rows.append([float(v) for v in l.split(",")])
            props = list(sc.glob(f"*.{m}.proposal.dat"))
            res[m] = (rows, props[0].read_text() if props else None)
        diag = {}
        for m in models:
            for n in (f"fit_{m.lower()}", f"fit_{m.lower()}_start2"):
                diag[n] = (cc.op_result(js, n) or {}).get("diagnostics", {})
        return rc, out, res, diag
    finally:
        shutil.rmtree(work, ignore_errors=True)


def model_split(rec_text, model, case, tag):
    """Arm (f) for UNIQUAC / Wilson on the record's own parameters and the
    case's own component records (check_regressed_pairs computes it)."""
    rf = crp.model_facts(rec_text, model)
    comps = {c: component_text(case, c) for c in (rf["i"], rf["j"])}
    return rf, crp.model_one_liquid_failures(rf, model, comps, tag)


def evidence_counts(case, kind):
    if kind == "tx":
        return tx_evidence_counts(case)
    import pairs_px as px
    live = px.contributing(case)
    return len({T for _, T in live}), len({d for d, _ in live})


def model_curation_block(model, kind, verdict, n_kept, n_drop, mx, mean, nan, grade,
                         one_liquid, nT, nL):
    import pairs_px as px
    if kind == "tx":
        rule = MODELS_RULE + " on " + RULE_GRADED
        res = (f"    outlierLimit    {OUTLIER_K:g} K;   // the NRTL least-squares stage's, reused\n"
               f"    outliersDropped {n_drop};\n"
               f"    pointsKept      {n_kept};\n"
               f"    noBubblePoint   {nan};\n"
               f"    maxAbsError     {mx:.4f} K;\n"
               f"    meanAbsError    {mean:.4f} K;\n"
               "    acceptance      graded;   // max |T_model - T| over the kept points, "
               "DEV.md 4c C285 (C286)\n"
               f"    gradeLimits_K   ({GRADE_K[0]:g} {GRADE_K[1]:g} {GRADE_K[2]:g});   "
               "// upper limits of clean / warning / severe; above, refused\n")
    else:
        rule = MODELS_RULE + " on " + px.RULE
        res = ("    residual        P_bubble;\n"
               "    residualScale   relative;   // (P_model - P)/P at each point's stated T\n"
               f"    outlierLimit_pct {px.OUTLIER_PCT:g};   // the NRTL least-squares stage's, reused\n"
               f"    outliersDropped {n_drop};\n"
               f"    pointsKept      {n_kept};\n"
               f"    noBubblePoint   {nan};\n"
               f"    maxRelError_pct {mx:.4f};\n"
               f"    meanRelError_pct {mean:.4f};\n"
               "    acceptance      graded;   // max relative pressure error over the kept "
               "points, DEV.md 4c C285 (C291)\n"
               f"    gradeLimits_pct ({px.GRADE_PCT[0]:g} {px.GRADE_PCT[1]:g} {px.GRADE_PCT[2]:g});   "
               "// upper limits of clean / warning / severe; above, refused\n")
    return (f"curation\n{{\n"
            f'    rule            "{rule}";\n'
            f"    model           {model};\n"
            f"    discardsFrom    fit_nrtl;   // the outliers were decided ONCE, on the NRTL "
            "least-squares stage, and reused (C294)\n"
            f"    evidence        allLaboratories;   // every study fitted, none held out\n"
            f"    objective       twoStage;\n"
            + res +
            f"    grade           {grade};\n"
            f"    oneLiquid       {'true' if one_liquid else 'false'};   // arm (f) on this "
            "model's own equation over the validity span\n"
            f"    temperatures    {nT};   // distinct stated temperatures in the kept evidence\n"
            f"    laboratories    {nL};   // distinct articles in the kept evidence\n"
            f"    singleTemperature {'true' if nT == 1 else 'false'};\n"
            f"    singleLaboratory  {'true' if nL == 1 else 'false'};\n"
            f"    verdict         {verdict};\n}}\n")


def model_record_header(model, stem, c1, c2, case_rel, reason_line, extra, kind):
    hdr = cc.record_header(stem, c1, c2, case_rel, reason_line, extra)
    hdr = hdr.replace("  NRTL binary interaction parameters ---",
                      f"  {model} binary interaction parameters ---", 1)
    hdr = re.sub(r"  EQUATION: tau_ij = a_ij \+ b_ij / T.*?not fitted\.\n",
                 lambda _m: EQUATION[model], hdr, count=1, flags=re.S)
    hdr = hdr.replace("its fit\n  writes", f"its fit_{model.lower()}\n  writes")
    hdr = hdr.replace(f"writes {stem}.proposal.dat", f"writes {stem}.{model}.proposal.dat")
    if kind == "px":
        hdr = hdr.replace("to measured\n  bubble temperatures.",
                          "to measured\n  bubble PRESSURES at stated temperatures (P-x, DEV.md 4c C291).")
    hdr = hdr.replace("The two articles named under `evidence` are the",
                      "The articles named under `evidence` are the")
    hdr = hdr.replace("(bin/choupo-curate, DEV.md 4c C282;",
                      "(bin/choupo-curate pairs --models, DEV.md 4c C294 on C282;")
    if EQUATION[model].splitlines()[0] not in hdr or f"{model} binary" not in hdr:
        refuse(f"{stem}: the record header template moved -- the {model} header cannot be derived")
    return hdr


def model_stats(kind, rows):
    import pairs_px as px
    return stats(rows) if kind == "tx" else px.stats(rows)


def model_grade(kind, mx, nan):
    import pairs_px as px
    return grade_of(mx, nan) if kind == "tx" else px.grade_of(mx, nan)


def unit_of(kind):
    return ("K", "|dT|") if kind == "tx" else ("%", "|dP|/P")


def readback_ops(case, models):
    """txy_<model>: the txy_nrtl scan with the model swapped -- it loads the
    record through the pair loader, so the engine voices its status."""
    t = (case / "system" / "propsDict").read_text()
    s = t.index("    {\n        name        txy_nrtl;\n")
    e = t.index("\n    }\n", s) + len("\n    }\n")
    base = t[s:e]
    out = ""
    for m in models:
        o = base.replace("name        txy_nrtl;", f"name        txy_{m.lower()};")
        o = o.replace("model NRTL;", f"model {m};").replace("file txy_nrtl.csv;",
                                                            f"file txy_{m.lower()}.csv;")
        out += o
    return out


def set_readback(case, models):
    pd = case / "system" / "propsDict"
    t = pd.read_text()
    t = re.sub(re.escape(RB_BEGIN) + r".*?" + re.escape(RB_END), "", t, flags=re.S)
    if models:
        k = t.index(OPS_END) + len(OPS_END)
        t = t[:k] + RB_BEGIN + readback_ops(case, models) + RB_END + t[k:]
    pd.write_text(t)


def models_run(case):
    """Fit every declared model of the case, write its case-local record,
    re-seal, run the whole case, and write the result paragraph."""
    kind = case_kind(case)
    case_rel = case.relative_to(ROOT).as_posix()
    pd = case / "system" / "propsDict"
    t = pd.read_text()
    if MODEL_MARK not in t:
        refuse(f"{cc.label(case)}: no C294 declaration -- declare (and commit) first")
    op = nrtl_op(t)
    c1, c2 = op_pair(op)
    stem = "-".join(sorted((c1, c2)))
    models = declared_models(case)
    out = {"case": cc.label(case), "pair": [c1, c2], "kind": kind, "models": {}}
    _, nt = nrtl_record(case)
    ncur = crp.block(crp.strip_comments(nt), "curation") or ""
    nmx = crp.num(ncur, "maxAbsError" if kind == "tx" else "maxRelError_pct")
    out["nrtl"] = {"max": nmx, "grade": crp.word(ncur, "grade"),
                   "oneLiquid": crp.word(ncur, "oneLiquid")}
    el = eligibility(case, c1, c2)
    for m in MODELS:
        if m not in models:
            out["models"][m] = {"fitted": False, "reason": el[m]}
    if not models:
        txt = ("WHAT THE UNIQUAC AND WILSON FITS FOUND: neither was fitted.  "
               + "  ".join(f"{m}: {el[m]}." for m in MODELS))
        t = re.sub(r"@@MODELS-RESULT-BEGIN@@.*?@@MODELS-RESULT-END@@",
                   lambda _m: "@@MODELS-RESULT-BEGIN@@\n" + cc.wrap(txt)
                   + "\n  @@MODELS-RESULT-END@@", t, flags=re.S)
        pd.write_text(t)
        out["outcome"] = "no model fitted"
        return out
    rc = cc.fetch(case, quiet=True)
    if rc:
        refuse(f"fetch of {case_rel} returned {rc}")
    seal_without_models(case)   # the component records as the catalogue carries them now (r/q)
    rc, o, res, diag = model_fit_only(case, models)
    #  A FIT THAT DID NOT CONVERGE (a parameter run to its bound: for Wilson,
    #  Lambda -> 0, no finite optimum on this evidence) is not a fit.  Its ops
    #  are removed so the case runs, and the attempt is written into the
    #  result paragraph -- never a record.  A second start that does not
    #  converge where the first did is removed alone, and said.
    notes = []
    for m in list(models):
        low = m.lower()
        for n in (f"fit_{low}", f"fit_{low}_start2"):
            d = diag.get(n, {})
            if d.get("converged") == 1:
                continue
            ks = MSPEC[m][0]
            bound = [ks[k] for k in range(len(ks)) if d.get(f"fit.{k}.at_bound") == 1]
            why = (f"{n} was declared and run and did NOT CONVERGE"
                   + (f" ({' and '.join(bound)} at its bound, {MSPEC[m][2][0]} .. {MSPEC[m][2][1]} "
                      f"{MSPEC[m][1]}: no finite optimum inside the declared bounds)" if bound else "")
                   + "; the op is removed so the case runs (C294)")
            pt = pd.read_text()
            if n == f"fit_{low}":
                pt = remove_op(remove_op(pt, f"fit_{low}_start2"), n)
                models.remove(m)
                out["models"][m] = {"fitted": False, "reason": why, "nonConverged": True}
                notes.append(f"{m}: not fitted -- {why}.")
                pd.write_text(pt)
                break
            pd.write_text(remove_op(pt, n))
            notes.append(f"{m}: {why}.")
    if not models:
        txt = ("WHAT THE UNIQUAC AND WILSON FITS FOUND: no record.  " + "  ".join(
            notes + [f"{m}: not fitted -- {el[m]}." for m in MODELS if el[m]]))
        t = re.sub(r"@@MODELS-RESULT-BEGIN@@.*?@@MODELS-RESULT-END@@",
                   lambda _m: "@@MODELS-RESULT-BEGIN@@\n" + cc.wrap(txt)
                   + "\n  @@MODELS-RESULT-END@@", pd.read_text(), flags=re.S)
        pd.write_text(t)
        out["outcome"] = "no model converged"
        return out
    n_drop = sum(len(v) for v in declared_discards(case).values())
    nT, nL = evidence_counts(case, kind)
    u, sym = unit_of(kind)
    lines = []
    for m in models:
        rows, ptext = res[m]
        rp = case / "constant" / "parameters" / m / f"{stem}.dat"
        if ptext is None or not rows:
            refuse(f"the {m} fit of {case_rel} exited {rc} / wrote no proposal: {o[-600:]}")
        mx, mean, n_kept, nan = model_stats(kind, rows)
        grade = model_grade(kind, mx, nan)
        rf, split = model_split(ptext, m, case, stem)
        accepted = grade != "refused"
        verdict = "accepted" if accepted else "notAccepted"
        if not accepted:
            reason = (f"NOT PROMOTABLE: fit grade refused -- max {sym} {mx:.3f} {u} over the "
                      f"{n_kept} kept points")
        elif split:
            reason = (f"NOT PROMOTABLE (fit grade {grade}, max {sym} {mx:.3f} {u}): the pair "
                      f"splits ONE liquid inside its own validity span (arm f, {m}) -- "
                      + split[0].split(": ", 1)[1])
        elif promotion_refusal(grade):
            reason = (f"NOT PROMOTED (max {sym} {mx:.3f} {u} over the {n_kept} kept points, one "
                      "liquid across the validity span): " + promotion_refusal(grade))
        else:
            reason = (f"PROMOTABLE by `{MODELS_PROMOTED_BY}`: fit grade {grade} -- max {sym} "
                      f"{mx:.3f} {u} over the {n_kept} kept points, one liquid across the "
                      "validity span")
        hdr = model_record_header(
            m, stem, rf["i"], rf["j"], case_rel,
            "reviewStatus interim: a case-local record, regressed and not read back.\n"
            "  Fitted on EVERY laboratory with the NRTL fit's own kept points (C294), so\n"
            "  the `validation {}` block says, truthfully, that nothing was held out;\n"
            "  the acceptance is the `curation {}` block.",
            cc.wrap(reason, indent="  ") + "\n", kind)
        rec = cc.record_from_proposal(ptext, hdr, cc.case_record_fields(case_rel))
        rec = rec.rstrip("\n") + "\n\n" + model_curation_block(
            m, kind, verdict, n_kept, n_drop, mx, mean, nan, grade, not split, nT, nL)
        rp.parent.mkdir(parents=True, exist_ok=True)
        rp.write_text(rec)
        out["models"][m] = {"fitted": True, "max": mx, "mean": mean, "kept": n_kept,
                            "nan": nan, "grade": grade, "split": bool(split),
                            "verdict": verdict, "reason": reason,
                            "params": [rf[k] for k in MSPEC[m][0]]}
    set_readback(case, models)
    cc.seal(case)
    rc, o, js = cc.run_props(case)
    if rc != 0:
        refuse(f"the sealed case {case_rel} exited {rc}: {o[-600:]}")
    for m in models:
        d1 = (cc.op_result(js, f"fit_{m.lower()}") or {}).get("diagnostics", {})
        d2 = (cc.op_result(js, f"fit_{m.lower()}_start2") or {}).get("diagnostics", {})
        keys = [k for k in d1 if k.rsplit(".", 1)[-1] in MSPEC[m][0]]
        keys.sort(key=lambda k: MSPEC[m][0].index(k.rsplit(".", 1)[-1]))
        p1, p2 = [d1[k] for k in keys], [d2.get(k) for k in keys]
        sc = 1.0 if m == "UNIQUAC" else 10.0
        same = bool(keys) and all(y is not None and abs(x - y) <= 1e-2 * max(sc, abs(x))
                                  for x, y in zip(p1, p2))
        r = out["models"][m]
        r["same"] = same if d2 else None
        kn = MSPEC[m][0]
        lines.append(
            f"fit_{m.lower()}: {kn[0]} = {p1[0]:.1f}, {kn[1]} = {p1[1]:.1f} {MSPEC[m][1]} over "
            f"{r['kept']} kept points: max {sym} {r['max']:.3f} {u}, mean {r['mean']:.3f} {u}, "
            f"graded {r['grade']} -> {r['verdict']}; "
            + (f"fit_{m.lower()}_start2 lands on "
               f"{'the same pair' if same else 'A DIFFERENT pair'} ({p2[0]:.1f}, {p2[1]:.1f}).  "
               if d2 else f"fit_{m.lower()}_start2 removed (it did not converge).  ")
            + r["reason"] + ".")
    lines += notes
    for m in MODELS:
        if m not in models and el[m]:
            lines.append(f"{m}: not fitted -- {el[m]}.")
    nl = (f"Beside fit_nrtl's max {sym} {nmx:.3f} {u} ({crp.word(ncur, 'grade')}) on the same "
          "kept points.  ")
    txt = ("WHAT THE UNIQUAC AND WILSON FITS FOUND (pinned in `expected`; measured, not "
           "argued).  " + nl + "  ".join(lines))
    t = pd.read_text()
    t = re.sub(r"@@MODELS-RESULT-BEGIN@@.*?@@MODELS-RESULT-END@@",
               lambda _m: "@@MODELS-RESULT-BEGIN@@\n" + cc.wrap(txt) + "\n  @@MODELS-RESULT-END@@",
               t, flags=re.S)
    pd.write_text(t)
    out["outcome"] = "ran"
    return out


# --------------------------------------------------------------------------
#  C294: promotion, by the same rules (C286, C300)
# --------------------------------------------------------------------------
def model_promoted_text(text, model, case, stem, i, j, kind):
    import pairs_px as px
    case_rel = case.relative_to(ROOT).as_posix()
    cur = crp.block(crp.strip_comments(text), "curation") or ""
    grade = crp.word(cur, "grade")
    if grade not in GRADES[:3] or promotion_refusal(grade):
        refuse(f"{model} {stem}: curation grade `{grade}` -- not promoted")
    nT, nL = int(crp.num(cur, "temperatures") or 0), int(crp.num(cur, "laboratories") or 0)
    applied, caps = cap_grade(grade, nT, nL)
    if kind == "tx":
        mx = crp.num(cur, "maxAbsError")
        lim = f"{GRADE_K[0]:g} / {GRADE_K[1]:g} / {GRADE_K[2]:g} K"
        gl_num = f"    fitGradeMaxTemperatureError_K {mx:.4f};\n"
        what = f"max |T_model - T| over the kept points, graded {lim}"
        mxs = f"{mx:.4f} K"
    else:
        mx = crp.num(cur, "maxRelError_pct")
        lim = f"{px.GRADE_PCT[0]:g} / {px.GRADE_PCT[1]:g} / {px.GRADE_PCT[2]:g} %"
        gl_num = f"    fitGradeMaxRelativeError_pct {mx:.4f};\n"
        what = f"max |P_model - P|/P over the kept points, graded {lim}"
        mxs = f"{mx:.4f} %"
    hdr = model_record_header(
        model, stem, i, j, case_rel,
        "reviewStatus autoPromoted; review { by none; }: PROMOTED AUTOMATICALLY by\n"
        "  its fitting pipeline (the NRTL case's own evidence and kept points, the\n"
        f"  {what} -- DEV.md 4c C285, C294;\n"
        f"  THIS fit: {grade} in-sample, {mxs}"
        + (f", CAPPED at {applied} by C300 ({' and '.join(caps)})" if caps else "")
        + "; one liquid across its\n"
        "  validity span), and NO HUMAN HAS REVIEWED IT.  The engine says so on every\n"
        "  run that reads it, and voices a warning or a severe grade beside it.\n"
        "  Nothing was held out: the `validation {}` block says so, and the\n"
        "  acceptance is the `curation {}` block.  A curator who reads the series\n"
        "  back against the articles records it in the `review {}` block (DEV.md 4c\n"
        "  C297).  Revert by reverting the commit that promoted it.",
        "", kind)
    body = cc.body_of(text)
    gl = (f"    fitGrade      {applied};   // DEV.md 4c C285 (C294): {what}\n"
          + BASIS_LINE + cap_line(caps) + gl_num)
    body = re.sub(r"(\n    reviewStatus\s+)interim;",
                  lambda mm: mm.group(1) + "autoPromoted;\n" + REVIEW_NONE + gl
                  + f'    promotedBy    "{MODELS_PROMOTED_BY}";\n'
                  + f'    promotedDate  "{date.today().isoformat()}";', body, count=1)
    return hdr + body


def promoting_case(case, c1, c2):
    """C294: one pair, one case of evidence across its models.  When the
    pair's NRTL is in the catalogue, only the case it names promotes the
    pair's other models; otherwise the pair's cases in path order."""
    nrec = cc.existing_records(c1, c2, model="NRTL")
    if nrec:
        named = crp.word(crp.strip_comments((ROOT / nrec[0]).read_text()), "fittedInCase")
        return named == case.relative_to(ROOT).as_posix()
    return True


def models_promote(case, model):
    kind = case_kind(case)
    t = (case / "system" / "propsDict").read_text()
    c1, c2 = op_pair(nrtl_op(t))
    stem = "-".join(sorted((c1, c2)))
    rp = case / "constant" / "parameters" / model / f"{stem}.dat"
    if not rp.exists():
        refuse(f"{cc.label(case)}: no case-local {model} record (not fitted, or promoted already)")
    text = rp.read_text()
    if crp.word(crp.strip_comments(text), "reviewStatus") != "interim":
        refuse(f"{cc.label(case)}: its {model} record is not a case-local interim record")
    cur = crp.block(crp.strip_comments(text), "curation") or ""
    if crp.word(cur, "verdict") != "accepted":
        refuse(f"{model} {stem}: curation verdict `{crp.word(cur, 'verdict')}`")
    if promotion_refusal(crp.word(cur, "grade")):
        refuse(f"{model} {stem}: NOT PROMOTED: " + promotion_refusal(crp.word(cur, "grade")))
    rf, split = model_split(text, model, case, stem)
    if split:
        refuse(f"{model} {stem}: " + split[0])
    if crp.word(cur, "oneLiquid") != "true":
        refuse(f"{model} {stem}: curation oneLiquid `{crp.word(cur, 'oneLiquid')}`")
    if cc.existing_records(c1, c2, model=model):
        refuse(f"a catalogue {model} record for {c1} + {c2} already exists -- never overwritten")
    if not promoting_case(case, c1, c2):
        refuse(f"{model} {stem}: the pair's NRTL record names another case -- one pair, one "
               "case of evidence across its models (C294)")
    dest = cc.STD_PARAMS / model / f"{stem}.dat"
    dest.parent.mkdir(parents=True, exist_ok=True)
    mxg = crp.num(cur, "maxAbsError" if kind == "tx" else "maxRelError_pct")
    blk = ("@@MODELS-RESULT-BEGIN@@", "@@MODELS-RESULT-END@@", MODELS_PROMOTED_BY,
           f"fit_{model.lower()}:")
    ideal = ideal_guard(case, kind, crp.word(cur, "grade"), mxg, f"{model} {stem}", blk)
    dest.write_text(stamp_ideal(model_promoted_text(text, model, case, stem, rf["i"], rf["j"], kind),
                                kind, mxg, ideal))
    rp.unlink()
    try:
        cc.seal(case)
    except (SystemExit, Refused):
        dest.unlink()
        rp.write_text(text)
        cc.seal(case)
        raise
    restate_severe_result(case, *blk[:3], kind=kind, mx=mxg, ideal=ideal, after=blk[3])
    pd = case / "system" / "propsDict"
    x = pd.read_text()
    mm = re.search(r"@@MODELS-RESULT-BEGIN@@(.*?)@@MODELS-RESULT-END@@", x, re.S)
    para = " ".join(mm.group(1).split())
    old = f"PROMOTABLE by `{MODELS_PROMOTED_BY}`: fit grade"
    k = para.find(f"fit_{model.lower()}:")
    if k >= 0 and para.find(old, k) >= 0:
        o = para.find(old, k)
        para = (para[:o] + f"PROMOTED on {date.today().isoformat()} into "
                f"{dest.relative_to(ROOT).as_posix()} as reviewStatus autoPromoted, review by "
                "none, because: fit grade" + para[o + len(old):])
        pd.write_text(x[:mm.start()] + "@@MODELS-RESULT-BEGIN@@\n" + cc.wrap(para)
                      + "\n  @@MODELS-RESULT-END@@" + x[mm.end():])
    return dest


def batch_models(a):
    """`choupo-curate pairs --models` (DEV.md 4c C294): --declare, --run,
    --promote over every C283/C291 pair case (or --only <stem> ...)."""
    cases = [(p, x, y) for p, x, y in cc.curation_roots.pair_cases()
             if (p / cc.DECL).exists() and case_kind(p)]
    if a.only:
        want = set(a.only)
        cases = [c for c in cases if cc.curation_roots.pair_stem_of(c[0]) in want
                 or cc.label(c[0]) in want]
    out = []
    if a.run and a.jobs > 1:
        out, cases = run_models_parallel(a, cases)
    for case, x, y in cases:
        rec = {"case": cc.label(case), "pair": [x, y]}
        try:
            if a.declare:
                rec["outcome"] = "declared" if models_declare(case) else "declared already"
            elif a.run:
                if MODEL_MARK not in (case / "system" / "propsDict").read_text():
                    rec["outcome"] = "not declared"
                elif "WHAT THE UNIQUAC AND WILSON FITS FOUND: not yet run." not in \
                        (case / "system" / "propsDict").read_text():
                    rec["outcome"] = "ran already"
                else:
                    rec.update(models_run(case))
            elif a.promote:
                done = []
                for m in MODELS:
                    rp = case / "constant" / "parameters" / m
                    if not list(rp.glob("*.dat")):
                        continue
                    try:
                        if crp.word(crp.strip_comments(next(rp.glob("*.dat")).read_text()),
                                    "reviewStatus") != "interim":
                            continue
                        d = models_promote(case, m)
                        done.append(f"{m} promoted")
                    except (Refused, SystemExit) as ex:
                        done.append(f"{m} not promoted: {str(ex)[:160]}")
                rec["outcome"] = "; ".join(done) or "nothing to promote"
        except Refused as ex:
            rec["outcome"] = "refused: " + str(ex)
        except SystemExit as ex:
            rec["outcome"] = f"refused (exit {ex.code})"
        except Exception as ex:   # noqa: BLE001 -- one failure never stops the batch
            rec["outcome"] = f"error: {type(ex).__name__}: {ex}"
        summ = ""
        for m, r in rec.get("models", {}).items():
            summ += (f"  {m} {r['grade']} {r['max']:.3f}" if r.get("fitted") else f"  {m} -")
        cc.say(f"[{rec['case']}] {rec['outcome'][:300]}{summ}")
        out.append(rec)
        if a.json:
            Path(a.json).write_text(json.dumps(out, indent=1, default=str))
    return 0


def run_models_parallel(a, cases):
    """`--models --run --jobs N`: each case run by a child of this command
    (`--only <label> --jobs 1`), at most N at once; a child writes only inside
    its own case directory (fetch, the fits, its case-local records, the
    seal).  Promotion and commits never run here."""
    import concurrent.futures as cf
    jobs = min(a.jobs, JOBS_CAP)
    if a.jobs > JOBS_CAP:
        cc.say(f"--jobs {a.jobs} capped at {JOBS_CAP}")
    tmp = Path(tempfile.mkdtemp(prefix="choupo-curate-c294-jobs-"))

    def child(c):
        lab = cc.label(c[0])
        js = tmp / (lab.replace("/", "__") + ".json")
        p = subprocess.run([sys.executable, str(ROOT / "bin" / "choupo-curate"), "pairs",
                            "--models", "--run", "--only", lab, "--jobs", "1",
                            "--json", str(js)], capture_output=True, text=True)
        try:
            rec = json.loads(js.read_text())[0]
        except (OSError, ValueError, IndexError):
            rec = {"case": lab, "pair": [c[1], c[2]],
                   "outcome": f"error: child exited {p.returncode}: {(p.stdout + p.stderr)[-300:]}"}
        return rec, p.stdout

    out = []
    try:
        with cf.ThreadPoolExecutor(max_workers=jobs) as ex:
            for rec, txt in ex.map(child, cases):
                sys.stdout.write("".join(l + "\n" for l in txt.splitlines() if l.startswith("[")))
                sys.stdout.flush()
                out.append(rec)
                if a.json:
                    Path(a.json).write_text(json.dumps(out, indent=1, default=str))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return out, []


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
