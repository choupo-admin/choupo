#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""propose_lennard_jones -- draft `lennardJones {}` fragments from Svehla (1962).

    bin/curate/propose_lennard_jones.py                 # -> data/local/lennardJones/
    bin/curate/propose_lennard_jones.py --out <dir>     # anywhere NOT under data/standards/

WHAT THIS IS.  A curation-time tool (the engine never runs it).  It reads the
ONE committed transcription of Svehla, R. A. (1962), *Estimated viscosities and
thermal conductivities of gases at high temperatures*, NASA TR R-132, Table I(a)
-- `bin/curate/svehla1962/svehla1962_tableIa.tsv`, every value read from the
page image, plus the Table I(b) method legend and the hand-written isomer table
beside it -- and matches each printed molecule to a record in
`data/standards/components/` by PARSED ELEMENTAL FORMULA on both sides, with the
record's declared MW cross-checked against its own formula.  Never by name:
the only place a record NAME is read is the isomer table, to choose among
records that already share one composition, and every fragment that rests on
that choice says so in its header.

WHAT IT WRITES.  One fragment per matched component,
`<out>/<componentName>.dat`, carrying the block the Chapman-Enskog gas
viscosity (src/thermo/transport/ChapmanEnskog.H) reads:

    lennardJones
    {
        sigma      [0 1 0 0 0] 3.798e-10;    // m  (printed: 3.798 A)
        epsOverK   71.4 K;
        provenance
        {
            sigma    { origin measuredFit; method "Svehla 1962 method 1: ..."; }
            epsOverK { origin measuredFit; method "Svehla 1962 method 1: ..."; }
            source   "Svehla, R. A. (1962). ... NASA TR R-132, Table I(a), report page 23 (PDF page 25), row 'N2'";
            licence  publicDomain;
        }
    }

