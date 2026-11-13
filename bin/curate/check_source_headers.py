#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: every tracked code file carries the holder line and the licence
identifier in its leading comment, no file that must carry none does, and no
commit since a pinned one has a stranger as its author.

    bin/curate/check_source_headers.py             # check
    bin/curate/add_source_headers.py               # the tool that fixes (a)

WHY (DEV.md 4c C393, Vítor, 2026-11-13).  Copyright does not depend on a
notice inside a file, but a file copied out of the tree must carry its holder
and its licence, and the licence's own appendix recommends a notice in each
source file.  The table of WHICH files are code, in WHAT FORM, and which are
excluded and why, lives in ONE place, `source_headers_kinds.py`, which the
tool `add_source_headers.py` reads as well.

THE RULING the gate holds: the holder is `Copyright (C) 2026 Vítor Geraldes`,
his name alone, with its accent, on every code file; and no project notice
where there must be none.

ARMS.
  (a) every tracked file of a code kind has, in its LEADING COMMENT BLOCK (after
      a shebang and an encoding cookie; inside the leading block comment or
      `//` / `#` / `REM` lines; within the first 40 lines; NOT in a docstring or
      a string literal): EXACTLY ONE line `Copyright (C) 2026 Vítor Geraldes`,
      compared exactly (the few existing lines that say more are listed per
      file, with the exact line, in ALLOWED_HOLDER_LINES), and EXACTLY ONE
      `SPDX-License-Identifier: GPL-3.0-or-later`.  A replaced holder, an
      appended co-holder, a second or foreign copyright line (any common
      spelling) or another identifier fails, unless the file is in
      QUOTED_NOTICES (a notice it quotes about something else);
  (b) the exclusion table is TWO-SIDED: every rule carries a reason, an
      explicit excluded path that is no longer tracked fails, a glob rule that
      matches nothing fails, every kind has at least one file (a kind that
      loses all its files is noticed), and a tracked file under a code root
      that no rule and no kind covers (UNCLASSIFIED) fails.  A script or source
      at the repository ROOT is a kind too;
  (c) NO NOTICE WHERE THERE MUST BE NONE: no file excluded by a third-party-*
      or held-* rule carries the project's notice in any spelling (with or
      without the accent) or the project's identifier;
  (d) AUTHOR ARM: every commit reachable from HEAD and not from the pinned
      commit has an AUTHOR whose name is EXACTLY a name listed in AUTHORS.  The
      COMMITTER is not judged: a managed container commits under the tool's
      identity by design (CLAUDE.md section 2, "Git identity").  When the pinned
      commit is not in the clone (a shallow checkout) the arm answers NO SUBJECT
      in words and does not fail.  For the record: 45 commits before the pin
      carry the tool as author (42 merges, 3 small text edits); history is not
      rewritten (a force-push of main is forbidden);
  (e) the manifest REUSE.toml is READ: every path pattern of it matches at least
      one tracked file, and every excluded file that cannot hold a comment is
      either in one of its annotations or in COVERED_BY_NOTHING below, a short
      list "covered by nothing, by decision", with the reason per group.

