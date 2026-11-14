#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""thermomlParity -- what bin/choupo-thermoml READS from a ThermoML file, as
JSON, for gui/tests/thermomlReader.test.ts to hold the TypeScript reader to.

    python3 gui/tests/thermomlParity.py FILE.xml [FILE.xml ...]

For every file and every <PureOrMixtureData> block it reports, from the
extractor's own functions (imported read-only, never copied):

  * `_one_bubble_block`  -> the bubble-temperature record, or its refusal;
  * `_one_bubbleP_block` -> the bubble-pressure record, or its refusal;
  * `extract_binary_bubble[P]` with no block named -> the file-level choice;
  * the `data ( ... )` rows and the uncertainty values the COMMANDS write
    (`extract-vle --interior-only --no-vapour --block N` and
    `extract-px --block N`), read back from the files they write into a
    temporary directory.

The commands join compounds to catalogue names through `identity.json`.  A
temporary cache with an identity.json mapping each compound's own InChIKey
to its own archive name is built for the run (CHOUPO_THERMOML_HOME), so the
real join code runs and no real cache is read or written.  A compound with no
InChIKey cannot take that path: extract-vle then runs with `--provenance
synthetic` (which skips the join, as the tool provides), and extract-px,
which has no such mode, reports `rows: null` with the reason.

Floats are emitted by json.dumps, i.e. repr: the shortest string that reads
back as the same double, so the test compares the numbers exactly.
"""

import argparse
import contextlib
import importlib.machinery
import importlib.util
import io
import json
import os
import pathlib
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
TOOL = ROOT / "bin" / "choupo-thermoml"


def load_tool():
    loader = importlib.machinery.SourceFileLoader("choupo_thermoml", str(TOOL))
    spec = importlib.util.spec_from_loader("choupo_thermoml", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def outcome(f):
    try:
        return {"ok": f()}
    except Exception as ex:  # noqa: BLE001 -- the kind is what is reported
        if type(ex).__name__ == "BubbleRefusal":
            return {"refused": str(ex)}
        return {"error": type(ex).__name__ + ": " + str(ex)}


def rows_of(path):
    """The data rows and the uncertainty values of a written dataset."""
    lines = path.read_text().split("\n")
    i = lines.index("data")
    assert lines[i + 1] == "("
    j = lines.index(");", i)
    vals = None
    for ln in lines:
        s = ln.strip()
        if s.startswith("values  ( "):
            vals = s[len("values  ( "):s.index(" );")]
    return lines[i + 2:j], vals


def run_cmd(tm, func, ns):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        rc = func(argparse.Namespace(**ns))
    return rc, out.getvalue()


def main(argv):
    tm = load_tool()
    report = []
    for f in argv:
        src = pathlib.Path(f)
        root = ET.parse(src).getroot()
        comps = tm.compounds_published(root)
        doi = tm.find_text(root, "sDOI")
        poms = tm.find_all(root, "PureOrMixtureData")
        keys = [c["inchikey"] for c in comps]
        entry = {"file": src.name, "blocks": []}
        entry["fileBubbleT"] = outcome(lambda: tm.extract_binary_bubble(root, src))
        entry["fileBubbleP"] = outcome(lambda: tm.extract_binary_bubbleP(root, src))
        with tempfile.TemporaryDirectory() as tmp:
            cache = pathlib.Path(tmp) / "cache"
            cache.mkdir()
            recs = [{"component": c["name"], "cas": "0-00-0", "inchiKey": c["inchikey"],
                     "status": "resolved"} for c in comps if c["inchikey"]]
            (cache / "identity.json").write_text(json.dumps({
                "records": recs,
                "byInchiKey": {r["inchiKey"]: [r["component"]] for r in recs}}))
            old = os.environ.get("CHOUPO_THERMOML_HOME")
            os.environ["CHOUPO_THERMOML_HOME"] = str(cache)
            try:
                for i, pom in enumerate(poms):
                    b = {"index": i,
                         "bubbleT": outcome(lambda: tm._one_bubble_block(root, pom, comps, doi)),
                         "bubbleP": outcome(lambda: tm._one_bubbleP_block(root, pom, comps, doi))}
                    if "ok" in b["bubbleT"]:
                        d = pathlib.Path(tmp) / f"vle{i}"
                        prov = "measured" if all(keys) else "synthetic"
                        rc, txt = run_cmd(tm, tm.cmd_extract_vle, dict(
                            file=str(src), block=i, into=str(d), provenance=prov,
                            interior_only=True, no_vapour=True, x_of=None))
                        if rc == 0:
                            out = next(d.glob("*.dat"))
                            b["vleRows"], b["vleU"] = rows_of(out)
                        else:
                            b["vleRows"], b["vleRefused"] = None, txt
                    if "ok" in b["bubbleP"]:
                        if not all(keys):
                            b["pxRows"], b["pxRefused"] = None, "no InChIKey: extract-px cannot join"
                        else:
                            d = pathlib.Path(tmp) / f"px{i}"
                            rc, txt = run_cmd(tm, tm.cmd_extract_px, dict(
                                file=str(src), block=i, into=str(d), x_of=None,
                                allow_multi_isotherm=False))
                            if rc == 0:
                                out = next(d.glob("*.dat"))
                                b["pxRows"], b["pxU"] = rows_of(out)
                            else:
                                b["pxRows"], b["pxRefused"] = None, txt
                    entry["blocks"].append(b)
            finally:
                if old is None:
                    os.environ.pop("CHOUPO_THERMOML_HOME", None)
                else:
                    os.environ["CHOUPO_THERMOML_HOME"] = old
        report.append(entry)
    json.dump(report, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
