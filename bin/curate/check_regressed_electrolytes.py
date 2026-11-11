#!/usr/bin/env python3
"""check_regressed_electrolytes -- a salt record Choupo REGRESSED cannot drift
from the case that regressed it (DEV.md 4c C311).

    bin/curate/check_regressed_electrolytes.py

WHY THIS EXISTS.  The C311 campaign writes Pitzer and eNRTL records, salt by
salt, from the evaluated gamma_pm and phi of four NBS/NIST compilations.  Each
record names its case (`fittedInCase`).  A record whose numbers were edited,
or a case whose evidence or held-out rule was edited, would leave the
catalogue claiming a fit nobody can reproduce.  check_regressed_pairs holds
the molecular pairs to their cases; this gate is its sibling for the salts
(one gate per record family: the salt record has no (i, j), no T-span and
no bubble-point evidence for that gate's arms to read).

ARMS, per record carrying `fittedInCase` -- every one under
data/standards/parameters/{Pitzer/pairs,eNRTL}/ and every case-local one
under data/curation/electrolytes/*/constant/parameters/:

  (a) REPRODUCTION.  The named case is copied to a scratch directory and
      run; the proposal it writes for that model must equal the record:
      every parameter (relative 1e-8), the molality window, the in-sample
      and held-out maxima and AADs (to the 4 decimals the record prints),
      the point counts.
  (b) THE GRADE IS THE RULE'S.  fitGrade equals the case's in-sample grade,
      except that an in-sample `clean` must read `warning` with
      `fitGradeCap ( singleTemperature singleLaboratory );` (C300 rule 2:
      one temperature, one evaluation); `fitGradeBasis inSample;` is present.
  (c) ONLY clean-or-warning IN THE CATALOGUE.  A record under data/standards/
      whose case grades it severe (or refused) fails; severe lives in its
      case only (C300 rule 3).
  (d) THE PROMOTION FIELDS.  recordType, pair {}, origin regressed,
      reviewStatus autoPromoted, a `review { by ...; }` block, a validity
      block and a `source` -- what promotion adds.
  (e) THE ENGINE VOICES IT.  For one promoted Pitzer record and one promoted
      eNRTL record, a probe case evaluates the salt; the run must print the
      `[unreviewed] pair` line naming it (the review status is a field the
      engine reads, not a comment).
  (f) THE EVIDENCE CARRIES ITS IDENTITY.  Every case's dataset declares a
      source, a DOI and a location (table and page).

Exit 0 and one `regressed-electrolytes: OK` line, or exit 1 naming each
failure.  It does NOT check that the transcription equals the printed page
(that was done by hand, with the checks each dataset header states); it
does NOT judge whether a salt SHOULD be in the catalogue beyond (c).
"""
import re
import shutil
import subprocess
import sys
import os
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import curation_roots  # noqa: E402

ROOT = curation_roots.ROOT
CASES = curation_roots.ELECTROLYTES
STD = ROOT / "data" / "standards" / "parameters"
PROPS = ROOT / "choupoProps"
ENV = dict(os.environ, CHOUPO_HOME=str(ROOT))
SUBS = {"pitzer": "Pitzer/pairs", "eNRTL": "eNRTL"}
PARAMS = {"pitzer": ("beta0", "beta1", "beta2", "Cphi", "alpha1", "alpha2"),
          "eNRTL": ("tau_m_ca", "tau_ca_m", "alpha")}

fails = []


def block(txt, name):
    """The body of the first `name { ... }` block, braces matched (blocks nest)."""
    m = re.search(r"(?:^|\n)\s*" + name + r"\s*\{", txt)
    if not m:
        return None
    i = m.end() - 1
    depth = 0
    for j in range(i, len(txt)):
        if txt[j] == "{":
            depth += 1
        elif txt[j] == "}":
            depth -= 1
            if depth == 0:
                return txt[i + 1:j]
    return None


def flat(body):
    """`body` with every nested `{ ... }` removed: the block's own scalars."""
    out, depth = [], 0
    for ch in body or "":
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif depth == 0:
            out.append(ch)
    return "".join(out)


def scalars(body):
    out = {}
    body = re.sub(r"//[^\n]*", "", flat(body))
    for k, v in re.findall(r"^\s*(\w+)\s+([^;{}\n]+);", body, re.M):
        try:
            out[k] = float(v)
        except ValueError:
            out[k] = v.strip()
    return out


def records():
    out = []
    for model, sub in SUBS.items():
        for f in sorted((STD / sub).glob("*.dat")):
            if "fittedInCase" in f.read_text():
                out.append((model, f, True))
        for f in sorted(CASES.glob(f"*/constant/parameters/{sub}/*.dat")):
            out.append((model, f, False))
    return out


