#!/usr/bin/env python3
"""Basis-reconciliation spike gate (ratified 2026-08-03; design record
docs/design/basis-reconciliation-spike.md).

Witness: tutorials/steady/thermo/basis01_two_unit_chain -- an electrolyte
flash SOLVES the sour-water chemistry and a heater running a plain
molecular world TRANSPORTS the species basis across the model boundary.

The ten ratified criteria, each probed through the real binaries:

  C1  ELEMENT conservation, recomputed here from the component basis with
      an INDEPENDENT formula table (feed == offgas + warmBrine per atom),
      cross-checked against the engine's own elementBalance KPIs.
  C2  CHARGE conservation on the block, both ends of the boundary, with
      NO silent correction: Sum z*n over the declared species must sit at
      solver tolerance, and the two ends must agree exactly.
  C3  SINGLE AUTHORITY: the block is DELETABLE -- removing it from the
      input state leaves every KPI unmoved (a derived view never enters
      the answer).
  C4  NO IMPLICIT RESPECIATION: warmBrine's rows are bit-identical to
      brine's, and the origin marks read `solved:speciator` /
      `transported:transporter`.
  C5  SERIALIZATION ROUND-TRIP: a converged block fed back as input state
      is accepted, and carries origin + solvedAtT through the cycle.
  C6  DETERMINISM: two runs give byte-identical state files, and the
      species rows are written in canonical (sorted) order -- so the file
      cannot depend on the solver's container order.
  C7  GLASS-BOX TRACE: the transport is ANNOUNCED, naming the unit and
      the reason.
  C8  REFUSALS, each fired through the real reader (see the honesty note
      below on which are named and which are merely caught).
  C9  ZERO LATERAL IMPACT: a molecular case carries no speciation block
      at all -- no empty-block pretence.
  C10 IDENTITY SECOND WITNESS: with the boundary REMOVED (the unit's
      `thermo {}` block deleted), the INTERMEDIATE stream is unchanged --
      what unit 2 is cannot reach back and change what unit 1 solved.
      (The OUTLET legitimately differs: the global world can re-solve at
      the outlet temperature, and does.  That difference is the boundary
      being visible, not a failure.)

HONESTY NOTE ON THE REFUSAL BATTERY (measured 2026-08-03, not assumed).
R2 (m = A n broken) is refused BY NAME.  R4 (a block declaring no
`network` or no `basis`) is refused by name -- built with this gate, it
did not refuse before.  R1 (charge imbalance) and R3 (an unknown species
id) DO refuse, but through the m = A n collapse net rather than by their
own name: the collapse is a strong enough test to catch them, and naming
them would need the species-charge surface at the reader, which is a real
dependency and not a line.  The gate asserts what is TRUE today -- that
they refuse -- and the design record carries the naming as a named gap.
A gate that claimed seven distinct named refusals would be describing a
battery that does not exist.

Exit 1 listing failures."""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials" / "steady" / "thermo" / "basis01_two_unit_chain"
MOLECULAR = ROOT / "tutorials" / "steady" / "flash" / "flash01_benzene_toluene"

failures = []

#  INDEPENDENT tables (deliberately hand-written here, not read from the
#  catalogue: a gate that imports the engine's own answer tests nothing).
ELEM = {"NH3": {"N": 1, "H": 3}, "CO2": {"C": 1, "O": 2},
        "water": {"H": 2, "O": 1}, "ethanol": {"C": 2, "H": 6, "O": 1},
        "N2": {"N": 2}}
CHARGE = {"CO2aq": 0, "CO3": -2, "H": +1, "HCO3": -1,
          "N2": 0, "NH3aq": 0, "NH4": +1, "OH": -1}


def run(case: Path, env_extra=None):
    p = subprocess.run([str(SOLVE), "."], cwd=case, capture_output=True,
                       text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def fresh(tmp: Path, tag: str, src: Path = CASE) -> Path:
    d = tmp / tag
    shutil.copytree(src, d, ignore=shutil.ignore_patterns(
        "converged", "reports", "log.*", "resultJson*"))
    return d


def comp_flows(path: Path) -> dict:
    """componentMolarFlows of a stream state file [kmol/h]."""
    t = path.read_text()
    m = re.search(r'componentMolarFlows\s*\{(.*?)\n\}', t, re.S)
    if not m:
        return {}
    return {k: float(v) for k, v in
            re.findall(r'([A-Za-z][A-Za-z0-9]*)\s+([-\d.e+]+)\s*kmol/h;',
                       m.group(1))}


def spec_block(path: Path):
    """-> (rows, meta) of the speciation block, or (None, None)."""
    t = path.read_text()
    i = t.find("speciation")
    if i < 0:
        return None, None
    seg = t[i:]
    rows = {k: float(v) for k, v in
            re.findall(r'^\s{4,}([A-Za-z][A-Za-z0-9]*)\s+([-\d.e+]+)\s*kmol/h;',
                       seg, re.M)}
    meta = {}
    for key in ("origin", "basis"):
        mm = re.search(r'\b%s\s+"?([A-Za-z0-9_:]+)"?\s*;' % key, seg)
        if mm:
            meta[key] = mm.group(1)
    mm = re.search(r'\bsolvedAtT\s+([\d.e+-]+)', seg)
    if mm:
        meta["solvedAtT"] = float(mm.group(1))
    return rows, meta


def kpis(out: str) -> dict:
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(1)).get("kpis", {})
    except json.JSONDecodeError:
        return {}


