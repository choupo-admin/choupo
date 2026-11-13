#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
"""Gate: every tracked code file carries the copyright line and the licence
identifier, and no commit since a pinned one has a stranger as its author.

    bin/curate/check_source_headers.py             # check
    bin/curate/add_source_headers.py               # the tool that fixes (a)

WHY (DEV.md 4c C393, Vítor, 2026-11-13).  Copyright does not depend on a
notice inside a file, but a file copied out of the tree must carry its holder
and its licence, and the licence's own appendix recommends a notice in each
source file.  A census found 724 code files without a copyright line.  The
table of WHICH files are code, in WHAT FORM, and which are excluded and why,
lives in ONE place, `source_headers_kinds.py`, which the tool
`add_source_headers.py` reads as well.

FOUR ARMS.
  (a) every tracked file of a code kind carries `SPDX-License-Identifier:
      GPL-3.0-or-later` AND a copyright line naming a person listed in
      AUTHORS, within its first 4000 characters;
  (b) the exclusion table is TWO-SIDED: every rule carries a reason, an
      explicit excluded path that is no longer tracked fails, a glob rule that
      matches nothing fails, and a tracked file under a code root that no rule
      and no kind covers (UNCLASSIFIED) fails -- a new kind of file is given
      its rule in the commit that adds it;
  (c) no file excluded as THIRD PARTY carries the project's holder line (a
      notice on someone else's file is the one way this could harm the record);
  (d) AUTHOR ARM: every commit reachable from HEAD and not from the pinned
      commit has an AUTHOR whose name is listed in AUTHORS.  The COMMITTER is
      not judged: a managed container commits under the tool's identity by
      design (CLAUDE.md section 2, "Git identity").  When the pinned commit is
      not in the clone (a shallow checkout on a runner) the arm answers NO
      SUBJECT in words and does not fail.  For the record: 45 commits before
      the pin carry the tool as author (42 merges, 3 small text edits); history
      is not rewritten (a force-push of main is forbidden).

WHAT IT DOES NOT CHECK.  It does not read data records, tutorial cases, the
guides' sources or any file outside the code roots (their licences are per
record, per guide or per work; the root NOTICE and, where it states them, the
REUSE.toml manifest cover them).  It does not check that the year is right,
that a holder line is the owner's rather than a co-author's, or that a file is
really the project's own (a third-party file NOT yet in the exclusion table
passes if it carries the holder line); it does not claim the repository is
REUSE-compliant.  It does not judge the committer or any commit before the pin.
"""
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import source_headers_kinds as K  # noqa: E402

ROOT = K.ROOT
# The head of origin/main the branch of this slice started from (full hash).
PIN = "c2615e79fea790d8dc888210c286ee534d50b748"


def git(*a):
    return subprocess.run(["git"] + list(a), cwd=str(ROOT),
                          capture_output=True, text=True)


def arm_a_b_c(fails):
    an = K.authors()
    rows = K.classify_all()
    tracked = {p for p, _c, _d in rows}
    kinds = {}
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
        kinds[det] = kinds.get(det, 0) + 1
        t = K.head_text(raw)
        _has_c, names, has_s = K.notice_state(raw)
        ours, foreign = K.own_and_foreign(path, names, an)
        if not ours:
            if names:
                fails.append("FOREIGN-COPYRIGHT  %s  (names %r, nobody in AUTHORS)"
                             % (path, names[0]))
            else:
                fails.append("NO-COPYRIGHT  %s  (kind %s)" % (path, det))
        if not has_s:
            fails.append("NO-SPDX  %s  (kind %s)" % (path, det))
    # (b) two-sided table
    for r in K.EXCLUSIONS:
        if not r["reason"].strip():
            fails.append("EXCLUSION-WITHOUT-REASON  %s" % r["name"])
        for p in r["paths"]:
            if p not in tracked:
                fails.append("STALE-EXCLUSION  %s  (rule %s names a path that is no longer tracked)"
                             % (p, r["name"]))
        for g in r["patterns"]:
            import fnmatch
            if not any(K.in_code_root(p) and fnmatch.fnmatchcase(p, g) for p in tracked):
                fails.append("STALE-EXCLUSION  %s  (rule %s: the pattern matches no tracked file)"
                             % (g, r["name"]))
    for pre, why in K.SCOPED_OUT:
        if not any(p.startswith(pre) for p in tracked):
            fails.append("STALE-SCOPE  %s  (%s)" % (pre, why))
    # banner sources must carry the banner
    for k, src in K.BANNER_SOURCES.items():
        raw = K.read_head(src)
        if raw is None:
            fails.append("BANNER-SOURCE-MISSING  %s" % src)
            continue
        _c, n, s = K.notice_state(raw)
        if not (n and s):
            fails.append("BANNER-SOURCE-BARE  %s" % src)
    # (c) third-party files must not carry the holder line
    for path, cat, det in rows:
        if cat == "excluded" and det.startswith("third-party"):
            raw = K.read_head(path)
            if raw and K.HOLDER.encode() in raw[:K.WINDOW] and b"Copyright (C)" in raw[:K.WINDOW]:
                fails.append("THIRD-PARTY-STAMPED  %s  (rule %s, carries the project's holder line)"
                             % (path, det))
    return kinds, len(rows)


def arm_d(fails):
    """-> a one-line account (OK / NO SUBJECT)."""
    r = git("cat-file", "-e", PIN + "^{commit}")
    if r.returncode != 0:
        return ("NO SUBJECT", "the pinned commit %s is not in this clone, a shallow checkout" % PIN[:9])
    r = git("merge-base", "--is-ancestor", PIN, "HEAD")
    if r.returncode != 0:
        return ("NO SUBJECT", "the pinned commit %s is not an ancestor of HEAD" % PIN[:9])
    an = K.authors()
    r = git("log", "--format=%H%x09%an", PIN + "..HEAD")
    n = 0
    for ln in r.stdout.splitlines():
        h, _, name = ln.partition("\t")
        n += 1
        if not K.is_author_name(name, an):
            fails.append("AUTHOR  %s  (author %r is not listed in AUTHORS)" % (h[:9], name))
    return ("OK", "%d commits since %s, every author listed in AUTHORS" % (n, PIN[:9]))


def main():
    fails = []
    kinds, nrows = arm_a_b_c(fails)
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
    print("source-headers: OK -- every tracked code file (%d kinds) carries the copyright line and the licence "
          "identifier; the exclusion table is two-sided; author arm: %s" % (len(kinds), dstate))
    print("  %d code files read" % total)
    print("  " + dline)
    return 0


if __name__ == "__main__":
    sys.exit(main())
