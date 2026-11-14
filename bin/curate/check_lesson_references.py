#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_lesson_references -- every reference an EduTool page prints carries
the record of how it was verified, and is well formed.

    bin/curate/check_lesson_references.py [--file PATH]

WHY THIS EXISTS (DEV.md 4c C259 (a)).  Vitor, 2026-11-09, asking for
bibliographic references on the EduTool pages: "confirma que existem e que nao
ha alucinacoes".  The C259 audit had already found one DOI, written from
memory, that resolved to a different paper.  So a reference is admitted only
with its verification -- the DOI resolved on Crossref, the PDF read in the
literature folder, the catalogue or official page fetched -- and that record
is DATA, held in gui/src/ui/methods/lessonReferences.json beside the citation
it vouches for.  A sentence in a comment saying "all verified" would be
enforced by nothing; this gate is what makes the field a contract.

WHAT IT CHECKS, all by reading files (it never touches the network):

  1. every entry has a `verified` record whose `method` is one of crossref,
     pdf, catalogue, official, with a non-empty `evidence` and an ISO `date`;
  2. every DOI is a bare, well-formed DOI (10.<registrant>/<suffix>, no
     resolver prefix, no whitespace, no trailing full stop); every URL is
     https;
  3. no lesson lists the same work twice (same DOI, same URL, or the same
     text);
  4. a DOI cited by two lessons carries the SAME bibliographic text in both,
     so one work never reads two ways across the EduTools;
  5. every key is a real EduTool id, every tool that has references DRAWS
     them (`<LessonReferences tool="<id>"` in the file the workspace mounts
     for that id), no page asks for references that do not exist, and a
     `pageSources` heading is a heading that page actually writes.

WHAT IT DOES NOT CHECK, and it is the half that matters: whether the
verification was TRUE.  It cannot re-resolve a DOI or reopen a PDF; it holds
that the claim of verification was recorded, where, how and when.  Re-running
the verification is a person's (or a networked script's) work, and the
evidence string says where to start.
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
METHODS = ROOT / "gui" / "src" / "ui" / "methods"
DATA = METHODS / "lessonReferences.json"
REGISTRY = METHODS / "registry.ts"
WORKSPACE = ROOT / "gui" / "src" / "ui" / "MethodsWorkspace.tsx"

METHODS_ALLOWED = ("crossref", "pdf", "catalogue", "official")
ENTRY_KEYS = {"text", "doi", "url", "note", "verified"}
VERIFIED_KEYS = {"method", "evidence", "date"}
BLOCK_KEYS = {"pageSources", "references"}
DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CALL_RE = re.compile(r'<LessonReferences\s+tool="([\w-]+)"')


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def tool_ids() -> set:
    src = REGISTRY.read_text(encoding="utf-8")
    m = re.search(r"export type MethodToolId\s*=([^;]*);", src)
    if not m:
        raise SystemExit("check_lesson_references: FAILED\n  cannot find the MethodToolId "
                         f"union in {REGISTRY.relative_to(ROOT)}")
    return set(re.findall(r'"([\w-]+)"', m.group(1)))


def tool_files() -> dict:
    """tool id -> the source text that draws it, derived the way
    gui/scripts/eduToolLessonsPlugin.ts derives it: the dispatch arm names a
    component, the lazy import names its file; a component defined inside
    MethodsWorkspace.tsx is read from that function's body."""
    ws = WORKSPACE.read_text(encoding="utf-8")
    lazy = dict(re.findall(
        r'const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\("\./methods/(\w+)\.js"\)', ws))
    out = {}
    for tid, comp in re.findall(r'tool === "([\w-]+)"\s*\?\s*\(?\s*<(\w+)', ws):
        if comp in lazy:
            f = METHODS / f"{lazy[comp]}.tsx"
            if f.exists():
                out[tid] = (f, f.read_text(encoding="utf-8"))
            continue
        start = ws.find(f"\nfunction {comp}(")
        if start < 0:
            continue
        nxt = re.search(r"\n(?:export\s+)?function \w+", ws[start + 1:])
        body = ws[start:] if not nxt else ws[start:start + 1 + nxt.start()]
        out[tid] = (WORKSPACE, body)
    return out


def headings_of(src: str) -> set:
    out = set()
    for m in re.finditer(r"<Title\s+order=\{[3-5]\}[^>]*>([\s\S]*?)</Title>", src):
        t = re.sub(r"<[^>]+>", "", m.group(1)).replace("&apos;", "'").replace("&quot;", '"')
        out.add(re.sub(r"\s+", " ", t).strip())
    return out


