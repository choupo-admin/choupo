#!/usr/bin/env python3
"""Census of component records whose `Vliq` may not be a liquid molar volume at 298.15 K.

    python3 data/curation/batches/vliq_datum_temperature/census.py [--all]

Reads data/standards/components/*.dat (read-only) and prints one TSV row per flagged record:
  T-STATED          the Vliq line (or its provenance block) states a temperature other than 25 C
  NOT-LIQ           the comment names a quantity that is not a pure-liquid molar volume
  TC-LOW            Tc < 298.15 K and no stated temperature: no liquid exists at 25 C
  TC-NEAR           298.15 <= Tc < 330 K and no stated temperature: near-critical liquid at 25 C
  TC-NEAR-STATED25  Tc < 330 K and the record says 25 C / 298 K: a stated 25 C claim on a record whose
                    liquid is near-critical or metastable; listed so it is READ, not assumed right
A record stating 25 C with Tc >= 330 K (or no Tc) is not flagged.  `--all` also lists every Vliq line.
"""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[3] / "standards" / "components"
NOT25 = re.compile(r"(?:at|@)\s*(Tb|Tm|Tc|[0-9]+(?:\.[0-9]+)?\s*K\b|[0-9]+(?:\.[0-9]+)?\s*(?:C|degC)\b)", re.I)
NOTLIQ = re.compile(r"apparent|in aqueous solution|in solution|partial molar", re.I)


def read(p):
    txt = p.read_text(errors="replace")
    vl = None
    for line in txt.splitlines():
        m = re.match(r"\s*Vliq\s+([0-9.eE+-]+)\s*;(.*)$", line)
        if m:
            vl = (m.group(1), m.group(2).strip())
            break
    tc = re.search(r"^\s*Tc\s+([0-9.eE+-]+)\s*;", txt, re.M)
    pm = re.search(r"provenance\s*\{.*?Vliq\s*\{(.*?)\}", txt, re.S)
    return vl, (float(tc.group(1)) if tc else None), (pm.group(1).strip() if pm else "")


def main():
    rows = []
    for p in sorted(root.glob("*.dat")):
        vl, tc, prov = read(p)
        if vl is None:
            continue
        val, com = vl
        cls, note = None, ""
        m = NOT25.search(com + " " + prov)
        is25 = m is not None and (re.search(r"^(?:at|@)\s*25\s*C", m.group(0), re.I) or "298" in m.group(0))
        if NOTLIQ.search(com):
            cls = "NOT-LIQ"
        elif m and not is25:
            cls, note = "T-STATED", m.group(0)
            if tc is None:
                note += " (no Tc)"
        elif tc is not None and tc < 298.15 and not m:
            cls = "TC-LOW"
        elif tc is not None and tc < 330 and not m:
            cls = "TC-NEAR"
        elif tc is not None and tc < 330:
            cls = "TC-NEAR-STATED25"
        if cls or "--all" in sys.argv:
            rows.append((p.stem, val, tc if tc is not None else "", cls or "ok", note, com))
    print("record\tVliq_m3_mol\tTc_K\tclass\tstated_temperature\trecord_comment")
    for r in rows:
        print("\t".join(str(x) for x in r))


main()
