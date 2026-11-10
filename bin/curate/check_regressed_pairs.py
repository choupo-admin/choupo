#!/usr/bin/env python3
"""check_regressed_pairs -- a pair Choupo REGRESSED cannot drift from its evidence.

    bin/curate/check_regressed_pairs.py

WHY THIS EXISTS (C16, 2026-09-28).  Binary pairs regressed by Choupo's own
`fitParameters` to measured bubble temperatures now sit in the public
catalogue (data/standards/parameters/NRTL/).  Each such record names the case
that regressed it (`fittedInCase`).  A record whose numbers were edited, or a
case whose evidence, partition or band was edited, would leave the catalogue
claiming a fit and a verdict nobody can reproduce -- the published-but-
unpinned shape, one level up: the case's golden pins what the CASE prints,
and nothing pinned that the RECORD still says the same.

WHAT IT CHECKS, per record carrying `fittedInCase` (the catalogue's, and any
case-local one that did not earn promotion):

  (a) REPRODUCTION.  The named case is copied and run; the proposal it writes
      must equal the record on the parameters (i, j, a, b, alpha), the
      evidence (role, DOI, sha256 of each dataset), the validity span and the
      validation block (verdict, held-out points, AAD, band).
  (b) THE PROMOTION FIELDS.  `recordType`, `pair {}`, `reviewStatus`,
      `reviewReason`, `reuse` and `fittedInCase` are present -- they are what
      promotion ADDS, and a record without them is a proposal that was moved,
      not promoted.
  (c) ONLY A VALIDATED FIT IS IN THE CATALOGUE.  A record under
      data/standards/ must carry `verdict validated`; a fit that missed its
      band may live in its own case, never in the catalogue.
  (d) THE ENGINE VOICES THE STATUS.  A record marked `reviewStatus interim`
      must produce the `[unreviewed] pair` line when its case runs -- a field
      the engine cannot see is a comment.
  (e) THE EVIDENCE CARRIES ITS IDENTITY.  Every dataset the case fits to or
      holds out carries a DOI, the archive file and its sha256, a citation,
      the CAS + InChIKey of both compounds, and per-point uncertainties whose
      count equals its data rows.
  (f) ONE LIQUID WHERE THE EVIDENCE SAYS ONE (C16 slice 2, 2026-10-05).  A
      catalogue pair must not predict a liquid-liquid split anywhere in its
      own validity span.  Its evidence is bubble temperatures of ONE liquid,
      and a bubble-temperature scan solves for one liquid BY CONSTRUCTION --
      so the held-out verdict cannot see a second one, and `validated` is
      necessary, not sufficient.  Found on ethanol + cyclohexane: validated
      at 0.094 % against a 0.41 % band, and splitting the liquid at every
      temperature up to 358.8 K, across its whole span (the engine's own VLLE flash at
      340 K splits a 43/57 feed, beta 0.48).  The test is the record's own
      NRTL equation (the one its header states), Gibbs energy of mixing on
      a 4000-point grid against its lower convex hull, at six temperatures
      spanning the validity block -- an INDEPENDENT recomputation, not a
      call into the engine.  Below the span is an extrapolation the record
      announces; the arm does not look there (1-propanol + water splits
      below 355.5 K, and its record says so).

      AMENDED (DEV.md 4c C226 A2, 2026-11-05): arm (f) is no longer only a
      prohibition.  A pair that DECLARES `liquidLiquid true;` (in its
      `validation {}` block, with a `gap {}` block) is held to a different
      question: does the equation reproduce the GAP its evidence measured?
      The declaration is accepted only with ALL of: tie-line evidence listed
      in the record (`property binaryLLE.binodal;` entries, at least one of
      `role fit`); a gap band `acceptance.maxLLE` declared before the fit and
      equal to `gap.band_dx`; the recorded gap error not above that band; the
      measured temperatures inside the record's validity span; and, at every
      measured tie line of that evidence (fit and held-out), the record's own
      NRTL equation (the Gibbs-energy-of-mixing lower hull, recomputed here
      -- no call into the engine) splits the liquid with both binodal
      compositions within the band.  The prohibition is UNCHANGED for every
      pair that does not carry the identical declaration: one liquid across
      its validity span, or it stays in its case.  Arm (h) builds the right
      record and six wrong ones and requires the right to pass and each wrong
      to be refused by name -- a guard whose only case satisfies it tests
      nothing.

  (g) A PAIR USED OUTSIDE ITS SPAN IS ANNOUNCED (C35 item 5, 2026-10-05).
      Arm (f) looks only INSIDE a span; below it the three water pairs the
      C16 report named (1-propanol, acetonitrile, isopropanol + water) split
      a liquid miscible in every proportion, and a run there used to say
      nothing.  The engine now announces it (`PairSpanGuard`,
      src/thermo/PairAudit.H).  Each of the three is asked for activity
      coefficients at TWO temperatures below its span, in a probe case built
      here: the run must print exactly ONE `[pair-span]` line naming the
      pair (once per pair per run) and carry it into the result JSON's
      advisories (the end-of-run caveat block); the same pair asked inside
      its span must print none.  And it changes no number: the gammas are
      compared with a twin that declares the same parameters INLINE (an
      inline pair carries no span, so nothing is announced) and must be
      identical.

  AMENDED (DEV.md 4c C282, 2026-11-10): `reviewStatus autoPromoted`.  A
      record its fitting pipeline (bin/choupo-curate pair --promote)
      promoted WITHOUT a human reading it is accepted beside `interim` in
      arms (b) and (d) on three conditions: it carries `humanReviewed
      false;` (a machine-promoted record that claims a human read it is
      refused), it names `promotedBy`, and its case's run prints the
      engine's OWN autoPromoted sentence (`reviewStatus autoPromoted`) --
      not merely an `[unreviewed] pair` line, which an inline pair also
      prints.  And a case whose measured series are NOT in the tree (Vitor,
      2026-11-10: only the fitted parameters are kept) declares them in
      `constant/archiveDatasets`; the gate regenerates them with
      `bin/choupo-curate fetch` (local cache, else the NIST URL, both sha256
      sums checked) before arms (a) and (e).  Where neither the cache nor
      NIST can be reached, those records are NOT RUN, listed by name, and
      the gate exits 2 -- never a pass (a check that cannot run must not
      pass) and never a silent skip.

  (i) A REGRESSED VAPOUR PRESSURE (DEV.md 4c C281 step 2, 2026-11-10).  A
      component whose `provenance { vaporPressure { ... } }` entry names a
      `fittedInCase` (or claims `autoPromoted` / `humanReviewed`) was refitted
      by `bin/choupo-curate vp` from an AmbroseWalton estimate to an Antoine:
      its case is fetched and run, and the record's coefficients (to 1e-8
      relative) must equal the run's; under DEV.md 4c C283 (every usable
      study fitted, none held out) the gate RECOMPUTES from the record's own
      coefficients, the case's datasets and the run's list of discarded
      points: the points kept and dropped, the mean and max relative P error
      of the fit and of the AmbroseWalton curve on the kept points, and
      requires acceptance.verdict `accepted`; under DEV.md 4c C285 it GRADES
      the fit (max relative P error 5 / 10 / 20 %, and |Tnb - Tb| 1 / 2 / 4 K
      where Tb lies outside the kept range, the limits of clean / warning /
      severe, the worse of the two; a case's system/curationDict may declare
      others with a reason) and requires the record's `fitGrade` to be that
      grade, never `refused`, with `fitGradeMaxRelativeError_pct` and (only
      where the temperature criterion applies) `fitGradeBoilingPointGap_K`
      equal to the recomputed numbers, and a warning or severe grade VOICED by
      the loader (`[fit-grade] ... fitGrade warning|SEVERE` on the console and
      in the advisories; a clean grade voices nothing); Trange = the kept span, the
      evidence (role, DOI, extract sha256) equal to the case's
      archiveDatasets, `outliers { maxRelativeError 15 percent; }` declared,
      and the objective twoStage in the case, the run and the record's
      `method` (C281 step 3); the entry is `reviewStatus autoPromoted;
      humanReviewed false;` with `promotedBy`; and the case's run prints the
      component loader's `[unreviewed] component '<c>': `vaporPressure`
      reviewStatus autoPromoted` line AND carries it in the result JSON
      advisories.  Each dataset carries its DOI, archive sha256, citation, the
      compound's CAS + InChIKey and one stated Psat uncertainty per row.
      NOT RUN (exit 2) where the series cannot be regenerated, as above.

WHAT IT DOES NOT CHECK.  Whether the measurements are RIGHT -- each dataset
says `reviewStatus transcribedNotCheckedAgainstArticle`, and reading them
back against the articles is a curator's act.  Whether the band was the right
one to declare -- only that the record carries the band the run used.
Phase stability below a record's validity span, or for a case-local record.

SABOTAGES (by hand): docs/design/binary-pairs-from-open-measurements.md
section 4 (2026-09-28, arms a-e) and section 6.4 (2026-10-05, arm f).
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "choupoProps"
STD = ROOT / "data" / "standards" / "parameters" / "NRTL"
PROMOTION_FIELDS = ("fittedInCase", "reviewStatus", "reviewReason", "reuse")
CURATE = ROOT / "bin" / "choupo-curate"
ARCHIVE_DECL = "constant/archiveDatasets"


def fetch_case(case):
    """(code, message): 0 fetched/verified, 1 refused, 2 cannot run."""
    p = subprocess.run([sys.executable, "-I", str(CURATE), "fetch", str(case)],
                       capture_output=True, text=True, timeout=900,
                       env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
    return p.returncode, (p.stdout + p.stderr).strip()


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"(^|\s)//[^\n]*", r"\1", t)


def block(text, name):
    m = re.search(r"(^|\s)%s\s*\{" % re.escape(name), text)
    if not m:
        return None
    k, depth = m.end() - 1, 0
    for n in range(k, len(text)):
        depth += {"{": 1, "}": -1}.get(text[n], 0)
        if depth == 0:
            return text[k + 1:n]
    return None


def word(text, key):
    m = re.search(r"(^|\s)%s\s+\"?([^;\"]+?)\"?\s*;" % re.escape(key), text or "")
    return m.group(2).strip() if m else None


def num(text, key):
    w = word(text, key)
    try:
        return float(w.split()[0]) if w else None
    except ValueError:
        return None


def evidence(text):
    ev = block(text, "provenance") or ""
    out = set()
    for m in re.finditer(r"\{([^{}]*)\}", ev):
        b = m.group(1)
        if "role" in b and "doi" in b:
            out.add((word(b, "role"), word(b, "doi"), word(b, "sha256")))
    return out


def facts(text):
    t = strip_comments(text)
    par = block(t, "parameters") or ""
    val = block(t, "validation") or ""
    ho = block(val, "heldOut") or ""
    acc = block(val, "acceptance") or ""
    vd = block(block(t, "provenance") or "", "validity") or ""
    return {
        "i": word(par, "i"), "j": word(par, "j"),
        **{k: num(par, k) for k in ("a_ij", "b_ij", "a_ji", "b_ji", "alpha")},
        "evidence": evidence(t),
        "T": (block(vd, "temperature") or "").split(),
        "P": (block(vd, "pressure") or "").split(),
        "verdict": word(val, "verdict"),
        "points": num(ho, "points"), "aad_pct": num(ho, "aad_pct"),
        "maxAAD": num(acc, "maxAAD"),
    }


def nrtl_liquid_split(T, a12, b12, a21, b21, alpha, n=4000):
    """Arm (f): the x1 interval over which the binary NRTL Gibbs energy of
    mixing lies ABOVE its lower convex hull at T (a liquid-liquid split), or
    None.  g/RT = x1 ln x1 + x2 ln x2 + x1 x2 [tau21 G21/(x1 + x2 G21) +
    tau12 G12/(x2 + x1 G12)], tau_ij = a_ij + b_ij/T, G_ij = exp(-alpha
    tau_ij) -- the equation the record header states, recomputed here."""
    t12, t21 = a12 + b12 / T, a21 + b21 / T
    G12, G21 = math.exp(-alpha * t12), math.exp(-alpha * t21)
    pts = []
    for k in range(1, n):
        x1 = k / n
        x2 = 1.0 - x1
        g = (x1 * math.log(x1) + x2 * math.log(x2)
             + x1 * x2 * (t21 * G21 / (x1 + x2 * G21) + t12 * G12 / (x2 + x1 * G12)))
        pts.append((x1, g))
    hull = []
    for p in pts:                       # lower convex hull, monotone chain
        while len(hull) >= 2 and ((hull[-1][0] - hull[-2][0]) * (p[1] - hull[-2][1])
                                  - (hull[-1][1] - hull[-2][1]) * (p[0] - hull[-2][0])) <= 0:
            hull.pop()
        hull.append(p)
    for (xa, ga), (xb, gb) in zip(hull, hull[1:]):
        if xb - xa > 2.5 / n and any(
                g - (ga + (gb - ga) * (x - xa) / (xb - xa)) > 1e-9
                for x, g in pts if xa < x < xb):
            return (xa, xb)
    return None


def evidence_entries(text):
    """Every `{ ... }` evidence entry of the record's provenance: (role,
    dataset, property)."""
    prov = block(text, "provenance") or ""
    m = re.search(r"evidence\s*\((.*?)\n    \);", prov, re.S)
    out = []
    for b in re.finditer(r"\{([^{}]*)\}", m.group(1) if m else ""):
        d = b.group(1)
        out.append((word(d, "role"), word(d, "dataset"), word(d, "property")))
    return out


def ll_facts(text):
    t = strip_comments(text)
    val = block(t, "validation") or ""
    gap = block(val, "gap") or ""
    acc = block(val, "acceptance") or ""
    return {
        "declared": word(val, "liquidLiquid"),
        "ties": num(gap, "ties"), "band": num(gap, "band_dx"),
        "aad": num(gap, "aad_dx"), "basis": word(gap, "basis"),
        "maxLLE": num(acc, "maxLLE"),
        "evidence": [e for e in evidence_entries(t) if e[2] == "binaryLLE.binodal"],
    }


def read_ties(path, comp_i, comp_j):
    """The tie lines of a binaryLLE.binodal dataset as (T, x_i_lo, x_i_hi),
    x_i the mole fraction of the RECORD's first component."""
    t = path.read_text()
    m = re.search(r"name\s+x_(\w+?)_phase1", t)
    if not m or "binaryLLE.binodal" not in t:
        return None, "is not a binaryLLE.binodal dataset with x_<comp>_phase1 columns"
    comp = m.group(1)
    if comp not in (comp_i, comp_j):
        return None, f"names component {comp!r}, which is neither of the pair"
    d = t[t.index("\ndata"):]
    rows = [l.split() for l in d.splitlines() if l.strip() and l.strip()[0].isdigit()]
    out = []
    for r in rows:
        T, a, b = float(r[0]), float(r[1]), float(r[2])
        if comp == comp_j:               # the dataset's component is the pair's j
            a, b = 1.0 - b, 1.0 - a
        out.append((T, min(a, b), max(a, b)))
    return out, None


