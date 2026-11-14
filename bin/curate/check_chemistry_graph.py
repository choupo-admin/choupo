#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the tree of chemistry (data/standards/routes/) is ONE graph that balances,
cites, reaches and does not loop in silence.

    bin/curate/check_chemistry_graph.py

WHY THIS EXISTS (DEV.md 4c C191 A, 2026-11-01).  The EduTool "The tree of
chemistry" draws a curated graph: substances as nodes, production routes as
edges, each edge a reaction with its stoichiometry, a yield band, its forced
co-products and a citation.  Nothing in the engine reads the record, so no
case can fail when it is wrong -- a route written with one hydrogen too many,
a citation left blank, a product no feedstock reaches, a loop the DEPTH view
would walk for ever, each would ship at exit 0.  A record no engine reads is
held by a gate or by nobody.

WHAT IS CHECKED, over every `.dat` under data/standards/routes/:

  (a) ONE `recordType routeGraph` header and at least one `recordType
      productionRoutes` file naming it; the scan root exists and the counts
      clear a collapsed-scan floor (100 substances, 100 routes).
  (b) SUBSTANCES: names unique; a node naming a `component` has a catalogue
      record (data/standards/components/<name>.dat) and carries NO formula or
      CAS of its own (both are READ from the record -- one home); a node
      without one carries a formula in the engine's grammar unless it is
      `kind lumped`; a lumped node carries none.
  (c) EVERY ROUTE: unique name; `target` a node; `kind` reaction | separation
      | processYield; `family` one of the header's `processFamilies`; `era`
      incumbent | transition; a description; a non-empty `provenance` list
      whose every `source` is declared in the header; a `yield` block
      (reaction, separation) with a known `basis`, a band 0 < lo <= hi, and
      `origin literature` (with `locus`) or `origin assumed` (with `reason`).
  (d) EVERY REACTION BALANCES: the stoichiometry's atoms sum to zero per
      element, the formulas parsed by a mirror of src/thermo/
      ElementComposition.H's grammar against the engine's own atomic-weight
      table (src/thermo/AtomicWeights.cpp -- the one home of the element
      list); the target has nu > 0, there is at least one reactant, no lumped
      node appears, and the yield's basis element is in the target's formula.
  (e) A SEPARATION names a `feed` node and no stoichiometry; a PROCESS YIELD
      names a `feed`, a `slate` of nodes with `massPerKgFeed ( lo hi )`,
      0 < lo <= hi, the target among them, and no `yield` block.  A lumped
      node appears ONLY as a feed or in a slate.
  (f) EVERY CITED CHOUPO CASE EXISTS (a directory under the tree with a
      system/controlDict).
  (g) TOPOLOGY: the 7 organic + 4 inorganic roots are declared and every
      member is a node; every node is on at least one route; every node is
      reachable from a feedstock (a node with no inbound arc) in the full
      graph (reactants/feed -> every product/slate member).
  (h) CYCLES: the graph of TARGET arcs (reactant -> the route's target, the
      arcs the DEPTH view walks) minus the routes marked `cycle "<reason>"`
      is acyclic; and every `cycle`-marked route lies on a cycle of the FULL
      graph (a stale pin fails -- the mark must still be earning its keep).
  (i) SOURCES: every declared source carries a citation, a licence word in
      {ccBy4, ccBy3, citedWork, publicDomain} and a verification word in
      {checkedCopy, bibliographicRecord, titleOnly}; every source is cited by
      at least one route or volume; every production volume names nodes, a
      source, a positive value, a unit and a basis.

WHAT IS NOT CHECKED, said so its OK line cannot imply it: whether a yield band
is TRUE of its route (most bands are `origin assumed`, the curator's, and the
census prints how many); whether a citation's locus is right; whether the
route list is COMPLETE (a missing route is invisible to a graph check).