_RUNS = {}


def run_case(rel):
    if rel in _RUNS:
        return _RUNS[rel]
    src = ROOT / rel
    tmp = Path(tempfile.mkdtemp(prefix="c311gate_"))
    dst = tmp / src.name
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("*.proposal.dat", "log.*"))
    p = subprocess.run([str(PROPS), "."], cwd=str(dst), capture_output=True, text=True, env=ENV)
    _RUNS[rel] = (dst, p)
    return _RUNS[rel]


def check_record(model, f, catalogue):
    who = f.relative_to(ROOT)
    txt = f.read_text()
    prov = block(txt, "provenance") or ""
    pv = scalars(prov)
    m = re.search(r'fittedInCase\s+"([^"]+)"', txt)
    if not m:
        fails.append(f"{who}: no fittedInCase"); return None
    rel = m.group(1)
    stem = f.stem
    # (d)
    for pat, what in ((r"^recordType\s+electrolyte(PairParameters|NRTLParameters)\s*;", "recordType"),
                      (r"^pair\s*\{\s*cation\s+\w+;\s*anion\s+\w+;\s*\}", "pair {}"),
                      (r'^source\s+"', "source"),
                      (r"origin\s+regressed\s*;", "origin regressed"),
                      (r"reviewStatus\s+autoPromoted\s*;", "reviewStatus autoPromoted"),
                      (r"review\s*\{\s*by\s+\w+\s*;", "review { by ...; }"),
                      (r"validity\s*\{", "validity"),
                      (r"fitGradeBasis\s+inSample\s*;", "fitGradeBasis inSample")):
        if not re.search(pat, txt, re.M):
            fails.append(f"{who}: missing {what}")
    if rel != f"data/curation/electrolytes/{stem}":
        fails.append(f"{who}: fittedInCase '{rel}' is not the case named by the stem")
        return None
    # (a)
    dst, p = run_case(rel)
    if p.returncode != 0:
        fails.append(f"{who}: its case {rel} exited {p.returncode}: "
                     + (p.stderr.strip().splitlines() or ["?"])[-1])
        return None
    prop = dst / f"{stem}.{model}.proposal.dat"
    if not prop.is_file():
        fails.append(f"{who}: its case wrote no {prop.name}"); return None
    ptxt = prop.read_text()
    pp, pf = scalars(block(ptxt, "parameters")), scalars(block(ptxt, "fit"))
    rp = scalars(block(txt, "parameters"))
    for k in PARAMS[model]:
        a, b = rp.get(k), pp.get(k)
        if a is None or b is None or abs(a - b) > 1e-8 * max(1.0, abs(b)):
            fails.append(f"{who}: parameter {k} = {a}, its case regresses {b}")
    ins = scalars(block(prov, "inSample"))
    held = scalars(block(prov, "heldOut"))
    val = block(prov, "validity") or ""
    mm = re.search(r"molality\s*\{\s*min\s+([\d.eE+-]+);\s*max\s+([\d.eE+-]+);", val)
    pairs = [("inSample.max_pct", ins.get("max_pct"), pf.get("inSampleMax_pct")),
             ("inSample.gammaAAD_pct", ins.get("gammaAAD_pct"), pf.get("inSampleGammaAAD_pct")),
             ("inSample.phiAAD_pct", ins.get("phiAAD_pct"), pf.get("inSamplePhiAAD_pct")),
             ("heldOut.max_pct", held.get("max_pct"), pf.get("heldOutMax_pct", 0.0)),
             ("heldOut.gammaAAD_pct", held.get("gammaAAD_pct"), pf.get("heldOutGammaAAD_pct", 0.0)),
             ("fitGradeMaxRelativeError_pct", pv.get("fitGradeMaxRelativeError_pct"), pf.get("inSampleMax_pct")),
             ("inSample.nPoints", ins.get("nPoints"), pf.get("nFit")),
             ("heldOut.nPoints", held.get("nPoints"), pf.get("nHeldOut")),
             ("validity.molality.min", float(mm.group(1)) if mm else None, pf.get("molalityMin")),
             ("validity.molality.max", float(mm.group(2)) if mm else None, pf.get("molalityMax"))]
    for name, a, b in pairs:
        if a is None or b is None or abs(a - b) > 6e-5 * max(1.0, abs(b)):
            fails.append(f"{who}: {name} = {a}, its case gives {b}")
    # (b)
    g_in = pf.get("gradeInSample")
    want = "warning" if g_in == "clean" else g_in
    if pv.get("fitGrade") != want:
        fails.append(f"{who}: fitGrade {pv.get('fitGrade')}, the rule gives {want}"
                     f" (in-sample {g_in})")
    capped = re.search(r"fitGradeCap\s*\(\s*singleTemperature\s+singleLaboratory\s*\)\s*;", prov)
    if (g_in == "clean") != bool(capped):
        fails.append(f"{who}: fitGradeCap {'missing' if g_in == 'clean' else 'present'}"
                     f" for an in-sample {g_in}")
    if held.get("grade", "none") != pf.get("gradeHeldOut", "none"):
        fails.append(f"{who}: heldOut.grade {held.get('grade')}, its case gives"
                     f" {pf.get('gradeHeldOut')}")
    # (c)
    if catalogue and g_in not in ("clean", "warning"):
        fails.append(f"{who}: in the catalogue with an in-sample grade {g_in} --"
                     " severe and refused stay out of data/standards (C300 rule 3)")
    return stem


