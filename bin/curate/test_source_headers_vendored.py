#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Test: neither the gate nor the tool ever reads a file under a
third-party-as-received rule in TEXT mode (DEV.md 4c C393, ruling).

The vendored NanoFiltran Fortran source carries a notice that is not valid
UTF-8; a tool that decoded it would corrupt or refuse it.  This test (1) checks
that the file really is not UTF-8 (so the proof has a subject), (2) makes every
text-mode open of a path under bin/curate/nanofiltran/ RAISE, and (3) runs the
gate and the tool's --check over the whole tree.  A pass means neither opened
the vendored files as text.

    bin/curate/test_source_headers_vendored.py
"""
import builtins
import io
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

VENDORED = ROOT / "bin" / "curate" / "nanofiltran"
SUBJECT = VENDORED / "src" / "NANOFILTRAN.F"


def _under(p):
    try:
        return Path(os.path.abspath(os.fspath(p))).is_relative_to(VENDORED)
    except (TypeError, ValueError):
        return False


def _guard(real):
    def f(file, mode="r", *a, **k):
        if _under(file) and "b" not in mode:
            raise AssertionError("text-mode open of a vendored file: %s" % file)
        return real(file, mode, *a, **k)
    return f


def main():
    try:
        SUBJECT.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        pass
    else:
        print("test_source_headers_vendored: FAIL -- %s is valid UTF-8, the test has no subject"
              % SUBJECT.relative_to(ROOT))
        return 1
    builtins.open = _guard(builtins.open)
    io.open = _guard(io.open)
    real_rt, real_po = Path.read_text, Path.open

    def rt(self, *a, **k):
        if _under(self):
            raise AssertionError("read_text of a vendored file: %s" % self)
        return real_rt(self, *a, **k)

    def po(self, mode="r", *a, **k):
        if _under(self) and "b" not in mode:
            raise AssertionError("text-mode Path.open of a vendored file: %s" % self)
        return real_po(self, mode, *a, **k)
    Path.read_text, Path.open = rt, po

    import check_source_headers as G
    import add_source_headers as T
    import source_headers_kinds as K
    out = io.StringIO()
    real_stdout, sys.stdout = sys.stdout, out
    try:
        fails = []
        G.arm_a_b_c(fails)
        T.main(["--check"])
        K.census()
    except AssertionError as e:
        sys.stdout = real_stdout
        print("test_source_headers_vendored: FAIL -- " + str(e))
        return 1
    finally:
        sys.stdout = real_stdout
    print("test_source_headers_vendored: OK -- the gate arms, the tool's --check and the census "
          "ran over the tree without one text-mode read of bin/curate/nanofiltran/ "
          "(its Fortran notice is not valid UTF-8)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
