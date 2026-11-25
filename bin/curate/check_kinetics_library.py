#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the gas-phase reaction library (data/standards/kinetics/) is one home, read right.

    bin/curate/check_kinetics_library.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  Until 2026-11-22 the 21 reactions of
O Conaire et al. 2004 were written out, by copy, in ELEVEN case files
(ignition01 and its four variants, ignition02-04, kinetics01, kinetics02,
nox01 -- ten of them byte-identical, the eleventh a superset).  A constant
edited in one copy moved ONE case's ignition delay and left ten others on the
old value, at exit 0, with every closure green and no golden able to say which
copy was right.  The library gives a reaction one file; this gate holds that
the file is what the cases read.

WHAT IT CHECKS
  (a) every record (kinetics/<equation>/<Source>.dat: a reaction is a FOLDER, a source a
      FILE in it, C339) parses, its FOLDER name IS its canonical equation (species
      sorted within each side, the reversible reaction oriented smaller side
      first, `+M` / `(+M)` suffix, `@n` for a summed duplicate, per source), no file
      lies loose in kinetics/, no name holds a character Windows or macOS refuses or
      equals another ignoring case, it carries `printedEquation` (the equation as the
      source prints it), it is an ELEMENTARY record (no `order`) or declares
      `global true;` or `spectators true;` (a species on both sides: the sides are read
      from `order` and `orderRev`), a set draws ONE source per equation, its atoms
      balance (formulas read from the species records), its `kinetics` carries
      a `units {}` block, and it carries a `source` with a table and a PAGE (a
      page `unrecorded` is allowed only on an `interim` record and is counted);
  (a4) EVERY row of Miller & Bowman 1989 Appendix A (235) and B (73), as the review
      read them (docs/reviews/2026-11-22-miller-bowman/mb1989_table.tsv), is named by
      exactly one record, whose numbers, page, falloff shape and third-body
      efficiencies equal the row's;
  (a5) the 8 Glarborg 2018 records equal the values read from journal pages 34 and 41
      (docs/reviews/2026-11-25-kinetics-glarborg/), and carry that page;
  (a2) the O Conaire constants equal, digit for digit, the values the review read off
      journal page 607 (docs/reviews/2026-11-21-kinetics-seed/oconaire2004_table.tsv): a
      wrong A in a record is the sabotage the byte-identity comparison below cannot see,
      because the library run and the inline form built from the same records move together
      (the case goldens see it too, in bin/runTests);
  (a3) the two sets written back inline equal, entry for entry, the text the cases carried until
      the library existed (docs/reviews/2026-11-21-kinetics-seed/inline_reactions_until_*.reactions);
  (b) every `sets {}` name resolves to a kinetics/sets/<name>.dat record, a set
      has members, and a label is unique within its set;
  (c) every shipped case that asks `reactionSet` runs BYTE-IDENTICALLY to the
      same case with the reactions written INLINE (the gate builds the inline
      form from the records by its own code, drops the efficiencies of species
      the run does not carry, and compares the printed result and every state
      directory);
  (d) SABOTAGE: a case-tier record (constant/kinetics/) with a doubled A moves
      the result (the precedence case > standards, and the comparison has
      teeth); an inline copy with one A doubled differs from the library run;
  (d2) a collider named by an alias (`hydrogen` for H2) in a case-tier variation gives the
      same numbers as the canonical key and is not announced as absent;
  (e) a set whose declared thermo is a catalogue home prints K_c(set)/K_c(run):
      exactly 1 for a reaction whose species the run reads from that very home;
  (g) two sources of one equation coexist: a second source's file beside O Conaire's
      for H+O2=O+OH; `reactionRecords` without a source is REFUSED naming both, with a
      source it is read; a set naming one equation from two sources is refused;
  (h) the name rules refuse each forbidden character, a space, and two names equal
      ignoring case (the helpers the records are held to are tried here);
  (f) two irreversible entries that are each other's reverse, and a leg with
      `A_rev`/`Ea_rev`, print k_f/k_r against K_c(T), and the printed ratio
      scales exactly with the reverse constant (A_rev chosen from the first
      print makes it 1).

  Arm (c) holds the library form equal to the inline form for the SHIPPED cases only: the inline
  renderer (kinetics_inline.py) does not model `reactionRecords`, the order the case lists its
  sets, or a collider named by an alias; the engine's own tests of those are arm (d2) and the cases.

