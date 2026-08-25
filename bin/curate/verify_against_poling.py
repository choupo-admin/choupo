#!/usr/bin/env python3
"""Check the standard component catalogue against Appendix A of Poling,
Prausnitz & O'Connell, *The Properties of Gases and Liquids*, 5th ed.

    bin/curate/verify_against_poling.py <appendixA.pdf|.txt> [--write-report]

WHY THIS IS A TOOL AND NOT A GATE
=================================
The appendix is copyrighted and is NOT in this repository; it never will be
(the licence policy excludes no-grant sources, and this one is published with
TRC's permission to McGraw-Hill, not to us).  A curator who owns the book runs
this against their own copy.

That makes it structurally impossible to run in CI -- and by this project's own
rule, *a check that cannot run must not pass*.  So it is not wired into
`bin/runTests` and does not print a gate's OK line.  It prints a REPORT.  What
a gate could legitimately pin is the report's own conclusions once a curator
has accepted them, which is a separate decision and is Vitor's.

WHAT IT DOES NOT DO
===================
It NEVER writes a value from the appendix into the tree, and this script
contains no value from it.  Redistribution and verification are different acts:
reading a published table to ask whether our number agrees with it leaves their
table where it is.  A DISAGREEMENT is reported with both numbers, because a
finding a reader cannot evaluate is not a finding -- that is a handful of
values quoted in a verification context, not a copy of the table.

THE PARSE AUDITS ITSELF (Table A)
=================================
Table A prints Zc = PcVc/RTc, a REDUNDANT determination of three columns beside
it.  Every row is recomputed and a row whose Zc does not reproduce is DROPPED
and counted, never used.  This matters more than it looks: the columns are
ragged (a substance with no measured Tfp leaves a gap), so a column-assignment
error is entirely silent -- it produces plausible numbers in the wrong slots.

Table B (formation properties, DelHb, Vliq) has NO redundant column, so no row
of it can be confirmed the same way.  Three weaker things stand in, and they
are named as weaker rather than allowed to pass for the Zc audit:

  * a per-token OFFSET ceiling and a per-column PLAUSIBILITY RANGE, which
    reject a mis-slot rather than confirm a fit (see RANGES);
  * calibration of the columns from each block's own complete rows, which
    removes the failure that produced the worst false finding (see read_table);
  * and the fact that an AGREEMENT self-validates -- our value and a mis-parsed
    one do not coincide to four figures by accident.

So it is only the Table B DISAGREEMENTS that are ambiguous between "our value
is wrong" and "the parse is", and the report marks them for reading by hand
against the book.  That mark is PER VALUE, not per record: a substance whose
Table A row passed its Zc audit lends that confidence to nothing in Table B.

MATCHING IS BY CAS NUMBER, NEVER BY NAME.  The F2 contract's reason applies
here exactly: a name is not an identity, and the appendix's IUPAC names differ
from ours often enough that name matching would produce both misses and, worse,
false hits between isomers.
"""
import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPONENTS = ROOT / "data/standards/components"

R_CM3_BAR = 83.14462618      # cm3.bar/(mol.K) -- Pc in bar, Vc in cm3/mol

TABLE_A = ["MW", "Tfp", "Tb", "Tc", "Pc", "Vc", "Zc", "omega"]
TABLE_A_HDR = [r"Mol\. Wt\.", r"Tfp, K", r"Tb, K", r"Tc, K", r"Pc, bar",
               r"cm3 / mol", r"PcVc / RTc", r"Omega"]

TABLE_B = ["dHf", "dGf", "dHb", "dHm", "Vliq", "Tliq", "dipole"]
TABLE_B_HDR = [r"kJ / mol", r"kJ / mol", r"kJ / mol", r"kJ / mol",
               r"cm3 / mol", r"T liq, K", r"Debye"]

