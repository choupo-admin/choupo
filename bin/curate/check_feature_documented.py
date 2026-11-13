#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_feature_documented -- every name a factory registers is in a guide AND the AI catalogue.

    bin/curate/check_feature_documented.py [--list]

Design record: DEV.md 4c C338; rule: CLAUDE.md section 0 rule 4d.

A capability is not done until a guide section carries it.  A sentence in
CLAUDE.md held that by reading reports, which is weaker than a gate; a rate-
based column was built with five models and no guide section before this existed.

WHAT IS ENUMERATED (recounted on every run, nothing transcribed)
  Every literal name in a `registerType("name"`, `registerModel("name"` or the
  `reg("name", []{ return std::make_unique<Class>(); })` helper of the unit and
  property operation registries, anywhere under src/ (the same registration
  shapes check_type_coverage and check_model_default_registered read).  The
  FAMILY is the registering source file (CycloneModel.cpp, ActivityModel.cpp...).
  ALIASES count once: names of one family that build the same class (found by
  the `make_unique<Class>` / `new Class` in the registration) or that differ
  only in letter case (`Fuller`/`fuller`) are one entry, named by its first
  spelling, and it is documented when ANY spelling is.

WHAT COUNTS AS DOCUMENTED (both required)
  (a) GUIDE.  A spelling occurs in docs/*.tex as a TOKEN (not part of a longer
      identifier, `\\_` read as `_`) inside the argument of \\code{}, \\texttt{},
      \\dict{}, \\lstinline{} or \\verb||, or inside a sectioning heading's
      title (\\section ... \\paragraph); AND that occurrence lies in a
      sectioning unit that carries a \\label -- its own, or that of the nearest
      enclosing \\section/\\subsection/\\subsubsection (a \\chapter label is too
      wide to count).  Comment text (% ...) is removed first; \\file{} and
      \\tutentry{} arguments (paths) are removed, so a case directory called
      `cyclone01` is not a mention of `cyclone`.  Listing bodies do not count.
  (b) CATALOGUE.  A spelling occurs in docs/ai/**/*.md (the AI-facing
      catalogue, including capabilities.md and the packs) inside inline
      backticks, or inside a fenced code block, as a token; not inside a path.

NOT COVERED, said plainly: that the section's equations match the
implementation, that the Theory link of the block opens that section
(check_guide_anchors), that the PDFs were rebuilt, and that a generic word
(`ideal`, `step`) written in \\texttt{} is about the registered model rather
than the English word.  A registered name with no literal (a name built at run
time) is invisible.

THE DEBT is pinned in bin/curate/feature_documented_debt.tsv (family<TAB>name):
the gate passes while the undocumented set EQUALS the pin, FAILS on a NEW
undocumented name (remedy: the four items of rule 4d), and FAILS when a pinned
name has become documented (delete its row -- the list can only shrink).
`--list` prints the current undocumented set in the pin's format.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
DOCS = ROOT / "docs"
PIN = Path(__file__).with_name("feature_documented_debt.tsv")

REG_SHAPE = re.compile(r'\b(?:register(?:Type|Model)|reg)\s*\(\s*"([^"]+)"')
CLASS_SHAPE = re.compile(r'(?:make_unique|make_shared)\s*<\s*([\w:]+)\s*>|\bnew\s+([\w:]+)')


def enumerate_registrations():
    """-> {(family, entry_key): [spellings]} with aliases merged."""
    ents = {}
    for p in sorted(SRC.rglob("*")):
        if p.suffix not in (".cpp", ".H") or not p.is_file():
            continue
        t = p.read_text(encoding="utf-8", errors="replace")
        ms = list(REG_SHAPE.finditer(t))
        for i, m in enumerate(ms):
            end = ms[i + 1].start() if i + 1 < len(ms) else len(t)
            seg = t[m.end():min(end, m.end() + 400)]
            cm = CLASS_SHAPE.search(seg)
            cls = (cm.group(1) or cm.group(2)) if cm else None
            name = m.group(1)
            key = cls if cls else name.lower()
            lst = ents.setdefault((p.stem, key), [])
            if name not in lst:
                lst.append(name)
    merged = {}
    for (fam, key), names in ents.items():
        k2 = None
        for (f2, key2), n2 in merged.items():
            if f2 == fam and {x.lower() for x in n2} & {x.lower() for x in names}:
                k2 = (f2, key2)
                break
        if k2:
            for n in names:
                if n not in merged[k2]:
                    merged[k2].append(n)
        else:
            merged[(fam, key)] = list(names)
    return merged


HEAD = re.compile(r'\\(chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{')
LEVEL = {"chapter": 0, "section": 1, "subsection": 2, "subsubsection": 3, "paragraph": 4}
MACRO = re.compile(r'\\(?:code|texttt|dict|lstinline)\s*\{|\\verb(.)')
PATHMACRO = re.compile(r'\\(?:file|tutentry|path|input|includegraphics|url)\s*(?:\[[^\]]*\])?\s*\{')


def strip_comments(t):
    return re.sub(r'(?<!\\)%[^\n]*', '', t)