NOT CHECKED: that a record's numbers equal the paper's page (a curator reads
that; the review docs/reviews/2026-11-21-kinetics-seed/ did, once), that a set's
declared thermo is the thermo it was made with, third-body efficiencies against
a run that DOES carry Ar and He, the Explorer view (a later slice).
"""
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import case_records  # noqa: E402
import gatekit  # noqa: E402
import record_reader as rr  # noqa: E402
from make_kinetics_seed import canonical, canonical_sides  # noqa: E402
from kinetics_inline import (  # noqa: E402
    words, stoich, stoich_rev, block_text, inline_text, present_species, asked_sets, entries_of, record_files)

SCAN_ROOTS = ("data/standards/kinetics/**", "tutorials/**/constant/reactions",
              "data/standards/components/*.dat",
              "data/standards/thermoTables/**/*.dat")

REPO = HERE.parent.parent
KIN = REPO / "data" / "standards" / "kinetics"
SETS = KIN / "sets"
ELEM = re.compile(r"([A-Z][a-z]?)(\d*)")


# ---- reading ---------------------------------------------------------------
def formula_of(name):
    cands = [REPO / "data/standards/components" / (name + ".dat")]
    cands += sorted((REPO / "data/standards/thermoTables").glob("*/" + name + ".dat"))
    for p in cands:
        if p.exists():
            m = re.search(r"^formula\s+(\S+?);", p.read_text(), re.M)
            if m:
                return m.group(1)
    return None


def atoms(formula):
    a = {}
    for el, n in ELEM.findall(formula):
        a[el] = a.get(el, 0) + (int(n) if n else 1)
    return a


def form_of(kin):
    t = words(kin.get("type"))[0] if kin.get("type") else ""
    return {"thirdBody": "+M", "falloff": "(+M)"}.get(t, "")


# ---- file names: what Windows and macOS refuse ---------------------------------
def name_problem(name):
    """Why `name` (a folder or a source file stem) is no file name on every platform the tree is read on."""
    bad = sorted(set(name) & set(':*?<>"\\|'))
    if bad:
        return "holds " + " ".join(repr(c) for c in bad) + ", which Windows refuses in a file name"
    if name != name.strip() or " " in name:
        return "holds a space"
    if name.endswith("."):
        return "ends in a dot, which Windows drops"
    return ""


def case_collisions(names):
    """Pairs of names that are one name ignoring case (one file on Windows and macOS)."""
    seen, out = {}, []
    for nm in sorted(set(names)):
        if nm.lower() in seen:
            out.append((seen[nm.lower()], nm))
        seen[nm.lower()] = nm
    return out


# ---- (a) and (b): the records ----------------------------------------------
def check_records(failures):
    members = {}
    labels = {}
    drawn = {}
    unrecorded = 0
    n = 0
    files = record_files()
    for f in sorted(KIN.glob("*.dat")):
        failures.append(f"{f.name}: lies loose in kinetics/ -- a reaction is a folder named by its canonical equation, each source a file in it (bin/curate/migrate_kinetics_layout.py)")
    if not files:
        failures.append("data/standards/kinetics/ holds no record")
    for f in files:
        n += 1
        b = rr.parse_file(str(f))
        who = f"{f.parent.name}/{f.name}"
        if words(b.get("recordType")) != ["elementaryReaction"]:
            failures.append(f"{who}: recordType is not elementaryReaction")
            continue
        st = stoich(b)
        kin = b.get("kinetics")
        if not st or kin is None:
            failures.append(f"{who}: no stoichiometry or no kinetics block")
            continue
        spec = words(b.get("spectators")) == ["true"]
        glob_ = words(b.get("global")) == ["true"] or spec
        if spec and words(b.get("global")) == ["true"]:
            failures.append(f"{who}: `spectators true;` and `global true;` are two claims")
        for sp, nu, order in st:
            if order is not None and not glob_:
                failures.append(f"{who}: species {sp} carries an `order` on an elementary record")
            if order is None and glob_:
                failures.append(f"{who}: a global record must declare the order of {sp}")
        rev = words(b.get("reversible")) == ["true"]
        dup = int(float(words(b.get("duplicate"))[0])) if b.get("duplicate") else 0
        try:
            if spec:      # a species on both sides: the sides are read from order (left) and orderRev (right)
                rv = stoich_rev(b)
                lhs, rhs = [], []
                for sp, nu, order in st:
                    pr = rv.get(sp, order + nu)
                    if pr - order != nu or order < 0 or pr < 0:
                        failures.append(f"{who}: {sp}: orderRev - order must equal nu")
                    lhs += [sp] * int(order)
                    rhs += [sp] * int(pr)
                want = canonical_sides(lhs, rhs, form_of(kin), rev, dup)
            else:
                want = canonical([(s, n_) for s, n_, _ in st], form_of(kin), rev, dup)
        except AssertionError:
            failures.append(f"{who}: a non-integer or zero coefficient")
            continue
        if want != f.parent.name:
            failures.append(f"{who}: the canonical equation of its content is {want}: the folder is the reaction")
        for part in (f.parent.name, f.stem):
            why = name_problem(part)
            if why:
                failures.append(f"{who}: '{part}' {why}")
        if b.get("printedEquation") is None:
            failures.append(f"{who}: no `printedEquation \"...\";` -- the equation AS THE SOURCE PRINTS IT")
        # atoms
        tot = {}
        for sp, nu, _ in st:
            fm = formula_of(sp)
            if fm is None:
                failures.append(f"{who}: no species record (components/ or thermoTables/) for {sp}")
                continue
            for el, k in atoms(fm).items():
                tot[el] = tot.get(el, 0) + nu * k
        bad = {el: v for el, v in tot.items() if abs(v) > 1e-12}
        if bad:
            failures.append(f"{who}: atoms do not balance {bad}")
        # units, source, page
        if kin.get("units") is None:
            failures.append(f"{who}: kinetics has no `units {{}}` block")
        src = b.get("source")
        if src is None or not src.get("citation") or not src.get("table") or not src.get("page"):
            failures.append(f"{who}: source needs citation, table and page")
        else:
            page = words(src.get("page"))[0]
            if page == "unrecorded":
                unrecorded += 1
                if words(b.get("reviewStatus")) != ["interim"]:
                    failures.append(f"{who}: page unrecorded on a record that is not interim")
            elif not re.fullmatch(r"\d+(-\d+)?", page):
                failures.append(f"{who}: page '{page}' is neither a number nor `unrecorded`")
        # sets
        sb = b.get("sets")
        if sb is None or not sb.keys():
            failures.append(f"{who}: belongs to no set (`sets {{ <set> <label>; }}`)")
            continue
        for s in sb.keys():
            if not (SETS / (s + ".dat")).exists():
                failures.append(f"{who}: set '{s}' has no kinetics/sets/{s}.dat")
            lab = words(sb.get(s))[0]
            members.setdefault(s, []).append(who)
            if (s, lab) in labels:
                failures.append(f"{who}: label {lab} is also {labels[(s, lab)]}'s in set {s}")
            labels[(s, lab)] = who
            if (s, f.parent.name) in drawn:
                failures.append(f"{who}: the set {s} already draws {f.parent.name} from {drawn[(s, f.parent.name)]}: one source per equation in a set")
            drawn[(s, f.parent.name)] = who
    #  names that differ only by case are one name on Windows and macOS
    for what, names in (("reaction folders", [f.parent.name for f in files]),
                        ("sources of one reaction", [f"{f.parent.name}/{f.stem}" for f in files]),
                        ("set records", [f.stem for f in SETS.glob("*.dat")])):
        for a_, b_ in case_collisions(names):
            failures.append(f"{what}: '{a_}' and '{b_}' are equal ignoring case (one file on Windows and macOS)")
    #  the summed terms of one equation, PER SOURCE
    terms = {}
    bare = set()
    for f in files:
        s, src = f.parent.name, f.stem
        if "@" in s:
            terms.setdefault((s.rsplit("@", 1)[0], src), []).append(int(s.rsplit("@", 1)[1]))
        else:
            bare.add((s, src))
    for (base, src), ns in terms.items():
        if (base, src) in bare:
            failures.append(f"{base}/{src}.dat and its summed terms {base}@n are both present: one equation, one identity in a source")
        if sorted(ns) != list(range(1, len(ns) + 1)) or len(ns) < 2:
            failures.append(f"the terms of {base} in {src} are @{sorted(ns)}: they must be numbered 1..k without a gap, k >= 2")
    for sf in sorted(SETS.glob("*.dat")):
        sb = rr.parse_file(str(sf))
        if words(sb.get("recordType")) != ["kineticsSet"]:
            failures.append(f"sets/{sf.name}: recordType is not kineticsSet")
        if sf.stem not in members:
            failures.append(f"sets/{sf.name}: no record is a member")
        th = sb.get("thermochemistry")
        if th is None or not th.get("citation"):
            failures.append(f"sets/{sf.name}: declares no `thermochemistry {{ citation ...; }}` -- a set says what thermo it was made with")
    return n, unrecorded, members


# ---- (a2): the O Conaire records against the page's own table ----------------------
TSV = REPO / "docs" / "reviews" / "2026-11-21-kinetics-seed" / "oconaire2004_table.tsv"


def check_against_table(failures):
    """A wrong digit in a record is a wrong digit in every case: the records of the set are held to the
    values the review read off journal page 607 (typed once, in the TSV, never by this gate)."""
    rows = {}
    for l in TSV.read_text().splitlines():
        if l.startswith("#") or l.startswith("row\t"):
            continue
        c = l.split("\t")
        rows[c[0]] = (float(c[4]), float(c[5]), float(c[6]))
    n = 0
    for f in record_files():
        b = rr.parse_file(str(f))
        if "OConaire2004" not in (b.get("sets").keys() if b.get("sets") else []):
            continue
        rx = words(b.get("source").get("reaction"))[0]
        dup = int(float(words(b.get("duplicate"))[0])) if b.get("duplicate") else 0
        kin = b.get("kinetics")
        ktype = words(kin.get("type"))[0]

        def three(blk):
            return tuple(float(words(blk.get(k))[0]) for k in ("A", "b", "Ea"))
        if ktype == "falloff":
            want = {"main": rows[rx + "H"], "low": rows[rx + "L"]}
            got = {"main": three(kin), "low": three(kin.get("low"))}
        else:
            tag = rx + ("ab"[dup - 1] if dup else "")
            if tag not in rows:
                failures.append(f"{f.name}: no row {tag} in the review's table")
                continue
            want, got = {"main": rows[tag]}, {"main": three(kin)}
        for k in want:
            n += 1
            if want[k] != got[k]:
                failures.append(f"{f.name}: {k} A,b,Ea = {got[k]} but journal page 607 (the review's table) prints {want[k]}")
    return n


# ---- (a4): the Miller & Bowman records against the appendix's own table -------------
MBTSV = REPO / "docs" / "reviews" / "2026-11-22-miller-bowman" / "mb1989_table.tsv"


def check_against_mb(failures):
    """EVERY row of Appendix A (235) and Appendix B (73) of Miller & Bowman 1989, as the review read them
    from the page images, is the value of exactly the record that names it (`MillerBowman1989_AppA` label
    A<n>, `MillerBowman1989_AppB` label B<m>): A, b, Ea, the falloff low limit, the SRI/Troe numbers, the
    third-body efficiencies equal the row's, the record's page is the row's page, and the folder is the
    canonical equation the row's printed equation gives.  A row no record names, or a record naming a
    row that is not in the table, fails."""
    import csv
    rows = {(r["table"], r["rxn"]): r for r in csv.DictReader(MBTSV.open(), delimiter="\t") if r["table"] in "AB"}
    name = {"C2H2": "acetylene", "C2H3": "C2H3_vinyl", "C2H4": "ethylene", "C2H6": "ethane",
            "C3H3": "C3H3_1propynl", "CH2O": "HCHO", "H2O": "water"}
    sets_of = {"A": "MillerBowman1989_AppA", "B": "MillerBowman1989_AppB"}
    n = 0
    seen = set()

    def f3(blk):
        return tuple(float(words(blk.get(k))[0]) for k in ("A", "b", "Ea"))
    for f in record_files():
        b = rr.parse_file(str(f))
        sb = b.get("sets")
        if sb is None:
            continue
        for tab, setname in sets_of.items():
            if setname not in sb.keys():
                continue
            lab = words(sb.get(setname))[0]
            if lab[0] != tab or (tab, lab[1:]) not in rows:
                failures.append(f"{f.parent.name}/{f.name}: label {lab} is not a row of Appendix {tab}")
                continue
            r = rows[(tab, lab[1:])]
            seen.add((tab, lab[1:]))
            who = f"{f.parent.name}/{f.name} ({lab})"
            kin = b.get("kinetics")
            want = [(float(r["A"]), float(r["n"]), float(r["E"].rstrip(".") or 0))]
            got = [f3(kin)]
            if r["type"] == "falloff":
                want.append((float(r["lowA"]), float(r["lowN"]), float(r["lowE"].rstrip(".") or 0)))
                got.append(f3(kin.get("low")))
                if r["falloff"].startswith("SRI"):
                    shape, key = [float(x.rstrip(".") or 0) for x in r["falloff"].split()[1:5]] + [0.0], "sri"
                elif r["falloff"].startswith("Troe"):      # "Troe a=6.04e-01 T*=6927.0 T**=132."
                    shape = [float(x.split("=")[1].rstrip(".")) for x in r["falloff"].split()[1:4]]
                    key = "troe"
                else:                                      # Lindemann: no shape at all
                    shape, key = None, None
                if key and [float(x) for x in words(kin.get(key)) if x not in "()"] != shape:
                    failures.append(f"{who}: {key} numbers differ from the table's {shape}")
                if key is None and (kin.get("troe") is not None or kin.get("sri") is not None):
                    failures.append(f"{who}: a Lindemann fall-off row carries a Troe/SRI shape")
            src = b.get("source")
            if words(src.get("page"))[0] != r["page"] and tab == ("A" if "MillerBowman1989_AppA" in sb.keys() else "B"):
                failures.append(f"{who}: page {words(src.get('page'))[0]} but the table's row is on p. {r['page']}")
            eff = {}
            for it in r["eff"].split():
                k, v = it.split("=")
                eff[name.get(k, k)] = float(v)
            tb = kin.get("thirdBody")
            have = {k: float(words(tb.get(k))[0]) for k in tb.keys()} if tb is not None else {}
            if have != eff:
                failures.append(f"{who}: third-body efficiencies {have} but the table prints {eff}")
            for w, g in zip(want, got):
                n += 1
                if w != g:
                    failures.append(f"{who}: A,b,Ea = {g} but Appendix {tab} p. {r['page']} (the review's table) prints {w}")
            # the folder is the printed equation's canonical form (species mapped to the catalogue's names)
            if b.get("printedEquation") is None:
                failures.append(f"{who}: no printedEquation")
    missing = sorted(set(rows) - seen)
    if missing:
        failures.append(f"{len(missing)} rows of the Miller & Bowman table are named by no record: {missing[:6]}")
    return n


# ---- (a5): the Glarborg records against the journal's own tables ---------------------
GLTSV = REPO / "docs" / "reviews" / "2026-11-25-kinetics-glarborg" / "glarborg2018_table.tsv"


def check_against_glarborg(failures):
    """The 8 records of Glarborg et al. 2018 (Tables 2 and 5) equal, digit for digit, the values read off the
    journal pages (p. 34 and p. 41) twice, and carry that page and the equation as printed."""
    rows = {}
    for l in GLTSV.read_text().splitlines():
        if l.startswith("#") or l.startswith("row\t"):
            continue
        c = l.split("\t")
        rows[c[0]] = (c[1], c[2], c[3], c[4], (float(c[5]), float(c[6]), float(c[7])))
    n = 0
    seen = set()
    for f in record_files():
        if f.stem != "Glarborg2018":
            continue
        b = rr.parse_file(str(f))
        rx = words(b.get("source").get("reaction"))[0]
        kin = b.get("kinetics")
        key = "R15H" if rx == "R15" else rx
        if key not in rows:
            failures.append(f"{f.parent.name}/{f.name}: reaction {rx} is not a row of the review's table")
            continue
        seen.add(key)
        table, _, page, printed, want = rows[key]

        def three(blk):
            return tuple(float(words(blk.get(k))[0]) for k in ("A", "b", "Ea"))
        pairs = [(three(kin), want)]
        if rx == "R15":
            lo = rows["R15L"][4]
            pairs.append((three(kin.get("low")), lo))
        for g, w in pairs:
            n += 1
            if g != w:
                failures.append(f"{f.parent.name}/{f.name}: A,b,Ea = {g} but the journal page prints {w}")
        if words(b.get("source").get("page"))[0] != page:
            failures.append(f"{f.parent.name}/{f.name}: page {words(b.get('source').get('page'))[0]} but the table is on p. {page}")
        if " ".join(words(b.get("printedEquation"))) != printed:
            failures.append(f"{f.parent.name}/{f.name}: printedEquation is not the journal's `{printed}`")
    for need in ("Z1", "Z2", "Z3", "R15H", "R16", "R17", "R18", "R19"):
        if need not in seen:
            failures.append(f"no Glarborg2018 record for the printed row {need}")
    return n


# ---- (a3): the records against the TEXT the cases carried until the library existed ------
SHIPPED = REPO / "docs" / "reviews" / "2026-11-21-kinetics-seed" / "inline_reactions_until_2026-11-22.reactions"


def check_against_shipped(failures):
    """The 29 entries nox01_zeldovich_postflame carried inline (the 21 of O Conaire are the very text of
    the ignition cases) are what the two sets write back, entry for entry: any digit of any record that
    moves is a difference here, whatever the cases' goldens would say."""
    every = {"H2", "O2", "H", "O", "OH", "HO2", "H2O2", "water", "N2", "N", "NO", "N2O", "NH"}
    want = entries_of(SHIPPED.read_text())
    got = entries_of(inline_text(["OConaire2004", "Glarborg2018"], every))
    if want.keys() != got.keys():
        failures.append(f"the sets write back {sorted(got.keys() ^ want.keys())} that the shipped text does not (or lacks)")
    bad = [k for k in want if k in got and want[k] != got[k]]
    for k in bad:
        failures.append(f"entry {k}: the record's inline form differs from the text the cases carried")
    return len(want)


