#!/usr/bin/env python3
"""D1 data: the liquid densities PRINTED in Wagner & Pruss (2002), J. Phys.
Chem. Ref. Data 31, 387-535, Table 13.1 (saturated liquid) and Table 13.2
(single phase, isobars), read from the article's PDF text layer with the
journal page of each value.

usage: extract_iapws95_table.py <wagner2002-iapws95.pdf> > d1_water_iapws95.tsv

The uncertainty statements of the article (Sec. 6.3.2) are quoted in the
design note with their page, not carried per row.
"""
import re, subprocess, sys

PRESSURES = {"0.1 MPa": 0.1, "0.101 325 MPa": 0.101325, "10.0 MPa": 10.0, "25.0 MPa": 25.0,
             "50.0 MPa": 50.0, "100 MPa": 100.0}
TMAX = 375.0


def pages(pdf):
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True,
                         text=True, check=True).stdout
    return txt.split("\f")


def printed_page(chunk):
    for line in chunk.splitlines():
        if line.strip():
            m = re.match(r"^\s*(\d{3})\s+W\. WAGNER", line) or re.search(r"ORDINARY WATER\s+(\d{3})\s*$", line)
            return int(m.group(1)) if m else None
    return None


def main(pdf):
    pg = pages(pdf)
    rows = []
    # ---- Table 13.1: saturated liquid ----
    for chunk in pg:
        if "TABLE 13.1." not in chunk:
            continue
        p = printed_page(chunk)
        for line in chunk.splitlines():
            m = re.match(r"^\s*(\d{3}(?:\.\d+)?)\s*[a-z]?\s+(\d\.\d{3}(?: \d+)?)\s+(\d{3,4}\.\d{3})\s", line)
            if m and float(m.group(1)) <= TMAX:
                psat = float(m.group(2).replace(" ", ""))
                rows.append(("sat", float(m.group(1)), psat, float(m.group(3)), "13.1", p))
    # ---- Table 13.2: isobars ----
    cur = None
    for chunk in pg:
        if "TABLE 13.2." not in chunk:
            continue
        p = printed_page(chunk)
        lines = chunk.splitlines()
        i = 0
        while i < len(lines):
            line = lines[i]
            hdr = re.match(r"^\s*([0-9. ]+ MPa)\s*$", line)
            if hdr:
                cur = PRESSURES.get(hdr.group(1).strip())
                i += 1
                continue
            if cur is not None:
                m = re.match(r"^\s*(\d{3}(?:\.\d+)?)\s*([a-c])?\s+(\d{3,4}\.\d+)\s", line)
                m2 = re.match(r"^\s*(\d{3}\.\d+)\s*([a-c])\s*$", line)   # T alone, rho on next line
                if m2 and i + 1 < len(lines):
                    mm = re.match(r"^\s*(\d{3,4}\.\d+)\s", lines[i + 1])
                    if mm and float(m2.group(1)) <= TMAX:
                        rows.append(("iso", float(m2.group(1)), cur, float(mm.group(1)), "13.2", p))
                elif m and float(m.group(1)) <= TMAX and (m.group(2) or "") != "c":
                    rows.append(("iso", float(m.group(1)), cur, float(m.group(3)), "13.2", p))
            i += 1
    print("kind\tT_K\tp_MPa\trho_kg_m3\ttable\tpage\tstatus")
    seen = set()
    for kind, T, P, rho, tab, p in rows:
        key = (kind, T, P)
        if key in seen:
            continue
        seen.add(key)
        print(f"{kind}\t{T}\t{P}\t{rho}\t{tab}\t{p}\ttranscribedNotCheckedAgainstArticle")


if __name__ == "__main__":
    main(sys.argv[1])