SABOTAGES, by hand on a scratch copy, 2026-11-01 (the outputs are in the
record, docs/design/the-tree-of-chemistry-is-a-record.md section 7):
  S1 `nu -0.5` -> `nu -1` on ethyleneOxidation          -> FAIL, "does not
     balance: O  reactants 2.0 vs products 1.0".
  S2 the provenance list of hockCleavage emptied         -> FAIL, "cites no
     source".
  S3 the `cycle` mark removed from ethyleneHydration     -> FAIL, naming the
     cycle ethylene -> ethanol -> ethylene.
  S4 `cases ( "tutorials/plant/cumene01" )` on a route    -> FAIL, "names a
     Choupo case that does not exist".
  S5 a `formula C2H4;` typed on the ethylene node         -> FAIL, "carries
     formula although it names a component".
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROUTES = ROOT / "data" / "standards" / "routes"
COMPONENTS = ROOT / "data" / "standards" / "components"
ATOMIC_WEIGHTS = ROOT / "src" / "thermo" / "AtomicWeights.cpp"

KINDS = {"reaction", "separation", "processYield"}
ERAS = {"incumbent", "transition"}
BASES = {"carbon": "C", "hydrogen": "H", "nitrogen": "N", "sulfur": "S",
         "chlorine": "Cl", "phosphorus": "P", "mass": None}
LICENCES = {"ccBy4", "ccBy3", "citedWork", "publicDomain"}
VERIFICATIONS = {"checkedCopy", "bibliographicRecord", "titleOnly"}
ORIGINS = {"literature", "assumed"}
NODE_KINDS = {"molecule", "polymer", "lumped"}
FLOOR_NODES, FLOOR_EDGES = 100, 100


# ------------------------------------------------------------------ dict reader
def tokens(text):
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c.isspace():
            i += 1
        elif text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
        elif c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 1
            out.append(("str", text[i + 1:j]))
            i = j + 1
        elif c in "{}();":
            out.append(("p", c))
            i += 1
        else:
            j = i
            while j < n and not text[j].isspace() and text[j] not in '{}();"':
                j += 1
            out.append(("w", text[i:j]))
            i = j
    return out


def parse_block(tk, i):
    d = {}
    while i < len(tk) and tk[i] != ("p", "}"):
        key = tk[i][1]
        i += 1
        if tk[i] == ("p", "{"):
            d[key], i = parse_block(tk, i + 1)
            i += 1
        elif tk[i] == ("p", "("):
            d[key], i = parse_list(tk, i + 1)
            i += 1
            if i < len(tk) and tk[i] == ("p", ";"):
                i += 1
        else:
            vals = []
            while tk[i] != ("p", ";"):
                vals.append(tk[i][1])
                i += 1
            d[key] = vals[0] if len(vals) == 1 else vals
            i += 1
    return d, i


def parse_list(tk, i):
    out = []
    while tk[i] != ("p", ")"):
        if tk[i] == ("p", "{"):
            b, i = parse_block(tk, i + 1)
            out.append(b)
            i += 1
        else:
            out.append(tk[i][1])
            i += 1
    return out, i


def read_dict(path):
    d, _ = parse_block(tokens(path.read_text()), 0)
    return d


def as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


# ------------------------------------------------------------------ formulas
def load_elements():
    """The engine's own element list, read from AtomicWeights.cpp (the shape
    bin/curate/propose_lennard_jones.py uses), plus the isotopes D and T the
    ElementComposition grammar keeps as their own symbols."""
    text = ATOMIC_WEIGHTS.read_text(encoding="utf-8")
    syms = {m for m in re.findall(r'\{\s*"([A-Za-z]+)",\s*[0-9.]+\s*\}', text)}
    if len(syms) < 30:
        sys.exit("check_chemistry_graph: FAILED -- could not read the element "
                 "list from src/thermo/AtomicWeights.cpp")
    return syms | {"D", "T"}


ELEMENTS = None


class FormulaError(Exception):
    pass