# ---- (c): the inline form, built here ------------------------------------------
def normalised(out):
    keep = []
    out = re.sub(r"\S*gatekit_\w+/", "", out)           # the probe's temporary directory
    for l in out.splitlines():
        if l.startswith("[kineticsLibrary]") or l.startswith("[pins]") or "Case directory" in l or '"seal"' in l:
            continue
        keep.append(l)
    return "\n".join(keep)


def state_files(case):
    got = {}
    for d in sorted(case.iterdir()):
        if d.is_dir() and re.fullmatch(r"[0-9.eE+-]+", d.name) and d.name != "0":
            for f in sorted(d.rglob("*")):
                if f.is_file():
                    got[str(f.relative_to(case))] = f.read_bytes()
    t = case / "trajectory.csv"
    if t.exists():
        got["trajectory.csv"] = t.read_bytes()
    return got


def binary_of(case):
    t = rr.strip_comments((case / "system" / "controlDict").read_text())
    return gatekit.binary(re.search(r"application\s+(\S+);", t).group(1))


STRIP = ("expected", "converged", "constant/propertyManifest")


def run_copy(base, mutate=None):
    with gatekit.probe_copy(base, strip=STRIP, keep_library=True) as c:
        if mutate:
            mutate(c)
        rc, out = gatekit.run(binary_of(c), c)
        return rc, out, state_files(c)