def check_liquid_liquid(rec, rf, case, tag, fails):
    """Arm (f), the declared-gap branch.  Returns True when the record
    declares `liquidLiquid true;` (its checks are then done HERE and the
    one-liquid prohibition does not apply), False when it declares nothing.
    Every refusal is appended to `fails`, by name."""
    lf = ll_facts(rec)
    if lf["declared"] is None:
        return False
    if lf["declared"] != "true":
        fails.append(f"{tag}: `liquidLiquid {lf['declared']}` -- the only declaration "
                     "is `liquidLiquid true;` (anything else is a word nobody reads)")
        return True
    why = []
    if not lf["maxLLE"]:
        why.append("no `acceptance.maxLLE` -- the gap band must be declared BEFORE "
                   "the fit, in the validation block")
    if not lf["band"] or (lf["maxLLE"] and not close(lf["band"], lf["maxLLE"], 1e-6, 1e-9)):
        why.append(f"gap.band_dx {lf['band']} is not the declared acceptance.maxLLE {lf['maxLLE']}")
    if lf["aad"] is None or (lf["band"] and lf["aad"] > lf["band"]):
        why.append(f"gap.aad_dx {lf['aad']} is above its band {lf['band']} (or absent)")
    if not any(role == "fit" for role, _, _ in lf["evidence"]):
        why.append("no tie-line evidence of `role fit` (a `property binaryLLE.binodal;` "
                   "entry under provenance.evidence) -- a gap with no measured gap "
                   "behind it is a guess")
    if case is None or not case.is_dir():
        why.append("fittedInCase is not a case, so the tie lines cannot be read")
    if why:
        fails.append(f"{tag}: declares `liquidLiquid true;` but " + "; ".join(why))
        return True
    tlo, thi = validity_T(rf["T"])
    err_sum, n = 0.0, 0
    for role, ds, _ in lf["evidence"]:
        path = case / ds
        if not path.exists():
            fails.append(f"{tag}: the tie-line evidence {ds} is not in {case.name}")
            return True
        rows, bad = read_ties(path, rf["i"], rf["j"])
        if bad:
            fails.append(f"{tag}: tie-line evidence {ds} {bad}")
            return True
        for T, xlo, xhi in rows:
            #  The span is the span of the FIT evidence (the record's own
            #  note).  A held-out tie line just outside it is evidence about
            #  the extrapolation and is still scored below; a FIT tie line
            #  outside it contradicts the span (C280, the first real record:
            #  held-out ties at 288.15 K and 366.23 K against 288.20-365.85).
            if role == "fit" and (tlo is None or not (tlo <= T <= thi)):
                fails.append(f"{tag}: a FIT tie line at {T} K lies outside the record's "
                             f"validity span {tlo}-{thi} K -- the evidence and the "
                             "span it supports disagree")
                return True
            cut = nrtl_liquid_split(T, rf["a_ij"], rf["b_ij"], rf["a_ji"], rf["b_ji"],
                                    rf["alpha"])
            if cut is None:
                fails.append(f"{tag}: declares a gap but its own NRTL equation gives "
                             f"ONE liquid at {T} K, where the evidence measured two "
                             f"(x_{rf['i']} {xlo:.4f} | {xhi:.4f})")
                return True
            err_sum += (abs(cut[0] - xlo) + abs(cut[1] - xhi)) / 2.0
            n += 1
    mean = err_sum / n if n else float("inf")
    if mean > lf["band"]:
        fails.append(f"{tag}: the gap its equation predicts misses the measured tie "
                     f"lines by {mean:.4f} (mean |dx| over {n} tie lines), above the "
                     f"band {lf['band']} declared before the fit")
    return True