def probe(model, stem):
    """(e) a promoted record must be voiced when the engine reads it."""
    c, a = stem.split("-")
    tmp = Path(tempfile.mkdtemp(prefix="c311probe_"))
    (tmp / "system").mkdir(); (tmp / "constant").mkdir()
    src = CASES / stem / "constant" / "thermoPhysPropDict"
    shutil.copy(src, tmp / "constant" / "thermoPhysPropDict")
    (tmp / "system" / "controlDict").write_text(
        'application choupoProps;\ndescription "C311 voice probe";\nverbosity 2;\n')
    if model == "pitzer":
        op = (f"{{ name probe; type pitzerActivity; cation {c}; anion {a};"
              f" molality {{ from 0.1; to 1.0; n 3; }} output {{ file probe.csv; }} }}")
    else:
        op = (f"{{ name probe; type enrtlMultiSalt; salts ( {{ cation {c}; anion {a}; }}"
              " { cation Na; anion Cl; } ); totalMolality 1.0; sweepPoints 3;"
              " output { file probe.csv; } }")
    (tmp / "system" / "propsDict").write_text("operations\n(\n" + op + "\n);\n")
    p = subprocess.run([str(PROPS), "."], cwd=str(tmp), capture_output=True, text=True, env=ENV)
    out = p.stdout + p.stderr
    label = ("Pitzer " if model == "pitzer" else "eNRTL ") + stem
    if p.returncode != 0:
        return f"probe {label}: exited {p.returncode}: " + (out.strip().splitlines() or ["?"])[-1]
    if f"[unreviewed] pair {label}" not in out:
        return f"probe {label}: the run did not print `[unreviewed] pair {label}`"
    return None


def main():
    if not PROPS.exists():
        print("regressed-electrolytes: CANNOT RUN -- no ./choupoProps (build first)")
        return 2
    recs = records()
    seen = {"pitzer": [], "eNRTL": []}
    ncat = 0
    for model, f, cat in recs:
        stem = check_record(model, f, cat)
        if stem and cat:
            seen[model].append(stem); ncat += 1
    # (f)
    ncases = 0
    for case in sorted(CASES.glob("*/system/controlDict")):
        case = case.parent.parent; ncases += 1
        ds = case / "constant" / "experiments" / f"{case.name}.dat"
        if not ds.is_file():
            fails.append(f"{case.relative_to(ROOT)}: no dataset {ds.name}"); continue
        t = ds.read_text()
        for k in ("source", "doi", "location"):
            if not re.search(r'^\s*' + k + r'\s+"[^"]+"\s*;', t, re.M):
                fails.append(f"{ds.relative_to(ROOT)}: provenance declares no {k}")
    # (e)
    def one_one(stem):
        return all(abs(int(re.search(r"^charge\s+([+-]?\d+)",
                   (ROOT / "data/standards/species" / f"{ion}.dat").read_text(),
                   re.M).group(1))) == 1 for ion in stem.split("-"))
    for model in ("pitzer", "eNRTL"):
        # enrtlMultiSalt is built for 1-1 salts: the eNRTL probe takes one
        cands = [x for x in seen[model] if model == "pitzer" or one_one(x)]
        if cands:
            msg = probe(model, cands[0])
            if msg:
                fails.append(msg)
    if ncases == 0:
        fails.append("no case under data/curation/electrolytes -- collapsed scan")
    for f in fails:
        print("FAIL " + f)
    if fails:
        print(f"regressed-electrolytes: {len(fails)} failure(s)")
        return 1
    print(f"regressed-electrolytes: OK -- {len(recs)} regressed salt records"
          f" ({ncat} in the catalogue: {len(seen['pitzer'])} Pitzer,"
          f" {len(seen['eNRTL'])} eNRTL) reproduced by their {ncases} cases;"
          " grades follow the C311 rule and the C300 cap; the engine voices a"
          " promoted record; the transcription itself is NOT checked here")
    return 0


if __name__ == "__main__":
    sys.exit(main())
