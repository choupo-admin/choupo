#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""check_std_includes -- what libstdc++ lends you, libc++ does not.

THE BUG THIS GUARDS.  `std::ostringstream` needs <sstream>.  libstdc++ hands
it over anyway, through <iostream> or <iomanip>; emscripten's libc++ does
not.  So a file can compile perfectly with g++ and fail under em++ -- and the
WASM build is what www.choupo.org is MADE of.  On 2026-07-30 the
psychrometric chart's label lambda used a stringstream without the header:
`make all` clean, `bin/runTests` 333 PASS, and every publish-site run from
17:34 onward failed at the build step.  The site went on serving the previous
bundle, and the failure arrived by EMAIL.

The honest fix is to build both compilers on every change, and that costs ~8
minutes of emscripten per suite run -- too much to pay on every slice.  This
is the 20 % that catches the 80 %: a static sweep for the handful of
facilities whose header is commonly borrowed by transitivity.  It costs a
second, it is deterministic, and it fires on exactly the shape that broke the
site.

It is NOT a substitute for `make wasm-gui`.  It cannot see a real libc++
difference (a missing overload, a stricter template).  Run the WASM build
before relying on the published site; run this every time.

Exit 0 = every file includes what it uses.  Exit 1 = a named file.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "src")

#  symbol pattern -> the header that declares it.  Kept SHORT on purpose: each
#  entry has to be a facility whose header is genuinely borrowable, or the
#  gate turns into noise nobody reads.
RULES = [
    (r"\bstd::(ostringstream|istringstream|stringstream)\b", "sstream"),
    (r"\bstd::function\s*<",                                 "functional"),
    (r"\bstd::(set|multiset)\s*<",                           "set"),
    (r"\bstd::(map|multimap)\s*<",                           "map"),
    (r"\bstd::(unordered_map|unordered_set)\s*<",            "unordered_map"),
    (r"\bstd::(unique_ptr|shared_ptr|make_unique|make_shared)\b", "memory"),
    (r"\bstd::(runtime_error|logic_error|invalid_argument)\b", "stdexcept"),
    (r"\bstd::numeric_limits\b",                             "limits"),
    (r"\bstd::(setprecision|setw|setfill)\b",                "iomanip"),
    (r"\bstd::(sort|find_if|min_element|max_element|accumulate)\b", None),
]
#  <algorithm> vs <numeric>: accumulate lives in <numeric>, the rest in
#  <algorithm>, so that last rule needs both spellings accepted.
ALGO = {"sort", "find_if", "min_element", "max_element"}

fails = []


def strip(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//[^\n]*", "", text)
    return re.sub(r'"(?:[^"\\\n]|\\.)*"', '""', text)


def check(path):
    raw = open(path, errors="replace").read()
    body = strip(raw)
    included = set(re.findall(r"#include\s+<([^>]+)>", raw))
    for pattern, header in RULES:
        m = re.search(pattern, body)
        if not m:
            continue
        if header is None:
            name = m.group(1)
            want = "algorithm" if name in ALGO else "numeric"
            if want not in included:
                fails.append((path, "std::" + name, want))
        elif header == "unordered_map":
            if not ({"unordered_map", "unordered_set"} & included):
                fails.append((path, m.group(0), "unordered_map / unordered_set"))
        elif header not in included:
            fails.append((path, m.group(0), header))


n = 0
for base, _dirs, files in os.walk(SRC):
    for fn in sorted(files):
        if fn.endswith((".cpp", ".H")):
            n += 1
            check(os.path.join(base, fn))

for path, sym, header in fails:
    print("FAIL  %s uses %s without #include <%s> -- g++ lends it, "
          "emscripten's libc++ does not"
          % (os.path.relpath(path, ROOT), sym, header))

print()
if fails:
    print("%d file(s) borrowing a header they do not include." % len(fails))
    sys.exit(1)
print("std includes: %d source files, each includes what it uses." % n)
sys.exit(0)