def seeded_cases():
    res = []
    for p in sorted((REPO / "tutorials").glob("**/constant/reactions")):
        if "reactionSet" in p.read_text():
            fs = p.parent.parent / "system" / "flowsheetDict"
            #  a brute-force sensitivity case integrates the vessel once per reaction (minutes, twice here);
            #  its reactions are those of the sibling case without the block, which IS compared
            if fs.exists() and re.search(r"^\s*sensitivity\s*$", fs.read_text(), re.M):
                continue
            res.append(p.parent.parent)
    return res


def same(a, b):
    if a[0] != b[0]:
        return False, "exit codes differ (%s / %s)" % (a[0], b[0])
    if a[0] != 0:          # a case that FAILS by design (an RK4 blow-up) must fail the same way
        return (normalised(a[1]) == normalised(b[1])), "both fail, differently"
    if normalised(a[1]) != normalised(b[1]):
        la, lb = normalised(a[1]).splitlines(), normalised(b[1]).splitlines()
        for x, y in zip(la, lb):
            if x != y:
                return False, "printed result differs: %r vs %r" % (x[:90], y[:90])
        return False, "printed result differs in length"
    if a[2].keys() != b[2].keys():
        return False, "different state files written"
    for k in a[2]:
        if a[2][k] != b[2][k]:
            return False, "state file %s differs" % k
    return True, ""