def main(argv) -> int:
    path = DATA
    if argv[:1] == ["--file"] and len(argv) > 1:
        path = Path(argv[1])
    errors = []
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"check_lesson_references: FAILED\n  cannot read {path}: {e}")
        return 1
    lessons = doc.get("lessons") if isinstance(doc, dict) else None
    if not isinstance(lessons, dict):
        print(f"check_lesson_references: FAILED\n  {path} has no `lessons` object")
        return 1

    ids = tool_ids()
    files = tool_files()
    doi_text = {}          # doi -> (text, lesson)
    counts = {m: 0 for m in METHODS_ALLOWED}
    n_entries = n_doi = 0

    for tool, block in lessons.items():
        where = f"lessons[{tool}]"
        if tool not in ids:
            errors.append(f"{where}: '{tool}' is not an EduTool id (MethodToolId in registry.ts)")
        if not isinstance(block, dict):
            errors.append(f"{where}: not an object")
            continue
        for k in set(block) - BLOCK_KEYS:
            errors.append(f"{where}: unknown field '{k}'")
        refs = block.get("references")
        if not isinstance(refs, list) or not refs:
            errors.append(f"{where}: `references` must be a non-empty list")
            refs = []
        seen_doi, seen_url, seen_text = set(), set(), set()
        for i, e in enumerate(refs):
            w = f"{where}.references[{i}]"
            if not isinstance(e, dict):
                errors.append(f"{w}: not an object")
                continue
            n_entries += 1
            for k in set(e) - ENTRY_KEYS:
                errors.append(f"{w}: unknown field '{k}'")
            text = e.get("text")
            if not isinstance(text, str) or not text.strip():
                errors.append(f"{w}: no bibliographic `text`")
                text = ""
            v = e.get("verified")
            if not isinstance(v, dict):
                errors.append(f"{w}: no `verified` record -- a reference is admitted only "
                              "with how it was verified")
            else:
                for k in set(v) - VERIFIED_KEYS:
                    errors.append(f"{w}.verified: unknown field '{k}'")
                meth = v.get("method")
                if meth not in METHODS_ALLOWED:
                    errors.append(f"{w}.verified.method: {meth!r} is not one of "
                                  f"{', '.join(METHODS_ALLOWED)}")
                else:
                    counts[meth] += 1
                if not isinstance(v.get("evidence"), str) or not v["evidence"].strip():
                    errors.append(f"{w}.verified: empty `evidence`")
                if not isinstance(v.get("date"), str) or not DATE_RE.match(v["date"]):
                    errors.append(f"{w}.verified.date: {v.get('date')!r} is not YYYY-MM-DD")
            doi = e.get("doi")
            if doi is not None:
                if not isinstance(doi, str) or not DOI_RE.match(doi) or doi.endswith("."):
                    errors.append(f"{w}.doi: {doi!r} is not a bare DOI (10.<registrant>/<suffix>)")
                else:
                    n_doi += 1
                    key = doi.lower()
                    if key in seen_doi:
                        errors.append(f"{w}: DOI {doi} listed twice in this lesson")
                    seen_doi.add(key)
                    if key in doi_text and norm(doi_text[key][0]) != norm(text):
                        errors.append(f"{w}: DOI {doi} reads differently in lessons[{doi_text[key][1]}]"
                                      f"\n      here : {text}\n      there: {doi_text[key][0]}")
                    doi_text.setdefault(key, (text, tool))
            url = e.get("url")
            if url is not None:
                if not isinstance(url, str) or not url.startswith("https://") or re.search(r"\s", url):
                    errors.append(f"{w}.url: {url!r} is not an https URL")
                elif url in seen_url:
                    errors.append(f"{w}: URL listed twice in this lesson")
                seen_url.add(url)
            if text:
                if norm(text) in seen_text:
                    errors.append(f"{w}: the same work is listed twice in this lesson")
                seen_text.add(norm(text))
            note = e.get("note")
            if note is not None and (not isinstance(note, str) or not note.strip()):
                errors.append(f"{w}.note: empty")

        # drawn, on the page the workspace mounts for this id
        if tool in ids:
            if tool not in files:
                errors.append(f"{where}: the workspace mounts no page for '{tool}'")
            else:
                f, src = files[tool]
                if tool not in CALL_RE.findall(src):
                    errors.append(f"{where}: {f.relative_to(ROOT)} never draws "
                                  f'<LessonReferences tool="{tool}" />')
                ps = block.get("pageSources")
                if ps is not None and ps not in headings_of(src):
                    errors.append(f"{where}.pageSources: {f.relative_to(ROOT)} writes no "
                                  f"heading '{ps}'")

    # no page asks for references that do not exist, or for another tool's
    for tid, (f, src) in files.items():
        pages_of_file = {t for t, (g, _) in files.items() if g == f}
        for called in CALL_RE.findall(src):
            if called not in lessons:
                errors.append(f"{f.relative_to(ROOT)}: draws references for '{called}', "
                              "which has none in lessonReferences.json")
            elif called not in pages_of_file:
                errors.append(f"{f.relative_to(ROOT)}: draws references for '{called}', "
                              f"but that file is not the page of '{called}'")
    errors = list(dict.fromkeys(errors))

    if errors:
        print("check_lesson_references: FAILED")
        for e in errors:
            print(f"  {e}")
        return 1
    live = len(set(files) & ids)
    print(f"check_lesson_references: OK -- {len(lessons)} of {live} mounted EduTool pages "
          f"carry references, {n_entries} entries ({n_doi} with a DOI); verified by "
          f"crossref {counts['crossref']}, pdf {counts['pdf']}, catalogue "
          f"{counts['catalogue']}, official {counts['official']}; every entry records how, "
          "where and when, no lesson repeats a work, a DOI reads the same on every page, "
          "and every listed page draws its block.  WHAT THIS DOES NOT CHECK: it is "
          "network-free, so it holds that a verification was RECORDED, never that it was "
          "true -- re-resolving a DOI or reopening a PDF is the evidence string's to start.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