def one_liquid_failures(rf, tag):
    """Arm (f), the prohibition: the refusals for a pair that declares no gap
    and predicts a split inside its validity span."""
    tlo, thi = validity_T(rf["T"])
    if tlo is None or thi is None or None in (rf["a_ij"], rf["b_ij"],
                                              rf["a_ji"], rf["b_ji"], rf["alpha"]):
        return [f"{tag}: no readable validity temperature span or NRTL "
                "parameters -- arm (f) cannot run, so it must not pass"]
    for k in range(6):
        T = tlo + (thi - tlo) * k / 5
        cut = nrtl_liquid_split(T, rf["a_ij"], rf["b_ij"], rf["a_ji"],
                                rf["b_ji"], rf["alpha"])
        if cut:
            return [
                f"{tag}: predicts a LIQUID-LIQUID SPLIT at {T:.2f} K "
                f"(x_{rf['i']} {cut[0]:.3f} .. {cut[1]:.3f}), inside its own "
                f"validity span {tlo}-{thi} K -- its evidence is bubble "
                "temperatures of ONE liquid, which a bubble scan cannot "
                "contradict; a pair that splits that liquid stays in its "
                "case, not the catalogue (or it DECLARES `liquidLiquid true;` "
                "with tie-line evidence and a gap band)"]
    return []


def validity_T(tokens):
    """(min, max) in K from the validity block's temperature tokens."""
    vals = re.findall(r"(min|max)\s+([0-9.eE+-]+)", " ".join(tokens))
    d = {k: float(v) for k, v in vals}
    return (d.get("min"), d.get("max"))


def close(a, b, rel=1e-6, abs_=1e-6):
    if a is None or b is None:
        return a is b
    return abs(a - b) <= max(abs_, rel * max(abs(a), abs(b)))


def check_dataset(path, fails, tag):
    t = path.read_text()
    prov = block(t, "provenance") or ""
    for k in ("doi", "sha256", "archiveFile", "citation"):
        if not word(prov, k):
            fails.append(f"{tag}: {path.name} declares no provenance `{k}`")
    ident = block(prov, "identity")
    if not ident or len(re.findall(r"inchiKey\s+\"[A-Z]{14}-[A-Z]{10}-[A-Z]\"", ident)) != 2 \
            or len(re.findall(r"cas\s+\"\d+-\d\d-\d\"", ident)) != 2:
        fails.append(f"{tag}: {path.name} does not carry the CAS and InChIKey of "
                     "BOTH compounds under provenance.identity -- the join to the "
                     "catalogue must be checkable without re-running it")
    #  A binodal dataset carries no bubble temperature: its rows are
    #  weighted by the operation's declared liquidLiquid sigma, and arm (f)
    #  holds them to the record.  The per-point arm below is for bubble sets.
    if re.search(r"^\s*property\s+binaryLLE\.binodal\s*;", t, re.M):
        return
    u = block(block(t, "uncertainty") or "", "T_bubble") or ""
    m = re.search(r"values\s*\(([^)]*)\)", u)
    d = t[t.index("\ndata"):] if "\ndata" in t else ""
    rows = [l for l in d.splitlines()[2:] if l.strip() and l.strip()[0].isdigit()]
    if not m or len(m.group(1).split()) != len(rows):
        fails.append(f"{tag}: {path.name} -- per-point T_bubble uncertainties "
                     f"missing or not one per data row ({len(rows)} rows)")


#  Arm (g): the three water pairs C16 found splitting a miscible liquid BELOW
#  their spans -- two temperatures below each span, one inside it.
SPAN_PROBES = (
    ("isopropanol",  "water", (298.15, 290.0), 360.0),
    ("1Propanol",    "water", (298.15, 290.0), 365.0),
    ("acetonitrile", "water", (298.15, 290.0), 360.0),
)


