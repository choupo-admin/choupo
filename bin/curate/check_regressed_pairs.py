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

WHAT IT DOES NOT CHECK.  Whether the measurements are RIGHT -- each dataset
says `reviewStatus transcribedNotCheckedAgainstArticle`, and reading them
back against the articles is a curator's act.  Whether the band was the right
one to declare -- only that the record carries the band the run used.
Phase stability below a record's validity span, or for a case-local record.

SABOTAGES (by hand): docs/design/binary-pairs-from-open-measurements.md
section 4 (2026-09-28, arms a-e) and section 6.4 (2026-10-05, arm f).
"""
import math
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
    u = block(block(t, "uncertainty") or "", "T_bubble") or ""
    m = re.search(r"values\s*\(([^)]*)\)", u)
    d = t[t.index("\ndata"):] if "\ndata" in t else ""
    rows = [l for l in d.splitlines()[2:] if l.strip() and l.strip()[0].isdigit()]
    if not m or len(m.group(1).split()) != len(rows):
        fails.append(f"{tag}: {path.name} -- per-point T_bubble uncertainties "
                     f"missing or not one per data row ({len(rows)} rows)")


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
    fails, checked, stable_checked = [], [], []
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
                tlo, thi = validity_T(rf["T"])
                if tlo is None or thi is None or None in (rf["a_ij"], rf["b_ij"],
                                                          rf["a_ji"], rf["b_ji"], rf["alpha"]):
                    fails.append(f"{tag}: no readable validity temperature span or NRTL "
                                 "parameters -- arm (f) cannot run, so it must not pass")
                else:
                    for k in range(6):
                        T = tlo + (thi - tlo) * k / 5
                        cut = nrtl_liquid_split(T, rf["a_ij"], rf["b_ij"], rf["a_ji"],
                                                rf["b_ji"], rf["alpha"])
                        if cut:
                            fails.append(
                                f"{tag}: predicts a LIQUID-LIQUID SPLIT at {T:.2f} K "
                                f"(x_{rf['i']} {cut[0]:.3f} .. {cut[1]:.3f}), inside its own "
                                f"validity span {tlo}-{thi} K -- its evidence is bubble "
                                "temperatures of ONE liquid, which a bubble scan cannot "
                                "contradict; a pair that splits that liquid stays in its "
                                "case, not the catalogue")
                            break
                    stable_checked.append(rec_path.stem)
            if not case_rel or not (ROOT / case_rel / "system" / "propsDict").exists():
                fails.append(f"{tag}: fittedInCase `{case_rel}` is not a case")
                continue
            case = ROOT / case_rel
            for ds in sorted((case / "constant" / "experiments").glob("*.dat")):
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
            if word(rec, "reviewStatus") == "interim" and \
                    not any(x in out for x in said):
                fails.append(f"{tag}: marked `reviewStatus interim` and its case "
                             "printed no `[unreviewed] pair` line -- the engine "
                             "does not voice the field")
            where = ("catalogue" if in_std
                     else "case-local in " + rec_path.parents[3].name)
            checked.append(f"{rec_path.stem} ({where}, {rf['verdict']})")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_regressed_pairs: FAILED")
        for f in fails:
            print("  - " + f)
        return 1
    print(f"check_regressed_pairs: OK -- {len(checked)} regressed NRTL record(s) "
          f"reproduced by re-running the case each names ({'; '.join(checked)}): "
          "parameters, evidence identity, validity span and held-out verdict "
          "equal what the run regresses now; only validated fits are in the "
          "catalogue; `interim` is voiced at run time; every dataset carries "
          "DOI, archive sha256, CAS+InChIKey and per-point uncertainty; "
          f"{len(stable_checked)} catalogue pair(s) predict ONE liquid across "
          "their validity span (arm f, the record's NRTL recomputed).  NOT "
          "checked: whether the transcribed measurements agree with the "
          "articles (a curator's read-back), whether the band was well "
          "chosen, or phase stability below a validity span.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
