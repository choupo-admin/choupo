#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Every name the capability index gives an assistant must exist in the tree.

    bin/curate/check_capability_index.py [--index <file>]

Design record: DEV.md 4c C211.

`docs/ai/capabilities.md` answers "does Choupo do X?" for a student's AI
assistant (served at /llm/capabilities.md, first in /llms.txt).  The question
it was written for (2026-11-03) was answered wrongly because the only thing a
search found was a unit CALLED `tabletPress` that is a `splitter`.  An index
that names a unit type, an operation or a case that does not exist would be
the same failure in a more confident register, so every name in it is typed
and each type is resolved against the source that REGISTERS it:

  unit:<t>        reg("<t>" ...) in src/unitOperations/UnitOperation.cpp
  batchUnit:<t>   ... src/unitOperations/batch/BatchUnitOperation.cpp
  dynUnit:<t>     ... src/unitOperations/dynamic/DynamicUnitOperation.cpp
  op:<t>          ... src/propertyOps/PropertyOperation.cpp
  pass:<n>        ... src/postProcessing/PostProcessor.cpp
  sizer:<t>       ... src/postProcessing/sizing/EquipmentSize.cpp
  controller:<t>  ... src/control/Controller.cpp
  kind:<w>        the string literal "<w>" in src/postProcessing/sizing/RatedMachineSize.cpp
  key:<k>         the string literal "<k>" somewhere under src/ (the engine
                  reads a key by its quoted name)
  pack:<p>        docs/ai/packs/<p>.md exists

and, besides the typed names:

  PATHS       every backticked `tutorials/...`, `src/...`, `docs/...`,
              `bin/...`, `data/...`, `gui/...` path exists; a `tutorials/`
              path must be a CASE (it holds system/controlDict) -- a witness
              is something the student can open and run.
  FULL PATHS  a backticked bare case name (`flash01_benzene_toluene`) is
              refused: the index gives every case by its full path (the
              2026-11-03 report named a case the reader could not find).
  ROWS        every '### ' concept of the index names at least one typed
              name and at least one witness case.
  UNTYPED     any other backticked identifier must be a quoted string
              literal under src/ or gui/src, or a word of some tutorial dict
              (a CLI binary name, a result key, a chamber model word).

NOT CHECKED, said plainly: whether the prose about a name is TRUE (that the
spray dryer computes what the row says).  The rows were each verified against
the source when written; this gate keeps the NAMES from drifting, never the
claims.  Exit 0 = OK; 1 = a dead name, listed."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "docs" / "ai" / "capabilities.md"

REGISTRIES = {
    "unit": "src/unitOperations/UnitOperation.cpp",
    "batchUnit": "src/unitOperations/batch/BatchUnitOperation.cpp",
    "dynUnit": "src/unitOperations/dynamic/DynamicUnitOperation.cpp",
    "op": "src/propertyOps/PropertyOperation.cpp",
    "pass": "src/postProcessing/PostProcessor.cpp",
    "sizer": "src/postProcessing/sizing/EquipmentSize.cpp",
    "controller": "src/control/Controller.cpp",
}
KIND_SOURCE = "src/postProcessing/sizing/RatedMachineSize.cpp"
PATH_PREFIXES = ("tutorials/", "src/", "docs/", "bin/", "data/", "gui/")
CASE_NAME = re.compile(r"^[A-Za-z]+\d{2}[a-z]?_[A-Za-z0-9_]+$")
IDENT = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def registered(rel):
    text = (ROOT / rel).read_text(encoding="utf-8")
    return set(re.findall(r'\b(?:reg|registerType)\(\s*"([A-Za-z0-9_]+)"', text))


def literals(paths):
    out = set()
    for base in paths:
        for p in (ROOT / base).rglob("*"):
            if p.suffix in (".cpp", ".H", ".h", ".ts", ".tsx") and p.is_file():
                out.update(re.findall(r'"([A-Za-z][A-Za-z0-9_]*)"',
                                      p.read_text(encoding="utf-8", errors="replace")))
    return out


def dict_words():
    words = set()
    for p in (ROOT / "tutorials").rglob("*"):
        if p.is_file() and (p.parent.name in ("system", "constant")
                            or p.parent.parent.name == "system"):
            try:
                words.update(re.findall(r"[A-Za-z][A-Za-z0-9_]*",
                                        p.read_text(encoding="utf-8")))
            except (UnicodeDecodeError, OSError):
                pass
    return words


PHARMA_MAX_WORDS = 2500