def parse_formula(formula):
    """Atoms per formula unit under the grammar of src/thermo/
    ElementComposition.H: segments joined by ':' or the middle dot (hydrates,
    each with an optional leading count), units = element[count] or
    (units)[count], counts integer or decimal, a trailing charge ('+', '-',
    'SO4-2', 'Ca+2') that changes no atoms.  The WHOLE string must parse."""
    f = formula.strip()
    if not f:
        raise FormulaError("empty formula")
    m = re.search(r"([+-])(\d*)$", f)
    if m and not re.search(r"[A-Za-z)]\d*$", f[:m.start()] + "x"):
        pass
    if m:
        f = f[:m.start()]
    atoms = defaultdict(float)
    for seg in re.split(r"[:·]", f):
        if not seg:
            raise FormulaError("empty segment in '%s'" % formula)
        mult = 1.0
        mm = re.match(r"(\d+(?:\.\d+)?)", seg)
        if mm:
            mult = float(mm.group(1))
            seg = seg[mm.end():]
        pos, sub = _units(seg, 0, formula)
        if pos != len(seg):
            raise FormulaError("could not parse '%s' at '%s'" % (formula, seg[pos:]))
        for k, v in sub.items():
            atoms[k] += mult * v
    if not atoms:
        raise FormulaError("no atoms in '%s'" % formula)
    return dict(atoms)


def _count(s, i):
    m = re.match(r"\d+(?:\.\d+)?", s[i:])
    if m:
        return float(m.group(0)), i + m.end()
    return 1.0, i


def _units(s, i, whole):
    atoms = defaultdict(float)
    n = len(s)
    while i < n and s[i] != ")":
        if s[i] == "(":
            j, sub = _units(s, i + 1, whole)
            if j >= n or s[j] != ")":
                raise FormulaError("unclosed '(' in '%s'" % whole)
            cnt, j = _count(s, j + 1)
            for k, v in sub.items():
                atoms[k] += cnt * v
            i = j
        else:
            m = re.match(r"[A-Z][a-z]?", s[i:])
            if not m:
                raise FormulaError("could not parse '%s' at '%s'" % (whole, s[i:]))
            sym = m.group(0)
            if sym not in ELEMENTS:
                if len(sym) == 2 and sym[0] in ELEMENTS:
                    sym = sym[0]
                    m = re.match(r"[A-Z]", s[i:])
                else:
                    raise FormulaError("unknown element '%s' in '%s'" % (sym, whole))
            cnt, j = _count(s, i + m.end())
            atoms[sym] += cnt
            i = j
    return i, atoms


# ------------------------------------------------------------------ catalogue
def component_identity(name):
    """(formula, cas) of a catalogue component, or None when no record exists.
    The formula is the record's first token (polymers write the repeat unit
    first, then the structure in words)."""
    p = COMPONENTS / (name + ".dat")
    if not p.is_file():
        return None
    text = p.read_text(errors="ignore")
    fm = re.search(r'^\s*formula\s+("?)([^";]+)\1\s*;', text, re.M)
    cm = re.search(r"^\s*CAS\s+([0-9-]+)\s*;", text, re.M)
    formula = fm.group(2).strip().split()[0] if fm else None
    return formula, (cm.group(1) if cm else None)