def run_span_probe(tmp, i, j, temps, inline=None):
    """Build a two-component choupoProps case asking for gamma at each T, and
    run it.  `inline` replaces the catalogue resolution with an inline pair,
    which carries no span -- the twin that cannot announce."""
    case = tmp / ("span-" + i + "-" + "-".join(f"{t:g}" for t in temps)
                  + ("-inline" if inline else ""))
    (case / "system").mkdir(parents=True)
    (case / "constant").mkdir()
    (case / "system" / "controlDict").write_text(
        'application choupoProps;\ndescription "pair span probe";\nverbosity 2;\n')
    ops = "".join(
        f"    {{ name g{k}; type activityCoefficients; temperature {t};"
        f" composition {{ {i} 0.5; {j} 0.5; }} }}\n"
        for k, t in enumerate(temps))
    (case / "system" / "propsDict").write_text("operations\n(\n" + ops + ");\n")
    pairs = ""
    if inline:
        pairs = (f" binaryParameters {{ {i}-{j} {{ i {i}; j {j};"
                 f" a_ij {inline['a_ij']!r}; b_ij {inline['b_ij']!r};"
                 f" a_ji {inline['a_ji']!r}; b_ji {inline['b_ji']!r};"
                 f" alpha {inline['alpha']!r}; }} }}")
    (case / "constant" / "thermoPhysPropDict").write_text(
        "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
        f"components ( {i} {j} );\n"
        "equilibrium\n{\n    formulation gammaPhi;\n"
        f"    liquid {{ activityModel {{ model NRTL;{pairs} }}"
        " standardState pureLiquid; }\n"
        "    vapour { fugacityModel idealGas; }\n}\n")
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(PROPS), "."], cwd=str(case), env=env,
                       capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def result_of(out):
    """(the gammas a run published, its advisories), from the result JSON."""
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None, None
    try:
        js = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None, None
    vals = []
    for op in js.get("operationResults", []):
        for k, v in sorted(op.get("diagnostics", {}).items()):
            if k.startswith("gamma_"):
                vals.append((op.get("name"), k, v))
    return vals, js.get("advisories", [])


def check_span_announcement(tmp, fails):
    """Arm (g).  Returns the number of pairs held to it."""
    held = 0
    for i, j, below, inside in SPAN_PROBES:
        tag = f"arm (g) {i}-{j}"
        names = (f"NRTL pair {i}-{j}:", f"NRTL pair {j}-{i}:")
        rc, out = run_span_probe(tmp, i, j, below)
        if rc != 0:
            fails.append(f"{tag}: the below-span probe exited {rc} -- the arm "
                         f"cannot run, so it must not pass: {out[-400:]}")
            continue
        lines = [ln for ln in out.splitlines()
                 if ln.startswith("[pair-span]") and any(n in ln for n in names)]
        if len(lines) != 1:
            fails.append(f"{tag}: asked for gamma at {below} K, below its "
                         f"declared span, the run printed {len(lines)} "
                         "`[pair-span]` line(s) for it -- the ruling is ONE "
                         "per pair per run")
        elif "BELOW its declared validity span" not in lines[0]:
            fails.append(f"{tag}: the `[pair-span]` line does not say BELOW "
                         f"its declared validity span: {lines[0][:200]}")
        vals, adv = result_of(out)
        loci = {f"NRTL pair '{i}-{j}'", f"NRTL pair '{j}-{i}'"}
        if adv is None or not any(a.get("locus") in loci
                                  and a.get("category") == "validity"
                                  for a in adv):
            fails.append(f"{tag}: the announcement is not in the result "
                         "JSON's advisories -- it would never reach the "
                         "end-of-run caveat block")
        rc2, out2 = run_span_probe(tmp, i, j, (inside,))
        if rc2 != 0:
            fails.append(f"{tag}: the inside-span probe exited {rc2}")
            continue
        if "[pair-span]" in out2:
            fails.append(f"{tag}: asked at {inside} K, INSIDE its span, the "
                         "run still printed a `[pair-span]` line -- an "
                         "announcement that fires everywhere is read nowhere")
        #  The numbers.  The parameters are read from the catalogue record
        #  itself, so the twin differs from the probe ONLY in carrying no
        #  span.
        f = STD / f"{i}-{j}.dat"
        rf = facts(f.read_text()) if f.exists() else {"i": None}
        if rf["i"] != i:
            fails.append(f"{tag}: no catalogue record {f.name} with i = {i}")
            continue
        rc3, out3 = run_span_probe(tmp, i, j, below, inline=rf)
        v3, adv3 = result_of(out3)
        if rc3 != 0 or not vals or not v3:
            fails.append(f"{tag}: the inline twin could not be compared "
                         f"(exit {rc3})")
        elif vals != v3:
            fails.append(f"{tag}: the announced run and its span-less inline "
                         f"twin publish DIFFERENT gammas ({vals} vs {v3}) -- "
                         "an announcement must move no number")
        elif "[pair-span]" in out3:
            fails.append(f"{tag}: the inline twin announced a span it does "
                         "not carry")
        held += 1
    return held


#  Arm (h): the declared-gap branch of arm (f), held to a RIGHT record and six
#  WRONG ones built from the proposal the SYNTHETIC witness curate13 writes
#  (nothing is added to the catalogue: the synthetic pair never enters it).
LL_CASE = "tutorials/props/curation/curate13_synthetic_lle_butanol_water"


def check_ll_arm(tmp, fails):
    """Returns the number of wrong records refused (6) when the arm holds."""
    case = ROOT / LL_CASE
    if not (case / "system" / "propsDict").exists():
        fails.append(f"arm (h): the witness {LL_CASE} is missing -- the arm "
                     "cannot run, so it must not pass")
        return 0
    work = tmp / "arm-h"
    shutil.copytree(case, work)
    p = subprocess.run([str(PROPS), "."], cwd=str(work), capture_output=True,
                       text=True, timeout=900)
    prop = work / "nButanol-water.proposal.dat"
    if p.returncode != 0 or not prop.exists():
        fails.append(f"arm (h): the witness exited {p.returncode} / wrote no "
                     "proposal -- the arm cannot run, so it must not pass")
        return 0
    good = prop.read_text()

    def refusals(text, tag):
        f = []
        rf = facts(text)
        if not check_liquid_liquid(text, rf, case, tag, f):
            f.extend(one_liquid_failures(rf, tag))
        return f

    right = refusals(good, "arm (h) right")
    if right:
        fails.append("arm (h): the RIGHT record (declared gap, tie-line evidence, "
                     "band declared before the fit, equation reproduces the "
                     "measured gap) was refused: " + "; ".join(right))
    sub = lambda pat, new, t: re.sub(pat, new, t, count=1)       # noqa: E731
    wrongs = (
        ("no declaration",
         sub(r"\n\s*liquidLiquid true;", "", good),
         "LIQUID-LIQUID SPLIT"),
        ("gap moved (b_ij 150 -> 420)",
         sub(r"b_ij\s+[0-9.]+;", "b_ij        420.0;", good),
         "misses the measured tie lines"),
        ("no band declared (maxLLE removed)",
         sub(r"\n\s*maxLLE\s+[0-9.]+;[^\n]*", "", good),
         "no `acceptance.maxLLE`"),
        ("no tie-line evidence",
         re.sub(r"\n\s*property\s+binaryLLE\.binodal;", "", good),
         "no tie-line evidence of `role fit`"),
        ("equation gives one liquid (b_ij = b_ji = 0)",
         sub(r"b_ji\s+[0-9.]+;", "b_ji        0.0;", sub(r"b_ij\s+[0-9.]+;", "b_ij        0.0;", good)),
         "gives ONE liquid at"),
        ("recorded gap error above its band",
         sub(r"aad_dx\s+[0-9.]+;", "aad_dx       0.5;", good),
         "is above its band"),
    )
    held = 0
    for name, text, needle in wrongs:
        if text == good:
            fails.append(f"arm (h) wrong record '{name}': the mutation changed nothing "
                         "-- the probe is vacuous")
            continue
        r = refusals(text, "arm (h) wrong")
        if not r:
            fails.append(f"arm (h) wrong record '{name}': NOT refused -- the guard "
                         "accepts a record it must refuse")
        elif not any(needle in x for x in r):
            fails.append(f"arm (h) wrong record '{name}': refused, but not by the "
                         f"expected name {needle!r}: {r[0][:200]}")
        else:
            held += 1
    return held