def budget_findings():
    """C250: every document an assistant is handed declares `budget: N words
    (~T tokens)` in its header and stays under it.  Applies to docs/ai/brief.md
    and every docs/ai/packs/*.md.  The student's assistant pays for every token
    of these files on every task, so a file that grows past its declared size is
    a regression of the product, not a style point.  Raising a budget is a
    visible edit of the header line.  Words = whitespace-separated tokens of the
    whole file (the budget line included); tokens are declared, not measured
    here (the harness measures them)."""
    bad = []
    files = [ROOT / "docs" / "ai" / "brief.md"] + sorted(
        (ROOT / "docs" / "ai" / "packs").glob("*.md"))
    for f in files:
        text = f.read_text(encoding="utf-8")
        rel = f.relative_to(ROOT)
        m = re.search(r"^budget:\s*(\d+) words \(~(\d+) tokens\)\s*$", "\n".join(
            text.split("\n")[:8]), re.M)
        if not m:
            bad.append("%s: no `budget: N words (~T tokens)` line in its header" % rel)
            continue
        words, toks = int(m.group(1)), int(m.group(2))
        n = len(text.split())
        if n > words:
            bad.append("%s: %d words, over its declared budget of %d" % (rel, n, words))
        if not (1.2 * words <= toks <= 2.0 * words):
            bad.append("%s: declared tokens %d are not 1.2-2.0 x the declared words %d"
                       % (rel, toks, words))
        if f.name == "pharmaceutical.md" and words > PHARMA_MAX_WORDS:
            bad.append("%s: budget %d exceeds the %d-word ceiling" % (rel, words, PHARMA_MAX_WORDS))
    return bad


PROMPT_MAX_WORDS = 250


def prompts_findings(home=None, landing=None, ts=None):
    """C252: docs/ai/prompts.md, the one home of the student prompt (C257: ONE prompt
    replaced the three of C252).
    (1) it parses as ONE fenced prompt; (2) every www.choupo.org URL
    it names is a file bin/curate/llm_site.py publishes (the publisher's own
    mapping, not a copy of it); (3) the prompt routes to packs through the brief's own
    index, so it must NOT carry a pack list of its own; (4) it stays within PROMPT_MAX_WORDS words (a prompt is
    tokens the student pays for); (5) the VIEWS carry the home's text: the
    /llm/prompts.md llm_site assembles, the landing bin/buildSite would build
    (the injection, run in memory on site/index.html) and the Help pop-out's
    generated module.  The arguments are for the self-test only."""
    import tempfile
    sys.path.insert(0, str(ROOT / "bin" / "curate"))
    import llm_site
    import prompts_home
    home = Path(home) if home else ROOT / "docs" / "ai" / "prompts.md"
    landing = Path(landing) if landing else ROOT / "site" / "index.html"
    bad = []
    if not home.is_file() or home.stat().st_size == 0:
        return ["%s is missing or empty -- the student prompts have no home" % home]
    text = home.read_text(encoding="utf-8")
    try:
        doc = prompts_home.parse(text)
    except ValueError as e:
        return ["prompts.md: %s" % e]
    prompts = [s["prompt"] for s in doc["sections"]]
    published = llm_site.published_urls()
    for url in sorted(set(re.findall(r"https://www\.choupo\.org(/[^\s)`>]*)", text))):
        url = url.rstrip(".,;")
        if "<" in url:
            continue                      # expanded by the pack check below
        if url not in published and not url.startswith("/app"):
            bad.append("prompts.md names %s, which llm_site.py does not publish" % url)
    if len(prompts) != 1:
        bad.append("prompts.md holds %d prompts, not ONE" % len(prompts))
    if re.search(r"<pack>|packs/[a-z-]+\.md", prompts[0] if prompts else ""):
        bad.append("the prompt names a pack itself; the brief's pack index does the routing")
    words = sum(len(p.split()) for p in prompts)
    if words > PROMPT_MAX_WORDS:
        bad.append("the prompt is %d words, over the %d-word ceiling"
                   % (words, PROMPT_MAX_WORDS))
    #  the views
    if not landing.is_file():
        bad.append("%s is missing -- the landing cannot carry the prompts" % landing)
    else:
        try:
            built = prompts_home.inject(landing.read_text(encoding="utf-8"), doc)
            if prompts_home.landing_prompts(built) != prompts:
                bad.append("the landing section does not carry the home's prompt")
        except ValueError as e:
            bad.append("landing: %s" % e)
    import contextlib, io
    with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()):
        if llm_site.build(d) != 0:
            bad.append("llm_site.py could not assemble /llm (see its message)")
        else:
            served = Path(d, "llm", "prompts.md")
            if not served.is_file():
                bad.append("/llm/prompts.md is not served")
            else:
                try:
                    got = [s["prompt"] for s in prompts_home.parse(
                        served.read_text(encoding="utf-8").replace(
                            llm_site.dev_note() + "\n\n", "", 1))["sections"]]
                except ValueError as e:
                    got = ["/llm/prompts.md does not parse as the prompts: %s" % e]
                if got != prompts:
                    bad.append("/llm/prompts.md does not carry the home's prompt")
            if llm_site.verify(d) != 0:
                bad.append("llm_site.py --verify refused what it assembled")
    ts_path = Path(ts) if ts else ROOT / prompts_home.OUT_TS
    if not ts_path.is_file() or ts_path.read_text(encoding="utf-8") != prompts_home.render_ts(doc):
        bad.append("%s is stale against docs/ai/prompts.md -- run bin/curate/prompts_home.py"
                   % prompts_home.OUT_TS)
    return bad


