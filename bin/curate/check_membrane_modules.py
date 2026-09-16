#!/usr/bin/env python3
"""Gate: a membrane MODULE is a record -- the data sheet's facts transcribed
once, the values the sheet does not state marked as estimates and announced,
the limits checked against the run, the rated test measured.
    bin/curate/check_membrane_modules.py

WHY THIS EXISTS.  Until 2026-09-15 a case typed a commercial element by hand
-- `area`, `length`, `channelHeight`, `spacerPorosity` over the operation and
its sub-blocks -- with nothing saying which number was the manufacturer's and
which was a guess.  Now `module <name>;` names a record of kind
`membraneModule` in assets/ (a spiral element wound with one membrane, or a
laboratory flat-sheet cell that takes any coupon), and Vitor's ruling on the
numbers no document gives -- "onde faltam parametros coloca um valor educado,
com uma nota a dizer que tem de ser verificado" -- is a CONTRACT the engine
must keep on every run: an educated value is marked `origin estimate;
reviewStatus unverified;` with a note saying how to verify it, and the module
ANNOUNCES each one it reads.  Three claims are pinned here: the records say
what the documents say, the engine tells the reader what was assumed, and the
record's geometry is what the channel is marched on.

WHAT THIS GATE CHECKS (every witness is RUN here; nothing is read from a
stale converged/):
  (a) THE RECORDS AGAINST THE DOCUMENTS.  Every `kind membraneModule` record
      in data/standards/assets/ carries the keys its format needs; every value
      the TABLE below marks as an estimate carries `origin estimate` +
      `reviewStatus unverified` + non-empty `notes`, and NO data-sheet value
      does; and every data-sheet value equals the TABLE -- a second, independent
      transcription of the same pages (DuPont Form No. 45-D01529-en Rev. 8,
      Form No. 45-D00971-en Rev. 7, the Sterlitech SEPA CF manual Tables 1-3),
      read from the .dat by this gate's own parser, never through the engine.
  (b) THE ANNOUNCEMENT.  Each witness (membrane15/16/17) prints exactly one
      `[estimate] module '<name>': `<key>`` line per estimate the record
      carries and none for any other key, each carrying the record's note;
      each reaches the result JSON as a `provenance` advisory on the module's
      locus.  SW30HR-380's spacer (a data-sheet fact) must NOT be announced.
  (c) THE REFUSALS, built from the witnesses in a temp dir: `module` + inline
      `area`; `module` + `massTransfer.channelHeight`; a spiral `module` +
      `membrane`; a flat cell without `membrane`; an unknown module name (the
      message must carry the registered list, all three names).
  (d) THE CHANNEL THE RECORD GAVE, recomputed from what the run PUBLISHED.
      The published inlet crossflow times the channel section the record
      implies must equal the feed volumetric flow (F_mass / rho) to 1e-9:
      for the flat cell with W = A/L, L = A/slotWidth (ONE face), and the
      profile's last z must be that L; for the spiral with W = A/(2 L),
      L the record's leaf length (TWO faces).  The `[spec]` line must say
      which face count was used.
  (e) THE LIMITS.  A membrane15 twin at 60 bar and 5 m3/h feed prints
      `[limit]` lines naming P_max and feedFlow_max and STILL EXITS 0 (a
      limit announces, never refuses); no witness prints any `[limit]` line.
  (f) THE RATED TEST, MEASURED.  Each spiral record's `ratedTest {}` is run
      through the engine (the sheet's solute, concentration, pressure and
      temperature; the feed flow the sheet's recovery implies,
      permeateFlow / recovery) and the engine's permeate flow and rejection
      are PRINTED beside the sheet's.  Printed, not asserted: the membrane
      records' A_w/B_s are fits to teaching cases (their headers say so), so
      the ratio is a finding recorded in docs/design/a-module-is-a-record.md,
      never tuned.  What IS asserted: the probe runs to exit 0 and publishes
      both numbers.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
It does not check that an estimate is a GOOD estimate (nobody has measured
an NF270-4040 spacer here) -- only that it is marked and announced.  It does
not check the transcription against the PDFs themselves (the table is a
human's second reading).  The rated-test ratio is not held to any band.
The batch vessel reads no module record.  DSPM-DE under a module record is
exercised by no case.  The pH limit fires only from a `scaling { pH }`
declaration and no witness declares one.

SABOTAGE-VERIFIED 2026-09-15 (engine and record edits BY HAND, rebuilt where
C++ moved, run, restored; the gate never patches a source):
  S1  NF270-4040.dat activeArea 7.6 -> 7.9 m2            CAUGHT by (a)
      (record 7.9 vs table 7.6) and by (d) on membrane15.
  S2  SEPA_CF.dat channelHeight block: `notes` removed    CAUGHT twice: the
      ENGINE refuses the record at load (MembraneModule::readFromDict names
      the missing notes), so every witness dies and the gate stops at "did
      not run"; with the engine's refusal disabled as well (S2b) arm (a)
      catches the empty note and arm (b) the note-less line.
  S3  SpiralWoundModule: the [estimate] loop deleted      CAUGHT by (b) on all
      three witnesses (0 lines against 3/2/2 expected) and by the missing
      provenance advisories.
  S4  facesPerLeaf forced to 2.0 on the flat cell        CAUGHT by (d):
      u * W h eps = 0.5 Q_feed on membrane17 (rel 5e-1), and the [spec] line
      no longer says "one membrane face".
  S5  the `module` + inline `area` refusal removed        CAUGHT by (c)
      (the probe ran to exit 0 with `area 7.6` beside `module`).
  S6  the [limit] block deleted                           CAUGHT by (e)
      (no [limit] line at 60 bar).
  S7  SW30HR-380.dat channelHeight provenance origin literature -> estimate
      (with a note added)                                CAUGHT by (a): a
      data-sheet value marked as an estimate; and by (b): membrane16
      announced a key the table does not list.
  S8  the flat cell's L taken as slotWidth instead of A/slotWidth
                                                          CAUGHT by (d): the
      profile's last z (0.0953) is not A/slotWidth (0.1469), and the section
      check fails with it.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
ASSETS = ROOT / "data/standards/assets"
M15 = ROOT / "tutorials/steady/membranes/membrane15_module_nf270_4040"
M16 = ROOT / "tutorials/steady/membranes/membrane16_module_sw30hr_8040"
M17 = ROOT / "tutorials/steady/membranes/membrane17_sepa_cf_flat_cell"
MW = {"water": 18.015, "NaCl": 58.44, "MgSO4": 120.37, "Na": 22.99, "Cl": 35.45,
      "NO3": 62.004, "NH4": 18.04}
MIL = 25.4e-6

#  THE TABLE: a second transcription of the same documents, in SI.  A value
#  listed under `estimates` is one the document does NOT state; everything
#  else is a data-sheet fact and must match the record to 1e-9 relative.
TABLE = {
    "NF270-4040": {
        "format": "spiralWound", "membrane": "NF270", "manufacturer": "DuPont FilmTec",
        "source": "45-D01529-en",
        "values": {"activeArea": 7.6},
        "limits": {"P_max": 41e5, "T_max": 318.15, "dP_max": 1.0e5,
                   "feedFlow_max": 3.6 / 3600.0, "pH_min": 3.0, "pH_max": 10.0},
        "ratedTest": {"feedMassFraction": 2.0e-3, "P": 4.8e5, "T": 298.15,
                      "recovery": 0.15, "permeateFlow": 9.5 / 86400.0, "rejection": 0.97},
        "ratedSolute": "MgSO4",
        "estimates": {"channelHeight": 28 * MIL, "spacerPorosity": 0.90, "leafLength": 0.95},
    },
    "SW30HR-380": {
        "format": "spiralWound", "membrane": "SW30HR", "manufacturer": "DuPont FilmTec",
        "source": "45-D00971-en",
        "values": {"activeArea": 35.0, "channelHeight": 28 * MIL},
        "limits": {"P_max": 83e5, "T_max": 318.15, "dP_max": 1.0e5,
                   "pH_min": 2.0, "pH_max": 11.0},
        "absentLimits": ["feedFlow_max"],
        "ratedTest": {"feedMassFraction": 32.0e-3, "P": 55e5, "T": 298.15,
                      "recovery": 0.08, "permeateFlow": 26.0 / 86400.0, "rejection": 0.997},
        "ratedSolute": "NaCl",
        "estimates": {"spacerPorosity": 0.90, "leafLength": 0.95},
    },
    "SEPA_CF": {
        "format": "flatSheetCell", "membrane": None, "manufacturer": "Sterlitech Corporation",
        "source": "Sterlitech",
        "values": {"activeArea": 140e-4, "slotDepth": 1.09e-3, "slotWidth": 95.3e-3,
                   "holdUpVolume": 70e-6},
        "limits": {"P_max": 69e5, "T_max": 355.15},
        "absentLimits": ["dP_max", "feedFlow_max", "pH_min", "pH_max"],
        "availableSpacers": [17 * MIL, 31 * MIL, 47 * MIL, 65 * MIL],
        "estimates": {"channelHeight": 31 * MIL, "spacerPorosity": 0.90},
    },
}
UNIT = {"m2": 1.0, "cm2": 1e-4, "m": 1.0, "mm": 1e-3, "bar": 1e5, "Pa": 1.0, "K": 1.0,
        "m3/h": 1 / 3600.0, "m3/d": 1 / 86400.0, "ml": 1e-6, "mL": 1e-6, "L": 1e-3}


# ---------------------------------------------------------------- parsing
def strip_comments(t):
    """Quote-aware: a URL inside a quoted string carries `//` and is not a
    comment (the SEPA CF manual's address lives in its record's `source`)."""
    return re.sub(r'("[^"]*")|/\*.*?\*/|//[^\n]*',
                  lambda m: m.group(1) if m.group(1) else "", t, flags=re.S)


def tokens(t):
    return re.findall(r'"[^"]*"|[{}();]|[^\s{}();"]+', t)


def parse_block(toks, i):
    """Parse `key value... ;` entries and `key { ... }` sub-dicts until '}'."""
    d = {}
    while i < len(toks):
        tk = toks[i]
        if tk == "}":
            return d, i + 1
        key = tk
        i += 1
        if toks[i] == "{":
            sub, i = parse_block(toks, i + 1)
            d[key] = sub
        elif toks[i] == "(":
            j = toks.index(")", i)
            d[key] = [float(x) for x in toks[i + 1:j]]
            i = j + 1
            assert toks[i] == ";"
            i += 1
        else:
            j = toks.index(";", i)
            d[key] = toks[i:j]
            i = j + 1
    return d, i


def parse_record(path):
    toks = tokens(strip_comments(path.read_text()))
    d, _ = parse_block(toks + ["}"], 0)
    return d


def si(entry):
    """`[value]` -> value (raw SI); `[value, unit]` -> converted."""
    v = float(entry[0])
    if len(entry) == 1:
        return v
    if entry[1] not in UNIT:
        raise RuntimeError(f"unit '{entry[1]}' not in the gate's table")
    return v * UNIT[entry[1]]


def word(entry):
    return entry[0].strip('"') if entry else ""


def close(a, b, rel=1e-9):
    return abs(a - b) <= rel * max(abs(a), abs(b), 1e-300)


# ---------------------------------------------------------------- running
def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BUILD / "choupoSolve"), str(case)], capture_output=True,
                       text=True, timeout=900, env=env)
    return r.returncode, r.stdout + r.stderr


def result_of(out):
    if "<<<Choupo:result-begin>>>" not in out:
        return None
    return json.loads(out.split("<<<Choupo:result-begin>>>")[1].split("<<<Choupo:result-end>>>")[0])


def copy_case(src, dst):
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("converged", "log.*", "expected", "reports", "design"))


def estimate_lines(out, name):
    return re.findall(r"\[estimate\] module '%s': `(\w+)` = \S+ \(SI\) is an ESTIMATE, reviewStatus (\w+) -- (.*)"
                      % re.escape(name), out)


def main():
    failures = []
    records = {}

    # ---------------- (a) the records against the documents ----------------
    for p in sorted(ASSETS.glob("*.dat")):
        d = parse_record(p)
        if word(d.get("kind", [])) != "membraneModule":
            continue
        name = word(d.get("name", []))
        records[name] = d
        if name not in TABLE:
            failures.append(f"(a) {p.name}: module '{name}' has no row in this gate's transcription table")
            continue
        tb = TABLE[name]
        for k in ("name", "kind", "manufacturer", "format", "activeArea", "channelHeight",
                  "spacerPorosity", "limits", "provenance"):
            if k not in d:
                failures.append(f"(a) {name}: required key `{k}` missing")
        if word(d.get("format", [])) != tb["format"]:
            failures.append(f"(a) {name}: format {word(d.get('format', []))!r} vs table {tb['format']!r}")
        if word(d.get("manufacturer", [])) != tb["manufacturer"]:
            failures.append(f"(a) {name}: manufacturer {word(d.get('manufacturer', []))!r}")
        if tb["membrane"] is None:
            if "membrane" in d:
                failures.append(f"(a) {name}: a flat cell must not name a membrane")
            for k in ("slotDepth", "slotWidth"):
                if k not in d:
                    failures.append(f"(a) {name}: flat cell lacks `{k}`")
            if "leafLength" in d:
                failures.append(f"(a) {name}: a flat cell must not store a leaf length (it is A/slotWidth, derived)")
        else:
            if word(d.get("membrane", [])) != tb["membrane"]:
                failures.append(f"(a) {name}: membrane {word(d.get('membrane', []))!r} vs table {tb['membrane']!r}")
            if "leafLength" not in d:
                failures.append(f"(a) {name}: spiral lacks `leafLength`")
        for k, v in tb["values"].items():
            if k in d and not close(si(d[k]), v):
                failures.append(f"(a) {name}: {k} = {si(d[k])} vs the document's {v}")
        lim = d.get("limits", {})
        for k, v in tb["limits"].items():
            if k not in lim:
                failures.append(f"(a) {name}: limits.{k} missing")
            elif not close(si(lim[k]), v):
                failures.append(f"(a) {name}: limits.{k} = {si(lim[k])} vs the document's {v}")
        for k in tb.get("absentLimits", []):
            if k in lim:
                failures.append(f"(a) {name}: limits.{k} declared but the document states none")
        if "ratedTest" in tb:
            rt = d.get("ratedTest", {})
            if word(rt.get("solute", [])) != tb["ratedSolute"]:
                failures.append(f"(a) {name}: ratedTest.solute {word(rt.get('solute', []))!r}")
            for k, v in tb["ratedTest"].items():
                if k not in rt:
                    failures.append(f"(a) {name}: ratedTest.{k} missing")
                elif not close(si(rt[k]), v):
                    failures.append(f"(a) {name}: ratedTest.{k} = {si(rt[k])} vs the sheet's {v}")
        elif "ratedTest" in d:
            failures.append(f"(a) {name}: a cell has no rated test")
        if "availableSpacers" in tb:
            sp = d.get("availableSpacers", [])
            if len(sp) != len(tb["availableSpacers"]) or not all(close(a, b, 1e-3) for a, b in zip(sp, tb["availableSpacers"])):
                failures.append(f"(a) {name}: availableSpacers {sp} vs the manual's {tb['availableSpacers']}")
        prov = d.get("provenance", {})
        if tb["source"] not in word(prov.get("source", [])):
            failures.append(f"(a) {name}: provenance.source does not name {tb['source']!r}")
        # every estimate marked, noted, reviewed; no data-sheet value marked
        for k, v in tb["estimates"].items():
            blk = prov.get(k)
            if not isinstance(blk, dict):
                failures.append(f"(a) {name}: `{k}` is not in the document and carries no provenance block")
                continue
            if word(blk.get("origin", [])) != "estimate":
                failures.append(f"(a) {name}: `{k}` provenance origin {word(blk.get('origin', []))!r}, must be `estimate`")
            if word(blk.get("reviewStatus", [])) != "unverified":
                failures.append(f"(a) {name}: `{k}` reviewStatus {word(blk.get('reviewStatus', []))!r}, must be `unverified`")
            if len(word(blk.get("notes", []))) < 20 or "verif" not in word(blk.get("notes", [])):
                failures.append(f"(a) {name}: `{k}` carries no note saying how it is to be verified")
            if k in d and not close(si(d[k]), v, 1e-3):
                failures.append(f"(a) {name}: estimate `{k}` = {si(d[k])} is not the recorded educated value {v}")
        for k, blk in prov.items():
            if isinstance(blk, dict) and word(blk.get("origin", [])) == "estimate" and k not in tb["estimates"]:
                failures.append(f"(a) {name}: `{k}` is a data-sheet value and is marked as an estimate")
    for name in TABLE:
        if name not in records:
            failures.append(f"(a) record '{name}' not found in {ASSETS}")

    # ---------------- (b) the announcement, per witness ---------------------
    outs = {}
    for case, name in ((M15, "NF270-4040"), (M16, "SW30HR-380"), (M17, "SEPA_CF")):
        rc, out = run(case)
        outs[case] = (rc, out)
        if rc != 0:
            failures.append(f"(b) {case.name} did not run (exit {rc}):\n" + out[-800:])
            continue
        lines = estimate_lines(out, name)
        want = set(TABLE[name]["estimates"])
        got = {k for k, _, _ in lines}
        if got != want or len(lines) != len(want):
            failures.append(f"(b) {case.name}: announced estimates {sorted(got)} ({len(lines)} lines) vs the record's {sorted(want)}")
        prov = records.get(name, {}).get("provenance", {})
        for k, status, note in lines:
            if status != "unverified":
                failures.append(f"(b) {case.name}: `{k}` announced with reviewStatus {status}")
            if k in prov and word(prov[k].get("notes", [])) not in note:
                failures.append(f"(b) {case.name}: the announced note for `{k}` is not the record's")
        other = re.findall(r"\[estimate\] module '(\w[\w-]*)'", out)
        if any(o != name for o in other):
            failures.append(f"(b) {case.name}: estimate lines for a module the case does not use: {set(other) - {name}}")
        j = result_of(out)
        adv = [a for a in (j or {}).get("advisories", [])
               if a.get("category") == "provenance" and a.get("locus") == f"module '{name}'"]
        if len(adv) != len(want):
            failures.append(f"(b) {case.name}: {len(adv)} provenance advisories on the module's locus vs {len(want)} estimates")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        # ---------------- (c) the refusals ---------------------------------
        def refusal(label, src, mutate, must):
            dd = tmp / label
            copy_case(src, dd)
            mutate(dd)
            rc, out = run(dd)
            missing = [m for m in must if m not in out]
            if rc == 0 or missing:
                failures.append(f"(c) {label}: exit {rc}, refusal text missing {missing}:\n" + out[-500:])

        def add_op(dd, line):
            p = dd / "system/flowsheetDict"
            p.write_text(p.read_text().replace("P_permeate       1.0 bar;", "P_permeate       1.0 bar;\n            " + line, 1))

        refusal("inlineArea", M15, lambda dd: add_op(dd, "area 7.6 m2;"), ["`area`", "one home", "NF270-4040"])
        def inline_channel(dd):
            p = dd / "system/flowsheetDict"
            p.write_text(p.read_text().replace("model          SchockMiquel;\n                viscosity      0.89e-3;",
                                               "model          SchockMiquel;\n                channelHeight  0.7 mm;\n                viscosity      0.89e-3;", 1))
        refusal("inlineChannel", M15, inline_channel, ["`massTransfer.channelHeight`", "one home"])
        refusal("spiralPlusMembrane", M15, lambda dd: add_op(dd, "membrane NF270;"), ["`membrane`", "one home"])

        def drop_membrane(dd):
            p = dd / "system/flowsheetDict"
            p.write_text(re.sub(r"membrane\s+NF270_sdem_NaCl;[^\n]*\n", "", p.read_text()))
        refusal("cellNoMembrane", M17, drop_membrane, ["flat-sheet cell", "`membrane <name>;`"])

        def unknown(dd):
            p = dd / "system/flowsheetDict"
            p.write_text(p.read_text().replace("module           NF270-4040;", "module           NF270-4041;"))
        refusal("unknownModule", M15, unknown, ["NF270-4041", "Registered", "NF270-4040", "SEPA_CF", "SW30HR-380"])

        # ---------------- (d) the channel, from what was published ----------
        def section_check(case, name, unit, faces, L_expected, spec_phrase):
            rc, out = outs[case]
            j = result_of(out) if rc == 0 else None
            if j is None:
                return
            d = records[name]
            A = si(d["activeArea"]); h = si(d["channelHeight"]); eps = si(d["spacerPorosity"])
            u = j["kpis"][unit].get("u_crossflow_inlet")
            if u is None:
                failures.append(f"(d) {case.name}: no u_crossflow_inlet published")
                return
            Q = j["streams"]["feed"]["F_mass"] / 1000.0          # rho_feed default
            W = A / (faces * L_expected)
            if not close(u * W * h * eps, Q, 1e-9):
                failures.append(f"(d) {case.name}: u W h eps = {u * W * h * eps:.6e} vs Q_feed {Q:.6e} with W = A/({faces} L)")
            z = j["profiles"][unit]["columns"]["z"]
            if not close(z[-1], L_expected, 1e-9):
                failures.append(f"(d) {case.name}: the profile's last z {z[-1]} is not the channel length {L_expected}")
            if spec_phrase not in out:
                failures.append(f"(d) {case.name}: the [spec] line does not say {spec_phrase!r}")
        sepa = records.get("SEPA_CF", {})
        if sepa:
            section_check(M17, "SEPA_CF", "cell", 1.0, si(sepa["activeArea"]) / si(sepa["slotWidth"]),
                          "W = A/(1 L)")
        nf = records.get("NF270-4040", {})
        if nf:
            section_check(M15, "NF270-4040", "NF", 2.0, si(nf["leafLength"]), "W = A/(2 L)")

        # ---------------- (e) the limits ---------------------------------------
        dd = tmp / "overLimit"
        copy_case(M15, dd)
        f = dd / "0/feed"
        f.write_text(f.read_text().replace("P               4.8 bar;", "P               60 bar;")
                     .replace("water   144.04 kmol/h;", "water   277.0 kmol/h;")
                     .replace("NaCl    0.08898 kmol/h;", "NaCl    0.1711 kmol/h;"))
        rc, out = run(dd)
        if rc != 0:
            failures.append("(e) the over-limit probe REFUSED -- a limit announces, it does not refuse:\n" + out[-500:])
        else:
            if not re.search(r"\[limit\] module 'NF270-4040': feed P 60\.00 bar EXCEEDS the maximum operating pressure 41\.00 bar", out):
                failures.append("(e) the 60 bar probe printed no P_max [limit] line")
            if not re.search(r"\[limit\] module 'NF270-4040': feed flow 5\.\d+ m3/h EXCEEDS the maximum feed flow 3\.600 m3/h", out):
                failures.append("(e) the 5 m3/h probe printed no feedFlow_max [limit] line")
            j = result_of(out)
            if j is None or sum(1 for a in j["advisories"] if a.get("category") == "rating" and a.get("locus") == "module 'NF270-4040'") < 2:
                failures.append("(e) the limit violations did not reach the advisories")
        for case in (M15, M16, M17):
            rc, out = outs[case]
            if rc == 0 and "[limit]" in out:
                failures.append(f"(e) {case.name} runs inside its ratings and still printed a [limit] line")

        # ---------------- (f) the rated test, measured -------------------------
        measured = []
        for case, name, unit in ((M15, "NF270-4040", "NF"), (M16, "SW30HR-380", "RO")):
            tb = TABLE[name]; rt = tb["ratedTest"]; sol = tb["ratedSolute"]
            dd = tmp / ("rated_" + name)
            copy_case(case, dd)
            Qf = rt["permeateFlow"] / rt["recovery"]                 # m3/s the sheet's recovery implies
            w = rt["feedMassFraction"]
            F_sol = Qf * 1000.0 * w / MW[sol] * 3600.0                # kmol/h at rho 1000
            F_w = Qf * 1000.0 * (1.0 - w) / MW["water"] * 3600.0
            (dd / "constant/thermoPhysPropDict").write_text(
                re.sub(r"components\s*\([^)]*\);", f"components       ( water  {sol} );",
                       (dd / "constant/thermoPhysPropDict").read_text()))
            feed = dd / "0/feed"
            feed.write_text(re.sub(r"componentMolarFlows\s*\{[^}]*\}",
                                   "componentMolarFlows\n{\n    water   %.6f kmol/h;\n    %s    %.6f kmol/h;\n}" % (F_w, sol, F_sol),
                                   feed.read_text()).replace("T               298.15 K;", "T               %.2f K;" % rt["T"])
                            .replace("P               4.8 bar;", "P               %.3f bar;" % (rt["P"] / 1e5))
                            .replace("P               55 bar;", "P               %.3f bar;" % (rt["P"] / 1e5)))
            for s in ("permeate", "retentate"):
                if (dd / "0" / s).exists():
                    (dd / "0" / s).unlink()
            env = dict(os.environ, CHOUPO_HOME=str(ROOT))
            subprocess.run([str(ROOT / "bin/choupo-init0"), str(dd)], capture_output=True, text=True, env=env, timeout=300)
            rc, out = run(dd)
            j = result_of(out) if rc == 0 else None
            if j is None:
                failures.append(f"(f) the rated-test probe of {name} did not run (exit {rc}):\n" + out[-600:])
                continue
            k = j["kpis"][unit]
            A = si(records[name]["activeArea"])
            perm_m3d = k["J_w_avg"] * A * 86400.0
            R = k[f"R_obs_{sol}"]
            measured.append((name, perm_m3d, rt["permeateFlow"] * 86400.0, R, rt["rejection"], k["water_recovery"]))
            print(f"  [rated test] {name}: {w * 1e6:.0f} ppm {sol}, {rt['P'] / 1e5:.1f} bar, {rt['T']:.2f} K, feed {Qf * 86400:.1f} m3/d --"
                  f" engine permeate {perm_m3d:.2f} m3/d (recovery {k['water_recovery'] * 100:.1f} %), rejection {R * 100:.2f} %"
                  f"   | data sheet: {rt['permeateFlow'] * 86400:.1f} m3/d at {rt['recovery'] * 100:.0f} %, rejection {rt['rejection'] * 100:.2f} %"
                  f"   (ratio permeate {perm_m3d / (rt['permeateFlow'] * 86400):.2f}x -- a MEASUREMENT of the fitted A_w, not a verdict)")

    if failures:
        print("check_membrane_modules: FAILED")
        for f in failures:
            print("  " + f)
        return 1
    print("check_membrane_modules: OK -- 3 `kind membraneModule` records (NF270-4040, SW30HR-380, SEPA_CF) match a second "
          "transcription of their documents on every data-sheet value, mark every value the document does not state "
          "`origin estimate; reviewStatus unverified;` with a note saying how to verify it and mark no data-sheet value so; "
          "membrane15/16/17 announce exactly those estimates (3/2/2 lines, the record's own note, a provenance advisory each) "
          "and no [limit] line; 5 refusals fire by name (inline area / channelHeight / membrane beside a spiral module, a cell "
          "without a membrane, an unknown module with the registered list); the published inlet crossflow recomputes the feed "
          "flow on W = A/L for the cell (one face, L = A/slotWidth) and A/(2L) for the spiral to 1e-9; a 60 bar, 5 m3/h twin "
          "prints both [limit] lines and exits 0; the two spirals' rated tests ran and printed engine vs data sheet.  "
          "NOT CHECKED: whether any estimate is a good one, the transcription against the PDFs, any band on the rated-test "
          "ratio, the batch vessel, DSPM-DE under a module, the pH limit (no witness declares a pH).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
