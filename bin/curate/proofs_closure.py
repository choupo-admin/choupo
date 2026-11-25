#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""VENDORED, unchanged in logic, from bin/curate/measure_independent_closure.py of the
cloud branch claude/choupo-simulator-new-session-s494v2 (C491 step 0), for proofs.py T4.
MEASUREMENT TOOL -- NOT a gate, NOT wired into bin/runTests.

    bin/curate/measure_independent_closure.py <caseDir> [<caseDir> ...] [--md]

WHAT IT MEASURES.  The closure gates (check_mass_closure, check_element_closure,
check_element_balance, check_energy_closure) read the number the ENGINE's own
balance report computed (reports/balances/*.csv); none recomputes it.  If the
report's code left a stream out, misread a formula or mis-scaled a unit, every
gate would agree with it.  This script recomputes the mass and the element
closures OUTSIDE the engine, from nothing but:

  * the stream state files the engine WROTE (converged/<...>/<stream>,
    `componentMolarFlows`, kmol/h at 10 digits),
  * the topology declared in system/flowsheetDict (`units (...)` for a flat
    case, `connections {...}` for a sectored plant),
  * the component records (`formula`, `MW`), resolved by its OWN rule:
    nearest constant/components/<name>.dat up the tree, then
    data/standards/components, data/standards/species, data/local/components.

It imports NOTHING from the engine tree and parses the formulas with its own
small grammar (not src/thermo/ElementComposition).  It then prints, next to its
own numbers, the engine's (massBalance.csv, elementBalance.csv) and the
difference.

WHAT IT DOES NOT DO (named, never papered over).  Energy: an enthalpy needs the
property package, so no independent energy closure is attempted.  A case it
cannot handle -- a stream file it cannot resolve to exactly one file, a unit it
cannot read, a component with no parsable formula or MW, a flow in an unknown
unit, an extra stream block -- is reported NOT JUDGED with the reason and is
left out of any verdict.

Reads only; writes nothing.  Run after `choupoSolve <case>` so converged/ and
reports/balances/ exist.
"""
import csv
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# --------------------------------------------------------------------------
# Dictionary text helpers (own tokenizer; deliberately not the engine's)
# --------------------------------------------------------------------------


def strip_comments(txt):
    txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    return re.sub(r"//[^\n]*", "", txt)


def match_close(txt, i, o, c):
    """txt[i] == o; return index of the matching close."""
    d = 0
    for j in range(i, len(txt)):
        if txt[j] == o:
            d += 1
        elif txt[j] == c:
            d -= 1
            if d == 0:
                return j
    raise ValueError("unbalanced " + o)


def top_level_blocks(body):
    """Split `{...} {...}` into the brace bodies."""
    out, i = [], 0
    while True:
        i = body.find("{", i)
        if i < 0:
            return out
        j = match_close(body, i, "{", "}")
        out.append(body[i + 1:j])
        i = j + 1


def list_after(txt, key):
    """The words of `key ( a b c );` at the top of txt, or None."""
    m = re.search(r"(?<![A-Za-z0-9_])" + key + r"\s*\(", txt)
    if not m:
        return None
    i = m.end() - 1
    j = match_close(txt, i, "(", ")")
    return txt[i + 1:j].split()


# --------------------------------------------------------------------------
# Formula -> atoms (own grammar)
# --------------------------------------------------------------------------

ELEMENT = re.compile(r"[A-Z][a-z]?")
NUM = re.compile(r"\d+(?:\.\d+)?")


def parse_formula(f):
    """atoms per formula unit, or raise ValueError.  Handles hydrate/adduct
    segments joined by ':' or the middle dot, parentheses, decimals, and a
    trailing charge ('+', '-', '+2', 'SO4-2')."""
    f = f.strip().strip('"')
    out = {}
    for seg in re.split(r"[:·]", f):
        seg = seg.strip()
        m = re.match(r"^(\d+(?:\.\d+)?)(.*)$", seg)
        mult = 1.0
        if m and not seg[len(m.group(1)):][:1].islower():
            mult, seg = float(m.group(1)), m.group(2)
        # trailing charge: sign alone, or sign before digits
        seg = re.sub(r"[+-]\d*$", "", seg)
        atoms, pos = _units(seg, 0, closing=False)
        if pos != len(seg):
            raise ValueError("cannot parse formula %r" % f)
        for k, v in atoms.items():
            out[k] = out.get(k, 0.0) + mult * v
    if not out:
        raise ValueError("empty formula")
    return out


def _units(s, pos, closing):
    atoms = {}
    while pos < len(s):
        ch = s[pos]
        if ch == "(":
            sub, p2 = _units(s, pos + 1, True)
            m = NUM.match(s, p2)
            k = float(m.group()) if m else 1.0
            pos = m.end() if m else p2
            for e, v in sub.items():
                atoms[e] = atoms.get(e, 0.0) + k * v
        elif ch == ")":
            if not closing:
                raise ValueError("stray )")
            return atoms, pos + 1
        else:
            m = ELEMENT.match(s, pos)
            if not m:
                raise ValueError("bad character at %d in %r" % (pos, s))
            e = m.group()
            pos = m.end()
            m2 = NUM.match(s, pos)
            k = float(m2.group()) if m2 else 1.0
            pos = m2.end() if m2 else pos
            atoms[e] = atoms.get(e, 0.0) + k
    if closing:
        raise ValueError("missing )")
    return atoms, pos


# --------------------------------------------------------------------------
# Component records
# --------------------------------------------------------------------------


def field(txt, key):
    m = re.search(r"(?m)^\s*" + key + r"\s+(\"[^\"]*\"|[^;\n]+?)\s*;", txt)
    return m.group(1).strip().strip('"') if m else None


def case_root(case):
    """The case folder holding constant/thermoPhysPropDict (walk up)."""
    p = case.resolve()
    for _ in range(4):
        if (p / "constant" / "thermoPhysPropDict").exists():
            return p
        p = p.parent
    return case.resolve()


def find_record(name, croot):
    homes = []
    p = croot
    for _ in range(6):
        homes.append(p / "constant" / "components" / (name + ".dat"))
        p = p.parent
    local = next((h for h in homes if h.exists()), None)
    std = [ROOT / "data/standards/components" / (name + ".dat"),
           ROOT / "data/standards/species" / (name + ".dat"),
           ROOT / "data/local/components" / (name + ".dat")]
    base = next((s for s in std if s.exists()), None)
    texts = []
    if base:
        texts.append(strip_comments(base.read_text(errors="ignore")))
    if local:
        texts.append(strip_comments(local.read_text(errors="ignore")))
    return texts          # later wins, field by field


def component_data(name, croot):
    texts = find_record(name, croot)
    if not texts:
        raise LookupError("no component record for '%s'" % name)
    mw = formula = None
    for t in texts:
        mw = field(t, "MW") or mw
        formula = field(t, "formula") or formula
    if mw is None:
        raise LookupError("component '%s': no MW field" % name)
    if formula is None:
        raise LookupError("component '%s': no formula field" % name)
    return float(mw.split()[0]), parse_formula(formula), formula


# --------------------------------------------------------------------------
# Stream files
# --------------------------------------------------------------------------

UNIT_TO_KMOL_H = {"kmol/h": 1.0, "mol/h": 1e-3, "kmol/s": 3600.0,
                  "mol/s": 3.6, "kmol/min": 60.0, "mol/min": 0.06}


def read_stream(path):
    txt = strip_comments(path.read_text(errors="ignore"))
    keys = set(re.findall(r"(?m)^([A-Za-z][A-Za-z0-9_]*)", txt))
    extra = keys - {"componentMolarFlows", "T", "P", "phase", "phases",
                    "recordType", "divergences"}
    if extra:
        raise ValueError("stream file %s carries blocks the independent reader "
                         "does not handle: %s" % (path.name, sorted(extra)))
    m = re.search(r"componentMolarFlows\s*\{", txt)
    if not m:
        raise ValueError("%s has no componentMolarFlows" % path.name)
    j = match_close(txt, m.end() - 1, "{", "}")
    flows = {}
    for line in txt[m.end():j].split(";"):
        w = line.split()
        if not w:
            continue
        if len(w) == 2:
            val, unit = float(w[1]), "kmol/h"      # unit-less = kmol/h? refuse:
            raise ValueError("%s: flow of %s has no unit" % (path.name, w[0]))
        if len(w) != 3 or w[2] not in UNIT_TO_KMOL_H:
            raise ValueError("%s: flow line %r: unit not handled" % (path.name, line.strip()))
        flows[w[0]] = float(w[1]) * UNIT_TO_KMOL_H[w[2]]
    return flows


# --------------------------------------------------------------------------
# Topology -> (feeds, products, internal) and where each file lives
# --------------------------------------------------------------------------


def parse_flat_units(fdict):
    m = re.search(r"(?<![A-Za-z0-9_])units\s*\(", fdict)
    if not m:                       # proofs.py: refuse by name instead of an AttributeError
        raise ValueError("flowsheetDict has no `units (` list the independent reader can parse")
    i = m.end() - 1
    j = match_close(fdict, i, "(", ")")
    body = fdict[i + 1:j]
    units = []
    for blk in top_level_blocks(body):
        # keep only depth-0 text of the block (drop nested {...})
        flat, d = [], 0
        for ch in blk:
            if ch == "{":
                d += 1
            elif ch == "}":
                d -= 1
            elif d == 0:
                flat.append(ch)
        flat = "".join(flat)
        name = re.search(r"\bname\s+([^;\s]+)", flat)
        ins = list_after(flat, "inputs")
        outs = list_after(flat, "outputs")
        if ins is None:
            m1 = re.search(r"\bin\s+([^;\s]+)\s*;", flat)
            ins = [m1.group(1)] if m1 else []
        if outs is None:
            m1 = re.search(r"\bout\s+([^;\s]+)\s*;", flat)
            outs = [m1.group(1)] if m1 else []
        units.append((name.group(1) if name else "?", ins, outs))
    return units


def topology(case):
    """Return dict: feeds, products, internal (stream -> file path), plus notes."""
    fd = strip_comments((case / "system/flowsheetDict").read_text(errors="ignore"))
    conv = case / "converged"
    notes = []
    feeds, products, internal = {}, {}, {}
    if re.search(r"(?<![A-Za-z0-9_])connections\s*\{", fd) and re.search(
            r"(?<![A-Za-z0-9_])sectors\s*\(", fd):
        # sectored plant: connections { name { from S/p; to S/p; } }
        m = re.search(r"connections\s*\{", fd)
        j = match_close(fd, m.end() - 1, "{", "}")
        body = fd[m.end():j]
        sectors = list_after(fd, "sectors") or []
        pos = 0
        while True:
            mm = re.compile(r"([A-Za-z0-9_]+)\s*\{").search(body, pos)
            if not mm:
                break
            k = match_close(body, mm.end() - 1, "{", "}")
            sub = body[mm.end():k]
            pos = k + 1
            frm = re.search(r"\bfrom\s+([^;\s]+)\s*;", sub)
            to = re.search(r"\bto\s+([^;\s]+)\s*;", sub)
            s = mm.group(1)
            cands = [conv / "MAIN" / s]
            if frm:
                sec = frm.group(1).split("/")[0]
                cands += [conv / sec / s, conv / sec / frm.group(1).split("/")[1]]
            hits = []
            for c in cands:
                if c.is_file() and c not in hits:
                    hits.append(c)
            for sec in sectors:
                c = conv / sec / s
                if c.is_file() and c not in hits and (frm or True):
                    hits.append(c)
            if len(hits) != 1:
                raise ValueError("stream '%s': %d candidate state files %s (need exactly 1)"
                                 % (s, len(hits), [str(h.relative_to(case)) for h in hits]))
            if to and not frm:
                feeds[s] = hits[0]
            elif frm and not to:
                products[s] = hits[0]
            elif frm and to:
                internal[s] = hits[0]
            else:
                raise ValueError("stream '%s' has neither from nor to" % s)
        # sub-sector streams (inside one sector) are internal, counted by file
        for sec in sectors:
            d = conv / sec
            if d.is_dir():
                for f in d.iterdir():
                    if f.is_file() and f not in set(feeds.values()) | set(products.values()) | set(internal.values()):
                        internal["%s/%s" % (sec, f.name)] = f
        notes.append("sectored plant (%d sectors)" % len(sectors))
        # cross-check against the declared boundary{} when present
        bm = re.search(r"boundary\s*\{", fd)
        if bm:
            bb = fd[bm.end():match_close(fd, bm.end() - 1, "{", "}")]
            di, do = set(list_after(bb, "inlets") or []), set(list_after(bb, "outlets") or [])
            if di and di != set(feeds):
                notes.append("declared inlets %s != inferred feeds %s" % (sorted(di), sorted(feeds)))
            if do and do != set(products):
                notes.append("declared outlets %s != inferred products %s" % (sorted(do), sorted(products)))
    else:
        units = parse_flat_units(fd)
        if not units:
            raise ValueError("no units parsed from flowsheetDict")
        cons = {s for _, i, _ in units for s in i}
        prod = {s for _, _, o in units for s in o}
        observers = {n for n, i, o in units if i and not o}
        if observers:
            raise ValueError("observer units %s (no outputs): feed classification is a "
                             "convention the independent method does not take" % sorted(observers))
        for s in sorted(cons | prod):
            p = conv / s
            if not p.is_file():
                raise ValueError("stream '%s' has no file under converged/" % s)
            if s in cons and s not in prod:
                feeds[s] = p
            elif s in prod and s not in cons:
                products[s] = p
            else:
                internal[s] = p
        notes.append("flat, %d units" % len(units))
    return feeds, products, internal, notes


# --------------------------------------------------------------------------
# Engine's numbers
# --------------------------------------------------------------------------


def engine_mass(case):
    p = case / "reports/balances/massBalance.csv"
    rows = {}
    for r in csv.reader(p.read_text().splitlines()):
        if r and r[0] and r[0] not in ("component",):
            rows[r[0]] = r[1:]
    tot = rows["TOTAL"]
    return float(tot[0]), float(tot[1]), float(rows["closure_pct"][2])


def engine_elements(case):
    p = case / "reports/balances/elementBalance.csv"
    out = {}
    for r in list(csv.reader(p.read_text().splitlines()))[1:]:
        if len(r) == 5 and r[0] != "element":
            out[r[0]] = (float(r[1]), float(r[2]), float(r[4]))
    return out


def pct(i, o):
    return 100.0 * o / i if i else float("nan")


def measure(case):
    case = Path(case)
    res = {"case": case.name, "family": case.parent.name}
    try:
        croot = case_root(case)
        feeds, products, internal, notes = topology(case)
        res["counts"] = (len(feeds), len(products), len(internal))
        res["notes"] = notes
        comps = {}
        flows = {}
        for grp, d in (("in", feeds), ("out", products)):
            for s, p in d.items():
                flows[(grp, s)] = read_stream(p)
        names = sorted({c for f in flows.values() for c in f})
        for c in names:
            comps[c] = component_data(c, croot)
        mi = mo = 0.0
        ei, eo = {}, {}
        for (grp, s), f in flows.items():
            for c, n in f.items():
                mw, atoms, _ = comps[c]
                if grp == "in":
                    mi += n * mw
                else:
                    mo += n * mw
                tgt = ei if grp == "in" else eo
                for e, k in atoms.items():
                    tgt[e] = tgt.get(e, 0.0) + n * k
        res["mass"] = (mi, mo, pct(mi, mo))
        res["elem"] = {e: (ei.get(e, 0.0), eo.get(e, 0.0), pct(ei.get(e, 0.0), eo.get(e, 0.0)))
                       for e in sorted(set(ei) | set(eo))}
    except (ValueError, LookupError, KeyError, OSError) as ex:
        res["notjudged"] = "%s: %s" % (type(ex).__name__, ex)
        return res
    try:
        res["eng_mass"] = engine_mass(case)
        res["eng_elem"] = engine_elements(case)
    except (OSError, KeyError, ValueError, IndexError) as ex:
        res["notjudged"] = "engine report unreadable: %s" % ex
    return res


# agreement: the engine reads the same stream values from memory, we read them
# from a 10-digit file; closure percentages therefore agree to ~1e-7.  TOL is
# 1e-4 percentage points -- 5000x tighter than the mass gate's band (0.5) and
# 100x tighter than the element gate's (0.01), loose enough to absorb 10-digit
# truncation on a residual that is itself a few ppm of the flow.
TOL_PCT = 1e-4
TOL_REL = 1e-6      # relative agreement of the kg/h and kmol-atom/h totals


def verdict(r):
    if "notjudged" in r:
        return "NOT JUDGED", r["notjudged"]
    why = []
    mi, mo, c = r["mass"]
    emi, emo, ec = r["eng_mass"]
    if abs(c - ec) > TOL_PCT:
        why.append("mass closure %.6f vs %.6f" % (c, ec))
    # the CSV prints kg/h with 4 decimals: absolute floor 6e-5 (proofs.py change to the vendored text)
    if abs(mi - emi) > max(TOL_REL * abs(emi), 6e-5) or abs(mo - emo) > max(TOL_REL * abs(emo), 6e-5):
        why.append("mass totals in %.4f/%.4f out %.4f/%.4f" % (mi, emi, mo, emo))
    for e, (ai, ao, ac) in r["elem"].items():
        if e not in r["eng_elem"]:
            why.append("element %s absent from the engine report" % e)
            continue
        bi, bo, bc = r["eng_elem"][e]
        # engine prints kmol-atom/h at 7 sig. digits and closure at 4 decimals
        if (abs(ai - bi) > max(1e-5 * abs(bi), 1e-7)) or (abs(ao - bo) > max(1e-5 * abs(bo), 1e-7)):   # proofs.py: absolute floor 1e-7 kmol atom/h (state files print tiny flows coarsely)
            why.append("element %s in/out %.6e/%.6e vs %.6e/%.6e" % (e, ai, ao, bi, bo))
        if abs(ac - bc) > 5e-4 + 100 * 1e-7 / max(abs(bi), 1e-30):                  # the CSV's 4 decimals
            why.append("element %s closure %.5f vs %.4f" % (e, ac, bc))
    for e in r["eng_elem"]:
        if e not in r["elem"]:
            why.append("element %s only in the engine report" % e)
    return ("DISAGREE", "; ".join(why)) if why else ("AGREE", "")


def worst_element(elem):
    return max(((abs(100.0 - v[2]), e, v[2]) for e, v in elem.items()
                if not math.isnan(v[2])), default=(0, "-", 100.0))


def main(argv):
    md = "--md" in argv
    cases = [a for a in argv if not a.startswith("--")]
    if not cases:
        print(__doc__)
        return 2
    if md:
        print("| case | family | feeds/products/internal | mass in / out kg/h (independent) | "
              "mass closure % indep. | engine | worst element indep. | engine | verdict |")
        print("|---|---|---|---|---|---|---|---|---|")
    for c in cases:
        r = measure(c)
        v, why = verdict(r)
        if "mass" in r and "eng_mass" in r:
            mi, mo, mc = r["mass"]
            we = worst_element(r["elem"])
            ewe = worst_element(r["eng_elem"])
            if md:
                print("| %s | %s | %d/%d/%d | %.4f / %.4f | %.6f | %.4f | %s %.5f | %s %.4f | %s%s |"
                      % (r["case"], r["family"], *r["counts"], mi, mo, mc, r["eng_mass"][2],
                         we[1], we[2], ewe[1], ewe[2], v, (": " + why) if why else ""))
            else:
                print("%-45s %s  mass %.6f vs engine %.4f  worst elem %s %.5f vs %s %.4f  %s %s"
                      % (r["case"], r["counts"], mc, r["eng_mass"][2], we[1], we[2],
                         ewe[1], ewe[2], v, why))
        else:
            cnt = "%d/%d/%d" % r["counts"] if "counts" in r else "-"
            if md:
                print("| %s | %s | %s | - | - | - | - | - | %s: %s |" % (r["case"], r["family"], cnt, v, why))
            else:
                print("%-45s %s %s: %s" % (r["case"], cnt, v, why))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
