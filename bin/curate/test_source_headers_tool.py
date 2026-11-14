#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test: the header tool refuses another holder's notice in every common
spelling, keeps a byte-order mark first, refuses an unknown kind, and the gate
sees what the ruling says (DEV.md 4c C393; the review's rows SH-07, SH-08,
SH-15, SH-04, SH-03).

    bin/curate/test_source_headers_tool.py

Scratch files are built in memory (bytes) and passed to `plan` and to the
gate's `findings`; nothing is written into the tree, except one run of the
tool's command line on an unknown kind.
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import add_source_headers as T  # noqa: E402
import source_headers_kinds as K  # noqa: E402

AN = K.authors()
fails = []


def check(name, cond, detail=""):
    if not cond:
        fails.append("%s %s" % (name, detail))


PY = "scratch/x.py"
SHE = "#!/usr/bin/env python3\n"

# 1. another holder, in every common spelling: a CONFLICT, never stamped
for spelling in ("Copyright 2019 Someone Else",
                 "© 2019 Someone Else",
                 "Copyright © 2019 Someone Else",
                 "(c) 2019 Someone Else",
                 "Copyright (C) 2019, Someone Else",
                 "(C) Someone Else 2019",
                 "Copyright (c) 2018-2026 by the software owners"):
    raw = (SHE + "# " + spelling + "\nprint(1)\n").encode("utf-8")
    new, note = T.plan("script-hash", raw, AN, PY)
    check("tool refuses %r" % spelling, new is None and note.startswith("CONFLICT"), note)
    # the same notice next to the project's own lines: still a conflict
    raw = (SHE + "# " + K.COPYRIGHT_LINE + "\n# " + K.SPDX_LINE + "\n# " + spelling + "\nprint(1)\n").encode("utf-8")
    new, note = T.plan("script-hash", raw, AN, PY)
    check("tool refuses beside ours %r" % spelling, new is None and note.startswith("CONFLICT"), note)
    f = {c for c, _t in K.findings(PY, "script-hash", raw)}
    check("gate fails beside ours %r" % spelling, "FOREIGN-COPYRIGHT" in f, str(f))

# 2. another identifier: conflict; a second project identifier: conflict
raw = (SHE + "# SPDX-License-Identifier: MIT\nprint(1)\n").encode()
new, note = T.plan("script-hash", raw, AN, PY)
check("tool refuses another identifier", new is None and note.startswith("CONFLICT"), note)
raw = (SHE + "# %s\n# %s\n# %s\nprint(1)\n" % (K.COPYRIGHT_LINE, K.SPDX_LINE, K.SPDX_LINE)).encode()
check("gate fails a second identifier",
      "DUPLICATE-SPDX" in {c for c, _t in K.findings(PY, "script-hash", raw)})

# 3. the byte-order mark stays first, the header follows it, and it parses
raw = K.BOM + b"x = 1\n"
new, note = T.plan("script-hash", raw, AN, PY)
check("BOM kept first", new is not None and new.startswith(K.BOM) and not new[3:].startswith(K.BOM), note)
if new is not None:
    check("BOM file: header found by the gate", not K.findings(PY, "script-hash", new),
          str(K.findings(PY, "script-hash", new)))
    compile(new[3:].decode("utf-8"), "bom", "exec")
    again, note2 = T.plan("script-hash", new, AN, PY)
    check("BOM file idempotent", again is None and note2 == "ok", note2)

# 4. the gate holds the ruling: exact holder, one line, in the comment
good = SHE + "# %s\n# %s\nprint(1)\n" % (K.COPYRIGHT_LINE, K.SPDX_LINE)
check("a good file passes", not K.findings(PY, "script-hash", good.encode()))
for name, txt in (
        ("holder replaced by another AUTHORS name", good.replace("Vítor Geraldes", "Pedro Mendes")),
        ("co-holder appended", good.replace("Vítor Geraldes", "Vítor Geraldes and Someone Else")),
        ("accent dropped", good.replace("Vítor", "Vitor")),
        ("year changed", good.replace("2026", "2025")),
        ("second copyright line", good.replace("print(1)", "# Copyright (C) 2019 Someone Else\nprint(1)")),
        ("header in a string literal", SHE + "X = '%s | %s'\nprint(1)\n" % (K.COPYRIGHT_LINE, K.SPDX_LINE)),
        ("header in a docstring", SHE + '"""\n%s\n%s\n"""\nprint(1)\n' % (K.COPYRIGHT_LINE, K.SPDX_LINE)),
        ("both strings in one disclaiming comment",
         SHE + "# see %s's notes; %s is not this file's\nprint(1)\n" % (K.COPYRIGHT_LINE, K.SPDX_LINE)),
        ("header below line 40", SHE + "# filler\n" * 45 + "# %s\n# %s\nprint(1)\n" % (K.COPYRIGHT_LINE, K.SPDX_LINE)),
        ("identifier removed", good.replace("# " + K.SPDX_LINE + "\n", "")),
        ("copyright removed", good.replace("# " + K.COPYRIGHT_LINE + "\n", ""))):
    check("gate fails: " + name, bool(K.findings(PY, "script-hash", txt.encode())))

# 5. the unknown kind is refused by the command line
r = subprocess.run([sys.executable, str(HERE / "add_source_headers.py"), "--check", "--kind", "no-such-kind"],
                   capture_output=True, text=True)
check("unknown --kind refused", r.returncode == 2 and "unknown kind" in r.stdout, r.stdout[:80])

# 6. a script at the repository root is a kind
check("root script is code", K.classify("zz_root.py", "100644", "")[0] == "code")
check("root shebang script is code", K.classify("zzroot", "100644", "#!/bin/sh")[0] == "code")
check("root prose is scoped out", K.classify("zz.md", "100644", "")[0] == "scoped-out")

if fails:
    print("test_source_headers_tool: FAIL -- %d" % len(fails))
    for f in fails:
        print("  " + f)
    sys.exit(1)
print("test_source_headers_tool: OK -- the tool refuses another holder in 7 spellings (alone and beside "
      "the project's lines), another or a second identifier; a byte-order mark stays first; the gate "
      "fails a replaced holder, a co-holder, the missing accent, another year, a second notice, a header "
      "in a string, a docstring, a disclaiming comment or below line 40; an unknown kind and a root "
      "script are handled")