#  Arm (i): a VAPOUR PRESSURE Choupo regressed (DEV.md 4c C281 step 2).
#  `bin/choupo-curate vp <component> --promote` replaces a component's
#  AmbroseWalton estimate by an Antoine fitted to one study and held out on
#  another, and marks the per-value provenance entry `provenance {
#  vaporPressure { ... reviewStatus autoPromoted; humanReviewed false;
#  fittedInCase ...; } }`.  The same promise as a pair record, so the same
#  arms, extended rather than duplicated: the record is reproduced by its case
#  (coefficients, Trange = the fit's own span, evidence identity, verdict,
#  held-out points and AAD, band), only a `validated` fit is in the
#  catalogue, `autoPromoted` carries `humanReviewed false` and `promotedBy`,
#  and the case's own run VOICES the status through the component loader.
STD_COMP = ROOT / "data" / "standards" / "components"


def _load_aw():
    import importlib.machinery
    import importlib.util
    path = ROOT / "bin" / "curate" / "check_ambrose_walton_announced.py"
    ld = importlib.machinery.SourceFileLoader("check_aw_for_regressed", str(path))
    sp_ = importlib.util.spec_from_loader(ld.name, ld)
    mod = importlib.util.module_from_spec(sp_)
    ld.exec_module(mod)
    return mod


AW = _load_aw()     # the AmbroseWalton curve, the gate that holds it to the engine


def AW_ARGS(rec_text):
    t = strip_comments(rec_text)
    return (num(t, "Tc"), num(t, "Pc") * 1e5, num(t, "omega"))


VP_FLOOR = 16     # promoted under DEV.md 4c C285's graded acceptance (7 clean,
                  # 6 warning, 3 severe; seven were promoted at C281 step 3
                  # under C283): a collapsed scan surface must not read as a
                  # clean catalogue
VP_GRADES = ("clean", "warning", "severe", "refused")
VP_LIMITS_P = (5.0, 10.0, 20.0)   # %, upper limits of clean / warning / severe (C285)
VP_LIMITS_T = (1.0, 2.0, 4.0)     # K, the same factors (C285's stated default)


def vp_grade(x, limits):
    for g, lim in zip(VP_GRADES, limits):
        if x <= lim:
            return g
    return VP_GRADES[-1]
VP_OBJECTIVE = "twoStage"   # C281 step 3: the declared objective of every regression


def vp_entry(text):
    """The per-value provenance entry of `vaporPressure`, comment-stripped."""
    prov = block(strip_comments(text), "provenance") or ""
    return block(prov, "vaporPressure")


def vp_facts(text):
    t = strip_comments(text)
    vb = None
    m = re.search(r"^vaporPressure\s*\{", t, re.M)
    if m:
        vb = block(t[m.start():], "vaporPressure")
    ent = vp_entry(text) or ""
    val = block(ent, "acceptance") or ""
    co = re.search(r"coefficients\s*\(([^)]*)\)", vb or "")
    tr = re.search(r"Trange\s*\(([^)]*)\)", vb or "")
    ev = set()
    for mm in re.finditer(r"\{([^{}]*)\}", block(ent, "evidence") or ent):
        b = mm.group(1)
        if "role" in b and "doi" in b:
            ev.add((word(b, "role"), word(b, "doi"), word(b, "sha256")))
    return {
        "model": word(vb or "", "model"),
        "coef": [float(x) for x in co.group(1).split()] if co else None,
        "Trange": [float(x) for x in tr.group(1).split()] if tr else None,
        "evidence": ev,
        "verdict": word(val, "verdict"), "pointsKept": num(val, "pointsKept"),
        "pointsDropped": num(val, "pointsDropped"), "studies": num(val, "studies"),
        "dropped": (re.search(r'dropped\s+"([^"]*)"', val) or [None, None])[1],
        "aad_pct": num(val, "aad_pct"), "max_pct": num(val, "max_pct"),
        "awAad_pct": num(val, "awAad_pct"), "awMax_pct": num(val, "awMax_pct"),
        "Tnb_fit": num(val, "Tnb_fit"),
        "fitGrade": word(ent, "fitGrade"),
        "gradeMax": num(ent, "fitGradeMaxRelativeError_pct"),
        "gradeGap": num(ent, "fitGradeBoilingPointGap_K"),
    }


def check_vp_dataset(path, comp, fails, tag):
    t = path.read_text()
    prov = block(t, "provenance") or ""
    for k in ("doi", "sha256", "archiveFile", "citation"):
        if not word(prov, k):
            fails.append(f"{tag}: {path.name} declares no provenance `{k}`")
    ident = block(prov, "identity") or ""
    if len(re.findall(r"inchiKey\s+\"[A-Z]{14}-[A-Z]{10}-[A-Z]\"", ident)) != 1 \
            or len(re.findall(r"cas\s+\"\d+-\d\d-\d\"", ident)) != 1 \
            or not re.search(r"(^|\s)%s\s*\{" % re.escape(comp), ident):
        fails.append(f"{tag}: {path.name} does not carry the CAS and InChIKey of "
                     f"{comp} under provenance.identity")
    u = block(block(t, "uncertainty") or "", "Psat") or ""
    m = re.search(r"values\s*\(([^)]*)\)", u)
    d = t[t.index("\ndata"):] if "\ndata" in t else ""
    rows = [l for l in d.splitlines()[2:] if l.strip() and l.strip()[0].isdigit()]
    if not m or len(m.group(1).split()) != len(rows):
        fails.append(f"{tag}: {path.name} -- per-point Psat uncertainties missing "
                     f"or not one per data row ({len(rows)} rows)")
    return [(float(l.split()[0]), float(l.split()[1])) for l in rows]   # (K, kPa)


