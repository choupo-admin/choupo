#!/usr/bin/env python3
"""check_compile_clean -- the tree must compile without warnings.

WHY.  `make/compiler.mk` carries a STRICT=1 mode (-Werror) and, beside it, the
sentence "The tree compiles CLEAN (zero warnings, 2026-07-28)".  On 2026-08-14
it did not: eight warnings, and nothing anywhere would have said so, because
STRICT=1 is opt-in and no one opts in.  The mechanism existed; nothing ran it.

The argument for zero is written in that same comment and is worth repeating,
because it is not tidiness: *a build that prints forty "this is fine" lines is
a build where the one that matters gets scrolled past.*  That is not
hypothetical here either -- an uninitialised norm in NewtonND and a dangling
`else` in VleConsistency had both been sitting in exactly that noise.  The
eighth was the same shape: a -Wmisleading-indentation in
`choupoBatch/main.cpp`, in a block added earlier the same day, where the
inserted code was under-indented by four spaces so that unconditional
statements read as if a preceding `else if` guarded them.  The behaviour was
right and the code lied about it.

WHAT IT CHECKS.  Every tracked `src/*.cpp` compiles under
`-Wall -Wextra -Wpedantic` with no warning.  Headers are covered transitively,
through the translation units that include them.

WHAT IT DOES *NOT* CHECK, and the second one matters:
  * `-fsyntax-only`, so the optimiser never runs.  Warnings that only the
    optimiser can raise -- `-Wmaybe-uninitialized` is the one that bites --
    are NOT covered here.  `make STRICT=1` is the complete check and stays
    the authority; this is the affordable one.
  * a header included by no translation unit is never compiled at all.
  * the WASM build (a separate Emscripten compile) and `gui/` (a separate
    toolchain with its own typecheck).
  * any compiler but the one running it.  A newer g++ invents new warnings;
    that is exactly why STRICT=1 is opt-in for distribution and why this gate
    reports what it saw rather than asserting a universal.

SABOTAGE-VERIFIED 2026-08-14, observed output:
  S1  the misleading indentation put back (the defect this was built for) ->
      "1 warning(s): ...main.cpp:1278:14: this 'if' clause does not guard...".
  S2  one named-member init returned to `UnitRow r{ u.name, 0 };` ->
      "2 warning(s)", both -Wmissing-field-initializers on the same line.

Exit 0 = no warnings.  Exit 1 = at least one, printed with its location.
"""

import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FLAGS = ["-std=c++17", "-Wall", "-Wextra", "-Wpedantic",
         "-I" + str(ROOT / "src"), "-fsyntax-only"]


def sources():
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files", "src/*.cpp"],
                         capture_output=True, text=True).stdout
    return [ROOT / p for p in out.split() if p]


def compile_one(src: Path):
    p = subprocess.run([os.environ.get("CXX", "g++")] + FLAGS + [str(src)],
                       capture_output=True, text=True, cwd=str(ROOT))
    text = p.stderr + p.stdout
    #  A source that does not COMPILE is not this gate's business -- the build
    #  itself reports that far more clearly -- but it must not be mistaken for
    #  a clean pass either.
    hard = p.returncode != 0 and "warning:" not in text
    warns = [ln for ln in text.splitlines() if "warning:" in ln]
    return src, warns, hard


def main() -> int:
    srcs = sources()
    if not srcs:
        print("check_compile_clean: no sources found -- refusing to report a"
              " clean tree from an empty sweep")
        return 1

    warned, broken = [], []
    with ThreadPoolExecutor(max_workers=max(2, (os.cpu_count() or 4))) as ex:
        for src, warns, hard in ex.map(compile_one, srcs):
            rel = src.relative_to(ROOT)
            if hard:
                broken.append(str(rel))
            for w in warns:
                warned.append(re.sub(r"^" + re.escape(str(ROOT)) + "/", "", w))

    if broken:
        print("check_compile_clean: FAIL -- %d source(s) do not compile at"
              " all; fix the build first" % len(broken))
        for b in broken[:10]:
            print("  -", b)
        return 1

    if warned:
        print("check_compile_clean: FAIL -- %d warning(s):" % len(warned))
        for w in warned[:40]:
            print("  " + w.strip())
        if len(warned) > 40:
            print("  ... and %d more" % (len(warned) - 40))
        return 1

    print("check_compile_clean: OK -- %d translation unit(s) compile under"
          " -Wall -Wextra -Wpedantic with no warning.  NOT checked:"
          " optimiser-only warnings (-fsyntax-only skips codegen; `make"
          " STRICT=1` is the complete check), headers no TU includes, the"
          " separate WASM and gui/ toolchains, or any compiler but this one."
          % len(srcs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