def main():
    failures = []
    n, unrecorded, members = check_records(failures)
    nvals = check_against_table(failures)
    nmb = check_against_mb(failures)
    if nmb < 300:
        failures.append(f"only {nmb} Miller & Bowman rate expressions were held to the table; Appendices A and B hold 308 rows")
    nshipped = check_against_shipped(failures)
    ngl = check_against_glarborg(failures)

    cases = seeded_cases()
    if len(cases) < 8:
        failures.append("only %d shipped cases ask a reactionSet (the ignition family is switched)" % len(cases))
    compared = 0
    for case in cases:
        rel = str(case.relative_to(REPO))
        sets = asked_sets((case / "constant" / "reactions").read_text())
        lib = run_copy(rel)

        def to_inline(c, sets=sets):
            (c / "constant" / "reactions").write_text(
                inline_text(sets, present_species(c)))
        inl = run_copy(rel, to_inline)
        ok, why = same(lib, inl)
        compared += ok
        if not ok:
            failures.append(f"{rel}: the library form and the inline form differ: {why}")

    # (d) sabotage ---------------------------------------------------------------
    base = "tutorials/batch/combustion/ignition01_h2o2"
    lib = run_copy(base)
    stem = "H+O2=O+OH"
    src_file = "OConaire2004.dat"

    def doubled_case_record(c):
        d = c / "constant" / "kinetics" / stem
        d.mkdir(parents=True, exist_ok=True)
        t = (KIN / stem / src_file).read_text()
        if "A 1.9100e+14" not in t:
            raise gatekit.EditNotApplied(stem + ": the probe's text to change is absent -- the probe is stale")
        (d / src_file).write_text(case_records.as_variation(
            src_file[:-4], t.replace("A 1.9100e+14", "A 3.8200e+14"), "gate probe: a doubled A"))
    sab = run_copy(base, doubled_case_record)
    if same(lib, sab)[0]:
        failures.append("sabotage arm: a case-tier record with a doubled A did not move ignition01 "
                        "(the precedence case > standards, or the comparison, is blind)")

    def doubled_inline(c):
        t = inline_text(["OConaire2004"], present_species(c))
        if "A 1.9100e+14" not in t:
            raise gatekit.EditNotApplied("the inline form has no `A 1.91e14` -- the probe is stale")
        (c / "constant" / "reactions").write_text(t.replace("A 1.9100e+14", "A 3.8200e+14", 1))
    sab2 = run_copy(base, doubled_inline)
    if same(lib, sab2)[0]:
        failures.append("sabotage arm: an inline copy with one A doubled equals the library run "
                        "(the byte-identity comparison cannot see a drifted copy)")

    # (d2) a collider named by an ALIAS gives the same numbers as its canonical name --
    #      `hydrogen` is H2's alias; a key dropped as "absent" would change R8's efficiency
    alias_stem = "H+OH+M=water+M"

    def alias_record(c):
        d = c / "constant" / "kinetics" / alias_stem
        d.mkdir(parents=True, exist_ok=True)
        t = (KIN / alias_stem / src_file).read_text()
        if "H2 0.73;" not in t:
            raise gatekit.EditNotApplied(alias_stem + ": the probe's text to change is absent")
        (d / src_file).write_text(case_records.as_variation(
            src_file[:-4], t.replace("H2 0.73;", "hydrogen 0.73;"), "gate probe: a collider written by its alias"))
    rc_a, out_a, st_a = run_copy(base, alias_record)
    ok_a, why_a = same(lib, (rc_a, out_a, st_a))
    if not ok_a:
        failures.append("alias arm: a third-body efficiency written `hydrogen` (H2's alias) must equal `H2`: " + why_a)
    if "[kineticsLibrary] third-body efficiencies of species not in this run (" in out_a and "hydrogen" in out_a.split("not in this run (")[1].split(")")[0]:
        failures.append("alias arm: the alias was dropped as absent from the run")

    # (e) K_c of the set's thermo against the run's -------------------------------
    def set_with_home(c):
        d = c / "constant" / "kinetics" / "sets"
        d.mkdir(parents=True, exist_ok=True)
        t = (SETS / "OConaire2004.dat").read_text()
        t = re.sub(r"thermochemistry\s*\{[^}]*\}",
                   'thermochemistry { citation "gate probe"; home NASA-TP-2002-211556; }', t)
        (d / "OConaire2004.dat").write_text(case_records.as_variation(
            "OConaire2004", t, "gate probe: the set declares a catalogue home"))
    rc, out, _ = run_copy(base, set_with_home)
    m = re.search(r"R11_HO2_H_2OH [^:]*: K_c\(set\)/K_c\(run\) = (\S+)", out)
    if rc != 0 or not m:
        failures.append("witness (e): no K_c(set)/K_c(run) line for R11 (exit %s)" % rc)
    elif abs(float(m.group(1)) - 1.0) > 1e-9:
        failures.append("witness (e): R11 (H, HO2, OH: all read from the very home the set names) "
                        "must give K_c(set)/K_c(run) = 1, got %s" % m.group(1))
    m7 = re.search(r"R7_O_H_M_OH_M [^:]*: K_c\(set\)/K_c\(run\) = (\S+)", out)
    if not m7 or abs(float(m7.group(1)) - 1.0) > 1e-9:
        failures.append("witness (e): R7 (O, H, OH: read from the very home the set names) must give 1")
    if not re.search(r"R1_H_O2_O_OH [^:]*: not compared -- O2 \(no record in NASA-TP-2002-211556\)", out):
        failures.append("witness (e): R1 has O2, which the home does not hold: it must say 'not compared', naming O2")

    # (f) explicit reverses ------------------------------------------------------
    def pair(arev):
        def mutate(c):
            r = c / "constant" / "reactions"
            r.write_text(r.read_text() + """
XF
{
    reversible false;
    stoichiometry
    (
        { component H;  nu -1; order 1; }
        { component O2; nu -1; order 1; }
        { component O;  nu  1; order 0; }
        { component OH; nu  1; order 0; }
    );
    kinetics { type modifiedArrhenius; A 1.91e14; b 0.0; Ea 16.44;
               units { A "cm3/mol/s"; Ea "kcal/mol"; } }
}
XR
{
    reversible false;
    stoichiometry
    (
        { component O;  nu -1; order 1; }
        { component OH; nu -1; order 1; }
        { component H;  nu  1; order 0; }
        { component O2; nu  1; order 0; }
    );
    kinetics { type modifiedArrhenius; A %s; b 0.0; Ea 0.0;
               units { A "cm3/mol/s"; Ea "kcal/mol"; } }
}
XA
{
    reversible false;
    stoichiometry
    (
        { component H;  nu -1; order 1; }
        { component O2; nu -1; order 1; }
        { component O;  nu  1; order 0; }
        { component OH; nu  1; order 0; }
    );
    kinetics { type Arrhenius; A 1.91e11; Ea 68784.96; A_rev %s; Ea_rev 0.0; }
}
""" % (arev, arev))
            f = c / "system" / "flowsheetDict"
            f.write_text(f.read_text().replace("R19b_H2O2_OH_H2O_HO2", "R19b_H2O2_OH_H2O_HO2 XF XR XA"))
        return mutate

    def ratios(out):
        two = re.search(r"XF and XR \(two irreversible entries\): k_f/k_r = (\S+), K_c = (\S+), \(k_f/k_r\)/K_c = (\S+)", out)
        leg = re.search(r"XA \(explicit A_rev/Ea_rev\): k_f/k_r = (\S+), K_c = (\S+), \(k_f/k_r\)/K_c = (\S+)", out)
        return two, leg
    rc, out, _ = run_copy(base, pair("1.0e14"))
    two, leg = ratios(out)
    if rc != 0 or not two or not leg:
        failures.append("witness (f): the reverse-consistency print is missing "
                        "(exit %s, pair %s, leg %s)" % (rc, bool(two), bool(leg)))
    else:
        r_two = float(two.group(3))
        # A_rev scaled by r makes k_f/k_r = K_c: the print must say 1.
        # (cm3/mol/s pair: A_rev in the same unit; SI leg: k_f/k_r is dimensionless here.)
        rc2, out2, _ = run_copy(base, pair("%.10e" % (1.0e14 * r_two)))
        two2, _ = ratios(out2)
        if rc2 != 0 or not two2 or abs(float(two2.group(3)) - 1.0) > 1e-4:
            failures.append("witness (f): two irreversible entries with A_rev from the first print do not "
                            "print (k_f/k_r)/K_c = 1 (got %s)" % (two2.group(3) if two2 else "no line"))
        r_leg = float(leg.group(3))
        rc3, out3, _ = run_copy(base, pair("%.10e" % (1.0e14 * r_leg)))
        _, leg3 = ratios(out3)
        if rc3 != 0 or not leg3 or abs(float(leg3.group(3)) - 1.0) > 1e-4:
            failures.append("witness (f): the A_rev leg with A_rev from the first print does not print "
                            "(k_f/k_r)/K_c = 1 (got %s)" % (leg3.group(3) if leg3 else "no line"))

    # (g) TWO SOURCES OF ONE EQUATION coexist, and the case must say which: a second source's file beside
    #     O Conaire's for H+O2=O+OH (case tier); `reactionRecords` without a source is REFUSED naming both,
    #     with one it is read; the numbers read are the named source's.
    def two_sources(ask):
        def mutate(c):
            d = c / "constant" / "kinetics" / stem
            d.mkdir(parents=True, exist_ok=True)
            t = (KIN / stem / src_file).read_text()
            if "A 1.9100e+14" not in t:
                raise gatekit.EditNotApplied(stem + ": the probe's text to change is absent -- the probe is stale")
            (d / "Other2099.dat").write_text(t.replace("A 1.9100e+14", "A 3.8200e+14").replace("OConaire2004", "Other2099"))
            r = c / "constant" / "reactions"
            txt = re.sub(r"(?m)^reactionSet\s+OConaire2004;", ask, r.read_text())
            if txt == r.read_text() and ask != "reactionSet OConaire2004;":
                raise gatekit.EditNotApplied("`reactionSet OConaire2004;` is absent from the probe's reactions")
            r.write_text(txt)
        return mutate
    rc_g, out_g, _ = run_copy(base, two_sources('reactionRecords ( { record "H+O2=O+OH"; name R1x; } );'))
    if rc_g == 0 or "without a source" not in out_g or "OConaire2004" not in out_g or "Other2099" not in out_g:
        failures.append("arm (g): `reactionRecords` for an equation two sources carry, with no source named, must be REFUSED "
                        "naming both sources (exit %s)" % rc_g)
    rc_h, out_h, _ = run_copy(base, two_sources('reactionRecords ( { record "H+O2=O+OH"; source Other2099; name R1x; } );'))
    if "without a source" in out_h or "which does not carry it" in out_h:
        failures.append("arm (g): naming the source must read the record: " + out_h[-200:])
    if "R1x" not in out_h and rc_h == 0:
        failures.append("arm (g): the reaction asked by source did not enter the run")
    # a set that draws one equation from two sources is refused too
    rc_i, out_i, _ = run_copy(base, lambda c: (two_sources('reactionSet OConaire2004;')(c),
        (c / "constant" / "kinetics" / stem / "Other2099.dat").write_text(
            (c / "constant" / "kinetics" / stem / "Other2099.dat").read_text().replace("Other2099 R1_H_O2_O_OH;", "OConaire2004 R1_H_O2_O_OH;"))))
    if rc_i == 0 or "from two sources" not in out_i:
        failures.append("arm (g): a set naming one equation from two sources must be refused (exit %s)" % rc_i)

    # (h) the name rules are real: a reaction folder or source named with a character Windows refuses, or two names
    #     equal ignoring case, is a failure (the helper the records are held to is itself tried here)
    for bad in ("Src:1", "Src*", "Src?", "Src<", "Src>", 'Src"', "Src\\", "Src|", "Src name", "Src."):
        if not name_problem(bad):
            failures.append(f"arm (h): the name '{bad}' must be refused")
    if name_problem("MillerBowman1989_B") or name_problem("H+O2(+M)=HO2(+M)@1"):
        failures.append("arm (h): a legal source or equation name was refused")
    if case_collisions(["OConaire2004", "oconaire2004"]) != [("OConaire2004", "oconaire2004")] or case_collisions(["a", "b"]):
        failures.append("arm (h): two names equal ignoring case are not told apart from two different ones")

    return gatekit.verdict(
        "check_kinetics_library", failures,
        f"{n} records (canonical names, atoms, units, sources with pages; {unrecorded} page(s) unrecorded on "
        f"interim records; {nvals} O Conaire constants equal journal page 607 as the review read it; {nmb} Miller & Bowman constants (all 235 + 73 rows of Appendices A and B) equal the table as the review read it; the {nshipped} entries the cases carried inline are written back unchanged; {ngl} Glarborg constants equal journal pages 34 and 41; two sources of one equation coexist and a case must name one), {len(members)} sets, {compared}/{len(cases)} shipped cases byte-identical to their "
        "inline form; a doubled A in a case-tier record or an inline copy is seen; K_c of a set's thermo and "
        "k_f/k_r against K_c are printed")


if __name__ == "__main__":
    sys.exit(main())