def check_vapour_pressures(tmp, fails, not_run, fetched):
    """Arm (i).  Returns the list of records reproduced."""
    done = []
    recs = []
    for p in sorted(STD_COMP.glob("*.dat")):
        ent = vp_entry(p.read_text())
        if ent is None:
            continue
        if word(ent, "fittedInCase") or word(ent, "reviewStatus") == "autoPromoted" \
                or word(ent, "humanReviewed"):
            recs.append(p)
    if len(recs) < VP_FLOOR:
        fails.append(f"arm (i): only {len(recs)} regressed vapour-pressure record(s) "
                     f"under {STD_COMP.relative_to(ROOT)} -- {VP_FLOOR} were promoted "
                     "by C281 step 3; the scan surface has collapsed or the "
                     "records lost their `fittedInCase`")
    for p in recs:
        comp, text = p.stem, p.read_text()
        tag = f"arm (i) {p.relative_to(ROOT).as_posix()}"
        ent = vp_entry(text)
        rf = vp_facts(text)
        for k in ("fittedInCase", "reviewStatus", "reviewReason", "reuse",
                  "promotedBy", "origin"):
            if not word(ent, k):
                fails.append(f"{tag}: provenance.vaporPressure has no `{k}` -- a "
                             "proposal moved, not promoted")
        if word(ent, "reviewStatus") != "autoPromoted" or \
                word(ent, "humanReviewed") != "false":
            fails.append(f"{tag}: provenance.vaporPressure reads reviewStatus "
                         f"{word(ent, 'reviewStatus')!r}, humanReviewed "
                         f"{word(ent, 'humanReviewed')!r} -- a value a machine "
                         "promoted is `autoPromoted` with `humanReviewed false`")
        if rf["model"] != "Antoine" or not rf["coef"] or len(rf["coef"]) != 3 \
                or not rf["Trange"]:
            fails.append(f"{tag}: the vaporPressure block is not a fitted Antoine "
                         "with coefficients and a Trange")
            continue
        if rf["verdict"] != "accepted":
            fails.append(f"{tag}: acceptance.verdict `{rf['verdict']}` in the CATALOGUE "
                         "-- only an accepted fit is promoted (DEV.md 4c C283)")
        case_rel = word(ent, "fittedInCase")
        case = ROOT / case_rel if case_rel else None
        if case is None or not (case / "system" / "propsDict").exists() \
                or not (case / ARCHIVE_DECL).exists():
            fails.append(f"{tag}: fittedInCase `{case_rel}` is not a case declaring "
                         f"{ARCHIVE_DECL}")
            continue
        if case_rel not in fetched:
            fetched[case_rel] = fetch_case(case)
        code, msg = fetched[case_rel]
        if code == 2:
            not_run.append(f"{tag}: {msg.splitlines()[-1] if msg else 'fetch could not run'}")
            continue
        if code != 0:
            fails.append(f"{tag}: its case's declared datasets could not be "
                         f"regenerated: {msg[-400:]}")
            continue
        decl = (case / ARCHIVE_DECL).read_text()
        pts = []            # (doi, T K, P kPa) of every declared fit dataset
        for ds in sorted((case / "constant" / "archiveExtracts").glob("*.dat")):
            rows = check_vp_dataset(ds, comp, fails, tag)
            mdoi = re.search(r'file\s+"constant/archiveExtracts/%s";\s*role\s+fit;'
                             r'[^}]*?doi\s+"([^"]+)"' % re.escape(ds.name),
                             strip_comments(decl), re.S)
            if mdoi:
                pts += [(mdoi.group(1), t, pk) for t, pk in rows]
        work = tmp / ("vp-" + case.name)
        shutil.copytree(case, work)
        pr = subprocess.run([str(PROPS), "."], cwd=str(work), capture_output=True,
                            text=True, timeout=900, env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
        out = pr.stdout + pr.stderr
        m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                      pr.stdout, re.S)
        js = json.loads(m.group(1)) if m else None
        op = next((o for o in (js or {}).get("operationResults", [])
                   if o.get("name") == "fit_antoine"), None)
        if pr.returncode != 0 or op is None:
            fails.append(f"{tag}: its case {case.name} exited {pr.returncode} / "
                         "published no `fit_antoine` result")
            continue
        d, cu = op.get("diagnostics", {}), op.get("curation", {})
        run = {"coef": [d.get("A"), d.get("B"), d.get("C")]}
        for k, (x, y) in zip("ABC", zip(rf["coef"], run["coef"])):
            if not close(x, y, rel=1e-8):
                fails.append(f"{tag}: Antoine {k} = {x} in the record, {y} from its "
                             "case -- the record has drifted from its evidence")
        #  C283 (amended): every study fitted, outliers discarded BY NAME, the
        #  acceptance on the KEPT points.  Recomputed here from the record's
        #  own coefficients, the case's datasets and the run's list of
        #  discarded points -- never read back from the tool.
        pd_text = strip_comments((case / "system" / "propsDict").read_text())
        if not re.search(r"^\s*outliers\s*\{\s*maxRelativeError\s+15\s+percent\s*;",
                         pd_text, re.M):
            fails.append(f"{tag}: its case does not declare `outliers {{ maxRelativeError "
                         "15 percent; }` (the C283 default)")
        drop = set()
        for item in (cu.get("outliersDropped") or "").split(";"):
            mm = re.match(r"\s*(\S+) T=([0-9.eE+-]+) K P=([0-9.eE+-]+) Pa", item)
            if mm:
                drop.add((mm.group(1), round(float(mm.group(2)), 3),
                          round(math.log10(float(mm.group(3))), 5)))
        kept = [(t, pk) for doi, t, pk in pts
                if (doi, round(t, 3), round(math.log10(pk * 1e3), 5)) not in drop]
        if len(kept) != int(d.get("n_points", -1)) or not kept:
            fails.append(f"{tag}: {len(kept)} kept points by the run's outlier list, the "
                         f"run fitted {d.get('n_points')}")
            continue
        A_, B_, C_ = rf["coef"]
        rel = [abs(100.0 * 10 ** (A_ - B_ / (t + C_)) / pk - 1.0) for t, pk in kept]
        aw = [abs(AW.psat(t, *AW_ARGS(text)) / 1e3 / pk - 1.0) for t, pk in kept]
        want_n = {"pointsKept": len(kept), "pointsDropped": len(drop),
                  "aad_pct": 100.0 * sum(rel) / len(rel), "max_pct": 100.0 * max(rel),
                  "awAad_pct": 100.0 * sum(aw) / len(aw), "awMax_pct": 100.0 * max(aw)}
        for k, v in want_n.items():
            if rf[k] is None or not close(rf[k], v, rel=1e-5):
                fails.append(f"{tag}: `acceptance.{k}` = {rf[k]} in the record, {v:.6g} "
                             "recomputed from its case")
        if (rf["dropped"] or "none") != (cu.get("outliersDropped") or "none"):
            fails.append(f"{tag}: the record's discarded points differ from its case's run")
        #  THE GRADE (DEV.md 4c C285).  Recomputed from the kept points: the
        #  max relative P error graded by the acceptance's three limits, the
        #  normal-boiling-point gap graded where Tb lies outside the kept
        #  range, the worse of the two; the record must carry that grade and
        #  the numbers that decided it, a refused fit is never in the catalogue.
        lim_P, lim_T = VP_LIMITS_P, VP_LIMITS_T
        cdict = case / "system" / "curationDict"
        if cdict.exists():
            ct = strip_comments(cdict.read_text())
            three = r"\(\s*([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s*\)"
            mr = re.search(r"maxRelativeError\s*%s\s+percent" % three, ct)
            mt = re.search(r"maxTemperatureError\s*%s\s+K" % three, ct)
            if not (mr and mt and re.search(r'reason\s+"[^"]+"', ct)):
                fails.append(f"{tag}: system/curationDict declares no complete graded "
                             "acceptance with a reason")
            else:
                lim_P = tuple(float(x) for x in mr.groups())
                lim_T = tuple(float(x) for x in mt.groups())
        maxP = 100.0 * max(rel)
        gP = vp_grade(maxP, lim_P)
        Tb = num(strip_comments(text), "Tb")
        Tnb = B_ / (A_ - math.log10(1.01325)) - C_
        lo, hi = min(t for t, _ in kept), max(t for t, _ in kept)
        t_applies = Tb is not None and not (lo <= Tb <= hi)
        gT = vp_grade(abs(Tnb - Tb), lim_T) if t_applies else "clean"
        grade = gP if VP_GRADES.index(gP) >= VP_GRADES.index(gT) else gT
        if grade == "refused":
            fails.append(f"{tag}: recomputed grade REFUSED (max {maxP:.4g} %, grade {gP}; "
                         + (f"Tnb - Tb {Tnb - Tb:+.3f} K, grade {gT}" if t_applies
                            else "Tb inside the kept range")
                         + ") -- promoted anyway")
        if rf["fitGrade"] != grade:
            fails.append(f"{tag}: provenance.vaporPressure.fitGrade `{rf['fitGrade']}`, "
                         f"recomputed `{grade}` (max {maxP:.4g} % -> {gP}"
                         + (f"; Tnb - Tb {Tnb - Tb:+.3f} K -> {gT}" if t_applies else "")
                         + ")")
        if rf["gradeMax"] is None or not close(rf["gradeMax"], maxP, rel=1e-5):
            fails.append(f"{tag}: fitGradeMaxRelativeError_pct = {rf['gradeMax']}, "
                         f"recomputed {maxP:.6g}")
        if t_applies and (rf["gradeGap"] is None
                          or not close(rf["gradeGap"], Tnb - Tb, rel=1e-3, abs_=1e-3)):
            fails.append(f"{tag}: fitGradeBoilingPointGap_K = {rf['gradeGap']}, recomputed "
                         f"{Tnb - Tb:.4f} (Tb outside the kept range)")
        if not t_applies and rf["gradeGap"] is not None:
            fails.append(f"{tag}: fitGradeBoilingPointGap_K declared, but Tb is inside the "
                         "kept range (or undeclared) and no temperature criterion applies")
        if not close(rf["Trange"][0], lo) or not close(rf["Trange"][1], hi):
            fails.append(f"{tag}: Trange {rf['Trange']} is not the kept points' span "
                         f"({lo}, {hi})")
        want = set()
        body = strip_comments(decl)
        body = body[body.find("datasets"):]
        depth, start = 0, None
        for k, ch in enumerate(body):
            if ch == "{":
                if depth == 0:
                    start = k
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    b = re.sub(r"identity\s*\{.*", "", body[start + 1:k], flags=re.S)
                    want.add((word(b, "role"), word(b, "doi"), word(b, "sha256")))
        if rf["evidence"] != want:
            fails.append(f"{tag}: evidence {sorted(rf['evidence'])} differs from its "
                         f"case's declaration {sorted(want)}")
        #  THE OBJECTIVE (C281 step 3).  The record is reproduced by the
        #  objective its case DECLARES, and that objective is the one the
        #  record names: the case's `objective { method <m>; }`, the run's
        #  published method, and the record's provenance `method` must agree,
        #  and the catalogue's regressions are twoStage (Vitor's practice,
        #  C280) -- a record fitted by another objective is a different curve.
        decl_m = re.search(r"^\s*objective\s*\{[^}]*\bmethod\s+(\w+)\s*;",
                           strip_comments((case / "system" / "propsDict").read_text()),
                           re.M)
        decl_m = decl_m.group(1) if decl_m else None
        run_m = {0: "leastSquares", 1: "minimax", 2: "twoStage"}.get(
            int(d.get("objective_method", -1)) if d.get("objective_method") is not None
            else -1)
        rec_m = re.search(r'\bmethod\s+"[^"]*\bobjective (\w+):', ent or "")
        rec_m = rec_m.group(1) if rec_m else None
        if decl_m != VP_OBJECTIVE or run_m != VP_OBJECTIVE or rec_m != VP_OBJECTIVE:
            fails.append(f"{tag}: objective -- the case declares {decl_m!r}, its run "
                         f"published {run_m!r}, the record names {rec_m!r}; a "
                         f"catalogue vapour pressure is the `{VP_OBJECTIVE}` fit its "
                         "case declares (C281 step 3)")
        #  THE GRADE IS VOICED (C285): a warning or a severe grade prints its
        #  [fit-grade] line with its severity word and rides the advisories; a
        #  clean grade says nothing more.
        gword = {"warning": "warning", "severe": "SEVERE"}.get(rf["fitGrade"])
        gsaid = f"[fit-grade] component '{comp}': `vaporPressure` fitGrade "
        gadv = [a for a in (js or {}).get("advisories", [])
                if a.get("locus") == f"component '{comp}'"
                and "fitGrade" in a.get("message", "")]
        if gword:
            if gsaid + gword not in out:
                fails.append(f"{tag}: fitGrade {rf['fitGrade']} and its case printed no "
                             f"`{gsaid}{gword}` line -- the engine does not voice it")
            if not any(f"fitGrade {gword}" in a.get("message", "") for a in gadv):
                fails.append(f"{tag}: the fitGrade {gword} line is not in the result JSON "
                             "advisories (the end-of-run caveat block)")
        elif gsaid in out or gadv:
            fails.append(f"{tag}: fitGrade {rf['fitGrade']!r} and the engine voiced a grade "
                         "-- a clean fit says nothing more")
        said = f"[unreviewed] component '{comp}': `vaporPressure` reviewStatus autoPromoted"
        if said not in out:
            fails.append(f"{tag}: marked autoPromoted and its case printed no "
                         f"`{said}` line -- the engine does not voice it")
        adv = [a for a in (js or {}).get("advisories", [])
               if a.get("locus") == f"component '{comp}'"
               and "autoPromoted" in a.get("message", "")]
        if not adv:
            fails.append(f"{tag}: the autoPromoted status is not in the result JSON "
                         "advisories (the end-of-run caveat block)")
        done.append(comp)
        VP_GRADE_COUNT[rf["fitGrade"]] = VP_GRADE_COUNT.get(rf["fitGrade"], 0) + 1
    return done


