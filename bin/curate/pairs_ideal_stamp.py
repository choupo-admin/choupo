#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""DEV.md 4c C334 -- stamp the beats-ideal guard onto the SEVERE records already
in data/standards/parameters/{NRTL,UNIQUAC,Wilson}/ (those promoted before the
guard existed).

For each catalogue record whose provenance says `fitGrade severe;` and that
names its case (`fittedInCase`), the guard's number is READ from the case's own
fit op with its parameters at zero and no iteration (pairs_c283.ideal_max) and
written into the provenance beside the fit's own max-error line, exactly as a
promotion writes it.  A record whose fit does NOT beat the ideal mixture is
reported and left untouched (the coordinator decides what happens to it): this
tool never deletes a record.  No parameter is read for writing, none changes.

    CHOUPO_HOME=$PWD CHOUPO_THERMOML_HOME=... bin/curate/pairs_ideal_stamp.py [--dry]
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pairs_c283 as pc   # noqa: E402

crp = pc.crp
ROOT = pc.ROOT


def main(argv):
    dry = "--dry" in argv
    done, failed, skipped = [], [], []
    for model in ("NRTL", "UNIQUAC", "Wilson"):
        for rp in sorted((ROOT / "data/standards/parameters" / model).glob("*.dat")):
            text = rp.read_text()
            body = crp.strip_comments(text)
            prov = crp.block(body, "provenance") or ""
            if crp.word(prov, "fitGrade") != "severe":
                continue
            if "fitGradeIdealMax" in text:
                skipped.append(f"{model} {rp.stem}")
                continue
            case_rel = crp.word(prov, "fittedInCase")
            kind = "px" if "fitGradeMaxRelativeError_pct" in text else "tx"
            key = "fitGradeMaxRelativeError_pct" if kind == "px" else "fitGradeMaxTemperatureError_K"
            mx = crp.num(prov, key)
            case = ROOT / case_rel.strip('"')
            ideal = pc.ideal_max(case, kind)
            ok = mx < ideal
            line = f"{model:8s} {rp.stem:45s} {kind} fit {mx:.4f}  ideal {ideal:.4f}  {'BEATS' if ok else 'DOES NOT BEAT'}"
            print(line, flush=True)
            if not ok:
                failed.append(line)
                continue
            if not dry:
                rp.write_text(pc.stamp_ideal(text, kind, mx, ideal))
            done.append(line)
    print(f"stamped {len(done)}, already stamped {len(skipped)}, does not beat ideal {len(failed)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