def balanced(t, i):
    """inner text of the {...} group whose '{' is at t[i-1]; returns (inner, end)."""
    d = 1
    j = i
    while j < len(t) and d:
        c = t[j]
        if c == '\\':
            j += 2
            continue
        if c == '{':
            d += 1
        elif c == '}':
            d -= 1
        j += 1
    return t[i:j - 1], j


def remove_paths(t):
    out, i = [], 0
    while True:
        m = PATHMACRO.search(t, i)
        if not m:
            out.append(t[i:])
            break
        out.append(t[i:m.start()])
        _, i = balanced(t, m.end())
    return "".join(out)


def tokens_in(text):
    return set(re.findall(r'[A-Za-z][\w\-]*', text.replace('\\_', '_').replace('\\-', '-')))


def guide_mentions():
    toks = set()
    for p in sorted(DOCS.glob("*.tex")):
        t = remove_paths(strip_comments(p.read_text(encoding="utf-8", errors="replace")))
        heads = []
        for m in HEAD.finditer(t):
            title, e = balanced(t, m.end())
            heads.append((m.start(), e, LEVEL[m.group(1)], title))
        spans = []
        for k, (s, e, lv, title) in enumerate(heads):
            nxt = heads[k + 1][0] if k + 1 < len(heads) else len(t)
            spans.append((s, nxt, lv, "\\label{" in t[s:nxt], title))
        for k, (s, nxt, lv, lab, title) in enumerate(spans):
            ok = lab
            if not ok and lv > 1:
                want = lv
                for q in range(k - 1, -1, -1):
                    if spans[q][2] < want:
                        want = spans[q][2]
                        if want <= 3 and want >= 1 and spans[q][3]:
                            ok = True
                            break
                        if want <= 1:
                            break
            if not ok:
                continue
            seg = t[s:nxt]
            toks |= tokens_in(title)
            for mm in MACRO.finditer(seg):
                if mm.group(1):
                    j = seg.find(mm.group(1), mm.end())
                    toks |= tokens_in(seg[mm.end():j] if j > 0 else "")
                else:
                    inner, _ = balanced(seg, mm.end())
                    toks |= tokens_in(inner)
    return toks


def catalogue_mentions():
    toks = set()
    for p in sorted((DOCS / "ai").rglob("*.md")):
        infence = False
        for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.lstrip().startswith("```"):
                infence = not infence
                continue
            chunks = [line] if infence else re.findall(r'`([^`]+)`', line)
            for c in chunks:
                c = re.sub(r'[\w\-.]*/[\w\-./]*', ' ', c)
                toks |= tokens_in(c)
    return toks


def load_pin():
    pin = set()
    if PIN.exists():
        for ln in PIN.read_text().splitlines():
            if ln.strip() and not ln.startswith("#"):
                fam, name = ln.split("\t")[:2]
                pin.add((fam, name))
    return pin


def main():
    ents = enumerate_registrations()
    if len(ents) < 100:
        print("check_feature_documented: FAIL -- only %d registered names found; "
              "the registration pattern no longer fits src/" % len(ents))
        return 1
    g, c = guide_mentions(), catalogue_mentions()
    undoc, nd = {}, 0
    fam_total = {}
    for (fam, key), names in sorted(ents.items()):
        fam_total[fam] = fam_total.get(fam, 0) + 1
        ing = any(n in g for n in names)
        inc = any(n in c for n in names)
        if ing and inc:
            nd += 1
        else:
            undoc[(fam, names[0])] = ("" if ing else "guide ") + ("" if inc else "catalogue")
    if "--list" in sys.argv:
        for (fam, n), why in sorted(undoc.items()):
            print("%s\t%s\t%s" % (fam, n, why.strip().replace(" ", "+")))
        print("# families (registered): " + ", ".join("%s %d" % kv for kv in sorted(fam_total.items())),
              file=sys.stderr)
        return 0
    pin = load_pin()
    cur = set(undoc)
    new, healed = sorted(cur - pin), sorted(pin - cur)
    bad = False
    for fam, n in new:
        bad = True
        print("FAIL  registered name `%s` (family %s) is missing from: %s.  Remedy (CLAUDE.md "
              "rule 4d): a Theory Guide section with a \\label naming it, the block's Theory link, "
              "the Tutorials Guide / docs/tutorials-catalogue.md / docs/ai entries and the "
              "capability index, PDFs rebuilt." % (n, fam, undoc[(fam, n)].strip()))
    for fam, n in healed:
        bad = True
        print("FAIL  pinned name `%s` (family %s) is now documented or no longer registered -- "
              "delete its row from %s (the debt may only shrink)" % (n, fam, PIN.name))
    if bad:
        print("check_feature_documented: FAIL")
        return 1
    fams = {}
    for fam, _ in pin:
        fams[fam] = fams.get(fam, 0) + 1
    fl = ", ".join("%s %d" % kv for kv in sorted(fams.items()))
    print("check_feature_documented: OK -- %d registered names, %d documented in a labelled guide "
          "section and the catalogue, %d pinned as debt (%s); NOT COVERED: that the section's "
          "equations match the implementation" % (len(ents), nd, len(pin), fl or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