VP_GRADE_COUNT = {}


def main():
    if not PROPS.exists():
        print("check_regressed_pairs: FAILED\n  choupoProps is not built -- "
              "the gate cannot run, so it must not pass")
        return 1
    if not STD.is_dir():
        print(f"check_regressed_pairs: FAILED\n  {STD} does not exist -- a "
              "scan over nothing is not a clean catalogue")
        return 1
    std = [p for p in sorted(STD.glob("*.dat")) if "fittedInCase" in p.read_text()]
    local = [p for p in sorted((ROOT / "tutorials").rglob("constant/parameters/NRTL/*.dat"))
             if "fittedInCase" in p.read_text()
             and "/constant/parameters/NRTL/" in p.as_posix()
             and "propertyManifest" not in p.name]
    #  A case-local record is either a SEALED COPY of a catalogue record
    #  (checked through that record) or an AUTHORED record that did not earn
    #  promotion.  Only the second kind is checked here on its own.
    std_names = {p.name for p in std}
    local = [p for p in local if p.name not in std_names]
    fails, checked, stable_checked, ll_checked = [], [], [], []
    not_run, fetched = [], {}
    if len(std) < 7:
        fails.append(f"only {len(std)} regressed record(s) under {STD.relative_to(ROOT)} "
                     "-- the C16 floor is seven (four from slice 1, three from slice 2); "
                     "the scan surface has collapsed or the records lost their "
                     "`fittedInCase`")

    tmp = Path(tempfile.mkdtemp(prefix="choupo-regressed-"))
    runs = {}   # fittedInCase -> (exit code, output): one run per named case
    try:
        for rec_path in std + local:
            #  Fields are read from the COMMENT-STRIPPED record: the header
            #  prose says "reviewStatus interim: ..." and a regex over the raw
            #  text read that sentence as the field -- S2 and S4 SURVIVED on
            #  it (a pattern that matches prose is a check prose can satisfy).
            rec = strip_comments(rec_path.read_text())
            tag = rec_path.relative_to(ROOT).as_posix()
            in_std = rec_path.parent == STD
            case_rel = word(rec, "fittedInCase")
            for k in PROMOTION_FIELDS:
                if not word(rec, k):
                    fails.append(f"{tag}: no `{k}` -- a proposal moved, not promoted")
            if not re.search(r"^\s*recordType\s+binaryInteractionParameters\s*;", rec, re.M) \
                    or block(strip_comments(rec), "pair") is None:
                fails.append(f"{tag}: no `recordType binaryInteractionParameters;` "
                             "and `pair {}` -- the catalogue form")
            rf = facts(rec)
            if in_std and rf["verdict"] != "validated":
                fails.append(f"{tag}: verdict `{rf['verdict']}` in the CATALOGUE -- "
                             "only a validated fit is promoted; a fit that missed its "
                             "band lives in its own case")
            if in_std:
                case_dir = (ROOT / case_rel) if case_rel else None
                if check_liquid_liquid(rec, rf, case_dir, tag, fails):
                    ll_checked.append(rec_path.stem)
                else:
                    fails.extend(one_liquid_failures(rf, tag))
                    stable_checked.append(rec_path.stem)
            if not case_rel or not (ROOT / case_rel / "system" / "propsDict").exists():
                fails.append(f"{tag}: fittedInCase `{case_rel}` is not a case")
                continue
            case = ROOT / case_rel
            if (case / ARCHIVE_DECL).exists():
                if case_rel not in fetched:
                    fetched[case_rel] = fetch_case(case)
                code, msg = fetched[case_rel]
                if code == 2:
                    not_run.append(f"{tag}: {msg.splitlines()[-1] if msg else 'fetch could not run'}")
                    continue
                if code != 0:
                    fails.append(f"{tag}: its case's declared datasets could not be "
                                 f"regenerated: {msg[-400:]}")
                    continue
            for ds in sorted((case / "constant" / "experiments").glob("*.dat")) + \
                    sorted((case / "constant" / "archiveExtracts").glob("*.dat")):
                check_dataset(ds, fails, tag)
            #  ONE RUN PER NAMED CASE.  Two records may name the same case:
            #  a witness that carries an unchanged COPY of a case-local
            #  regression (vlle04_two_liquids_decanter carries curate12's,
            #  2026-10-05) is held to the fit exactly as the original is.
            #  Copying the case twice into one work directory collided, so the
            #  run is made once and each record is compared against it.
            work = tmp / case.name
            if case_rel not in runs:
                shutil.copytree(case, work)
                for stale in work.glob("*.proposal.dat"):
                    stale.unlink()
                p = subprocess.run([str(PROPS), "."], cwd=str(work),
                                   capture_output=True, text=True, timeout=900)
                runs[case_rel] = (p.returncode, p.stdout + p.stderr)
            rc, out = runs[case_rel]
            if rc != 0:
                fails.append(f"{tag}: its case {case.name} exited {rc}")
                continue
            prop = work / (rec_path.stem + ".proposal.dat")
            if not prop.exists():
                fails.append(f"{tag}: {case.name} wrote no {prop.name} -- its fit "
                             "must declare `proposal`, or this gate is vacuous")
                continue
            pf = facts(prop.read_text())
            for k in ("i", "j", "verdict", "evidence", "T", "P"):
                if rf[k] != pf[k]:
                    fails.append(f"{tag}: `{k}` differs from what its case regresses "
                                 f"now -- record {rf[k]!r}, run {pf[k]!r}")
            for k in ("a_ij", "b_ij", "a_ji", "b_ji", "alpha", "points",
                      "aad_pct", "maxAAD"):
                if not close(rf[k], pf[k]):
                    fails.append(f"{tag}: `{k}` = {rf[k]} in the record, {pf[k]} "
                                 "from its case -- the record has drifted from its "
                                 "evidence")
            #  The loader names a pair in its OWN i-j order, which is not the
            #  file's alphabetical one (ethylAcetate-ethanol lives in
            #  ethanol-ethylAcetate.dat), so either spelling is the pair.
            said = [f"[unreviewed] pair {rf['i']}-{rf['j']}",
                    f"[unreviewed] pair {rf['j']}-{rf['i']}"]
            status = word(rec, "reviewStatus")
            if status == "autoPromoted":
                if word(rec, "humanReviewed") != "false":
                    fails.append(f"{tag}: `reviewStatus autoPromoted` without "
                                 "`humanReviewed false;` (it reads "
                                 f"{word(rec, 'humanReviewed')!r}) -- a record a "
                                 "machine promoted must say no human reviewed it")
                if not word(rec, "promotedBy"):
                    fails.append(f"{tag}: `reviewStatus autoPromoted` names no "
                                 "`promotedBy` -- the pipeline that promoted it")
                if not any(f"{x}: reviewStatus autoPromoted" in out for x in said):
                    fails.append(f"{tag}: marked `reviewStatus autoPromoted` and its "
                                 "case printed no `[unreviewed] pair ...: reviewStatus "
                                 "autoPromoted` line -- the engine does not voice it")
            elif word(rec, "humanReviewed") == "false" and status not in ("interim",):
                fails.append(f"{tag}: `humanReviewed false;` beside `reviewStatus "
                             f"{status}` -- only an interim or autoPromoted record can "
                             "say no human reviewed it")
            if status == "interim" and \
                    not any(x in out for x in said):
                fails.append(f"{tag}: marked `reviewStatus interim` and its case "
                             "printed no `[unreviewed] pair` line -- the engine "
                             "does not voice the field")
            where = ("catalogue" if in_std
                     else "case-local in " + rec_path.parents[3].name)
            checked.append(f"{rec_path.stem} ({where}, {rf['verdict']})")
        vp_done = check_vapour_pressures(tmp, fails, not_run, fetched)
        vp_grades = ", ".join(f"{VP_GRADE_COUNT.get(g, 0)} {g}" for g in VP_GRADES[:3])
        span_held = check_span_announcement(tmp, fails)
        ll_held = check_ll_arm(tmp, fails)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_regressed_pairs: FAILED")
        for f in fails:
            print("  - " + f)
        for f in not_run:
            print("  - NOT RUN " + f)
        return 1
    if not_run:
        print(f"check_regressed_pairs: NOT RUN -- {len(not_run)} regressed record(s) "
              "could not be reproduced because their measured series are not in the "
              "tree and could not be regenerated (no ThermoML cache, NIST "
              f"unreachable); everything else held ({len(checked)} reproduced).  "
              "NOT counted as a pass:")
        for f in not_run:
            print("  - " + f)
        return 2
    print(f"check_regressed_pairs: OK -- {len(checked)} regressed NRTL record(s) "
          f"reproduced by re-running the case each names ({'; '.join(checked)}): "
          "parameters, evidence identity, validity span and held-out verdict "
          "equal what the run regresses now; only validated fits are in the "
          "catalogue; `interim` and `autoPromoted` (with `humanReviewed false`) are voiced at run time; every dataset carries "
          "DOI, archive sha256, CAS+InChIKey and per-point uncertainty; "
          f"{len(stable_checked)} catalogue pair(s) predict ONE liquid across "
          "their validity span (arm f, the record's NRTL recomputed); "
          f"{len(ll_checked)} catalogue pair(s) declare a liquid-liquid gap and are held to "
          f"the measured tie lines; arm (h) refused {ll_held} of 6 wrong gap declarations "
          "by name and passed the right one (arm f, amended); "
          f"{len(vp_done)} catalogue vapour pressure(s) regressed by `choupo-curate vp` "
          f"({', '.join(vp_done) or 'none'}) reproduced by their cases -- Antoine "
          "coefficients under the declared twoStage objective, both curves' errors and the "
          "discarded points recomputed on the kept points, the C285 fitGrade recomputed "
          f"({vp_grades}; none refused) with its deciding numbers, Trange = the kept span, "
          "evidence -- autoPromoted with humanReviewed false, and a warning or SEVERE "
          "grade voiced by the component loader into the caveat block (arm i); "
          f"{span_held} water pair(s) used BELOW their span announce it once "
          "per run, into the caveat block, say nothing inside it, and publish "
          "the same gammas as a span-less inline twin (arm g).  NOT "
          "checked: whether the transcribed measurements agree with the "
          "articles (a curator's read-back), whether the band was well "
          "chosen, or phase stability below a validity span (it is "
          "announced, arm g, not judged).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