#  PLAUSIBILITY RANGES, and why Table B needs them where Table A does not.
#
#  Table A audits itself: Zc = PcVc/RTc is a redundant determination, so a
#  column-assignment error cannot survive it.  Table B has no such column, and
#  the first version of this script shipped without a substitute -- with the
#  result that it reported CO2's heat of vaporisation as disagreeing with
#  Appendix A by 106 %, when what it had picked up was CO2's GIBBS ENERGY OF
#  FORMATION, -394.38 kJ/mol.  CO2 sublimes, so its dHb cell is EMPTY, and an
#  order-preserving fit over a ragged row will happily slide the earlier
#  columns rightward to fill it.
#
#  *A finding a tool invents is worse than one it misses*, so the row is
#  rejected on two independent grounds: no assigned token may sit further than
#  MAX_OFFSET characters from its column's centre, and every assigned value
#  must lie in the range that quantity physically occupies.  Neither is a
#  correctness proof; together they turn a silent mis-slot into a counted
#  rejection, which is the difference that matters.
MAX_OFFSET = 6.0
#  A block needs this many COMPLETE rows before its column centres can be
#  measured from its own body.  Below it, the block is dropped rather than
#  fitted to its header -- see read_table.
MIN_CALIBRATION_ROWS = 4
RANGES = {
    "dHf":    (-3000.0, 1200.0),      # kJ/mol
    "dGf":    (-3000.0, 1200.0),
    "dHb":    (0.0, 200.0),           # a heat of vaporisation is positive
    "dHm":    (0.0, 100.0),           # ... and so is a heat of fusion
    "Vliq":   (5.0, 1000.0),          # cm3/mol
    "Tliq":   (10.0, 800.0),          # K
    "dipole": (0.0, 12.0),            # Debye
}

#  Which catalogue key each appendix column is compared against, and the
#  relative tolerance.  The tolerances are the tables' OWN printed precision,
#  not a band chosen to make things pass: Tc/Tb are given to 0.01 K on values
#  of a few hundred, Pc to 0.01 bar, omega to three decimals.
COMPARISONS = [
    # (catalogue key, appendix key, scale, rel tol, note)
    ("MW",     "MW",   1.0,      2e-4, "kg/kmol == g/mol"),
    ("Tc",     "Tc",   1.0,      1e-4, "K"),
    ("Pc",     "Pc",   1.0,      2e-4, "bar"),
    ("omega",  "omega", 1.0,     6e-3, "3 decimals in the table"),
    ("Tb",     "Tb",   1.0,      1e-4, "K"),
    ("HvapTb", "dHb",  1e-3,     3e-3, "J/mol vs kJ/mol"),
    #  Vliq is compared ONLY where the appendix's own `T liq` says 298.15 K.
    #  Our records carry the liquid molar volume at 25 C; the appendix carries
    #  it at whatever temperature the measurement was made -- 90 K for argon,
    #  193 K for HBr.  Comparing across that is not a disagreement about the
    #  substance, it is a disagreement about the temperature, and the first
    #  version of this script published eleven of them as findings.
    ("Vliq",   "Vliq", 1e6,      3e-3, "m3/mol vs cm3/mol, both at 298.15 K"),
]
VLIQ_T = 298.15