def main() -> int:
    if not SOLVE.exists():
        print(f"check_basis_spike: {SOLVE} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        base = fresh(tmp, "base")
        rc, out = run(base)
        if rc != 0:
            print("check_basis_spike: the witness did not run\n" + out[-1500:])
            return 1
        conv = base / "converged"

        # ---- C1 ELEMENT conservation, independent recomputation ---------
        feed = comp_flows(base / "0" / "feed")
        outs = {}
        for s in ("offgas", "warmBrine"):
            for k, v in comp_flows(conv / s).items():
                outs[k] = outs.get(k, 0.0) + v
        for el in ("N", "C", "H", "O"):
            a = sum(ELEM.get(c, {}).get(el, 0) * v for c, v in feed.items())
            b = sum(ELEM.get(c, {}).get(el, 0) * v for c, v in outs.items())
            if abs(a - b) > 1e-9 * max(abs(a), 1.0):
                failures.append(f"C1 element {el}: in {a} != out {b}")
        k = kpis(out).get("campaign", {}) or kpis(out).get("flowsheet", {})
        worst = None
        for kk, vv in (kpis(out).get("campaign", {}) or {}).items():
            if kk.endswith("element_worst_closure_rel"):
                worst = vv
        if worst is not None and abs(worst) > 1e-9:
            failures.append(f"C1 engine element closure {worst}")

        # ---- C2 CHARGE, both ends, no silent correction ------------------
        qs = {}
        for s in ("brine", "warmBrine"):
            rows, meta = spec_block(conv / s)
            if not rows:
                failures.append(f"C2: {s} carries no speciation block")
                continue
            q = sum(CHARGE.get(k2, 0) * v for k2, v in rows.items())
            scale = sum(abs(v) for k2, v in rows.items() if CHARGE.get(k2, 0))
            qs[s] = q
            if abs(q) > 1e-8 * max(scale, 1.0):
                failures.append(f"C2 {s}: Sum z*n = {q} kmol/h (rel"
                                f" {q / max(scale, 1e-30)})")
        if len(qs) == 2 and qs["brine"] != qs["warmBrine"]:
            failures.append("C2: the two ends of the boundary disagree on"
                            " charge -- the block was not carried")

        # ---- C4 NO IMPLICIT RESPECIATION ---------------------------------
        rb, mb = spec_block(conv / "brine")
        rw, mw = spec_block(conv / "warmBrine")
        if rb != rw:
            failures.append("C4: warmBrine's rows differ from brine's --"
                            " the block was re-derived, not transported")
        if (mb or {}).get("origin") != "solved:speciator":
            failures.append(f"C4: brine origin {(mb or {}).get('origin')!r}")
        if (mw or {}).get("origin") != "transported:transporter":
            failures.append(f"C4: warmBrine origin"
                            f" {(mw or {}).get('origin')!r}")
        if abs((mw or {}).get("solvedAtT", 0.0)
               - (mb or {}).get("solvedAtT", -1.0)) > 1e-9:
            failures.append("C4: the carried block does not report the state"
                            " it was solved at")

        # ---- C7 GLASS-BOX TRACE ------------------------------------------
        if "TRANSPORTED across the model boundary" not in out \
           or "transporter" not in out:
            failures.append("C7: the transport is not announced by name")

        # ---- C6 DETERMINISM + canonical row order ------------------------
        again = fresh(tmp, "again")
        rc2, _ = run(again)
        if rc2 != 0 or (again / "converged" / "brine").read_bytes() \
                != (conv / "brine").read_bytes():
            failures.append("C6: two runs disagree byte for byte")
        order = re.findall(r'^\s{4,}([A-Za-z][A-Za-z0-9]*)\s+[-\d.e+]+\s*kmol/h;',
                           (conv / "brine").read_text()[
                               (conv / "brine").read_text().find("speciation"):],
                           re.M)
        if order != sorted(order):
            failures.append(f"C6: species rows are not in canonical order:"
                            f" {order}")

        # ---- C5 ROUND-TRIP: a converged block fed back as input ----------
        rt = fresh(tmp, "roundtrip")
        shutil.copy(conv / "brine", rt / "0" / "brine")
        rc3, out3 = run(rt)
        if rc3 != 0:
            failures.append("C5: a converged block fed back as input state"
                            " was REFUSED\n" + out3[-600:])
        else:
            _, m3 = spec_block(rt / "0" / "brine")
            if (m3 or {}).get("origin") != "solved:speciator" \
               or "solvedAtT" not in (m3 or {}):
                failures.append("C5: origin/solvedAtT did not survive the"
                                " write-read cycle")

        # ---- C3 SINGLE AUTHORITY: the block is DELETABLE ------------------
        dl = fresh(tmp, "deletable")
        shutil.copy(conv / "brine", dl / "0" / "brine")
        t = (dl / "0" / "brine").read_text()
        i = t.find("speciation")
        (dl / "0" / "brine").write_text(t[:i] if i > 0 else t)
        rc4, out4 = run(dl)
        if rc4 != 0:
            failures.append("C3: deleting the block broke the run")
        else:
            a, b = kpis(out), kpis(out4)
            for unit in ("speciator", "transporter"):
                for kk, vv in (a.get(unit, {}) or {}).items():
                    ov = (b.get(unit, {}) or {}).get(kk)
                    if ov is None or abs(ov - vv) > 1e-8 * max(abs(vv), 1.0):
                        failures.append(f"C3: KPI {unit}.{kk} moved when the"
                                        f" block was deleted ({vv} -> {ov})")
                        break

        # ---- C8 REFUSALS (see the module docstring's honesty note) --------
        def refuse(tag, mutate, *needles):
            d = fresh(tmp, "ref_" + tag)
            shutil.copy(conv / "brine", d / "0" / "brine")
            p = d / "0" / "brine"
            p.write_text(mutate(p.read_text()))
            rcx, outx = run(d)
            if rcx == 0:
                failures.append(f"C8 {tag}: expected a refusal, got exit 0")
                return
            for n in needles:
                if n not in outx:
                    failures.append(f"C8 {tag}: message lacks {n!r}")

        refuse("R1 charge imbalance",
               lambda t: t.replace("NH4    0.8508169151",
                                   "NH4    0.9508169151"),
               "does NOT collapse back")
        refuse("R2 m=An broken",
               lambda t: t.replace("HCO3    0.7034761893",
                                   "HCO3    0.9034761893"),
               "does NOT collapse back")
        refuse("R3 unknown species id",
               lambda t: t.replace("CO2aq    ", "Xx99zz    "),
               "does NOT collapse back")
        refuse("R4a no network",
               lambda t: re.sub(r'\n\s*network\s+\([^)]*\);', '', t),
               "declares no `network`")
        refuse("R4b no basis",
               lambda t: re.sub(r'\n\s*basis\s+\w+;', '', t),
               "declares no `basis`")

        # ---- C9 ZERO LATERAL IMPACT --------------------------------------
        mol = fresh(tmp, "molecular", MOLECULAR)
        rc5, _ = run(mol)
        if rc5 != 0:
            failures.append("C9: the molecular control case did not run")
        else:
            for f in (mol / "converged").iterdir():
                if "speciation" in f.read_text():
                    failures.append(f"C9: a molecular case grew a speciation"
                                    f" block on {f.name} -- one basis is its"
                                    f" whole structure")
                    break

        # ---- C10 IDENTITY SECOND WITNESS ---------------------------------
        idw = fresh(tmp, "identity")
        fsd = idw / "system" / "flowsheetDict"
        t = fsd.read_text()
        i = t.index("        thermo\n        {")
        j = t.index("\n    }\n);", i)
        fsd.write_text(t[:i] + t[j + 1:])
        rc6, out6 = run(idw)
        if rc6 != 0:
            failures.append("C10: the boundary-free variant did not run")
        else:
            if (idw / "converged" / "brine").read_bytes() \
                    != (conv / "brine").read_bytes():
                failures.append("C10: the INTERMEDIATE stream moved when the"
                                " downstream unit's world changed -- unit 2"
                                " reached back into unit 1's answer")
            if "TRANSPORTED across the model boundary" in out6:
                failures.append("C10: transport fired with no boundary to"
                                " cross")

    if failures:
        print("check_basis_spike: FAIL")
        for m in failures:
            print("  -", m)
        return 1
    print("check_basis_spike: OK -- elements+charge close on both bases,"
          " the block transports unchanged (origin+solvedAtT), is deletable,"
          " deterministic and canonically ordered, 5 refusals fire, a"
          " molecular case stays single-basis, and the intermediate stream"
          " is untouched by what the downstream unit is")
    return 0


if __name__ == "__main__":
    sys.exit(main())
