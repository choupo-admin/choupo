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

THE LIST IS AN ENUMERATION, SO IT CATCHES WHAT SOMEBODY LISTED -- and on
2026-08-26 that stopped being an abstract caveat.  `std::array` was not on it,
the block-tridiagonal slice put a `std::vector<std::array<...>>` into
`solver/NewtonND.cpp`, the native build compiled (libstdc++ lends the header
transitively), this gate said OK, and the WASM build died in Vitor's terminal:

    /usr/share/emscripten/.../c++/v1/__tuple:219:
    template <class _Tp, size_t _Size> struct _LIBCPP_TEMPLATE_VIS array;

libc++ only FORWARD-DECLARES array there.  So the guard held for every symbol
it knew and was blind to the one that broke.

The complete check is `make wasm`, which compiles the tree with the libc++ in
question -- and it is NOT in bin/runTests, because emscripten is a separate
toolchain and the suite must run without it.  That gap is real and is stated
here rather than papered over: this gate REDUCES the chance of the failure, it
does not remove it.  Adding a symbol here after a WASM build catches one is
the intended workflow, not an admission of a broken gate.

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

#  A scan over nothing includes nothing (2026-08-15 fleet census): this gate
#  shared the check_true_ions death shape -- rename src/ and os.walk yields
#  nothing, zero misses over zero files, and the gate goes permanently green.
#  A scanner must refuse when it cannot see what it audits.
if not os.path.isdir(SRC):
    print("std includes FAILED: scan root 'src' does not exist -- this gate"
          " cannot see what it audits, and a green verdict over an absent"
          " tree would be the check_true_ions failure again.")
    sys.exit(1)

#  symbol pattern -> the header that declares it.  Kept SHORT on purpose: each
#  entry has to be a facility whose header is genuinely borrowable, or the
#  gate turns into noise nobody reads.
RULES = [
    (r"\bstd::(ostringstream|istringstream|stringstream)\b", "sstream"),
    (r"\bstd::array\s*<",                                    "array"),
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

#  Collapsed-scan floor (2026-08-15 fleet census, check_true_ions precedent):
#  628 source files observed; the floor sits a round 5x+ below.
if n < 100:
    print("std includes FAILED: only %d source files scanned -- the tree"
          " holds hundreds, so the scan surface has collapsed and a verdict"
          " over it would describe nothing." % n)
    sys.exit(1)

for path, sym, header in fails:
    print("FAIL  %s uses %s without #include <%s> -- g++ lends it, "
          "emscripten's libc++ does not"
          % (os.path.relpath(path, ROOT), sym, header))

print()
if fails:
    print("%d file(s) borrowing a header they do not include." % len(fails))
    sys.exit(1)
print("std includes: %d source files, each includes what it uses (an absent"
      " or collapsed scan root REFUSES)." % n)
sys.exit(0)