# ---------------------------------------------------------------------------
#  Reading the appendix
# ---------------------------------------------------------------------------
def to_text(path):
    """`pdftotext -layout` if given a PDF; the file itself if already text.

    The `-layout` flag is not optional: without it the columns collapse to a
    token stream and the gaps that make a row ragged become invisible."""
    if path.suffix.lower() != ".pdf":
        return path.read_text(encoding="utf-8", errors="replace")
    tmp = Path(tempfile.mkdtemp()) / "appendix.txt"
    r = subprocess.run(["pdftotext", "-layout", str(path), str(tmp)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"pdftotext failed on {path}: {r.stderr.strip()}")
    return tmp.read_text(encoding="utf-8", errors="replace")


def header_spans(line, pats):
    """x-centre of each numeric column, from this page's own header line."""
    out, pos = [], 0
    for p in pats:
        m = re.compile(p).search(line, pos)
        if not m:
            return None
        out.append((m.start() + m.end()) / 2.0)
        pos = m.end()
    return out


def assign(toks, hdr, cols):
    """Map a row's numeric tokens onto the header's columns.

    MONOTONE, not nearest-centre.  Nearest-centre was the first attempt and it
    failed in a way worth recording: a page whose header sits a few characters
    off its body loses EVERY row on it, silently -- ethanol and water both
    vanished that way while the run reported a confident total.  The columns
    appear in a fixed order and a row's tokens appear in that same order, so
    the right question is the cheapest ORDER-PRESERVING assignment.  That is a
    two-line dynamic program, and it is insensitive to a uniform shift."""
    n, m = len(toks), len(hdr)
    if n == 0 or n > m:
        return None
    INF = float("inf")
    best = [[INF] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    for j in range(m + 1):
        best[0][j] = 0.0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            skip = best[i][j - 1]
            take = best[i - 1][j - 1] + abs(toks[i - 1][0] - hdr[j - 1])
            best[i][j], back[i][j] = ((skip, "skip") if skip <= take
                                      else (take, "take"))
    if best[n][m] == INF:
        return None
    out, i, j = {}, n, m
    while i > 0 and j > 0:
        if back[i][j] == "take":
            if abs(toks[i - 1][0] - hdr[j - 1]) > MAX_OFFSET:
                return None           # a token nowhere near the slot it got
            out[cols[j - 1]] = toks[i - 1][1]
            i -= 1
        j -= 1
    if i != 0:
        return None
    for k, v in out.items():
        lo, hi = RANGES.get(k, (-float("inf"), float("inf")))
        if not (lo <= v <= hi):
            return None               # a value outside what the column can be
    return out


def row_tokens(ln):
    """(CAS, [(x-centre, value), ...]) for one table row, or None."""
    cas = re.search(r"\b(\d{2,7}-\d\d-\d)\b", ln)
    if not cas:
        return None
    #  pdftotext renders the appendix's minus sign as a private-use glyph;
    #  normalise the forms that appear BEFORE any number is read, or every
    #  negative formation enthalpy in Table B silently becomes positive.
    tail = ln[cas.end():]
    for g in ("\u2afa", "\u232a", "\u2013", "\u2212"):
        tail = tail.replace(g, "-")
    return cas.group(1), [
        (cas.end() + (m.start() + m.end()) / 2.0, float(m.group()))
        for m in re.finditer(r"-?\d+\.?\d*", tail)]


def read_table(text, cols, hdr_pats, audit):
    """Rows of one appendix table, keyed by CAS.

    A HEADER GOVERNS EVERY ROW UNTIL THE NEXT ONE.  Splitting on the form feed
    looked natural and was wrong -- pdftotext's page breaks do not fall where
    the appendix's own headers do, so half the table was orphaned from its
    column positions and skipped with nothing reporting the loss (209 rows
    where the table has 440).  Walking the file and letting each header start a
    new BLOCK assumes nothing about paging.

    THE COLUMNS ARE CALIBRATED FROM THE BODY, NOT FROM THE HEADER.  The header
    NAMES the columns; it does not reliably POSITION them.  pdftotext lays each
    page out on its own, and on some pages the header sits several characters
    off its own body -- invisible until a ragged row lands one slot to the left
    and reports R-245fa's CRITICAL TEMPERATURE of 427 K as a normal boiling
    point.  Nothing catches that on its own: 427 K is a plausible boiling
    point, that row carries no Zc to audit, and the disagreement it
    manufactures is indistinguishable from a finding.

    So each block's centres come from its COMPLETE rows -- the ones carrying
    one token per column, where the assignment is forced and no alignment has
    to be assumed.  A block with fewer than MIN_CALIBRATION_ROWS of them is
    DROPPED and counted, because a guessed alignment is exactly how the false
    finding above was produced."""
    rows, dropped = {}, 0
    blocks, cur = [], None
    for ln in text.splitlines():
        if "CAS #" in ln:
            hdr = header_spans(ln, hdr_pats)
            cur = {"rows": []} if hdr else None
            if cur is not None:
                blocks.append(cur)
            continue
        if cur is None:
            continue
        r = row_tokens(ln)
        if r:
            cur["rows"].append(r)

    for blk in blocks:
        full = [t for _, t in blk["rows"] if len(t) == len(cols)]
        if len(full) < MIN_CALIBRATION_ROWS:
            dropped += len(blk["rows"])
            continue
        centres = [sum(t[k][0] for t in full) / len(full)
                   for k in range(len(cols))]
        for cas, toks in blk["rows"]:
            vals = assign(toks, centres, cols)
            if not vals:
                dropped += 1
                continue
            if audit and all(vals.get(k) for k in ("Pc", "Vc", "Tc", "Zc")):
                z = vals["Pc"] * vals["Vc"] / (R_CM3_BAR * vals["Tc"])
                if abs(z - vals["Zc"]) > 0.0055:     # the table prints 3 dp
                    dropped += 1
                    continue
                vals["_audited"] = True
            rows.setdefault(cas, vals)
    return rows, dropped


# ---------------------------------------------------------------------------
#  Reading the catalogue
# ---------------------------------------------------------------------------
def read_catalogue():
    """Top-level scalars of every standard component record, keyed by CAS.

    A deliberately LOCAL reader, for the same reason the other curation gates
    have one: this compares what the FILES say against a published table, and
    routing it through the engine would mean auditing the loader with the
    loader.  Only top-level `key value;` lines are read -- everything compared
    here lives at that level."""
    out = {}
    for f in sorted(COMPONENTS.glob("*.dat")):
        txt = f.read_text(encoding="utf-8", errors="replace")
        #  strip block and line comments so a commented-out value is not read
        txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
        txt = re.sub(r"//[^\n]*", "", txt)
        cas = re.search(r"^CAS\s+(\S+?);", txt, re.M)
        if not cas:
            continue
        rec = {"_file": f.name}
        for m in re.finditer(r"^([A-Za-z_][A-Za-z0-9_]*)\s+"
                             r"(-?\d+\.?\d*(?:[eE][-+]?\d+)?)\s*;", txt, re.M):
            rec[m.group(1)] = float(m.group(2))
        out[cas.group(1)] = rec
    return out


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("appendix", type=Path,
                    help="your own copy of Appendix A (.pdf or pdftotext .txt)")
    ap.add_argument("--write-report", action="store_true",
                    help="also write data/local/polingVerification.md")
    args = ap.parse_args()
    if not args.appendix.exists():
        sys.exit(f"no such file: {args.appendix}")

    text = to_text(args.appendix)
    tA, dropA = read_table(text, TABLE_A, TABLE_A_HDR, audit=True)
    tB, dropB = read_table(text, TABLE_B, TABLE_B_HDR, audit=False)
    cat = read_catalogue()

    audited = sum(1 for v in tA.values() if v.get("_audited"))
    lines = []
    w = lines.append
    w("# Catalogue vs Poling App. A — verification report")
    w("")
    w(f"* Table A: **{len(tA)}** rows parsed, **{audited}** of them confirmed "
      f"by their own Zc = PcVc/RTc column; {dropA} row(s) rejected by that "
      "audit or unassignable and NOT used.")
    w(f"* Table B: **{len(tB)}** rows parsed, **0** confirmed — the table "
      "carries no redundant column, so nothing in it can be confirmed the "
      f"way Table A is; {dropB} row(s) were rejected by the offset and range "
      "guards, which reject a mis-slot without confirming a fit.")
    w(f"* Catalogue: **{len(cat)}** standard component records carry a CAS "
      "number and can be matched at all.")
    w("")

    #  THREE BANDS, NOT TWO.  A first version reported "agrees" and
    #  "disagrees", and the second bucket then held 142 entries of which most
    #  were third-decimal differences in an acentric factor -- which is not an
    #  error, it is two compilations.  Putting those beside a 15 % gap in a
    #  heat of vaporisation hides the gap and slanders the acentric factors.
    #
    #  REPRODUCES: within the appendix's own printed precision.  Our value and
    #  theirs are the same number, so ours is a faithful transcription of a
    #  lineage the appendix shares -- it says nothing about the measurement.
    #  DIFFERS SLIGHTLY: under NOTABLE, so a different compilation.
    #  NOTABLE: at or above it -- a curator's question, and the only band
    #  whose entries this report prints with both numbers.
    NOTABLE = 0.01
    same, near, notable, absent, skipped = [], [], [], [], []
    checked_records = set()
    for cas, rec in sorted(cat.items()):
        srcA, srcB = tA.get(cas, {}), tB.get(cas, {})
        if not srcA and not srcB:
            absent.append(rec["_file"])
            continue
        for key, akey, scale, tol, note in COMPARISONS:
            fromA = akey in srcA
            src = srcA if fromA else srcB
            ours, theirs = rec.get(key), src.get(akey)
            if ours is None or theirs in (None, 0.0):
                continue
            if akey == "Vliq":
                tliq = src.get("Tliq")
                if tliq is None or abs(tliq - VLIQ_T) > 0.5:
                    skipped.append((rec["_file"], tliq))
                    continue
            checked_records.add(rec["_file"])
            mine = ours * scale
            rel = abs(mine - theirs) / abs(theirs)
            #  THE AUDIT FLAG IS PER VALUE, NOT PER RECORD.  Zc audits Table A
            #  only; a dHb read out of Table B is unaudited even when the same
            #  substance's Table A row passed.  Carrying one flag for the whole
            #  record would have lent Table A's confidence to Table B's parse,
            #  which is the one thing the two-table split exists to prevent.
            aud = bool(srcA.get("_audited")) if fromA else False
            row = (rec["_file"], key, mine, theirs, rel, aud, "A" if fromA else "B")
            (same if rel <= tol else near if rel < NOTABLE else notable).append(row)

    w(f"Across **{len(checked_records)} record(s)** the appendix can speak "
      f"about, **{len(same)}** value(s) reproduce it to its own printed "
      f"precision, **{len(near)}** differ by less than {NOTABLE*100:g} % "
      f"(a different compilation, not an error), and **{len(notable)}** "
      f"differ by more.  {len(absent)} record(s) name a substance the "
      "appendix does not list, so nothing here speaks about them at all.")
    w("")
    if skipped:
        w(f"**{len(skipped)} liquid-volume comparison(s) were NOT made.**  The "
          "appendix states its Vliq at the temperature of the measurement "
          "while ours is at 25 C, and a volume compared across that is a "
          "disagreement about the temperature, not about the substance.  "
          "Neither agreement nor disagreement -- a question this table cannot "
          "answer: "
          + ", ".join(f"`{f}` ({'no T stated' if t is None else f'{t} K'})"
                      for f, t in sorted(skipped)) + ".")
        w("")
    #  PER QUANTITY, because the totals hide the sharpest thing in the run.
    #  Recomputed here rather than written into the prose of a design record:
    #  a measurement taken once and then remembered is a derived fact with a
    #  second home, which is the arity sin the doctrine is about.
    w("### By quantity")
    w("")
    w("| quantity | reproduces | differs < 1 % | differs >= 1 % |")
    w("|---|---|---|---|")
    for key, akey, *_ in COMPARISONS:
        n = [sum(1 for r in band if r[1] == key)
             for band in (same, near, notable)]
        if any(n):
            w(f"| {key} | {n[0]} | {n[1]} | {n[2]} |")
    w("")

    if notable:
        w(f"## The {len(notable)} differences worth a curator's eye")
        w("")
        w("| record | quantity | catalogue | Poling App. A | rel. | table | parse audited |")
        w("|---|---|---|---|---|---|---|")
        for f, k, mine, theirs, rel, aud, tbl in sorted(
                notable, key=lambda r: -r[4]):
            w(f"| `{f}` | {k} | {mine:.6g} | {theirs:.6g} | {rel*100:.2f} % | "
              f"{tbl} | {'yes' if aud else 'NO -- read against the book'} |")
        w("")
    if near:
        w(f"## The {len(near)} small differences, named but not tabulated")
        w("")
        w("Each is below " + f"{NOTABLE*100:g}" + " %.  They are listed so the "
          "count above is checkable, not because any of them is a defect: ")
        w("")
        w(", ".join(sorted({f"`{f}`:{k}" for f, k, *_ in near})) + ".")
        w("")
    w("## What this does NOT establish")
    w("")
    w("Agreement with Appendix A is agreement with **one** compilation.  Where "
      "our value and theirs descend from the same original measurement -- "
      "which for critical constants is the common case -- this confirms the "
      "TRANSCRIPTION and says nothing about the measurement.  It is a check on "
      "us, not on them.  And a disagreement is not by itself a defect in "
      "either: two compilations may have chosen different primaries, which is "
      "a fact about provenance and is resolved by reading them, not by "
      "preferring one.")

    report = "\n".join(lines)
    print(report)
    if args.write_report:
        #  data/local/, NOT generated/.  generated/ is COMMITTED, and a file
        #  there that can only be rebuilt from a book this repository does not
        #  contain would go stale with nothing able to notice -- the
        #  hand-compiled-count trap, one directory over.  data/local/ is the
        #  gitignored private tier, which is exactly what output derived from
        #  the curator's own copy of a copyrighted table is.
        out = ROOT / "data/local/polingVerification.md"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(report + "\n")
        print(f"\nwrote {out.relative_to(ROOT)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
