#!/usr/bin/env python3
"""Gate: HOW TO CITE IS GENERATED FROM CITATION.cff, AND A RUN CARRIES IT.
    bin/curate/check_citation.py

WHY THIS EXISTS (DEV.md 4c C171 B, Vitor 2026-10-26: "tem de haver uma forma
adequada de ele me poder citar!").  CITATION.cff existed and nothing a user
meets showed it.  Now one citation text is built from three homes -- the cff
(through the two files bin/curate/gen_citation.py GENERATES from it), the
case's declared `citations ( "..." );` in system/controlDict, and the
engine version and commit -- and it reaches the Help menu, every case's
About, a downloaded case's CITATION.txt and the result JSON's `citation`
block.  A citation that drifted from the cff, or a hand-typed copy of it,
would cite the project wrongly in exactly the place a reader trusts.  Arms:

  (a) THE GENERATED FILES ARE CURRENT against CITATION.cff
      (`gen_citation.py --check`).
  (b) THE TEXT FOLLOWS THE CFF -- a PROBE: a copy of CITATION.cff with its
      title, its authors, its repository and its licence changed, rendered
      by the generator into a scratch tree, must carry every change in BOTH
      outputs (engine and GUI) and none of the old values; the real cff,
      which has no `doi:`, must yield the plain "no DOI yet" sentence, and
      the probe with a `doi:` added must yield the DOI and lose that
      sentence.  Nothing here may supply a DOI the cff does not carry.  The
      no-case part of the wording names no controlDict.
  (c) NO HAND COPY: the cff's title appears in no tracked file under src/
      or gui/src/ except the two generated files.
  (d) A RUN CARRIES IT: a native run of a case that declares citations
      (ed04, choupoSolve) publishes `citation` with the engine version, the
      build's commit (when the build recorded one), the controlDict's list
      verbatim and in order, and a text whose software line is the
      generator's with that version and commit, whose numbered sources are
      that list, and which says no DOI exists; a case that declares none
      (flash01) says so.
  (e) A MALFORMED LIST REFUSES BY NAME: a copy of ed04 whose `citations`
      holds numbers, and one with an empty entry, each exit non-zero naming
      `citations`; and one declaring the list under the old word
      `references` (one word, one meaning: a propsDict's `references` are
      reference DATASETS) exits non-zero naming both words, instead of being
      ignored in silence.
  (f) NO GOLDEN PINS IT: no `expected` file under tutorials/ names a
      `citation` row or the build's commit.

NOT CHECKED, said plainly: that a declared reference is CORRECT (that is
the case author's claim, like any `source`), and that the GUI's composer
equals the engine's -- gui/tests/citation.test.ts holds that, on a native
run's own result block.

By-hand sabotages (run 2026-10-26):
  S1 a hand-edited title in src/core/CitationTemplate.H        -> (a) fails
  S2 the generator ignores the cff title (a literal)            -> (b) fails
  S3 the title pasted into gui/src/ui/MenuBar.tsx               -> (c) fails
  S4 ResultEmitter emits no citation block                      -> (d) fails
  S5 readCaseCitations no longer refuses an empty entry         -> (e) fails
  S6 the old word `references` accepted and ignored (2026-10-26,
     after the rename)                                           -> (e) fails
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_citation as gen  # noqa: E402

WITH_REFS = ROOT / "tutorials" / "steady" / "electrodialysis" / "ed04_limiting_current_multiionic"
NO_REFS = ROOT / "tutorials" / "steady" / "flash" / "flash01_benzene_toluene"
SOLVE = ROOT / "choupoSolve"
fails = []


def arm_a():
    r = subprocess.run([sys.executable, str(ROOT / "bin/curate/gen_citation.py"), "--check"],
                       capture_output=True, text=True, cwd=str(ROOT))
    if r.returncode != 0:
        fails.append("(a) " + (r.stdout + r.stderr).strip())


def render(cff_text: str, td: Path):
    td.mkdir(parents=True, exist_ok=True)
    p = td / "CITATION.cff"
    p.write_text(cff_text, encoding="utf-8")
    out = td / "out"
    r = subprocess.run([sys.executable, str(ROOT / "bin/curate/gen_citation.py"),
                        "--cff", str(p), "--out-dir", str(out)],
                       capture_output=True, text=True, cwd=str(ROOT))
    if r.returncode != 0:
        fails.append("(b) the generator refused a probe cff: " + (r.stdout + r.stderr).strip())
        return None
    return [(out / gen.OUT_H).read_text(encoding="utf-8"),
            (out / gen.OUT_TS).read_text(encoding="utf-8")]


NO_DOI = "Choupo has no DOI yet."


def arm_b():
    cff = (ROOT / "CITATION.cff").read_text(encoding="utf-8")
    f = gen.cff_fields(cff)
    if f["doi"]:
        fails.append("(b) the probe assumes the real CITATION.cff carries no DOI, and "
                     "it now does (%s): rewrite arm (b)'s DOI half" % f["doi"])
    real = gen.outputs(cff)
    for path, txt in real.items():
        if NO_DOI not in txt:
            fails.append("(b) %s does not say plainly that no DOI exists yet "
                         "(the cff carries none)" % path)
    w = gen.wording(f)
    if "controlDict" in w["NO_CASE"] or "controlDict" in w["DOCUMENT"]:
        fails.append("(b) the wording names a controlDict where no case may be open "
                     "(DOCUMENT or NO_CASE)")
    # the probe: change what a citation reads from the cff
    probe = cff
    probe = probe.replace(f["title"], "Probe Title For The Gate")
    probe = probe.replace(f["repository"], "https://example.org/probe-repo")
    probe = re.sub(r'^license:.*$', 'license: "MIT-PROBE"', probe, flags=re.M)
    probe = re.sub(r'^(authors:\s*\n)', r'\1  - family-names: Probeauthor\n    given-names: Ana Maria\n',
                   probe, count=1, flags=re.M)
    with tempfile.TemporaryDirectory() as td:
        outs = render(probe, Path(td))
        if outs is None:
            return
        for txt, where in zip(outs, ("engine", "GUI")):
            for want in ("Probe Title For The Gate", "https://example.org/probe-repo",
                         "MIT-PROBE", "Probeauthor, A. M., & Geraldes, V."):
                if want not in txt.replace("\\n", "\n"):
                    fails.append("(b) the %s template does not follow the probe cff: "
                                 "%r missing" % (where, want))
            for gone in (f["title"], f["repository"]):
                if gone in txt:
                    fails.append("(b) the %s template still carries %r after the cff "
                                 "changed it -- a hand copy, not a render" % (where, gone))
        doi_probe = re.sub(r'^(license:.*)$', r'\1\ndoi: "10.0000/probe.doi"', probe,
                           count=1, flags=re.M)
        outs = render(doi_probe, Path(td) / "doi")
        if outs is None:
            return
        for txt, where in zip(outs, ("engine", "GUI")):
            if "https://doi.org/10.0000/probe.doi" not in txt:
                fails.append("(b) the %s template ignores a DOI the cff declares" % where)
            if NO_DOI in txt:
                fails.append("(b) the %s template still says there is no DOI after the "
                             "cff declared one" % where)


def arm_c():
    title = gen.cff_fields((ROOT / "CITATION.cff").read_text(encoding="utf-8"))["title"]
    r = subprocess.run(["git", "grep", "-l", "-F", title, "--", "src", "gui/src"],
                       capture_output=True, text=True, cwd=str(ROOT))
    allowed = {str(gen.OUT_H), str(gen.OUT_TS)}
    for f in r.stdout.split():
        if f not in allowed:
            fails.append("(c) %s carries the cff title %r by hand -- the citation's "
                         "one home is CITATION.cff, reached through the generated "
                         "files" % (f, title))


def run(case: Path):
    p = subprocess.run([str(SOLVE)], cwd=str(case), capture_output=True, text=True,
                       timeout=600)
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  p.stdout, re.S)
    js = None
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            js = None
    return p.returncode, p.stdout + p.stderr, js


def declared_refs(case: Path):
    txt = (case / "system" / "controlDict").read_text(encoding="utf-8")
    m = re.search(r"^citations\s*\((.*?)\)\s*;", txt, re.M | re.S)
    return re.findall(r'"([^"]*)"', m.group(1)) if m else []


def banner_version():
    m = re.search(r'CHOUPO_VERSION\s*=\s*"([^"]+)"',
                  (ROOT / "src/core/Banner.H").read_text(encoding="utf-8"))
    return m.group(1) if m else ""


def build_commit():
    p = ROOT / "generated" / "gitVersion.H"
    if not p.is_file():
        return ""
    m = re.search(r'CHOUPO_GIT_HASH\s+"([^"]+)"', p.read_text())
    return m.group(1) if m else ""


def arm_d():
    w = gen.wording(gen.cff_fields((ROOT / "CITATION.cff").read_text(encoding="utf-8")))
    version, commit = banner_version(), build_commit()
    for case, refs in ((WITH_REFS, declared_refs(WITH_REFS)), (NO_REFS, [])):
        rc, out, js = run(case)
        name = case.name
        if rc != 0 or js is None:
            fails.append("(d) %s did not run to a result block (exit %d)" % (name, rc))
            continue
        c = js.get("citation")
        if not isinstance(c, dict):
            fails.append("(d) %s's result carries no `citation` block" % name)
            continue
        if c.get("engineVersion") != version:
            fails.append("(d) %s: engineVersion %r, Banner.H says %r"
                         % (name, c.get("engineVersion"), version))
        if commit and c.get("commit") != commit:
            fails.append("(d) %s: commit %r, the build's stamp says %r"
                         % (name, c.get("commit"), commit))
        if c.get("citations") != refs:
            fails.append("(d) %s: citations %r, its controlDict declares %r"
                         % (name, c.get("citations"), refs))
        text = c.get("text", "")
        eng = ("version %s, commit %s" % (version, commit)) if commit \
            else "version %s; this build recorded no commit" % version
        software = w["DOCUMENT"].split("\n")[4].replace("@ENGINE@", eng)
        if software not in text:
            fails.append("(d) %s: the text's software line is not the generator's "
                         "with this engine (%r)" % (name, software))
        if NO_DOI not in text:
            fails.append("(d) %s: the text does not say that no DOI exists" % name)
        for i, r in enumerate(refs, 1):
            if "  [%d] %s" % (i, r) not in text:
                fails.append("(d) %s: reference %d is not listed as declared" % (name, i))
        if not refs and "This case declares no primary sources" not in text:
            fails.append("(d) %s declares no citations and its citation does not "
                         "say so" % name)


def arm_e():
    with tempfile.TemporaryDirectory() as td:
        for tag, body in (("numbers", "citations ( 1 2 );"),
                          ("empty", 'citations ( "A real source." "" );'),
                          ("the old word", 'references ( "A real source." );')):
            case = Path(td) / tag
            shutil.copytree(WITH_REFS, case)
            cd = case / "system" / "controlDict"
            txt = cd.read_text(encoding="utf-8")
            txt = re.sub(r"^citations\s*\(.*?\)\s*;", body, txt, count=1,
                         flags=re.M | re.S)
            cd.write_text(txt, encoding="utf-8")
            rc, out, _ = run(case)
            if rc == 0 or "`citations`" not in out \
                    or (tag == "the old word" and "`references`" not in out):
                fails.append("(e) a controlDict whose `citations` is %s was not refused "
                             "by name (exit %d)" % (tag, rc))


def arm_f():
    commit = build_commit()
    for exp in (ROOT / "tutorials").rglob("expected"):
        if not exp.is_file():
            continue
        txt = exp.read_text(encoding="utf-8", errors="ignore")
        if re.search(r"^\s*citation\b", txt, re.M):
            fails.append("(f) %s pins a `citation` row" % exp.relative_to(ROOT))
        if commit and commit in txt:
            fails.append("(f) %s carries the build's commit %s"
                         % (exp.relative_to(ROOT), commit))


def main():
    if not SOLVE.exists():
        print("check_citation: REFUSED -- no native choupoSolve in this tree; run "
              "`make all` first (arms (d) and (e) run the engine).")
        return 1
    arm_a()
    arm_b()
    arm_c()
    arm_d()
    arm_e()
    arm_f()
    if fails:
        print("check_citation: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print("check_citation: OK -- the citation is generated from CITATION.cff "
          "(probe: title, authors, repository, licence and a DOI all follow; no "
          "DOI is supplied), no hand copy of its title under src/ or gui/src/, "
          "ed04 publishes it with its declared citations and flash01 says it "
          "declares none, a malformed list or the old word `references` refuses by name, the no-case footer names no controlDict, no golden pins it.  "
          "NOT CHECKED: that a declared reference is correct, and the GUI's "
          "composer (gui/tests/citation.test.ts holds that)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