# ------------------------------------------------------------------ main
def main():
    global ELEMENTS
    fail = []
    if not ROUTES.is_dir():
        print("check_chemistry_graph: FAILED -- data/standards/routes/ does not "
              "exist; the gate cannot see what it audits.")
        return 1
    ELEMENTS = load_elements()

    files = sorted(ROUTES.glob("*.dat"))
    headers, route_files = [], []
    for p in files:
        try:
            d = read_dict(p)
        except Exception as e:  # a file the reader cannot parse is a failure
            fail.append("%s: unreadable (%s)" % (p.name, e))
            continue
        rt = d.get("recordType")
        if rt == "routeGraph":
            headers.append((p, d))
        elif rt == "productionRoutes":
            route_files.append((p, d))
        else:
            fail.append("%s: recordType '%s' is neither routeGraph nor "
                        "productionRoutes" % (p.name, rt))
    if len(headers) != 1:
        fail.append("expected exactly ONE routeGraph header, found %d" % len(headers))
        return finish(fail, None)
    hp, H = headers[0]
    gname = H.get("name")
    for p, d in route_files:
        if d.get("graph") != gname:
            fail.append("%s: `graph %s;` does not name the header's graph '%s'"
                        % (p.name, d.get("graph"), gname))
    if not route_files:
        fail.append("no productionRoutes file beside the header")

    # ---- (b) substances --------------------------------------------------
    nodes = {}
    for s in as_list(H.get("substances")):
        if not isinstance(s, dict) or "name" not in s:
            fail.append("a substance entry without a name")
            continue
        nm = s["name"]
        if nm in nodes:
            fail.append("substance '%s' declared twice" % nm)
            continue
        kind = s.get("kind", "molecule")
        if kind not in NODE_KINDS:
            fail.append("substance '%s': kind '%s' unknown" % (nm, kind))
        formula, cas = None, None
        if "component" in s:
            ident = component_identity(s["component"])
            if ident is None:
                fail.append("substance '%s' names component '%s' and no "
                            "data/standards/components/%s.dat exists"
                            % (nm, s["component"], s["component"]))
            else:
                formula, cas = ident
                if formula is None and kind != "lumped":
                    fail.append("substance '%s': component record '%s' carries no "
                                "formula" % (nm, s["component"]))
            for k in ("formula", "cas"):
                if k in s:
                    fail.append("substance '%s' carries %s although it names a "
                                "component -- the record is the one home; delete "
                                "the field" % (nm, k))
        else:
            formula, cas = s.get("formula"), s.get("cas")
            if kind == "lumped" and formula:
                fail.append("substance '%s' is lumped and carries a formula" % nm)
            if kind != "lumped" and not formula:
                fail.append("substance '%s' has no component and no formula" % nm)
        atoms = None
        if formula and kind != "lumped":
            try:
                atoms = parse_formula(formula)
            except FormulaError as e:
                fail.append("substance '%s': %s" % (nm, e))
        if not s.get("label"):
            fail.append("substance '%s' has no label" % nm)
        nodes[nm] = dict(kind=kind, formula=formula, cas=cas, atoms=atoms,
                         label=s.get("label", ""))

    # ---- header lists -------------------------------------------------------
    families = {}
    for f in as_list(H.get("processFamilies")):
        if isinstance(f, dict) and "name" in f and f.get("meaning"):
            families[f["name"]] = f["meaning"]
        else:
            fail.append("a processFamilies entry without name/meaning")
    sources = {}
    for s in as_list(H.get("sources")):
        if not isinstance(s, dict) or "name" not in s:
            fail.append("a source entry without a name")
            continue
        sid = s["name"]
        if not s.get("citation"):
            fail.append("source '%s' has no citation" % sid)
        if s.get("licence") not in LICENCES:
            fail.append("source '%s': licence '%s' is not one of %s"
                        % (sid, s.get("licence"), sorted(LICENCES)))
        if s.get("verification") not in VERIFICATIONS:
            fail.append("source '%s': verification '%s' is not one of %s"
                        % (sid, s.get("verification"), sorted(VERIFICATIONS)))
        sources[sid] = s
    cited = defaultdict(int)
    roots = []
    for r in as_list(H.get("roots")):
        if not isinstance(r, dict) or "name" not in r:
            fail.append("a roots entry without a name")
            continue
        grp = r.get("group")
        if grp not in ("organic", "inorganic"):
            fail.append("root '%s': group '%s' is not organic|inorganic" % (r["name"], grp))
        members = as_list(r.get("members"))
        if not members:
            fail.append("root '%s' has no members" % r["name"])
        for m in members:
            if m not in nodes:
                fail.append("root '%s' names member '%s', not a substance" % (r["name"], m))
        roots.append((r["name"], grp, members))
    n_org = sum(1 for _, g, _ in roots if g == "organic")
    n_inorg = sum(1 for _, g, _ in roots if g == "inorganic")
    if (n_org, n_inorg) != (7, 4):
        fail.append("the roots are %d organic + %d inorganic; the architect's "
                    "message is SEVEN + FOUR" % (n_org, n_inorg))
    volumes = as_list(H.get("productionVolumes"))
    for v in volumes:
        if not isinstance(v, dict):
            fail.append("a productionVolumes entry that is not a block")
            continue
        for m in as_list(v.get("substances")):
            if m not in nodes:
                fail.append("production volume names '%s', not a substance" % m)
        try:
            if float(v.get("value", "x")) <= 0:
                raise ValueError
        except ValueError:
            fail.append("production volume for %s has no positive value" % v.get("substances"))
        for k in ("unit", "basis", "locus"):
            if not v.get(k):
                fail.append("production volume for %s has no %s" % (v.get("substances"), k))
        if v.get("source") not in sources:
            fail.append("production volume for %s cites unknown source '%s'"
                        % (v.get("substances"), v.get("source")))
        else:
            cited[v["source"]] += 1

    # ---- (c)-(f) routes -----------------------------------------------------
    routes = {}
    full_arcs = defaultdict(set)     # node -> nodes it feeds (every product)
    target_arcs = defaultdict(set)   # node -> targets it feeds
    inbound_full = defaultdict(set)
    target_inbound = defaultdict(set)
    cycle_marked = []
    n_cases, cases_seen = 0, set()
    yield_origin = defaultdict(int)
    kinds = defaultdict(int)
    eras = defaultdict(int)
    h2_per_c = []
    coproduct_only = set()

    def nu_of(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    for p, d in route_files:
        for e in as_list(d.get("routes")):
            if not isinstance(e, dict) or "name" not in e:
                fail.append("%s: a route without a name" % p.name)
                continue
            nm = e["name"]
            where = "%s/%s" % (p.name, nm)
            if nm in routes:
                fail.append("%s: route '%s' declared twice" % (p.name, nm))
                continue
            routes[nm] = e
            kind = e.get("kind")
            if kind not in KINDS:
                fail.append("%s: kind '%s' unknown" % (where, kind))
                continue
            kinds[kind] += 1
            era = e.get("era")
            if era not in ERAS:
                fail.append("%s: era '%s' is not incumbent|transition" % (where, era))
            eras[era] += 1
            fam = e.get("family")
            if fam not in families:
                fail.append("%s: family '%s' is not in the header's processFamilies"
                            % (where, fam))
            if not e.get("description"):
                fail.append("%s: no description" % where)
            target = e.get("target")
            if target not in nodes:
                fail.append("%s: target '%s' is not a substance" % (where, target))
                continue
            # provenance
            prov = [x for x in as_list(e.get("provenance")) if isinstance(x, dict)]
            if not prov:
                fail.append("%s: cites no source -- an uncited route is refused "
                            "entry (a title or a DOI is a citation)" % where)
            for x in prov:
                if x.get("source") not in sources:
                    fail.append("%s: provenance names unknown source '%s'"
                                % (where, x.get("source")))
                else:
                    cited[x["source"]] += 1
            # cases
            for c in as_list(e.get("cases")):
                n_cases += 1
                cd = ROOT / c
                if not (cd / "system" / "controlDict").is_file():
                    fail.append("%s: names a Choupo case that does not exist: %s"
                                % (where, c))
                else:
                    cases_seen.add(c)
            # yield
            y = e.get("yield")
            if kind in ("reaction", "separation"):
                if not isinstance(y, dict):
                    fail.append("%s: no yield block" % where)
                    y = {}
                basis = y.get("basis")
                if basis not in BASES:
                    fail.append("%s: yield basis '%s' is not one of %s"
                                % (where, basis, sorted(BASES)))
                band = [nu_of(b) for b in as_list(y.get("band"))]
                if len(band) != 2 or None in band or not (0 < band[0] <= band[1]):
                    fail.append("%s: yield band must be ( lo hi ) with 0 < lo <= hi, "
                                "got %s" % (where, y.get("band")))
                elif BASES.get(basis) and band[1] > 1.0:
                    fail.append("%s: an atom-basis yield cannot exceed 1 (%s)"
                                % (where, y.get("band")))
                org = y.get("origin")
                if org not in ORIGINS:
                    fail.append("%s: yield origin '%s' is not literature|assumed"
                                % (where, org))
                else:
                    yield_origin[org] += 1
                    need = "locus" if org == "literature" else "reason"
                    if not y.get(need):
                        fail.append("%s: yield origin %s needs a %s" % (where, org, need))
            elif y is not None:
                fail.append("%s: a processYield carries a yield block; its slate IS "
                            "the yield" % where)
            # energy
            for en in as_list(e.get("energy")):
                if not isinstance(en, dict):
                    fail.append("%s: an energy entry that is not a block" % where)
                    continue
                band = [nu_of(b) for b in as_list(en.get("band"))]
                if len(band) != 2 or None in band or not (0 < band[0] <= band[1]):
                    fail.append("%s: energy band must be ( lo hi ), got %s"
                                % (where, en.get("band")))
                for k in ("route", "unit"):
                    if not en.get(k):
                        fail.append("%s: energy entry has no %s" % (where, k))
                org = en.get("origin")
                if org not in ORIGINS:
                    fail.append("%s: energy origin '%s' is not literature|assumed"
                                % (where, org))
                elif not en.get("locus" if org == "literature" else "reason"):
                    fail.append("%s: energy origin %s needs its locus/reason" % (where, org))
            # cycle mark
            if e.get("cycle"):
                cycle_marked.append(nm)
            # ---- by kind
            reactants, products = [], []
            if kind == "reaction":
                if "feed" in e:
                    fail.append("%s: a reaction carries `feed`; its reactants are the "
                                "stoichiometry" % where)
                st = [x for x in as_list(e.get("stoichiometry")) if isinstance(x, dict)]
                if not st:
                    fail.append("%s: a reaction with no stoichiometry" % where)
                    continue
                total = defaultdict(float)
                ok = True
                for x in st:
                    c, nu = x.get("component"), nu_of(x.get("nu"))
                    if c not in nodes:
                        fail.append("%s: stoichiometry names '%s', not a substance" % (where, c))
                        ok = False
                        continue
                    if nodes[c]["kind"] == "lumped":
                        fail.append("%s: lumped substance '%s' in a stoichiometry -- a "
                                    "cut has no formula to balance" % (where, c))
                        ok = False
                        continue
                    if nu is None or nu == 0:
                        fail.append("%s: '%s' has nu %s" % (where, c, x.get("nu")))
                        ok = False
                        continue
                    (reactants if nu < 0 else products).append(c)
                    if nodes[c]["atoms"]:
                        for el, k in nodes[c]["atoms"].items():
                            total[el] += nu * k
                    else:
                        ok = False
                if target not in products:
                    fail.append("%s: the target '%s' is not a product of its own "
                                "stoichiometry" % (where, target))
                if not reactants:
                    fail.append("%s: no reactant" % where)
                if ok:
                    bad = {el: v for el, v in total.items() if abs(v) > 1e-9}
                    if bad:
                        parts = []
                        for el in sorted(bad):
                            r = sum(-nu_of(x["nu"]) * nodes[x["component"]]["atoms"].get(el, 0)
                                    for x in st if nu_of(x["nu"]) < 0)
                            pr = sum(nu_of(x["nu"]) * nodes[x["component"]]["atoms"].get(el, 0)
                                     for x in st if nu_of(x["nu"]) > 0)
                            parts.append("%s  reactants %g vs products %g" % (el, r, pr))
                        fail.append("%s: does not balance: %s" % (where, "; ".join(parts)))
                    basis_el = BASES.get(y.get("basis")) if isinstance(y, dict) else None
                    if basis_el and nodes[target]["atoms"] and basis_el not in nodes[target]["atoms"]:
                        fail.append("%s: yield basis %s but the target '%s' has no %s"
                                    % (where, y.get("basis"), target, basis_el))
                    # hydrogen per carbon of the target, derived, never stored
                    h2 = sum(-nu_of(x["nu"]) for x in st
                             if x["component"] == "H2" and nu_of(x["nu"]) < 0)
                    nu_t = sum(nu_of(x["nu"]) for x in st if x["component"] == target)
                    c_t = nodes[target]["atoms"].get("C", 0) if nodes[target]["atoms"] else 0
                    if h2 > 0 and c_t > 0 and nu_t > 0:
                        h2_per_c.append((nm, era, target, h2 / (nu_t * c_t)))
            else:
                feed = e.get("feed")
                if feed not in nodes:
                    fail.append("%s: feed '%s' is not a substance" % (where, feed))
                    continue
                if "stoichiometry" in e:
                    fail.append("%s: a %s carries a stoichiometry" % (where, kind))
                reactants = [feed]
                if kind == "separation":
                    if "slate" in e:
                        fail.append("%s: a separation carries a slate" % where)
                    if isinstance(y, dict) and y.get("basis") != "mass":
                        fail.append("%s: a separation's yield is on a mass basis" % where)
                    products = [target]
                else:
                    slate = [x for x in as_list(e.get("slate")) if isinstance(x, dict)]
                    if not slate:
                        fail.append("%s: a processYield with no slate" % where)
                    for x in slate:
                        c = x.get("component")
                        if c not in nodes:
                            fail.append("%s: slate names '%s', not a substance" % (where, c))
                            continue
                        products.append(c)
                        band = [nu_of(b) for b in as_list(x.get("massPerKgFeed"))]
                        if len(band) != 2 or None in band or not (0 < band[0] <= band[1]):
                            fail.append("%s: slate '%s' needs massPerKgFeed ( lo hi ), "
                                        "0 < lo <= hi" % (where, c))
                        org = x.get("origin")
                        if org not in ORIGINS:
                            fail.append("%s: slate '%s' origin '%s'" % (where, c, org))
                        else:
                            yield_origin[org] += 1
                            if not x.get("locus" if org == "literature" else "reason"):
                                fail.append("%s: slate '%s' needs its locus/reason" % (where, c))
                    if target not in products:
                        fail.append("%s: the target '%s' is not in its slate" % (where, target))
            for r in reactants:
                for pr in products:
                    full_arcs[r].add(pr)
                    inbound_full[pr].add(r)
                target_arcs[r].add(target)
                target_inbound[target].add(r)
            e["_reactants"], e["_products"] = reactants, products

    # ---- unused sources -----------------------------------------------------
    for sid in sources:
        if cited[sid] == 0:
            fail.append("source '%s' is declared and cited by nothing" % sid)

    # ---- (g) topology -------------------------------------------------------
    on_route = set(full_arcs) | set(inbound_full)
    for nm in nodes:
        if nm not in on_route:
            fail.append("substance '%s' is on no route" % nm)
    feedstocks = sorted(n for n in nodes if n in on_route and not inbound_full.get(n))
    reach = set(feedstocks)
    stack = list(feedstocks)
    while stack:
        x = stack.pop()
        for y in full_arcs.get(x, ()):
            if y not in reach:
                reach.add(y)
                stack.append(y)
    for nm in nodes:
        if nm in on_route and nm not in reach:
            fail.append("substance '%s' is reachable from no feedstock" % nm)
    for nm in nodes:
        if nm in on_route and inbound_full.get(nm) and not target_inbound.get(nm):
            coproduct_only.add(nm)

    # ---- (h) cycles ---------------------------------------------------------
    marked = set(cycle_marked)
    t_arcs = defaultdict(set)
    for nm, e in routes.items():
        if nm in marked or "_reactants" not in e:
            continue
        for r in e["_reactants"]:
            t_arcs[r].add(e["target"])
    cyc = find_cycle(t_arcs)
    if cyc:
        fail.append("the target graph has an undeclared cycle: %s -- a DEPTH view "
                    "would walk it for ever; mark the route that closes it with "
                    "`cycle \"<why>\";`" % " -> ".join(cyc))
    for nm in cycle_marked:
        e = routes[nm]
        if "_reactants" not in e:
            continue
        # does a path lead from any product of this route back to a reactant?
        on_cycle = False
        for pr in e["_products"]:
            seen, stack = set(), [pr]
            while stack:
                x = stack.pop()
                if x in e["_reactants"]:
                    on_cycle = True
                    break
                for y in full_arcs.get(x, ()):
                    if y not in seen:
                        seen.add(y)
                        stack.append(y)
            if on_cycle:
                break
        if not on_cycle:
            fail.append("route '%s' is marked `cycle` and lies on no cycle of the "
                        "full graph -- a stale pin; remove the mark" % nm)

    # ---- floors -------------------------------------------------------------
    if len(nodes) < FLOOR_NODES or len(routes) < FLOOR_EDGES:
        fail.append("only %d substances and %d routes read against floors of %d / %d; "
                    "the scan surface has collapsed" % (len(nodes), len(routes),
                                                        FLOOR_NODES, FLOOR_EDGES))

    census = dict(nodes=nodes, routes=routes, roots=roots, feedstocks=feedstocks,
                  kinds=kinds, eras=eras, yield_origin=yield_origin, n_cases=n_cases,
                  cases=cases_seen, h2=h2_per_c, coproduct_only=coproduct_only,
                  sources=sources, volumes=volumes, target_inbound=target_inbound,
                  full_arcs=full_arcs, cycle_marked=cycle_marked, files=len(files))
    return finish(fail, census)


def find_cycle(arcs):
    """One cycle of a directed graph as a node list, or None (iterative DFS)."""
    WHITE, GREY, BLACK = 0, 1, 2
    colour = defaultdict(int)
    parent = {}
    for s in list(arcs):
        if colour[s]:
            continue
        stack = [(s, iter(sorted(arcs.get(s, ()))))]
        colour[s] = GREY
        while stack:
            x, it = stack[-1]
            nxt = next(it, None)
            if nxt is None:
                colour[x] = BLACK
                stack.pop()
                continue
            if colour[nxt] == GREY:
                path = [nxt]
                for y, _ in reversed(stack):
                    path.append(y)
                    if y == nxt:
                        break
                return list(reversed(path))
            if colour[nxt] == WHITE:
                colour[nxt] = GREY
                parent[nxt] = x
                stack.append((nxt, iter(sorted(arcs.get(nxt, ())))))
    return None


def finish(fail, c):
    if fail:
        print("check_chemistry_graph: FAILED (%d)" % len(fail))
        for f in fail:
            print("  - " + f)
        return 1
    nodes, routes = c["nodes"], c["routes"]
    root_members = {m for _, _, ms in c["roots"] for m in ms}
    products = sorted(n for n in nodes if not c["full_arcs"].get(n))
    inter = sorted(n for n in nodes if n not in root_members and n not in c["feedstocks"]
                   and n not in products)
    yo = c["yield_origin"]
    print("check_chemistry_graph: the tree of chemistry")
    print("  substances %d: feedstocks %d, roots %d (members %d), intermediates %d, "
          "products (leaves) %d" % (len(nodes), len(c["feedstocks"]), len(c["roots"]),
                                    len(root_members), len(inter), len(products)))
    print("  routes %d: %s; era %s" % (
        len(routes), ", ".join("%s %d" % kv for kv in sorted(c["kinds"].items())),
        ", ".join("%s %d" % kv for kv in sorted(c["eras"].items()))))
    print("  yield / slate numbers: literature %d, assumed %d (the curator's bands, "
          "each with its reason)" % (yo["literature"], yo["assumed"]))
    print("  sources %d, production volumes %d, Choupo cases linked %d (%d distinct), "
          "cycle-marked routes %d" % (len(c["sources"]), len(c["volumes"]), c["n_cases"],
                                      len(c["cases"]), len(c["cycle_marked"])))
    print("  co-product-only substances (made by no route built for them): %s"
          % ", ".join(sorted(c["coproduct_only"])))
    print("  H2 consumed per carbon of the target, DERIVED from the stoichiometry "
          "(transition routes):")
    for nm, era, t, v in sorted(c["h2"]):
        if era == "transition":
            print("    %-28s -> %-14s %.2f mol H2 / mol C" % (nm, t, v))
    print("check_chemistry_graph: OK -- %d files, %d substances, %d routes: every "
          "reaction balances on the engine's element table, every route cites a "
          "declared source, every substance is reachable from a feedstock, the "
          "target graph has no undeclared cycle, 7 + 4 roots declared, every cited "
          "case exists.  NOT checked: whether a yield band (%d of %d are `assumed`) "
          "or a locus is TRUE, or whether the route list is complete."
          % (c["files"], len(nodes), len(routes), yo["assumed"],
             yo["assumed"] + yo["literature"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
