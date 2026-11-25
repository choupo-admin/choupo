#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the Billet-Schultes packing law equals a second transcription of its paper, and its
records, witness and refusals hold.

    bin/curate/check_billet_schultes.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  The law is some thirty equations and six per-packing
constants typed from a scan (Billet & Schultes, Trans IChemE 77A (1999) 498-504).  An exponent
off by a digit (the 0.15 of Eq 42, the 13 of Eqs 12 and 14), a constant in the wrong
column of Table 2, a bracket in Eq 31 closed one term early: none of these crashes, none
trips a mass balance, and a golden pins whatever the typo prints -- the witness case would
be "unchanged" and wrong.  Held here, against numbers that do not come from PackingBS.cpp:

  (1) THE LAW.  test/packing_bs.cpp, built here with g++ on PackingBS.cpp alone, evaluates two
      packings (25 mm metal Pall rings, 25 mm ceramic Raschig rings) at three gas velocities
      each (below loading, above it, and flooded for the Raschig ring): the loading and
      flooding points, holdup, interfacial area, k_L, k_G, H_G, H_L, H_OG, effective liquid
      velocity and the dry and irrigated pressure drop equal bin/curate/billet_schultes_reference.py
      (the same equations written again, in other code, from the page images) to 1e-9 relative.
  (2) THE RECORDS.  Each shipped random-packing record states exactly the six constants of
      its Table 2a row, a and eps, `arrangement random`, and equals the reference table.
  (3) THE WITNESS.  ratebased05_billetSchultes_pall25_c6c7 runs, prints the law's name, the
      loading and flooding points and the window line, publishes its flooding fraction in (0, 1)
      and holds the first law; the packing's source rows are printed as `record`.
  (4) REFUSALS, each by name: Billet-Schultes on a structured record that lacks the six
      constants (names CS ... CV); Rocha-Bravo-Fair on a random record ("RANDOM packing");
      a record with one constant removed (names it); an inline bed without `Ch`; the transfer-unit
      bed (`model totalReflux;`) on `model BilletSchultes;` (names what it accepts); a boil-up past
      the flooding point ("FLOODS").  And a state outside Table 1 is ANNOUNCED, not refused.

