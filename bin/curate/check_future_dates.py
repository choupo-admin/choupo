#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: no tracked text carries a date later than the clock, unless the date is declared deliberate.

    bin/curate/check_future_dates.py
    bin/curate/check_future_dates.py --files F...   # only those paths (pre-commit hook, bin/hooks/pre-commit)

THE DEFECT THIS WOULD HAVE CAUGHT (DEV.md 4c C446, found 2026-11-18).  From the night of
11-17/18 the registers were stamped with the NEXT day: 2026-11-19 was written for everything
done on 2026-11-18 -- 115 lines in 61 files (DEV.md entries, BRAIN, CLAUDE, SESSIONS, PLAN,
guides, source headers, case READMEs) and 20 audit and review files NAMED 2026-11-19-*.  The
date was taken from the conversation instead of read from the clock (`date`); nothing compared
the stamp with the machine, so the error spread by copy for a day and every later entry
inherited it.  The correction (git blame of each line, the introducing commit's date) was a
44-file mechanical slice that a gate would have made a one-line fix on the first occurrence.

THE RULE.  Let R be the later of the machine's date today and the date of HEAD's commit.  Every
YYYY-MM-DD in a tracked text file, and every one in a tracked file's NAME, must be <= R.  A
date after R is refused unless it is listed in bin/curate/future_dates_allowed.tsv with its
reason (a deadline, a test's date arithmetic, a patent-expiry example): the list is where the
legitimacy is written down, two-sided -- an entry whose date has passed, or that no longer
occurs, FAILS so the list can only shrink.  data/groupEstimative is not read (CAS numbers such
as 2035-94-1 are not dates; a date needs a month 01-12 and a day 01-31 and no digit or hyphen
touching it).

NOT CHECKED, said plainly: a date that is wrong but not in the future (a stamp that is one day
EARLY, or the wrong day of the past) -- only the blame of the line can tell, and a correction of
that kind is a slice, not a gate; and a date written without the ISO form.  The rule is proved
against probe lines before the tree is read.
"""
import datetime
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
#  Reads every tracked file (the dates in them) through `git grep`, which the static reader cannot
#  evaluate: the roots are the whole tree.
SCAN_ROOTS = ("*",)
ALLOW = ROOT / "bin" / "curate" / "future_dates_allowed.tsv"
SELF = ("bin/curate/future_dates_allowed.tsv", "bin/curate/check_future_dates.py")  # the list IS the dates
DATE = re.compile(r"(?<![0-9A-Za-z-])(20[0-9]{2})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])(?![0-9]|-[0-9])")


def reference_date():
    today = datetime.date.today()
    r = subprocess.run(["git", "-C", str(ROOT), "log", "-1", "--format=%cs"],
                       capture_output=True, text=True)
    head = today
    if r.returncode == 0 and r.stdout.strip():
        head = datetime.date.fromisoformat(r.stdout.strip())
    return max(today, head)


def dates_in(text):
    return [m.group(0) for m in DATE.finditer(text)]


def probes():
    ref = "2026-11-18"
    bad = ["see DEV.md 4c C1 (2026-11-19)", "docs/audits/2026-11-19-x.md"]
    good = ["see DEV.md 4c C1 (2026-11-18)", "CAS 2035-94-1", "a-2026-11-19b", "2035-99-6"]
    for s in bad:
        if not [d for d in dates_in(s) if d > ref]:
            return "probe not caught: " + s
    for s in good:
        if [d for d in dates_in(s) if d > ref]:
            return "clean probe flagged: " + s
    return None


def load_allow():
    allow = {}
    for ln in ALLOW.read_text().splitlines():
        if not ln.strip() or ln.startswith("#"):
            continue
        parts = ln.split("\t")
        if len(parts) != 3 or not parts[2].strip():
            sys.exit("check_future_dates: FAIL -- bad allowlist row (path TAB date TAB reason): " + ln)
        allow[(parts[0], parts[1])] = parts[2]
    return allow


def main():
    p = probes()
    if p:
        print("check_future_dates: FAIL -- " + p)
        return 1
    ref = reference_date().isoformat()
    allow = load_allow()
    found = {}   # (path, date) -> first line number, 0 for a file name
    files = subprocess.run(["git", "-C", str(ROOT), "ls-files"], capture_output=True,
                           text=True, check=True).stdout.splitlines()
    only = None
    if "--files" in sys.argv:
        only = set(sys.argv[sys.argv.index("--files") + 1:])
        files = [f for f in files + sorted(only) if f in only]
        files = sorted(set(files))
    for f in files:
        if f.startswith("data/groupEstimative/") or f in SELF:
            continue
        for d in dates_in(f):
            found.setdefault((f, d), 0)
    g = subprocess.run(["git", "-C", str(ROOT), "grep", "-I", "-n", "-o", "-E",
                        r"20[0-9]{2}-[01][0-9]-[0-3][0-9]", "--"] + (sorted(only) if only is not None else ["."])
                       + [":(exclude)data/groupEstimative"],
                       capture_output=True, text=True)
    # git grep -o loses the neighbours, so re-read each hit line for the bounded match.
    lines = {}
    for hit in g.stdout.splitlines():
        f, n, _ = hit.split(":", 2)
        lines.setdefault(f, set()).add(int(n))
    for f, ns in lines.items():
        if f in SELF:
            continue
        try:
            text = (ROOT / f).read_text(errors="replace").split("\n")
        except OSError:
            continue
        for n in sorted(ns):
            for d in dates_in(text[n - 1]):
                found.setdefault((f, d), n)
    bad = []
    used = set()
    for (f, d), n in sorted(found.items()):
        if d <= ref:
            continue
        if (f, d) in allow:
            used.add((f, d))
            continue
        bad.append("%s:%s  %s is after %s" % (f, n or "(file name)", d, ref))
    stale = [] if only is not None else [("%s %s" % k) for k in allow if k not in used]
    if bad:
        print("check_future_dates: FAIL -- a date later than %s (the clock, or HEAD's commit if later):" % ref)
        for b in bad:
            print("  " + b)
        print("Read the date from `date`; a deliberate future date goes in "
              "bin/curate/future_dates_allowed.tsv with its reason.")
        return 1
    if stale:
        print("check_future_dates: FAIL -- allowlist entries that no longer apply (the date passed or is gone):")
        for s in stale:
            print("  " + s)
        return 1
    print("check_future_dates: OK -- %d files, no date after %s outside the %d declared; the rule caught "
          "its probe lines.  NOT CHECKED: a wrong date that is not in the future, and a date not in ISO form."
          % (len(files), ref, len(allow)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