def main():
    index = INDEX
    if "--index" in sys.argv:
        index = Path(sys.argv[sys.argv.index("--index") + 1]).resolve()
    if not index.is_file() or index.stat().st_size == 0:
        print("check_capability_index: FAIL: %s is missing or empty -- a gate "
              "with nothing to read must not pass" % index)
        return 1
    text = index.read_text(encoding="utf-8")
    regs = {k: registered(v) for k, v in REGISTRIES.items()}
    for k, v in regs.items():
        if not v:
            print("check_capability_index: FAIL: no registration found in %s "
                  "-- the pattern no longer reads it" % REGISTRIES[k])
            return 1
    kinds = set(re.findall(r'"([A-Za-z]+)"',
                           (ROOT / KIND_SOURCE).read_text(encoding="utf-8")))
    src_lits = literals(["src"])
    loose_lits = src_lits | literals(["gui/src"])
    words = None

    bad = []
    counts = {"typed": 0, "paths": 0, "cases": 0, "untyped": 0}
    tokens = re.findall(r"`([^`\n]+)`", text)
    for tok in tokens:
        m = re.match(r"^([A-Za-z]+):([A-Za-z0-9_]+)$", tok)
        if m and (m.group(1) in regs or m.group(1) in ("kind", "key", "pack")):
            t, n = m.group(1), m.group(2)
            counts["typed"] += 1
            ok = (n in regs[t] if t in regs else
                  n in kinds if t == "kind" else
                  n in src_lits if t == "key" else
                  (ROOT / "docs" / "ai" / "packs" / (n + ".md")).is_file())
            if not ok:
                bad.append("`%s`: no %s named '%s' in the tree" % (tok, t, n))
            continue
        if tok.startswith(PATH_PREFIXES):
            counts["paths"] += 1
            p = ROOT / tok.rstrip("/")
            if not p.exists():
                bad.append("`%s`: path does not exist" % tok)
            elif tok.startswith("tutorials/"):
                if not (p / "system" / "controlDict").is_file():
                    bad.append("`%s`: not a case (no system/controlDict)" % tok)
                else:
                    counts["cases"] += 1
            continue
        if CASE_NAME.match(tok):
            bad.append("`%s`: a bare case name -- give its full tutorials/ path" % tok)
            continue
        if IDENT.match(tok):
            counts["untyped"] += 1
            if tok in loose_lits:
                continue
            if words is None:
                words = dict_words()
            if tok not in words and not (ROOT / "src" / "applications" / tok).is_dir():
                bad.append("`%s`: not a string literal in src/ or gui/src, nor a "
                           "word of any tutorial dict" % tok)

    #  ROWS: every concept names a typed name and a witness case.
    for sec in re.split(r"(?m)^### ", text)[1:]:
        head = sec.splitlines()[0].strip()
        if not re.search(r"`(?:%s):[A-Za-z0-9_]+`" % "|".join(
                list(regs) + ["kind", "key", "pack"]), sec):
            bad.append("concept '%s': names no typed unit/op/pass/key" % head)
        if not re.search(r"`tutorials/[^`]+`", sec):
            bad.append("concept '%s': names no witness case" % head)
    #  The table rows of the general section (section 2), likewise.
    general = text.split("\n## 2.", 1)[1] if "\n## 2." in text else ""
    for line in general.splitlines():
        if line.startswith("| ") and "`tutorials/" not in line and \
           re.search(r"`(?:unit|op|batchUnit|dynUnit|pass):", line):
            bad.append("table row without a witness case: %s" % line[:60])

    if index == INDEX:
        bad += budget_findings()
        bad += prompts_findings()

    if bad:
        print("check_capability_index: FAIL: %d dead or incomplete reference(s) "
              "in %s:" % (len(bad), index.relative_to(ROOT) if
                          str(index).startswith(str(ROOT)) else index))
        for b in bad:
            print("  " + b)
        return 1
    print("check_capability_index: OK: %d typed name(s) resolved against their "
          "registries, %d path(s) present (%d witness case(s)), %d untyped "
          "name(s) found in the tree; every concept names a typed name and a "
          "witness (names only -- the prose about them is not checked); every "
          "brief and pack within its declared word budget; the ONE student prompt names only published URLs and existing packs, stay within %d words and are carried verbatim by /llm/prompts.md, the landing and the Help module"
          % (counts["typed"], counts["paths"], counts["cases"], counts["untyped"], PROMPT_MAX_WORDS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
