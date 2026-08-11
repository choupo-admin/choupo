#!/usr/bin/env python3
"""check_thermoml_index -- the archive reader detects its dialect and refuses.

ThermoML exists in two INCOMPATIBLE dialects, and a reader written for one
fails on every file of the other:

    published   <DataReport>   <Compound> <PureOrMixtureData> <Property>
                               -- what the NIST archive ships
    v5 (2017)   <dataReport>   <chemical> <prop> <var>
                               -- the proposal in usnistgov/thermoML

That was established element by element against NIST's own ThermoML5.xsd,
which defines `chemical` and `property` and contains no `Compound` or
`PureOrMixtureData` at all.  So the dialect is READ off the root element and an
unrecognised one is REFUSED BY NAME -- because if the archive ever migrates,
silently misreading it is far worse than stopping.

ARMS:

  A1  BOTH DIALECTS ARE READ.  The fixtures index to one `published` and one
      `v5` file, and identity is recovered from each.

  A2  AN UNKNOWN DIALECT IS REFUSED BY NAME, not skipped and not guessed at.

  A3  ALL FOUR KEYS SEARCH.  name, CAS, InChI and InChIKey each resolve.

  A4  UNSUPPORTED PROPERTIES ARE LISTED, NOT DROPPED.  A reader that quietly
      ignores two thirds of a file is indistinguishable from one that found
      nothing, so every declared property type Choupo cannot read yet is
      named in the output.

  A5  AN EMPTY CACHE REFUSES.  An index built over nothing would report a
      clean, empty archive -- which is not the same as a working one, and is
      the shape of a check that cannot run reporting success.

  A6  A HAND-PLACED CACHE SAYS SO.  Until a file NIST actually served has
      passed through it, the published-dialect reader is unverified and the
      run must announce that rather than imply coverage it does not have.

WHAT THIS GATE DOES NOT CHECK, stated plainly:
  * that the PUBLISHED-dialect reader matches the real archive.  Its fixture
    was written from the documented element names, because every NIST host is
    unreachable from the environment this was built in.  Matching is by local
    element NAME rather than by path precisely so a nesting difference costs
    an adjustment instead of producing plausible wrong numbers -- but only a
    real archive file can settle it, and A6 is the standing admission that
    none has passed through yet.
  * the download.  `sync` refuses rather than inventing a URL and a checksum
    it could not read.
  * any NUMBER.  This gate reads identity and property NAMES; extracting
    values is the next slice.

Exit 0 on success, 1 with the failing arm named.
"""

import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
TOOL = ROOT / "bin" / "choupo-thermoml"
FIXTURES = ROOT / "bin" / "curate" / "fixtures" / "thermoml"


def run(args, home):
    env = dict(os.environ, CHOUPO_THERMOML_HOME=str(home))
    p = subprocess.run([str(TOOL)] + args, capture_output=True, text=True,
                       env=env)
    return p.returncode, p.stdout + p.stderr


def main():
    fails = []
    if not TOOL.exists():
        print("check_thermoml_index: FAIL -- bin/choupo-thermoml is missing")
        return 1
    if not FIXTURES.is_dir():
        print(f"check_thermoml_index: FAIL -- no fixtures at {FIXTURES}")
        return 1

    with tempfile.TemporaryDirectory() as td:
        home = pathlib.Path(td) / "cache"
        home.mkdir()
        for f in FIXTURES.glob("*.xml"):
            shutil.copy(f, home)

        rc, out = run(["index"], home)
        if rc != 0:
            fails.append(f"A1 index failed (exit {rc})\n{out[-600:]}")
        else:
            # -- A1: both dialects --------------------------------------------
            if "dialect published  1" not in out:
                fails.append("A1 the published dialect was not detected")
            if "dialect v5         1" not in out:
                fails.append("A1 the v5 dialect was not detected")

            # -- A2: the unknown dialect is refused BY NAME -------------------
            if "REFUSED unknown-dialect.xml" not in out:
                fails.append("A2 a file in neither dialect was not refused")
            if "unrecognised ThermoML root element" not in out:
                fails.append("A2 the refusal does not name what it refused on")

            # -- A4: unsupported property types are listed --------------------
            if "LISTED rather than dropped" not in out:
                fails.append("A4 unsupported property types are not listed")
            if "Viscosity" not in out:
                fails.append("A4 a declared property Choupo cannot read was "
                             "dropped instead of named")

            # -- A6: the unverified admission ---------------------------------
            if "[unverified]" not in out:
                fails.append("A6 a hand-placed cache did not announce that the "
                             "published reader has never seen a real file")

            idx = json.loads((home / "index.json").read_text())
            if idx["indexed"] != 2 or len(idx["refused"]) != 1:
                fails.append(f"A1 expected 2 indexed / 1 refused, got "
                             f"{idx['indexed']} / {len(idx['refused'])}")

        # -- A3: all four key kinds resolve -----------------------------------
        for key, label in (("water", "name"),
                           ("7732-18-5", "CAS"),
                           ("InChI=1S/H2O/h1H2", "InChI"),
                           ("XLYOFNOQVPJJNP-UHFFFAOYSA-N", "InChIKey")):
            rc_s, out_s = run(["search", key], home)
            if rc_s != 0 or "1 dataset(s)" not in out_s:
                fails.append(f"A3 search by {label} ('{key}') did not resolve")

    # -- A5: an empty cache refuses -------------------------------------------
    with tempfile.TemporaryDirectory() as td2:
        rc_e, out_e = run(["index"], pathlib.Path(td2))
        if rc_e == 0:
            fails.append("A5 an index over an EMPTY cache reported success -- "
                         "a clean empty archive is not a working one")
        elif "holds no .xml files" not in out_e:
            fails.append("A5 the empty-cache refusal does not say why")

    if fails:
        print("check_thermoml_index: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    print("check_thermoml_index: OK -- both ThermoML dialects are detected off "
          "the root element and an unrecognised one is refused BY NAME; all "
          "four identifier kinds (name, CAS, InChI, InChIKey) resolve through "
          "the index; declared property types Choupo cannot read yet are "
          "LISTED rather than dropped; an empty cache refuses instead of "
          "reporting a clean empty archive; and a hand-placed cache announces "
          "that the published-dialect reader has never seen a file NIST "
          "served.  NOT COVERED, and it is the important gap: whether the "
          "PUBLISHED reader matches the real archive -- its fixture was "
          "written from documented element names because every NIST host is "
          "unreachable from here, matching is by local element NAME so a "
          "nesting difference costs an adjustment rather than producing wrong "
          "numbers, and only a real archive file can settle it.  Also not "
          "covered: the download itself, and any numeric VALUE (this gate "
          "reads identity and property names only).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
