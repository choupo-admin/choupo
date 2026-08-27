#!/usr/bin/env python3
"""Gate: what g++ lends you as an extension, emscripten's clang refuses.

    bin/curate/check_wasm_dialect.py

WHY THIS EXISTS, and it is dated 2026-08-27 because that is the day it cost
the live site three commits.

The costing provenance block wrote a helper lambda over a structured binding:

    for (const auto& [uname, cb] : result.costs)
        auto f = [&](const char* k) { ... cb.factors.find(k) ... };

Capturing a STRUCTURED BINDING in a lambda is illegal in C++17 and became
legal only in C++20.  g++ accepts it as an extension and says nothing, even
under -Wall -Wextra -Wpedantic.  emscripten's clang makes it an error:

    error: reference to local binding 'cb' declared in enclosing function

So it built natively, passed 546 cases and 162 gates, and killed `make wasm`.
publish-site failed on three consecutive pushes and www.choupo.org went on
serving a bundle three commits old while `main` moved ahead.  A green suite is
not evidence about the site: the site is a DIFFERENT artefact from a DIFFERENT
toolchain, and nothing in bin/runTests compiled it.

This is the same family `check_std_includes` guards -- and that gate says
plainly it cannot cover this: "The complete check is `make wasm` ... and it is
NOT in bin/runTests, because emscripten is a separate toolchain and the suite
must run without it."  True, and it left the gap wide.

WHAT MAKES A LOCAL CHECK POSSIBLE.  The two compilers do not disagree about
the LANGUAGE, only about severity: ordinary clang reports the very same
constructs as `-Wc++20-extensions` (and siblings) where emscripten's older
clang errors.  So the tree can be compiled here, with the clang that is
installed, at `-fsyntax-only`, with those warnings promoted to errors.  No
emscripten needed.

WHAT THIS GATE CHECKS:

  (a) EVERY `src/**/*.cpp` PARSES under
      `clang++ -std=c++17 -fsyntax-only -Werror=c++20-extensions
       -Werror=c++2a-extensions -Werror=c++14-extensions`.
      A hit names the file, the line and the construct.

  (b) THE PROBE STILL FAILS.  A file containing the exact construct that broke
      the site is compiled and MUST be rejected.  Without this the gate would
      pass just as happily on a clang that stopped implementing the warning,
      or on a machine with no clang at all -- and a permanently-green gate is
      worse than none (the retired `check_true_ions` shape).

  (c) CLANG IS PRESENT, and its ABSENCE FAILS rather than skips, for the same
      reason.  A check that cannot run must not pass.

SABOTAGE-VERIFIED 2026-08-27, four times; every quoted line is OBSERVED.

S1 -- the site-breaking construct restored in CostingPass.cpp (the lambda
capturing `cb` from the structured binding).  Arm (a), naming the file, the
line and the construct:

    src/postProcessing/CostingPass.cpp:213:27: error: captured structured
    bindings are a C++20 extension [-Werror,-Wc++20-extensions]

S2 -- `-Werror=c++20-extensions` demoted to a plain warning.  **THIS SABOTAGE
SURVIVED**, and the reason is worth keeping: `-Wc++2a-extensions` is an ALIAS
for the same warning group, so disarming one flag leaves the other promoting
it.  The gate went on printing "promoted to errors" and "the probe is still
rejected" -- both false at that moment -- because the probe was still, in
fact, rejected.  The flag list OVERLAPS, so removing one member proves
nothing, and any future sabotage of this gate must disarm the whole list.

S2b -- all four flags turned to `-Wno-`.  Arm (b), which is the arm that
exists for exactly this:

    the PROBE compiled clean.  It contains a lambda capturing a structured
    binding -- the exact construct that killed `make wasm` ...

S3 -- clang++ removed from PATH.  Arm (c) FAILS rather than skipping:

    clang++ is not installed, so this gate cannot run.  It does not skip: a
    check that cannot run must not pass ...

WHAT THIS GATE DOES **NOT** COVER, stated so its OK line cannot imply it:

  * It is NOT `make wasm`.  It compiles with the LOCAL clang and the LOCAL
    libstdc++ headers, so it sees dialect extensions and NOT the libc++
    differences `check_std_includes` exists for (a missing <sstream> still
    passes here).  The two gates are complementary and neither replaces the
    build.
  * The warning list is an ENUMERATION, and so has the same blind spot
    check_std_includes names about itself: it catches the extension families
    somebody listed.  A g++ extension clang does not warn about at all passes.
  * It does not link, instantiate templates it is not asked to, or run
    anything.  `-fsyntax-only` is the price of being fast enough to sit in
    every suite run.
  * emscripten's clang is OLDER than any local one.  A construct new enough
    that the local clang accepts it silently while emscripten rejects it would
    pass here.  Only `make wasm` closes that, and it stays the complete check.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  Promoted to errors.  Each is a family where clang says "extension" and the
#  emscripten toolchain says "error".
FLAGS = [
    "-Werror=c++20-extensions",
    "-Werror=c++2a-extensions",
    "-Werror=c++14-extensions",
    "-Werror=c++17-extensions",
]

#  The construct that broke the site, kept as an executable memory.
PROBE = """\
#include <map>
#include <string>
int probe()
{
    std::map<std::string, int> m{{"a", 1}};
    int t = 0;
    for (const auto& [k, v] : m) { auto f = [&]{ return v; }; t += f(); }
    return t;
}
"""

fails = []


def compile_one(path, extra=()):
    cmd = ["clang++", "-std=c++17", "-I" + str(ROOT / "src"),
           "-fsyntax-only", *FLAGS, *extra, str(path)]
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT))
    return p.returncode, p.stdout + p.stderr


def main():
    # ---- (c) clang must be present; absence FAILS, never skips
    if subprocess.run(["which", "clang++"], capture_output=True).returncode != 0:
        print("check_wasm_dialect: FAIL -- clang++ is not installed, so this "
              "gate cannot run.  It does not skip: a check that cannot run "
              "must not pass, and this one stands between a native build and "
              "a broken www.choupo.org.")
        return 1

    # ---- (b) the probe must still be rejected
    with tempfile.TemporaryDirectory() as tmp:
        probe = Path(tmp) / "probe.cpp"
        probe.write_text(PROBE)
        rc, out = compile_one(probe)
        if rc == 0:
            fails.append(
                "the PROBE compiled clean.  It contains a lambda capturing a "
                "structured binding -- the exact construct that killed "
                "`make wasm` and left the site three commits stale.  If this "
                "no longer fails, the flags below no longer catch anything "
                "and the gate is green for the wrong reason")
        elif "structured binding" not in out:
            fails.append("the probe failed, but not on the structured-binding "
                         "diagnostic; the flags may be catching something "
                         "else:\n    " + out.strip().splitlines()[0])

    # ---- (a) the tree
    sources = sorted((ROOT / "src").rglob("*.cpp"))
    if not sources:
        print("check_wasm_dialect: FAIL -- no sources found under src/; an "
              "absent or collapsed scan root REFUSES rather than reporting a "
              "clean tree")
        return 1

    hits = []
    for f in sources:
        rc, out = compile_one(f)
        if rc != 0:
            first = next((l for l in out.splitlines() if " error:" in l),
                         out.strip().splitlines()[0] if out.strip() else "?")
            hits.append(f"{f.relative_to(ROOT)}: {first.strip()}")
    if hits:
        fails.append(f"{len(hits)} source file(s) use a g++ extension that "
                     "emscripten's clang rejects:\n    " + "\n    ".join(hits))

    if fails:
        print("check_wasm_dialect: FAIL")
        for x in fails:
            print("  - " + x)
        return 1

    print(f"check_wasm_dialect: OK -- all {len(sources)} source file(s) parse "
          "under clang with the C++14/17/20 extension families promoted to "
          "errors, and the probe (a lambda capturing a structured binding, the "
          "construct that broke the site on 2026-08-27) is still rejected.  "
          "NOT COVERED, and the distinction matters: this is NOT `make wasm`. "
          "It uses the LOCAL clang and the LOCAL libstdc++ headers, so it sees "
          "dialect extensions and not the libc++ header differences "
          "check_std_includes exists for; the warning list is an enumeration "
          "with that gate's own blind spot; nothing is linked or run; and "
          "emscripten's clang is OLDER than any local one, so a construct the "
          "local clang accepts silently would pass here.  `make wasm` remains "
          "the complete check.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