NOT CHECKED: that the constants transcribe the paper (read by the author on the page image,
twice; the reference table is a second typing of the same reading, not a second reading), that
the law predicts any measurement (none in hand: docs/design/random-packings.md section 7), or
that the doubtful digits listed there (the temperature of the paper's "water") are right.

SABOTAGES (run by hand 2026-11-25, on a copy of PackingBS.cpp, arm (1)): the 0.15 of Eq 42 -> 0.51
(the Re_L < 5 branch): 9 values fail; n_S = -0.723 -> -0.732 (flow parameter above 0.4): 11 fail;
the 0.6244 of Eq 40 -> 0.6424: 23 fail.  The three states per packing at L/V 1 exercise Eqs 12-16;
the extra states at L/V 0.1 and 8 exercise the two branches the L/V 1 states never reach.
A record constant changed by one digit fails arm (2).
"""
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402
import billet_schultes_reference as ref  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
NAME = "check_billet_schultes"
WITNESS = "tutorials/steady/distillation/ratebased05_billetSchultes_pall25_c6c7"
STRIP = ("expected", "converged", "iterations", "reports")
RTOL = 1e-9
RECORDS = {"PallRing-metal-50", "PallRing-metal-25", "PallRing-plastic-50", "PallRing-plastic-25",
           "Raschig-ceramic-25"}


def law_arm(failures, notes):
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        failures.append("(1) no C++ compiler to build test/packing_bs.cpp")
        return
    with tempfile.TemporaryDirectory(prefix="packing_bs_") as td:
        exe = Path(td) / "packing_bs"
        r = subprocess.run([cxx, "-std=c++17", "-O2", "-I", str(REPO / "src"),
                            str(REPO / "test/packing_bs.cpp"),
                            str(REPO / "src/unitOperations/distillation/PackingBS.cpp"),
                            "-o", str(exe)], capture_output=True, text=True, timeout=600)
        if r.returncode != 0:
            failures.append("(1) test/packing_bs.cpp did not compile: " + r.stderr[-500:])
            return
        r = subprocess.run([str(exe)], capture_output=True, text=True, timeout=120)
    if r.returncode != 0 or "PACKING_BS_OK" not in r.stdout:
        failures.append("(1) packing_bs failed: " + r.stdout[-500:] + r.stderr[-300:])
        return
    got = {}
    for ln in r.stdout.splitlines():
        parts = ln.split()
        if len(parts) < 4 or parts[0] == "PACKING_BS_OK":
            continue
        got[(parts[0], float(parts[1]), float(parts[2]))] = parts[3:]
    worst, n = 0.0, 0
    for name, uV, LV, want in ref.states():
        line = got.get((name, uV, LV))
        if line is None:
            failures.append(f"(1) {name} u_V {uV} L/V {LV}: the engine's test printed no line")
            continue
        if want["flooded"] != (line[0] == "FLOODED"):
            failures.append(f"(1) {name} u_V {uV} L/V {LV}: flooded = {want['flooded']} in the reference, "
                            f"{line[0] == 'FLOODED'} in the engine")
            continue
        vals = dict(kv.split("=") for kv in line if "=" in kv)
        pairs = {"uS": "uS", "uFl": "uFl"}
        if not want["flooded"]:
            pairs.update({"hLS": "hLS", "hL": "hL", "ae": "ae", "kL": "kL", "kG": "kG", "HG": "HG",
                          "HL": "HL", "HOG": "HOG", "dPdry": "dPdry", "dP": "dP",
                          "ubar": "ubar", "aOverA": "aOverA"})
        for ek, rk in pairs.items():
            e, w = float(vals[ek]), want[rk]
            rel = abs(e - w) / max(abs(w), 1e-300)
            worst = max(worst, rel)
            n += 1
            if rel > RTOL:
                failures.append(f"(1) {name} u_V {uV} L/V {LV} {ek}: engine {e!r} vs reference {w!r} "
                                f"(relative {rel:.2e} > {RTOL:g})")
    notes.append(f"law = second transcription on {n} values (worst relative {worst:.1e})")


def record_arm(failures, notes):
    d = REPO / "data" / "standards" / "assets"
    found = {p.stem for p in d.glob("*.dat")
             if "arrangement       random" in p.read_text()}
    if found != RECORDS:
        failures.append(f"(2) random-packing records are {sorted(found)}, expected {sorted(RECORDS)}")
    for name, p in ref.PACKINGS.items():
        f = d / f"{name}.dat"
        if not f.exists():
            continue
        t = f.read_text()

        def val(key):
            m = re.search(rf"^\s*{key}\s+([0-9.]+)\s*;", t, re.M)
            return float(m.group(1)) if m else None
        want = {"specificArea": p["a"], "voidFraction": p["e"], "CS": p["CS"], "CFl": p["CFl"],
                "Ch": p["Ch"], "CP0": p["CP0"], "CL": p["CL"], "CV": p["CV"]}
        for k, w in want.items():
            if val(k) != w:
                failures.append(f"(2) {name}: {k} = {val(k)} in the record, {w} in the reference table")
        if "Table 2a" not in t or "Trans IChemE 77" not in t:
            failures.append(f"(2) {name}: the provenance does not cite Billet & Schultes Table 2a")
    notes.append(f"{len(RECORDS)} records equal the reference table")


def run_case(case, timeout=900):
    return gatekit.run(gatekit.binary("choupoSolve"), case, timeout=timeout)


def case_arm(failures, notes):
    with gatekit.probe_copy(WITNESS, strip=STRIP) as c:
        rc, out = run_case(c)
        if rc != 0:
            failures.append("(3) the witness exited %d: %s" % (rc, " | ".join(out.strip().splitlines()[-2:])[:400]))
            return
        for needle in ("correlation: Billet-Schultes", "record 'PallRing-metal-25'",
                       "Loading point", "Billet-Schultes window (Table 1, mass-transfer column)"):
            if needle not in out and needle.lower() not in out.lower():
                failures.append(f"(3) the witness's output lacks {needle!r}")
        import json
        a, b = out.find("<<<Choupo:result-begin>>>"), out.find("<<<Choupo:result-end>>>")
        k = json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])["kpis"]["column"] if a >= 0 else {}
        ff = k.get("uV_over_uVFl_max")
        if ff is None or not (0.0 < ff < 1.0):
            failures.append(f"(3) uV_over_uVFl_max = {ff!r}, expected in (0, 1)")
        if "dP_over_dPflood_max" in k:
            failures.append("(3) a Billet-Schultes bed published dP_over_dPflood_max, a Rocha-Bravo-Fair number")
        if not (k.get("HETP", 0) > 0 and k.get("dP_bed_mbar_per_m", 0) > 0):
            failures.append("(3) HETP or the pressure drop is not positive")
        notes.append("witness runs (HETP %.3f m, flooding fraction %.3f)" % (k.get("HETP", float('nan')), ff or float('nan')))

    def probe(tag, edit_fn, needles, absent=(), base=WITNESS):
        with gatekit.probe_copy(base, strip=STRIP) as c:
            edit_fn(c)
            rc, out = run_case(c)
        if rc == 0:
            failures.append(f"(4) {tag}: exit 0, expected a refusal")
            return
        low = out.lower()
        for n_ in needles:
            if n_.lower() not in low:
                failures.append(f"(4) {tag}: the refusal does not name {n_!r}: {out.strip().splitlines()[-1][:250]}")
        for n_ in absent:
            if n_.lower() in low:
                failures.append(f"(4) {tag}: the refusal wrongly says {n_!r}")

    fs = "system/flowsheetDict"

    def e(c, old, new, rel=fs):
        gatekit.edit(c / rel, old, new)

    probe("structured_record", lambda c: e(c, "record            PallRing-metal-25;", "record            MontzB1-250;"),
          ["lacks", "BilletSchultes", "CS", "CV"])
    probe("rbf_on_random", lambda c: e(c, "model             BilletSchultes;", "model             RochaBravoFair;"),
          ["RANDOM packing", "PallRing-metal-25", "BilletSchultes"])

    def drop_const(c):
        rec = c / "constant" / "assets"
        rec.mkdir(parents=True, exist_ok=True)
        t = (REPO / "data/standards/assets/PallRing-metal-25.dat").read_text()
        t = re.sub(r"^\s*CL\s+[0-9.]+;.*\n", "", t, flags=re.M)
        (rec / "PallRing-metal-25.dat").write_text(t)
    probe("missing_constant", drop_const, ["lacks", "CL", "BilletSchultes"])

    def inline_no_ch(c):
        e(c, "                record            PallRing-metal-25;   // data/standards/assets (Billet & Schultes 1999, Table 2a)\n",
          "                specificArea 223.5; voidFraction 0.954; CS 2.627; CFl 2.083; CP0 0.957; CL 1.44; CV 0.336;\n")
    probe("inline_without_Ch", inline_no_ch, ["lacks", "Ch", "BilletSchultes", "Table 2"])
    probe("totalReflux_bed", lambda c: e(c, "model       rateBased;", "model       totalReflux;"),
          ["BilletSchultes", "Accepted"])
    probe("flooded", lambda c: e(c, "fFactor        1.2;", "fFactor        4.0;"), ["FLOODS", "flooding point"])

    with gatekit.probe_copy(WITNESS, strip=STRIP) as c:      # announced, not refused
        e(c, "fFactor        1.2;", "fFactor        0.02;")
        rc, out = run_case(c)
        if rc != 0:
            failures.append("(4) a state below Table 1's liquid-load window should run, announced: "
                            + " | ".join(out.strip().splitlines()[-2:])[:300])
        elif "outside the paper's range" not in out or "u_L" not in out:
            failures.append("(4) a liquid load below Table 1 was not announced")
    notes.append("6 refusals by name and the window announced")


def main():
    failures, notes = [], []
    try:
        law_arm(failures, notes)
        record_arm(failures, notes)
        case_arm(failures, notes)
    except gatekit.GateRefusal as ex:
        failures.append(str(ex))
    return gatekit.verdict(
        NAME, failures,
        "the Billet-Schultes law equals a second transcription of the paper (" + "; ".join(notes)
        + "); it does NOT check that the constants transcribe the paper or that the law predicts a measurement")


if __name__ == "__main__":
    sys.exit(main())
