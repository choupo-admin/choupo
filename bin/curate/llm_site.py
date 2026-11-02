#!/usr/bin/env python3
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
    docs/ai/brief.md            -> /llm/brief.md
    docs/ai/packs/*.md          -> /llm/packs/<name>.md
    docs/ai/*.md (the rest)     -> /llm/reference/<name>.md   (the long references)
and every line of llms.txt is built from the H1 of the file it links.  A pack
added tomorrow appears in llms.txt tomorrow with no edit here.

A CHECK THAT CANNOT RUN MUST NOT PASS.  No brief, an empty brief, or no pack
is an ERROR (exit 1), not a site without an llms.txt: the publish step that
calls this script must fail, because a site that silently lost its assistant
documents is the 404 this script exists to end.

Pure standard library.  Exit 0 = written / verified; 1 = a defect.
"""
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AI = os.path.join(ROOT, "docs", "ai")
SITE = "https://www.choupo.org"

TITLE = "Choupo"
SUMMARY = ("Choupo is an open-source, glass-box chemical process simulator "
           "(C++17, GPL-3.0-or-later) that runs in the browser at "
           "https://www.choupo.org/app; the documents below teach an AI "
           "assistant to design a process and write it as a Choupo case.")
INTRO = ("Read the brief first and all of it: it is the contract for a case "
         "and ends with an index of task packs.  Read only the packs the "
         "design needs.  The reference documents are long and are for lookups "
         "a pack points to, not for reading end to end.")


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


def one_line(text):
    return re.sub(r"\s+", " ", text).strip()


def sources():
    """-> (brief, [pack paths], [reference paths]) from docs/ai, sorted."""
    brief = os.path.join(AI, "brief.md")
    packs_dir = os.path.join(AI, "packs")
    packs = sorted(os.path.join(packs_dir, n) for n in os.listdir(packs_dir)
                   if n.endswith(".md")) if os.path.isdir(packs_dir) else []
    refs = sorted(os.path.join(AI, n) for n in os.listdir(AI)
                  if n.endswith(".md") and n != "brief.md")
    return brief, packs, refs


def entry(url_path, src):
    title = one_line(h1(src)) or os.path.basename(src)
    return "- [%s](%s%s): %s" % (os.path.basename(src), SITE, url_path, title)


def build(dist):
    brief, packs, refs = sources()
    if not os.path.isfile(brief) or os.path.getsize(brief) == 0:
        return fail("docs/ai/brief.md is missing or empty -- the site would serve "
                    "no brief; refusing to assemble /llm")
    if not packs:
        return fail("docs/ai/packs/ holds no pack -- refusing to assemble /llm")
    out = os.path.join(dist, "llm")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(os.path.join(out, "packs"))
    os.makedirs(os.path.join(out, "reference"))
    shutil.copyfile(brief, os.path.join(out, "brief.md"))
    for p in packs:
        shutil.copyfile(p, os.path.join(out, "packs", os.path.basename(p)))
    for r in refs:
        shutil.copyfile(r, os.path.join(out, "reference", os.path.basename(r)))

    lines = ["# " + TITLE, "", "> " + SUMMARY, "", INTRO, "",
             "## Start here", "",
             entry("/llm/brief.md", brief), "",
             "## Task packs", ""]
    lines += [entry("/llm/packs/" + os.path.basename(p), p) for p in packs]
    lines += ["", "## Optional: reference documents", ""]
    lines += [entry("/llm/reference/" + os.path.basename(r), r) for r in refs]
    lines += ["", "## Optional: the project", "",
              "- [Repository](https://github.com/choupo-admin/choupo): "
              "source, tutorial cases and data (GPL-3.0-or-later)",
              "- [The app](%s/app/): run a case in the browser" % SITE, ""]
    with open(os.path.join(dist, "llms.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("llm_site: /llm/brief.md, %d pack(s), %d reference document(s), "
          "/llms.txt (%d links)" % (len(packs), len(refs),
                                    len(packs) + len(refs) + 3))
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
    if bad:
        return 1
    print("llm_site: OK: llms.txt lists %d link(s), all served; brief and %d "
          "pack(s) present and non-empty" % (len(links), len(packs)))
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
