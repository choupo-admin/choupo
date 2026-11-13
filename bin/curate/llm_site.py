#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Assemble what choupo.org serves to an ASSISTANT: /llm/** and /llms.txt.

    bin/curate/llm_site.py <dist>            copy + write  (bin/buildSite calls it)
    bin/curate/llm_site.py <dist> --verify   read back what is in <dist>, exit 1 on a defect

WHY.  A student's own assistant (ChatGPT, Claude, any browsing model) reads
Choupo's brief and the task packs under docs/ai/ to design a case.  Until
2026-11-02 the site served none of it: /llms.txt and /llm/* were 404, and the
brief could be read only at raw.githubusercontent.com.  The convention a
browsing assistant looks for first is /llms.txt (llmstxt.org): a title, a
one-sentence summary, then links with a line each.

DERIVED, NEVER HAND-KEPT.  The files served are the files that exist:
    docs/ai/start-here.md       -> /llm/start-here.md         (THE entry: routes every task)
    docs/ai/capabilities.md     -> /llm/capabilities.md       ("does Choupo do X?")
    docs/ai/prompts.md          -> /llm/prompts.md            (the ONE student prompt, C257)
    docs/ai/brief.md            -> /llm/brief.md              ("design a process")
    docs/ai/packs/*.md          -> /llm/packs/<name>.md
    docs/ai/*.md (the rest)     -> /llm/reference/<name>.md   (the long references)
    generated/modelsCatalogue.json -> /llm/models.md          (static, no JavaScript)
and every line of llms.txt is built from the H1 of the file it links.  A pack
added tomorrow appears in llms.txt tomorrow with no edit here.

ONE QUESTION, ONE PATH (DEV.md 4c C211).  A capability question and a design
task are different questions: llms.txt lists the capability index FIRST, under
"Does Choupo do X?", and the brief under "Design a process".

EVERY SERVED DOCUMENT STATES ITS VERSION LINE (C211 b), in its first lines,
inserted HERE after the H1 -- never typed into each source, where it would
drift file by file.  The line is read from generated/releaseInventory.json
(`line`, `latestRelease`): the documents describe the development line, which
https://www.choupo.org/app runs; the ONE page that describes the stable release
instead is the model catalogue (/models/ and its static copy /llm/models.md),
whose own note names the release the catalogue declares.

A CHECK THAT CANNOT RUN MUST NOT PASS.  No brief, an empty brief, or no pack
is an ERROR (exit 1), not a site without an llms.txt: the publish step that
calls this script must fail, because a site that silently lost its assistant
documents is the 404 this script exists to end.

Pure standard library.  Exit 0 = written / verified; 1 = a defect.
"""
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AI = os.path.join(ROOT, "docs", "ai")
INVENTORY = os.path.join(ROOT, "generated", "releaseInventory.json")
CATALOGUE = os.path.join(ROOT, "generated", "modelsCatalogue.json")
TUTORIALS = os.path.join(ROOT, "tutorials")
SITE = "https://www.choupo.org"
VERSION_MARK = "> **Version.**"

TITLE = "Choupo"
SUMMARY = ("Point the assistant at https://www.choupo.org/llm/start-here.md: it is the ONE entry and routes every task.  "
           "Choupo is an open-source, glass-box chemical process simulator "
           "(C++17, GPL-3.0-or-later) that runs in the browser at "
           "https://www.choupo.org/app; the documents below teach an AI "
           "assistant to design a process and write it as a Choupo case.")
INTRO = ("Two questions, one path each.  To answer whether Choupo does "
         "something (a unit, a calculation, a check), read the capability "
         "index: per concept it says what Choupo computes, what it only "
         "balances, what it only checks and what is missing, with a witness "
         "case.  To DESIGN a process, read the brief first and all of it: it "
         "is the contract for a case and ends with an index of task packs.  "
         "Read only the packs the design needs.  The reference documents are "
         "long and are for lookups a pack points to, not for reading end to "
         "end.")


def fail(msg):
    print("llm_site: ERROR: " + msg, file=sys.stderr)
    return 1


def h1(path):
    """The first '# ' heading of a markdown file, '' if none."""
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = re.match(r"#\s+(.+?)\s*$", line)
            if m:
                return m.group(1)
    return ""


def versions():
    """-> (development line, latest stable release) from the release inventory."""
    with open(INVENTORY, encoding="utf-8") as f:
        inv = json.load(f)
    return inv["line"], inv["latestRelease"]


def dev_note():
    line, rel = versions()
    return ("%s This document describes the development line `%s`, which "
            "%s/app runs and which every assistant document here describes.  "
            "The latest stable release is `%s`; the one page that describes "
            "that release instead of the development line is the model "
            "catalogue, %s/models/ (static copy: %s/llm/models.md)."
            % (VERSION_MARK, line, SITE, rel, SITE, SITE))


def with_version(text, note):
    """Insert the version note right after the first H1 (or at the top)."""
    lines = text.split("\n")
    for i, l in enumerate(lines):
        if re.match(r"#\s+\S", l):
            return "\n".join(lines[:i + 1] + ["", note] + lines[i + 1:])
    return note + "\n\n" + text


REPO_BLOB = "https://github.com/choupo-admin/choupo/blob/main/"
LINK = re.compile(r"(\]\()([^)\s#]+)(#[^)\s]*)?(\))")


def url_of_source(abs_path):
    """The URL path /llm/** serves a docs/ai source at, or None (the ONE
    inverse of published_urls: same mapping, looked up by file)."""
    rel = os.path.relpath(abs_path, AI).replace(os.sep, "/")
    if rel.startswith(".."):
        return None
    name = os.path.basename(rel)
    if rel in ("start-here.md", "capabilities.md", "prompts.md", "brief.md"):
        return "/llm/" + rel
    if rel.startswith("packs/") and rel.count("/") == 1 and name.endswith(".md"):
        return "/llm/" + rel
    if "/" not in rel and name.endswith(".md"):
        return "/llm/reference/" + name
    return None


def rewrite_links(text, src):
    """C257: a document is read at /llm/<x> by an assistant and at docs/ai/<x>
    on GitHub, and a RELATIVE link resolves in only one of them (start-here's
    section 6 404ed on the site).  Every relative link becomes the URL the
    target is PUBLISHED at, or, for a repository file the site does not
    serve (a design record, AUTHORS), its GitHub page.  The source keeps the
    relative form, which is right for a GitHub reader.  Fenced code is left
    alone."""
    here = os.path.dirname(os.path.abspath(src))

    def one(m):
        target = m.group(2)
        if re.match(r"[A-Za-z][A-Za-z0-9+.-]*:|/", target):
            return m.group(0)
        absf = os.path.normpath(os.path.join(here, target))
        frag = m.group(3) or ""
        url = url_of_source(absf)
        if url:
            return "%s%s%s%s%s" % (m.group(1), SITE, url, frag, m.group(4))
        if os.path.exists(absf) and os.path.relpath(absf, ROOT).split(os.sep)[0] != "..":
            rel = os.path.relpath(absf, ROOT).replace(os.sep, "/")
            return "%s%s%s%s%s" % (m.group(1), REPO_BLOB, rel, frag, m.group(4))
        sys.exit(fail("%s links %s, which does not exist" % (os.path.relpath(src, ROOT), target)))

    out, fence = [], False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            fence = not fence
        out.append(line if fence else LINK.sub(one, line))
    return "\n".join(out)


def copy_versioned(src, dst, note):
    with open(src, encoding="utf-8") as f:
        text = rewrite_links(f.read(), src)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(with_version(text, note))


def case_path(name):
    """A catalogue's bare case name -> its full tutorials/ path ('' if none)."""
    for dirpath, dirnames, _ in os.walk(TUTORIALS):
        dirnames.sort()
        if os.path.basename(dirpath) == name and os.path.isfile(
                os.path.join(dirpath, "system", "controlDict")):
            return os.path.relpath(dirpath, ROOT)
    return ""


def models_md():
    """generated/modelsCatalogue.json as a readable, static markdown page."""
    with open(CATALOGUE, encoding="utf-8") as f:
        cat = json.load(f)
    line, _ = versions()
    out = ["# Choupo model catalogue", "",
           ("%s This catalogue describes the stable release `%s`, NOT the "
            "development line `%s` that %s/app and the other assistant "
            "documents describe: a model added since that release may be "
            "missing here.  For the development line, read %s/llm/reference/"
            "thermo.md and %s/llm/reference/unit-ops.md."
            % (VERSION_MARK, cat.get("release", "?"), line, SITE, SITE, SITE)),
           "", "Generated from `generated/modelsCatalogue.json` (the same data "
           "the interactive page %s/models/ draws).  Note of the catalogue: "
           "%s" % (SITE, one_line(cat.get("note", ""))), ""]
    for cname, entries in cat["categories"].items():
        out += ["## " + cname, ""]
        if entries and "count" in entries[0]:
            out += ["| key | name | records | source |", "|---|---|---|---|"]
            for e in entries:
                out.append("| `%s` | %s | %s | `%s` |" % (
                    e.get("key", ""), e.get("name", ""), e.get("count", ""),
                    e.get("source", "")))
        else:
            out += ["| key | name | engine | phases | source | tutorials |",
                    "|---|---|---|---|---|---|"]
            for e in entries:
                cases = []
                for t in e.get("tutorials", []) or []:
                    cases.append("`%s`" % (case_path(t) or t))
                out.append("| `%s` | %s | %s | %s | `%s` | %s |" % (
                    e.get("key", ""), e.get("name", ""), e.get("engine", ""),
                    e.get("phases", ""), e.get("source", ""),
                    ", ".join(cases)))
        out.append("")
    return "\n".join(out)


def one_line(text):
    return re.sub(r"\s+", " ", text).strip()


def sources():
    """-> (brief, [pack paths], [reference paths]) from docs/ai, sorted."""
    brief = os.path.join(AI, "brief.md")
    packs_dir = os.path.join(AI, "packs")
    packs = sorted(os.path.join(packs_dir, n) for n in os.listdir(packs_dir)
                   if n.endswith(".md")) if os.path.isdir(packs_dir) else []
    refs = sorted(os.path.join(AI, n) for n in os.listdir(AI)
                  if n.endswith(".md") and n not in SPECIAL)
    return brief, packs, refs


SPECIAL = ("brief.md", "capabilities.md", "start-here.md", "prompts.md")


def published_urls():
    """-> the set of URL paths /llm/** will serve, from the files that exist
    (the ONE mapping; check_capability_index asks it whether a URL a prompt
    names is real).  Paths only, no host: '/llm/brief.md'."""
    brief, packs, refs = sources()
    urls = {"/llm/start-here.md", "/llm/capabilities.md", "/llm/prompts.md",
            "/llm/brief.md", "/llm/models.md"}
    urls |= {"/llm/packs/" + os.path.basename(p) for p in packs}
    urls |= {"/llm/reference/" + os.path.basename(r) for r in refs}
    return urls


def entry(url_path, src):
    title = one_line(h1(src)) or os.path.basename(src)
    return "- [%s](%s%s): %s" % (os.path.basename(src), SITE, url_path, title)


def build(dist):
    brief, packs, refs = sources()
    caps = os.path.join(AI, "capabilities.md")
    if not os.path.isfile(brief) or os.path.getsize(brief) == 0:
        return fail("docs/ai/brief.md is missing or empty -- the site would serve "
                    "no brief; refusing to assemble /llm")
    if not os.path.isfile(caps) or os.path.getsize(caps) == 0:
        return fail("docs/ai/capabilities.md is missing or empty -- a capability "
                    "question would have no entry path; refusing to assemble /llm")
    if not packs:
        return fail("docs/ai/packs/ holds no pack -- refusing to assemble /llm")
    for need in (INVENTORY, CATALOGUE):
        if not os.path.isfile(need):
            return fail("%s is missing -- the version line or the model "
                        "catalogue cannot be written" % need)
    note = dev_note()
    out = os.path.join(dist, "llm")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(os.path.join(out, "packs"))
    os.makedirs(os.path.join(out, "reference"))
    start = os.path.join(AI, "start-here.md")
    if not os.path.isfile(start) or os.path.getsize(start) == 0:
        return fail("docs/ai/start-here.md is missing or empty -- the one entry "
                    "an assistant is pointed at; refusing to assemble /llm")
    copy_versioned(start, os.path.join(out, "start-here.md"), note)
    copy_versioned(caps, os.path.join(out, "capabilities.md"), note)
    copy_versioned(brief, os.path.join(out, "brief.md"), note)
    prompts = os.path.join(AI, "prompts.md")
    if not os.path.isfile(prompts) or os.path.getsize(prompts) == 0:
        return fail("docs/ai/prompts.md is missing or empty -- the landing and "
                    "/llm/prompts.md would carry no prompt; refusing to assemble /llm")
    copy_versioned(prompts, os.path.join(out, "prompts.md"), note)
    for p in packs:
        copy_versioned(p, os.path.join(out, "packs", os.path.basename(p)), note)
    for r in refs:
        copy_versioned(r, os.path.join(out, "reference", os.path.basename(r)), note)
    with open(os.path.join(out, "models.md"), "w", encoding="utf-8") as f:
        f.write(models_md())

    models_entry = ("- [models.md](%s/llm/models.md): Choupo model catalogue "
                    "(static; describes the stable release it names, not the "
                    "development line)" % SITE)
    lines = ["# " + TITLE, "", "> " + SUMMARY, "", note, "", INTRO, "",
             "## Start here (the one entry; it routes every task)", "",
             "- [start-here.md](%s/llm/start-here.md): read its first section "
             "and follow the route it gives" % SITE, "",
             "## Prompts to give the assistant (three short ones: learn Choupo, learn the area, the task)", "",
             entry("/llm/prompts.md", prompts), "",
             "## Does Choupo do X?", "",
             entry("/llm/capabilities.md", caps), "",
             "## Design a process: start here", "",
             entry("/llm/brief.md", brief), "",
             "## Task packs", ""]
    lines += [entry("/llm/packs/" + os.path.basename(p), p) for p in packs]
    lines += ["", "## Optional: reference documents", ""]
    lines += [entry("/llm/reference/" + os.path.basename(r), r) for r in refs]
    lines += [models_entry]
    lines += ["", "## Optional: the project", "",
              "- [Repository](https://github.com/choupo-admin/choupo): "
              "source, tutorial cases and data (GPL-3.0-or-later)",
              "- [The app](%s/app/): run a case in the browser" % SITE, ""]
    with open(os.path.join(dist, "llms.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("llm_site: /llm/capabilities.md, /llm/brief.md, %d pack(s), %d "
          "reference document(s), /llm/models.md, /llms.txt (%d links)"
          % (len(packs), len(refs), len(packs) + len(refs) + 5))
    return 0


def verify(dist):
    """Read back what is in dist: the brief, a pack, and every llms.txt link."""
    brief = os.path.join(dist, "llm", "brief.md")
    if not os.path.isfile(brief) or os.path.getsize(brief) == 0:
        return fail("llm/brief.md is missing or empty in " + dist)
    packs = [n for n in os.listdir(os.path.join(dist, "llm", "packs"))
             if n.endswith(".md")] if os.path.isdir(
        os.path.join(dist, "llm", "packs")) else []
    if not packs:
        return fail("llm/packs/ holds no pack in " + dist)
    idx = os.path.join(dist, "llms.txt")
    if not os.path.isfile(idx) or os.path.getsize(idx) == 0:
        return fail("llms.txt is missing or empty in " + dist)
    text = open(idx, encoding="utf-8").read()
    if not text.startswith("# "):
        return fail("llms.txt does not open with a '# title' line")
    links = re.findall(r"\]\(%s(/llm/[^)]+)\)" % re.escape(SITE), text)
    if not links:
        return fail("llms.txt links nothing under /llm/")
    bad = 0
    for l in links:
        p = os.path.join(dist, l.lstrip("/"))
        if not os.path.isfile(p) or os.path.getsize(p) == 0:
            print("llm_site: ERROR: llms.txt links %s but %s is missing or "
                  "empty" % (l, p), file=sys.stderr)
            bad += 1
    for n in packs:
        if "/llm/packs/" + n not in text:
            print("llm_site: ERROR: pack %s is served but llms.txt does not "
                  "list it" % n, file=sys.stderr)
            bad += 1
    #  ONE entry: start-here is the FIRST link and routes every question
    #  (a capability question to the index, a design to the brief and packs).
    if links[0] != "/llm/start-here.md":
        print("llm_site: ERROR: llms.txt's first link is %s, not "
              "/llm/start-here.md (the one entry an assistant is pointed at)"
              % links[0], file=sys.stderr)
        bad += 1
    if "/llm/prompts.md" not in links[:3]:
        print("llm_site: ERROR: llms.txt does not list /llm/prompts.md near the top",
              file=sys.stderr)
        bad += 1
    if "/llm/capabilities.md" not in links:
        print("llm_site: ERROR: llms.txt does not list /llm/capabilities.md",
              file=sys.stderr)
        bad += 1
    if "/llm/models.md" not in links:
        print("llm_site: ERROR: llms.txt does not list /llm/models.md",
              file=sys.stderr)
        bad += 1
    #  C257: no served document may carry a RELATIVE link: it would resolve
    #  against /llm/<x> and 404 (start-here's reference links did).
    for dirpath, _, names in os.walk(os.path.join(dist, "llm")):
        for n in names:
            if not n.endswith(".md"):
                continue
            p = os.path.join(dirpath, n)
            fence = False
            for i, line in enumerate(open(p, encoding="utf-8").read().split("\n"), 1):
                if line.lstrip().startswith("```"):
                    fence = not fence
                if fence:
                    continue
                for m in LINK.finditer(line):
                    if not re.match(r"[A-Za-z][A-Za-z0-9+.-]*:|/", m.group(2)):
                        print("llm_site: ERROR: %s:%d carries the relative link %s, "
                              "which does not resolve on the site"
                              % (os.path.relpath(p, dist), i, m.group(2)), file=sys.stderr)
                        bad += 1
    #  Every served document states its version line in its first lines.
    served = 0
    for dirpath, _, names in os.walk(os.path.join(dist, "llm")):
        for n in names:
            if not n.endswith(".md"):
                continue
            served += 1
            p = os.path.join(dirpath, n)
            head = open(p, encoding="utf-8").read().split("\n")[:6]
            if not any(l.startswith(VERSION_MARK) for l in head):
                print("llm_site: ERROR: %s does not state its version line in "
                      "its first lines" % os.path.relpath(p, dist), file=sys.stderr)
                bad += 1
    if not any(l.startswith(VERSION_MARK) for l in text.split("\n")[:8]):
        print("llm_site: ERROR: llms.txt does not state its version line in its "
              "first lines", file=sys.stderr)
        bad += 1
    if bad:
        return 1
    print("llm_site: OK: llms.txt lists %d link(s), all served, the capability "
          "index listed, start-here first; brief and %d pack(s) present and non-empty; %d served "
          "document(s) and llms.txt state their version line"
          % (len(links), len(packs), served))
    return 0


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1 or any(a not in ("--verify",) for a in sys.argv[1:] if a.startswith("--")):
        print(__doc__.split("\n\n")[0], file=sys.stderr)
        return 2
    dist = os.path.abspath(args[0])
    return verify(dist) if "--verify" in sys.argv[1:] else build(dist)


if __name__ == "__main__":
    sys.exit(main())