WHAT IT DOES NOT CHECK.  It does not read data records, tutorial cases, the
guides' sources or any file outside the code roots and the root scripts (their
licences are per record, per guide or per work; the root NOTICE and the manifest
cover them).  It does not check that a file is really the project's own (a
third-party file NOT in the exclusion table passes if it carries the holder
line); the year is compared as part of the exact line, nothing else about the
year is checked; a foreign notice quoted in a docstring (outside the leading
comment) is not seen; it does not claim the repository is REUSE-compliant.  It
does not judge the committer or any commit before the pin.
"""
import fnmatch
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import source_headers_kinds as K  # noqa: E402

ROOT = K.ROOT
# The head of origin/main the branch of this slice started from (full hash).
PIN = "c2615e79fea790d8dc888210c286ee534d50b748"

# Excluded files that cannot hold a comment and that the manifest does not
# annotate, BY DECISION, with the reason per group.  (pattern, reason)
COVERED_BY_NOTHING = [
    (["gui/package-lock.json"],
     "dependency lock file, derived from third-party packages' metadata: the "
     "project states nothing about it"),
    (["site/logo2.png", "site/logo2-mark.png"],
     "brand assets: not licensed by GPL or CC BY-SA (TRADEMARKS.md)"),
    (["bin/curate/helmholtz/*", "bin/curate/svehla1962/*",
      "bin/curate/fixtures/thermoml/*"],
     "published coefficient tables and data files of other authors: their "
     "licence is per record, as for data/"),
    (["bin/curate/fixtures/neutralMasterMineral/*"],
     "case dictionaries of a curation fixture (data records, out of this slice; "
     "they take comments but are not code)"),
]

NO_COMMENT_EXT = (".json", ".png", ".tsv", ".xml", ".XLS", ".webmanifest",
                  ".manifest", ".txt", ".ico", ".svg", ".pdf")


def git(*a):
    return subprocess.run(["git"] + list(a), cwd=str(ROOT),
                          capture_output=True, text=True)


def _glob_re(g: str):
    """A REUSE.toml path glob: `*` matches anything but `/`, `**` anything."""
    out, i = "", 0
    while i < len(g):
        if g.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
        elif g.startswith("**", i):
            out += ".*"
            i += 2
        elif g[i] == "*":
            out += "[^/]*"
            i += 1
        else:
            out += re.escape(g[i])
            i += 1
    return re.compile("^" + out + "$")


def manifest_patterns():
    try:
        import tomllib
    except ImportError:
        return None
    d = tomllib.load(open(ROOT / "REUSE.toml", "rb"))
    pats = []
    for a in d.get("annotations", []):
        p = a["path"]
        pats += p if isinstance(p, list) else [p]
    return pats


def arms(fails):
    rows = K.classify_all()
    tracked = {p for p, _c, _d in rows}
    kinds = {k: 0 for k in K.KINDS}
    # (a) + unclassified
    for path, cat, det in rows:
        if cat == "unclassified":
            fails.append("UNCLASSIFIED  %s  (under a code root; give it a kind or an exclusion rule in "
                         "bin/curate/source_headers_kinds.py)" % path)
            continue
        if cat != "code":
            continue
        raw = K.read_head(path)
        if raw is None:
            fails.append("UNREADABLE  %s" % path)
            continue
        kinds[det] += 1
        for code, text in K.findings(path, det, raw):
            fails.append("%s  %s  (kind %s: %s)" % (code, path, det, text))
    # (b) two-sided table
    for k, n in kinds.items():
        if n == 0:
            fails.append("EMPTY-KIND  %s  (no tracked file of this kind: the table or the tree changed)" % k)
    for r in K.EXCLUSIONS:
        if not r["reason"].strip():
            fails.append("EXCLUSION-WITHOUT-REASON  %s" % r["name"])
        for p in r["paths"]:
            if p not in tracked:
                fails.append("STALE-EXCLUSION  %s  (rule %s names a path that is no longer tracked)"
                             % (p, r["name"]))
        for g in r["patterns"]:
            if not any(K.in_code_root(p) and fnmatch.fnmatchcase(p, g) for p in tracked):
                fails.append("STALE-EXCLUSION  %s  (rule %s: the pattern matches no tracked file)"
                             % (g, r["name"]))
    for pre, why in K.SCOPED_OUT:
        if not any(p.startswith(pre) for p in tracked):
            fails.append("STALE-SCOPE  %s  (%s)" % (pre, why))
    for p in list(K.QUOTED_NOTICES) + list(K.ALLOWED_HOLDER_LINES):
        if p not in tracked:
            fails.append("STALE-LIST  %s  (named in QUOTED_NOTICES or ALLOWED_HOLDER_LINES, not tracked)" % p)
    for k, src in K.BANNER_SOURCES.items():
        raw = K.read_head(src)
        if raw is None or K.findings(src, "engine-cpp" if k == "cpp" else "web-src", raw):
            fails.append("BANNER-SOURCE-BARE  %s" % src)
    # (c) no notice where there must be none: third-party-* and held-*
    for path, cat, det in rows:
        if cat == "excluded" and (det.startswith("third-party") or det.startswith("held")):
            raw = K.read_head(path)
            if raw is not None and K.carries_project_notice(raw):
                fails.append("PROJECT-NOTICE-ON-EXCLUDED  %s  (rule %s: carries the project's notice or "
                             "identifier, in some spelling)" % (path, det))
    # (e) the manifest is read
    pats = manifest_patterns()
    if pats is None:
        manifest_note = "manifest not read (no tomllib)"
    else:
        res = [(g, _glob_re(g)) for g in pats]
        for g, rx in res:
            if not any(rx.match(p) for p in tracked):
                fails.append("MANIFEST-STALE  %s  (a REUSE.toml path matches no tracked file)" % g)
        for path, cat, det in rows:
            if cat != "excluded" or det.startswith(("third-party", "held")):
                continue
            if not (det == "no-comment-data" or path.endswith(NO_COMMENT_EXT)):
                continue
            if any(rx.match(path) for _g, rx in res):
                continue
            if any(fnmatch.fnmatchcase(path, g) for gs, _w in COVERED_BY_NOTHING for g in gs):
                continue
            fails.append("COVERED-BY-NOTHING-UNDECIDED  %s  (cannot hold a comment, in no REUSE.toml "
                         "annotation and in no COVERED_BY_NOTHING group)" % path)
        manifest_note = "manifest read"
    for gs, why in COVERED_BY_NOTHING:
        for g in gs:
            if not any(fnmatch.fnmatchcase(p, g) for p in tracked):
                fails.append("STALE-COVERED-BY-NOTHING  %s  (%s)" % (g, why[:40]))
    return kinds, len(rows)


def arm_d(fails):
    """-> (state, detail)."""
    r = git("cat-file", "-e", PIN + "^{commit}")
    if r.returncode != 0:
        return ("NO SUBJECT", "the pinned commit %s is not in this clone, a shallow checkout" % PIN[:9])
    r = git("merge-base", "--is-ancestor", PIN, "HEAD")
    if r.returncode != 0:
        return ("NO SUBJECT", "the pinned commit %s is not an ancestor of HEAD" % PIN[:9])
    an = K.authors()
    r = git("log", "--format=%H%x09%an", PIN + "..HEAD")
    n = 0
    bad = 0
    for ln in r.stdout.splitlines():
        h, _, name = ln.partition("\t")
        n += 1
        if not K.is_author_name(name, an):
            bad += 1
            fails.append("AUTHOR  %s  (author %r is not exactly a name listed in AUTHORS)" % (h[:9], name))
    if bad:
        return ("FAIL", "%d of %d commits since %s have an author not listed in AUTHORS" % (bad, n, PIN[:9]))
    return ("OK", "%d commits since %s, every author listed in AUTHORS" % (n, PIN[:9]))


def main():
    try:
        subprocess.run(["git", "--version"], capture_output=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        print("source-headers: REFUSED -- git is not available, so the tracked files cannot be listed; "
              "the gate does not guess")
        return 1
    fails = []
    try:
        kinds, _n = arms(fails)
    except RuntimeError as e:
        print("source-headers: REFUSED -- " + str(e))
        return 1
    dstate, ddetail = arm_d(fails)
    dline = "author arm: %s (%s)" % (dstate, ddetail)
    total = sum(kinds.values())
    if fails:
        print("source-headers: FAIL -- %d finding(s)" % len(fails))
        for f in fails[:200]:
            print("  " + f)
        if len(fails) > 200:
            print("  ... and %d more (bin/curate/add_source_headers.py --check lists the files)"
                  % (len(fails) - 200))
        print("  " + dline)
        return 1
    print("source-headers: OK -- every tracked code file (%d kinds) carries the holder line and the licence "
          "identifier in its leading comment, no excluded third-party or held file carries one, the "
          "exclusion table and the manifest are two-sided; author arm: %s" % (len(kinds), dstate))
    print("  %d code files read" % total)
    print("  " + dline)
    return 0


if __name__ == "__main__":
    sys.exit(main())