sigma is written in METRES by an exact decimal shift of the printed angstrom
value (angstrom is not a named unit in src/core/Units.cpp; the bracket form
declares the dimension and the loader's checked lookup verifies it); eps/k in
kelvin as printed.  Provenance is PER VALUE because Svehla codes sigma and
eps/k separately.  The origin word follows the ruling of 2026-09-06:

    Svehla Table I(b) group A, codes 1-4 (least-squares / graphical fits to
      measured viscosity or thermal-conductivity data)  -> `measuredFit`
      (resolved to the `regressed` rung by core/Origin.H)
    code 20 (Knudsen-gage radiometer measurements)      -> `measured`
    every other code (estimates from physical properties, combining rules,
      Brandt's correlation, quantum-mechanical formulas) -> `estimated`

and the `method` string always carries Svehla's code with his legend, so the
distinction travels even where the origin word is coarse.

WHAT IT REFUSES.  An `--out` under data/standards/ -- promotion into the
public tree is Vítor's review, never this tool's write (CLAUDE.md section 7:
the engine and its tools do not write under data/standards/; the rule's one
home is records::refuseStandardsWrite in C++, and this Python tool applies the
same refusal by path).  The default destination is data/local/lennardJones/,
the gitignored private tier.

WHAT IT EXCLUDES, from the record's DECLARED facts (never from its name):
`role nonvolatile;`, `standardThermochemistry.referenceState pureSolid;`, a
`dissociatesTo` or `solidPhases` block (a salt or mineral), a hydrate or
unparseable formula, and a record whose declared MW disagrees with the MW its
own formula gives by more than 0.5 % (the synthetic VLLE stand-ins compB /
compC, `formula B;` with `MW 50.0`).  Svehla rows whose only composition match
is an excluded record are LISTED in the coverage report, values included, so
the curator sees them; nothing is written for them.

DETERMINISTIC AND IDEMPOTENT: sorted iteration everywhere, no timestamps, no
environment in the output; running it twice gives byte-identical files, and
check_transport_correlations verifies exactly that.  Fragments this tool
wrote earlier into the same directory (recognised by their PROPOSAL header)
are removed before writing, so a record that leaves the match set leaves the
directory too; a file it did not write is never touched.
"""
import argparse
import glob
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HOME = os.path.join(ROOT, "bin", "curate", "svehla1962")
TABLE = os.path.join(HOME, "svehla1962_tableIa.tsv")
METHODS = os.path.join(HOME, "svehla1962_methods.txt")
ISOMERS = os.path.join(HOME, "isomer_resolution.tsv")
COMPONENTS = os.path.join(ROOT, "data", "standards", "components")
ATOMIC_WEIGHTS = os.path.join(ROOT, "src", "thermo", "AtomicWeights.cpp")
DEFAULT_OUT = os.path.join(ROOT, "data", "local", "lennardJones")
MARKER = "PROPOSAL -- Lennard-Jones (12-6) force constants"

SOURCE_CLASS = "publicDomain"      # the licence word every fragment declares
LICENCE_WORD = SOURCE_CLASS        # check_source_licence cross-checks this constant

MW_TOL_REL = 0.005   # records carry 4-6 significant figures; a stand-in is off x2-x4

# ---------------------------------------------------------------- the engine's own atomic weights
AW = {}
for sym, val in re.findall(r'\{\s*"([A-Za-z]+)",\s*([0-9.]+)\s*\}',
                           open(ATOMIC_WEIGHTS, encoding="utf-8").read()):
    AW[sym] = float(val)
if len(AW) < 30:
    sys.exit("propose_lennard_jones: could not read src/thermo/AtomicWeights.cpp")
ELEMENTS = set(AW)


# ---------------------------------------------------------------- formula parser
class ParseError(Exception):
    pass


def _num(s, i):
    j = i
    while j < len(s) and (s[j].isdigit() or s[j] == "."):
        j += 1
    if j == i:
        return 1.0, i
    return float(s[i:j]), j


def _units(s, i, out, mult):
    start = i
    while i < len(s) and s[i] != ")":
        if s[i] == "(":
            inner = {}
            i = _units(s, i + 1, inner, 1.0)
            if i >= len(s) or s[i] != ")":
                raise ParseError("unbalanced '('")
            n, i = _num(s, i + 1)
            for k, v in inner.items():
                out[k] = out.get(k, 0) + v * n * mult
        elif s[i].isupper():
            sym = s[i]
            i += 1
            if i < len(s) and s[i].islower():
                sym += s[i]
                i += 1
            if sym not in ELEMENTS:
                raise ParseError("unknown element '%s'" % sym)
            n, i = _num(s, i)
            out[sym] = out.get(sym, 0) + n * mult
        else:
            raise ParseError("unexpected '%s' at %d" % (s[i], i))
    if i == start:
        raise ParseError("empty unit list")
    return i


def parse_formula(f):
    """The ElementComposition grammar (segments on ':' or U+00B7, [count] unit+,
    parentheses, trailing charge stripped).  Whole string or ParseError."""
    f = f.strip().strip('"').strip()
    if not f or f in ("N/A", "n/a", "-"):
        raise ParseError("no formula")
    m = re.search(r"([+-]\d*)$", f)
    if m and not re.search(r"\d[+-]\d*$", f[:m.start() + 1]):
        f = f[:m.start()]
    f = re.sub(r"([+-])(\d+)$", "", f)
    out = {}
    for seg in re.split(r":|\u00b7", f):
        seg = seg.strip()
        n, i = _num(seg, 0)
        sub = {}
        j = _units(seg, i, sub, 1.0)
        if j != len(seg):
            raise ParseError("trailing garbage in '%s'" % seg)
        for k, v in sub.items():
            out[k] = out.get(k, 0) + v * n
    return out


def canon(atoms):
    return ";".join("%s:%g" % (k, atoms[k]) for k in sorted(atoms))


def formula_mw(atoms):
    return sum(AW[k] * v for k, v in atoms.items())


def svehla_formula(mol):
    """Strip Svehla's typographic prefixes; return (prefix, bare formula)."""
    m = re.match(r"^(n|iso|neo|cyclo|sec|tert)-(.+)$", mol)
    if m:
        return m.group(1), m.group(2)
    return "", mol


# ---------------------------------------------------------------- the transcription
def read_table():
    rows, header = [], None
    with open(TABLE, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if header is None:
                header = parts
                continue
            if len(parts) != len(header):
                sys.exit("propose_lennard_jones: malformed row in %s: %r" % (TABLE, line))
            rows.append(dict(zip(header, parts)))
    need = {"pdfPage", "reportPage", "moleculeAsPrinted", "sigma_A", "epsOverK_K",
            "methodSigma", "methodEps", "svehlaDataPage", "refsAsPrinted", "refsColumn", "verified"}
    if header is None or not need <= set(header):
        sys.exit("propose_lennard_jones: %s lacks the expected columns" % TABLE)
    return rows


def read_methods():
    methods = {}
    with open(METHODS, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#") or not line.strip():
                continue
            code, group, legend = line.rstrip("\n").split("\t")
            methods[code] = (group, legend)
    if len(methods) != 23:
        sys.exit("propose_lennard_jones: Table I(b) has 23 codes; read %d" % len(methods))
    return methods


def read_isomers():
    isomer = {}
    with open(ISOMERS, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#") or not line.strip():
                continue
            mol, chosen, basis = line.rstrip("\n").split("\t")
            isomer[mol] = (chosen, basis)
    return isomer


# ---------------------------------------------------------------- the records
def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return re.sub(r"//[^\n]*", "", s)


def top_level(txt):
    depth, cur = 0, ""
    for ch in txt:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif depth == 0:
            cur += ch
    return cur


def scalar(top, key):
    m = re.search(r"(?m)^\s*%s\s+([^;]+);" % re.escape(key), top)
    return m.group(1).strip() if m else ""


def read_records():
    records = []
    for f in sorted(glob.glob(os.path.join(COMPONENTS, "*.dat"))):
        raw = open(f, encoding="utf-8", errors="replace").read()
        txt = strip_comments(raw)
        top = top_level(txt)
        rec = {
            "file": os.path.basename(f)[:-4],
            "name": scalar(top, "name"),
            "formula": scalar(top, "formula").strip('"'),
            "CAS": scalar(top, "CAS"),
            "role": scalar(top, "role"),
            "referenceState": (re.search(r"standardThermochemistry\s*\{[^}]*?referenceState\s+(\w+)",
                                         txt, re.S) or [None, ""])[1],
            "flags": [k for k in ("dissociatesTo", "solidPhases")
                      if re.search(r"(?m)^\s*%s\b" % k, txt)],
            "MW": scalar(top, "MW"),
            "hasLJ": bool(re.search(r"(?m)^\s*lennardJones\s*\{", txt)),
        }
        try:
            rec["atoms"] = parse_formula(rec["formula"]) if rec["formula"] else None
            rec["parseError"] = "" if rec["formula"] else "no formula declared"
        except ParseError as e:
            rec["atoms"] = None
            rec["parseError"] = str(e)
        records.append(rec)
    if len(records) < 100:
        sys.exit("propose_lennard_jones: only %d records under %s -- the scan surface "
                 "collapsed" % (len(records), COMPONENTS))
    return records


def exclusion_reason(rec):
    r = []
    if rec["role"] == "nonvolatile":
        r.append("role nonvolatile")
    if rec["referenceState"] == "pureSolid":
        r.append("referenceState pureSolid")
    if "dissociatesTo" in rec["flags"]:
        r.append("dissociatesTo (salt)")
    if "solidPhases" in rec["flags"]:
        r.append("solidPhases (mineral/salt)")
    if ":" in rec["formula"] or "\u00b7" in rec["formula"]:
        r.append("hydrate formula")
    if rec["atoms"] is None:
        r.append("formula not parseable: " + rec["parseError"])
    elif rec["MW"]:
        try:
            mw = float(rec["MW"].split()[0])
            fm = formula_mw(rec["atoms"])
            if abs(mw - fm) / fm > MW_TOL_REL:
                r.append("record MW %s inconsistent with formula MW %.3f (%.1f %%) -- not the "
                         "substance its formula names" % (rec["MW"], fm, 100 * (mw - fm) / fm))
        except ValueError:
            r.append("MW not numeric: " + rec["MW"])
    else:
        r.append("no MW declared -- formula/MW cross-check impossible")
    return r


# ---------------------------------------------------------------- the fragment
def origin_of(code):
    #  The 2026-09-06 ruling, see the module docstring.
    if code in ("1", "2", "3", "4"):
        return "measuredFit"
    if code == "20":
        return "measured"
    return "estimated"


def fragment(d, rec, alt, isomer_basis, methods):
    name = rec["name"]
    mol = d["moleculeAsPrinted"]
    src = ("Svehla, R. A. (1962). Estimated viscosities and thermal conductivities of gases "
           "at high temperatures. NASA TR R-132, Table I(a), report page %s (PDF page %s), "
           "row '%s'" % (d["reportPage"], d["pdfPage"], mol))
    L = []
    L.append("/*--------------------------------*- Choupo -*-----------------------*\\")
    L.append("  %s for component `%s`" % (MARKER, name))
    L.append("  (record formula %s, CAS %s).  A FRAGMENT to be reviewed and, if promoted,"
             % (rec["formula"], rec["CAS"] or "n/a"))
    L.append("  pasted into the component record; NOT a complete record.  Read by the")
    L.append("  Chapman-Enskog gas viscosity (src/thermo/transport/ChapmanEnskog.H) and,")
    L.append("  through it, the modified Eucken conductivity.  Promotion into")
    L.append("  data/standards/ is a curation decision -- this tool never writes there.")
    L.append("  Matched to the record by PARSED ELEMENTAL FORMULA (element counts on both")
    L.append("  sides) with the record's MW cross-checked against its formula, never by name.")
    if isomer_basis:
        L.append("  ISOMER PICK -- several records share this composition; this one was chosen")
        L.append("  because: %s." % isomer_basis)
        L.append("  CONFIRM BEFORE PROMOTING.")
    L.append("  Transcribed from the page image (verified: %s), sigma in angstrom and" % d["verified"])
    L.append("  epsilon/k in kelvin exactly as printed; sigma is written below in SI by an")
    L.append("  exact decimal shift (1 A = 1e-10 m) because `A` is not a named unit in")
    L.append("  src/core/Units.cpp -- the bracket form [M L T Theta N] declares length.")
    L.append("  Svehla's calculated mu(T), k(T) table for this molecule: report page %s."
             % d["svehlaDataPage"])
    if d["refsAsPrinted"]:
        L.append("  Svehla's experimental %s data references for this row (his bibliography"
                 % ("viscosity" if d["refsColumn"] == "viscosity" else "thermal-conductivity"))
        L.append("  numbers, report pages 15-19): %s." % d["refsAsPrinted"])
    if alt is not None:
        L.append("  NOTE: Svehla lists %s a second time (report page %s) fitted to THERMAL"
                 % (mol, alt["reportPage"]))
        L.append("  CONDUCTIVITY data: sigma %s A (method %s), epsilon/k %s K (method %s),"
                 % (alt["sigma_A"], alt["methodSigma"], alt["epsOverK_K"], alt["methodEps"]))
        L.append("  refs %s.  The viscosity-based pair is proposed here; the" % alt["refsAsPrinted"])
        L.append("  k-based pair is recorded in svehla1962_tableIa.tsv and is NOT a second home.")
    L.append("\\*---------------------------------------------------------------------------*/")
    L.append("")
    L.append("lennardJones")
    L.append("{")
    L.append("    sigma      [0 1 0 0 0] %se-10;    // m  (printed: %s A)" % (d["sigma_A"], d["sigma_A"]))
    L.append("    epsOverK   %s K;" % d["epsOverK_K"])
    L.append("")
    L.append("    provenance")
    L.append("    {")
    for key, code in (("sigma", d["methodSigma"]), ("epsOverK", d["methodEps"])):
        group, legend = methods[code]
        L.append("        %s" % key)
        L.append("        {")
        L.append("            origin   %s;" % origin_of(code))
        L.append("            method   \"Svehla 1962 method %s: %s\";" % (code, legend))
        L.append("        }")
    L.append("        source   \"%s\";" % src)
    L.append("        licence  %s;    // US government work (NASA), 17 U.S.C. 105" % LICENCE_WORD)
    L.append("    }")
    L.append("}")
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------- main
def refuse_standards(out):
    std = os.path.realpath(os.path.join(ROOT, "data", "standards"))
    real = os.path.realpath(out)
    if real == std or real.startswith(std + os.sep):
        sys.exit("propose_lennard_jones: REFUSED -- '%s' is under data/standards/.  The "
                 "public tree is written by curation review, never by a tool; write to "
                 "data/local/lennardJones/ (the default) and promote by hand." % out)


def main():
    ap = argparse.ArgumentParser(description="Draft lennardJones {} fragments from Svehla 1962.")
    ap.add_argument("--out", default=DEFAULT_OUT,
                    help="destination directory (default data/local/lennardJones/; "
                         "anything under data/standards/ is refused)")
    args = ap.parse_args()
    refuse_standards(args.out)

    rows = read_table()
    methods = read_methods()
    isomer = read_isomers()
    records = read_records()

    by_comp = defaultdict(list)
    for rec in records:
        if rec["atoms"] is not None:
            by_comp[canon(rec["atoms"])].append(rec)

    #  Ar, He, Kr, Ne, Xe are printed twice; the VISCOSITY row (first in
    #  page order) is proposed and the conductivity row is quoted.
    by_mol = defaultdict(list)
    for d in rows:
        by_mol[d["moleculeAsPrinted"]].append(d)

    matched, ambiguous, no_record, unparseable, excluded_hits = [], [], [], [], []
    for mol in sorted(by_mol):
        ds = by_mol[mol]
        d, alt = ds[0], (ds[1] if len(ds) > 1 else None)
        _prefix, bare = svehla_formula(mol)
        try:
            atoms = parse_formula(bare)
        except ParseError as e:
            unparseable.append((mol, str(e)))
            continue
        cands = by_comp.get(canon(atoms), [])
        if not cands:
            no_record.append(d)
            continue
        ok = [c for c in cands if not exclusion_reason(c)]
        for c in cands:
            if exclusion_reason(c):
                excluded_hits.append((d, c, exclusion_reason(c)))
        if not ok:
            continue
        if len(ok) == 1 and len(cands) == 1:
            matched.append((d, ok[0], alt, None))
            continue
        if mol in isomer:
            chosen, basis = isomer[mol]
            pick = [c for c in ok if c["name"] == chosen]
            if len(pick) == 1:
                matched.append((d, pick[0], alt, basis))
                continue
            ambiguous.append((d, cands, "isomer table names '%s' but no eligible record "
                                        "carries that name" % chosen))
            continue
        ambiguous.append((d, cands, "several records share composition %s; Svehla prints '%s'"
                          % (canon(atoms), mol)))

    #  Write.  Sorted by component name; earlier fragments of this tool's own
    #  making are removed first so the directory mirrors the match set.
    os.makedirs(args.out, exist_ok=True)
    removed = 0
    for f in sorted(glob.glob(os.path.join(args.out, "*.dat"))):
        with open(f, encoding="utf-8", errors="replace") as fh:
            head = fh.read(400)
        if MARKER in head:
            os.remove(f)
            removed += 1
    written = []
    for d, rec, alt, basis in sorted(matched, key=lambda t: t[1]["name"]):
        path = os.path.join(args.out, "%s.dat" % rec["name"])
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(fragment(d, rec, alt, basis, methods))
        written.append((rec["name"], d))

    #  Coverage, printed -- the counts a reader quotes come from here, never
    #  from a document.
    FIT = ("1", "2", "3", "4")
    n_fit_both = sum(1 for _, d in written if d["methodSigma"] in FIT and d["methodEps"] in FIT)
    n_iso = sum(1 for _, _r, _a, b in matched if b)
    already = sum(1 for _, rec, _a, _b in matched if rec["hasLJ"])
    print("propose_lennard_jones: Svehla (1962) NASA TR R-132 Table I(a) -> %s" % args.out)
    print("  rows transcribed %d (%d distinct molecules); component records %d, gas-phase "
          "candidates after exclusions %d"
          % (len(rows), len(by_mol), len(records),
             sum(1 for r in records if not exclusion_reason(r))))
    print("  matched, fragment written: %d  (%d by unique composition + %d with a flagged "
          "isomer pick; %d with both constants fitted to measured data, codes 1-4)"
          % (len(written), len(written) - n_iso, n_iso, n_fit_both))
    print("  records already carrying a lennardJones block: %d" % already)
    print("  ambiguous, NOT matched: %d" % len(ambiguous))
    for d, cands, why in ambiguous:
        print("    %s -- %s; candidates: %s" % (d["moleculeAsPrinted"], why,
                                                 ", ".join(sorted(c["name"] for c in cands))))
    print("  Svehla molecules whose only composition match is an EXCLUDED record: %d "
          "(values listed; nothing written)"
          % len({d["moleculeAsPrinted"] for d, _c, _r in excluded_hits}))
    for d, c, r in sorted(excluded_hits, key=lambda t: (t[0]["moleculeAsPrinted"], t[1]["name"])):
        print("    %-8s sigma %s A  eps/k %s K  methods %s/%s  p.%s  -> %s [%s]"
              % (d["moleculeAsPrinted"], d["sigma_A"], d["epsOverK_K"], d["methodSigma"],
                 d["methodEps"], d["reportPage"], c["name"], "; ".join(r)))
    print("  Svehla rows with no record of that composition: %d; not parseable: %d (%s)"
          % (len(no_record), len(unparseable), ", ".join(m for m, _e in unparseable) or "none"))
    print("  stale fragments of this tool removed from the destination first: %d" % removed)
    print("  PROMOTION IS A REVIEW: nothing was written under data/standards/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
