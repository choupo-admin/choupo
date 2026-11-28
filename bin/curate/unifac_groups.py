#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""unifac_groups -- the original-UNIFAC subgroups of a molecule, DERIVED FROM ITS STRUCTURE.

    bin/curate/unifac_groups.py --validate            agree with the records that already carry groups?
    bin/curate/unifac_groups.py --list                what would be written, and what stays ungrouped (and why)
    bin/curate/unifac_groups.py --write [NAME ...]    write `groups { unifac (...) }` + provenance into records
    bin/curate/unifac_groups.py --smiles SMILES       decompose one structure

WHY (Explorer defect 2026-11-25: picking tertButylbenzene and UNIFAC ended in "no group
decomposition").  A UNIFAC decomposition is a FACT OF STRUCTURE: the molecule is cut
into the subgroups of Hansen et al. 1991 (data/standards/parameters/UNIFAC/groups.dat).
No table of decompositions is copied here; the cut is computed by rules written in this
file, from the molecular graph, and a molecule the rules cannot cut UNIQUELY is left
without groups and listed with the reason -- a wrong decomposition answers without
complaint, an absent one is refused by name.

STRUCTURE SOURCE.  The record's CAS selects a SMILES in the ChemSep structure listing
(thirdParty/chemsep/pcd/casn.dat + smil.dat, the offline copy the importer already uses;
--chemsep DIR to point elsewhere).  Only the structure is read -- it is a fact, and the
groups that follow from it are Choupo's own.  The atom count of the SMILES must reproduce the
record's `formula`, else the structure is rejected (a SMILES that is another substance
must never decide a decomposition).

THE RULES (a subgroup claims atoms; every heavy atom must be claimed, else the molecule stays
ungrouped).  In this order: whole molecules the table defines as one group (water, methanol,
ethylene glycol, DMSO, CS2, DMF, NMP, morpholine, furfural, acrylonitrile); carbonyl carbons
(acid, ester, carbonate, amide, ketone, aldehyde; the CH3/CH2 beside the carbonyl is absorbed
into CH3CO/CH2CO/CH3COO/CH2COO); nitriles, nitro, halogens on carbon (Cl, F and mixed), Br, I;
alcohols and phenols; thiols; ethers and sulfides (one alkyl neighbour absorbed: CH3 before CH2
before CH, a neighbour not on an aromatic ring first); amines; alkenes and alkynes; pyridine and
thiophene rings; the benzene ring (ACH, AC, ACCH3/ACCH2/ACCH, ACOH, ACCl, ACF, ACNH2, ACNO2);
the remaining sp3 carbons (CH3, CH2, CH, C).  Left UNGROUPED on purpose: a sp3 carbon bridging
two aromatic carbons, three-membered rings, lactones, aryl esters, radicals and ions, any atom no
subgroup covers, and any group name absent from groups.dat.
"""
import argparse
import csv
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP = ROOT / "data" / "standards" / "components"
GROUPS = ROOT / "data" / "standards" / "parameters" / "UNIFAC" / "groups.dat"
SCRIPT = "bin/curate/unifac_groups.py"
CHEMSEP_DEFAULT = ROOT / "thirdParty" / "chemsep" / "pcd"
CHEMSEP_FALLBACK = Path("/home/vitor/Choupo/thirdParty/chemsep/pcd")

# ----------------------------------------------------------------------------- SMILES graph

ORGANIC = {"B": 3, "C": 4, "N": 3, "O": 2, "P": 3, "S": 2, "F": 1, "Cl": 1, "Br": 1, "I": 1}
AROM = {"b": "B", "c": "C", "n": "N", "o": "O", "p": "P", "s": "S"}


class Mol:
    def __init__(self):
        self.el, self.arom, self.H, self.chg = [], [], [], []
        self.nb = []                # list of {j: order}; order 1,2,3 or 1.5

    def add(self, el, arom, H, chg):
        self.el.append(el); self.arom.append(arom); self.H.append(H); self.chg.append(chg)
        self.nb.append({})
        return len(self.el) - 1

    def bond(self, i, j, o):
        self.nb[i][j] = o; self.nb[j][i] = o

    @property
    def n(self):
        return len(self.el)


def parse_smiles(s):
    m = Mol()
    pend = []                       # (atom index, explicit H or None) fixed up after bonds are known
    explicit = {}
    prev, stack, ring, bond = None, [], {}, None
    i = 0
    while i < len(s):
        c = s[i]
        if c == "(":
            stack.append(prev); i += 1; continue
        if c == ")":
            prev = stack.pop(); i += 1; continue
        if c in "-=#:/\\":
            bond = {"-": 1, "=": 2, "#": 3, ":": 1.5, "/": 1, "\\": 1}[c]; i += 1; continue
        if c == ".":
            prev = None; i += 1; continue
        if c.isdigit() or c == "%":
            if c == "%":
                num = s[i + 1:i + 3]; i += 3
            else:
                num = c; i += 1
            if num in ring:
                j, ob = ring.pop(num)
                o = bond or ob or (1.5 if m.arom[prev] and m.arom[j] else 1)
                m.bond(prev, j, o)
            else:
                ring[num] = (prev, bond)
            bond = None
            continue
        # atom
        if c == "[":
            k = s.index("]", i)
            body = s[i + 1:k]
            mm = re.match(r"(\d*)([A-Z][a-z]?|[bcnops]|se|as)(@*)(H\d*)?([+-]+\d*)?(:\d+)?$", body)
            if not mm:
                raise ValueError(f"bracket atom {body!r}")
            sym = mm.group(2)
            arom = sym in AROM
            el = AROM.get(sym, sym)
            h = 0
            if mm.group(4):
                h = int(mm.group(4)[1:] or 1)
            chg = 0
            if mm.group(5):
                q = mm.group(5)
                chg = (1 if q[0] == "+" else -1) * (int(q[1:]) if q[1:].isdigit() else len(q))
            a = m.add(el, arom, h, chg)
            explicit[a] = True
            i = k + 1
        else:
            if s[i:i + 2] in ("Cl", "Br"):
                sym = s[i:i + 2]; i += 2
            else:
                sym = c; i += 1
            arom = sym in AROM
            el = AROM.get(sym, sym)
            if el not in ORGANIC:
                raise ValueError(f"atom {sym!r}")
            a = m.add(el, arom, 0, 0)
        if prev is not None:
            o = bond or (1.5 if m.arom[prev] and m.arom[a] else 1)
            m.bond(prev, a, o)
        bond = None
        prev = a
    # implicit hydrogens of organic-subset atoms
    for a in range(m.n):
        if a in explicit:
            continue
        v = ORGANIC[m.el[a]]
        if m.arom[a]:
            na = sum(1 for j, o in m.nb[a].items() if o == 1.5)
            exo = sum(o for j, o in m.nb[a].items() if o != 1.5)
            if m.el[a] == "C":
                m.H[a] = max(0, v - exo - (3 if na == 2 else 4))
            else:
                m.H[a] = 0
        else:
            m.H[a] = max(0, v - int(sum(m.nb[a].values())))
    # explicit [H] atoms (stereo SMILES) are folded into the heavy atom's count
    for a in range(m.n):
        if m.el[a] == "H" and len(m.nb[a]) == 1:
            j = next(iter(m.nb[a]))
            if m.el[j] != "H":
                m.H[j] += 1
                m.nb[j].pop(a); m.nb[a].clear(); m.el[a] = "-"
    keep = [a for a in range(m.n) if m.el[a] != "-"]
    if len(keep) != m.n:
        idx = {a: k for k, a in enumerate(keep)}
        m.el = [m.el[a] for a in keep]; m.arom = [m.arom[a] for a in keep]
        m.H = [m.H[a] for a in keep]; m.chg = [m.chg[a] for a in keep]
        m.nb = [{idx[j]: o for j, o in m.nb[a].items()} for a in keep]
    return m


def perceive_aromatic(m):
    """Kekule benzene/pyridine/thiophene rings -> aromatic (the SMILES listing mixes both styles).

    A six-membered ring of C/N atoms is aromatic when EVERY ring atom carries exactly one double bond to
    a ring-bound C/N partner (inside this ring or in a fused one): six pi electrons, Hueckel.  A ring
    atom with a double bond to O, to a chain atom, or none (sp3) makes it non-aromatic.  Thiophene: five
    atoms, one S, two C=C."""
    ring_atoms = set()
    for r in rings_of(m, 6):
        ring_atoms |= r

    def dbl(a):
        return [j for j, o in m.nb[a].items() if o == 2]

    todo = []
    for ring in rings_of(m, 6):
        if len(ring) not in (5, 6) or any(m.arom[a] for a in ring):
            continue
        if len(ring) == 6 and all(m.el[a] in ("C", "N") and len(dbl(a)) == 1 and dbl(a)[0] in ring_atoms
                                  and m.el[dbl(a)[0]] in ("C", "N") for a in ring):
            todo.append(ring)
        elif len(ring) == 5 and sum(1 for a in ring if m.el[a] == "S") == 1 \
                and sum(1 for a in ring for j in dbl(a) if j in ring) == 4 \
                and all(m.el[a] in ("C", "S") for a in ring):
            todo.append(ring)
    for ring in todo:
        for a in ring:
            m.arom[a] = True
    for ring in todo:
        for a in ring:
            for j in list(m.nb[a]):
                if j in ring:
                    m.nb[a][j] = 1.5; m.nb[j][a] = 1.5
    return m


def formula_of(m):
    cnt = Counter()
    for a in range(m.n):
        cnt[m.el[a]] += 1; cnt["H"] += m.H[a]
    return cnt


def parse_formula(f):
    cnt = Counter()
    for el, n in re.findall(r"([A-Z][a-z]?)(\d*)", f):
        cnt[el] += int(n or 1)
    return cnt


def wl_hash(m, rounds=4):
    lab = [(m.el[a], m.H[a], m.arom[a], m.chg[a], len(m.nb[a])) for a in range(m.n)]
    for _ in range(rounds):
        lab = [(lab[a], tuple(sorted((o, lab[j]) for j, o in m.nb[a].items()))) for a in range(m.n)]
        lab = [hash(x) for x in lab]
    return tuple(sorted(lab)), m.n


def rings_of(m, maxlen=8):
    """Set of frozenset(atoms) of simple cycles up to maxlen (enough for the molecules in scope)."""
    found = set()
    for s in range(m.n):
        stack = [(s, [s])]
        while stack:
            a, path = stack.pop()
            for j in m.nb[a]:
                if j == s and len(path) >= 3:
                    found.add(frozenset(path))
                elif j > s and j not in path and len(path) < maxlen:
                    stack.append((j, path + [j]))
    return found


# ----------------------------------------------------------------------------- the decomposition


class Ungroupable(Exception):
    pass


WHOLE = {   # group name -> reference SMILES; the table defines these as ONE group each
    "H2O": "O", "CH3OH": "CO", "_CH2OH_2": "OCCO", "Me2SO": "CS(C)=O", "CS2": "S=C=S",
    "DMF-1": "CN(C)C=O", "NMP": "CN1CCCC1=O", "Morpholine": "C1COCCN1",
    "Furfural": "O=Cc1ccco1", "ACRY": "C=CC#N",
}


def decompose(m, table):
    """{group: count} or raises Ungroupable(reason)."""
    if any(c != 0 for c in m.chg) and not _is_nitro_only(m):
        raise Ungroupable("charged species (ion or salt)")
    if all(e == "H" for e in m.el) or m.n == 0:
        raise Ungroupable("hydrogen / deuterium molecule (no heavy atom)")
    wh = wl_hash(m)
    for g, smi in WHOLE.items():
        if wh == wl_hash(parse_smiles(smi)) and g in table:
            return {g: 1}
    n = m.n
    claimed = [False] * n
    out = Counter()
    ring_sets = rings_of(m)
    in_ring = [any(a in r for r in ring_sets) for a in range(n)]
    ring3 = [any(a in r and len(r) == 3 for r in ring_sets) for a in range(n)]

    def heavy(a):
        return list(m.nb[a])

    def hasH(a):
        return m.H[a]

    def take(g, *atoms):
        if g not in table:
            raise Ungroupable(f"group {g} is not in groups.dat")
        for a in atoms:
            if claimed[a]:
                raise Ungroupable("internal: atom claimed twice")
            claimed[a] = True
        out[g] += 1

    def sp3c(a):
        return (m.el[a] == "C" and not m.arom[a] and not claimed[a]
                and all(o == 1 for o in m.nb[a].values()))

    def ar_nb(a):
        return sum(1 for j in m.nb[a] if m.arom[j])

    def absorb_rank(a):
        # which alkyl neighbour a hetero-centre swallows: CH3 before CH2 before CH, one off an aromatic ring first
        return ({3: 0, 2: 1, 1: 2}.get(m.H[a], 9), ar_nb(a) > 0, a)

    for a in range(n):
        if ring3[a] and m.el[a] != "C":
            raise Ungroupable("three-membered ring (epoxide, aziridine)")

    # ---- carbonyl carbons
    for c in range(n):
        if m.el[c] != "C" or m.arom[c] or claimed[c]:
            continue
        oxo = [j for j, o in m.nb[c].items() if o == 2 and m.el[j] == "O"]
        if not oxo:
            continue
        ox = oxo[0]
        rest = [j for j in m.nb[c] if j != ox]
        els = sorted(m.el[j] for j in rest)
        if any(in_ring[a] for a in (c, ox)) and any(m.el[j] == "O" for j in rest):
            raise Ungroupable("lactone / cyclic carbonate")
        if els == ["O", "O"]:
            o1, o2 = rest
            if m.H[o1] or m.H[o2]:
                raise Ungroupable("carbonic acid half-ester")
            take("OCOO", c, ox, o1, o2)
            continue
        if "O" in els and "N" not in els:
            o = [j for j in rest if m.el[j] == "O"][0]
            other = [j for j in rest if j != o]
            if len(other) > 1 or any(m.el[j] == "O" for j in other):
                raise Ungroupable("carbonyl with several oxygens")
            if m.H[o] == 1 and len(m.nb[o]) == 1:                     # carboxylic acid
                if not other:
                    take("HCOOH", c, ox, o)                         # formic acid
                    continue
                take("COOH", c, ox, o)
                continue
            if len(m.nb[o]) != 2 or m.H[o]:
                raise Ungroupable("unrecognised carbonyl-oxygen")
            if any(j != c and any(oo == 2 and m.el[k] == "O" for k, oo in m.nb[j].items()) for j in m.nb[o]):
                raise Ungroupable("anhydride (no subgroup)")
            if any(m.arom[j] and j != c for j in m.nb[o]):
                raise Ungroupable("aryl ester (no subgroup)")
            if not other:
                take("HCOO", c, ox, o)
                continue
            x = other[0]
            if sp3c(x) and m.H[x] == 3:
                take("CH3COO", c, ox, o, x)
            elif sp3c(x) and m.H[x] == 2:
                take("CH2COO", c, ox, o, x)
            else:
                take("COO", c, ox, o)
            continue
        if "N" in els:
            nn = [j for j in rest if m.el[j] == "N"][0]
            other = [j for j in rest if j != nn]
            if in_ring[c]:
                raise Ungroupable("lactam other than NMP")
            if other and other[0] is not None and not (sp3c(other[0]) or m.el[other[0]] == "C"):
                raise Ungroupable("amide with a non-carbon acyl neighbour")
            subs = [j for j in m.nb[nn] if j != c]
            if any(not sp3c(j) for j in subs) or m.H[nn] + len(subs) != 2:
                raise Ungroupable("amide not of the CONH2 / CONHR / CONR2 form")
            kinds = sorted(m.H[j] for j in subs)
            tab = {(): "CONH2", (3,): "CONHCH3", (2,): "CONHCH2", (3, 3): "CON_CH3_2",
                   (2, 3): "CONCH3CH2", (2, 2): "CON_CH2_2"}
            g = tab.get(tuple(kinds))
            if not g:
                raise Ungroupable("amide substituent without a subgroup")
            if not other:
                raise Ungroupable("formamide (no subgroup)")
            take(g, c, ox, nn)
            for j in subs:
                claimed[j] = True
            continue
        if not rest:
            raise Ungroupable("formaldehyde / carbon monoxide")
        if len(rest) == 1 and m.el[rest[0]] == "C" and m.H[c] == 1:   # aldehyde
            take("CHO", c, ox)
            continue
        if len(rest) == 2 and all(m.el[j] == "C" for j in rest):       # ketone
            cand = [j for j in rest if sp3c(j) and m.H[j] in (3, 2)]
            if not cand:
                raise Ungroupable("ketone with no CH3/CH2 neighbour (no subgroup)")
            x = sorted(cand, key=absorb_rank)[0]
            take("CH3CO" if m.H[x] == 3 else "CH2CO", c, ox, x)
            continue
        raise Ungroupable("carbonyl of an unrecognised kind")

    # ---- nitrile, nitro
    for c in range(n):
        if m.el[c] == "C" and not claimed[c]:
            tr = [j for j, o in m.nb[c].items() if o == 3 and m.el[j] == "N"]
            if tr:
                x = [j for j in m.nb[c] if j != tr[0]]
                if len(x) == 1 and sp3c(x[0]) and m.H[x[0]] in (3, 2):
                    take("CH3CN" if m.H[x[0]] == 3 else "CH2CN", x[0], c, tr[0])
                    continue
                raise Ungroupable("nitrile with no CH3/CH2 neighbour")
    for nn in range(n):
        if m.el[nn] == "N" and not claimed[nn]:
            os_ = [j for j in m.nb[nn] if m.el[j] == "O" and len(m.nb[j]) == 1]
            cs = [j for j in m.nb[nn] if m.el[j] == "C"]
            if len(os_) == 2 and len(cs) == 1:
                x = cs[0]
                if m.arom[x]:
                    take("ACNO2", x, nn, *os_)
                elif sp3c(x) and m.H[x] in (3, 2, 1):
                    take({3: "CH3NO2", 2: "CH2NO2", 1: "CHNO2"}[m.H[x]], x, nn, *os_)
                else:
                    raise Ungroupable("nitro on a carbon without a subgroup")

    # ---- halogens on carbon
    for c in range(n):
        if m.el[c] != "C" or claimed[c]:
            continue
        hal = [j for j in m.nb[c] if m.el[j] in ("Cl", "F") and not claimed[j]]
        if not hal:
            continue
        ncl = sum(1 for j in hal if m.el[j] == "Cl")
        nf = sum(1 for j in hal if m.el[j] == "F")
        h = m.H[c]
        if m.arom[c]:
            if len(hal) != 1:
                raise Ungroupable("aromatic carbon with two halogens")
            take("ACCl" if ncl else "ACF", c, hal[0])
            continue
        if any(o != 1 for o in m.nb[c].values()):
            raise Ungroupable("halogen on a multiply bonded carbon")
        key = (ncl, nf, h)
        if nf == 0:
            t = {(1, 0, 2): "CH2Cl", (1, 0, 1): "CHCl", (1, 0, 0): "CCl", (2, 0, 2): "CH2Cl2",
                 (2, 0, 1): "CHCl2", (2, 0, 0): "CCl2", (3, 0, 1): "CHCl3", (3, 0, 0): "CCl3", (4, 0, 0): "CCl4"}
        elif ncl == 0:
            t = {(0, 3, 0): "CF3", (0, 2, 0): "CF2", (0, 1, 0): "CF"}
        else:
            t = {(3, 1, 0): "CCl3F", (2, 1, 0): "CCl2F", (2, 1, 1): "HCCl2F", (1, 1, 1): "HCClF",
                 (1, 2, 0): "CClF2", (1, 2, 1): "HCClF2", (1, 3, 0): "CClF3", (2, 2, 0): "CCl2F2"}
        g = t.get(key)
        if not g:
            raise Ungroupable(f"halogenated carbon C(Cl{ncl},F{nf},H{h}) has no subgroup")
        take(g, c, *hal)
    for a in range(n):
        if claimed[a] or m.el[a] not in ("Br", "I", "Cl", "F"):
            continue
        if not m.nb[a]:
            raise Ungroupable("hydrogen halide / isolated halogen (no carbon)")
        x = list(m.nb[a])[0]
        if m.el[x] in ("Br", "I", "Cl", "F"):
            raise Ungroupable("interhalogen / elemental halogen (no subgroup)")
        if m.el[a] in ("Br", "I"):
            take(m.el[a], a)
        elif m.el[a] == "Cl" and m.el[x] == "C" and not m.arom[x] and any(o == 2 for o in m.nb[x].values()):
            take("Cl_C=C_", a)
        else:
            raise Ungroupable(f"{m.el[a]} bonded to a carbon pattern with no subgroup")

    # ---- 2-alkoxyethanols: HO-C-C-O-C is ONE subgroup (C2H5O2 with CH2CH2, C2H4O2 with CH2CH)
    pair_used = set()
    for z in range(n):
        if m.el[z] != "O" or claimed[z] or len(m.nb[z]) != 2 or m.H[z]:
            continue
        for q in m.nb[z]:
            for pc in m.nb[q]:
                if pc == z or not sp3c(q) or not sp3c(pc):
                    continue
                oh = [o for o in m.nb[pc] if m.el[o] == "O" and m.H[o] == 1 and len(m.nb[o]) == 1 and not claimed[o]]
                if oh and q != pc:
                    pair_used.add((z, q, pc, oh[0]))
    ethers = Counter(z for z, _, _, _ in pair_used)
    ohs = Counter(o for _, _, _, o in pair_used)
    if any(v > 1 for v in ethers.values()) or any(v > 1 for v in ohs.values()):
        raise Ungroupable("one ether oxygen or hydroxyl in two HO-C-C-O patterns (not unique)")
    for z, q, pc, o in sorted(pair_used):
        if claimed[q] or claimed[pc] or claimed[o]:
            continue
        h = m.H[q] + m.H[pc] + 1
        if h not in (5, 4):
            raise Ungroupable("HO-C-C-O pattern with a branched carbon pair (no subgroup)")
        take("C2H5O2" if h == 5 else "C2H4O2", z, q, pc, o)

    # ---- alcohols, phenols, thiols
    for o in range(n):
        if m.el[o] == "O" and not claimed[o] and m.H[o] == 1 and len(m.nb[o]) == 1:
            x = list(m.nb[o])[0]
            if m.arom[x]:
                take("ACOH", x, o)
            elif m.el[x] == "C" and not claimed[x]:
                take("OH", o)
            else:
                raise Ungroupable("hydroxyl on a non-carbon or an already grouped atom")
    for s in range(n):
        if m.el[s] == "S" and not claimed[s] and m.H[s] == 1 and len(m.nb[s]) == 1:
            x = list(m.nb[s])[0]
            if sp3c(x) and m.H[x] in (3, 2):
                take("CH3SH" if m.H[x] == 3 else "CH2SH", x, s)
            else:
                raise Ungroupable("thiol with no CH3/CH2 neighbour")

    # ---- ethers, sulfides, amines: a hetero centre swallows ONE alkyl neighbour
    for z in range(n):
        if claimed[z] or m.arom[z]:
            continue
        if m.el[z] in ("O", "S") and len(m.nb[z]) == 2 and m.H[z] == 0:
            nbs = list(m.nb[z])
            if any(m.el[j] != "C" for j in nbs):
                raise Ungroupable(f"{m.el[z]} bonded to a hetero atom (peroxide, sulfoxide, ...)")
            cand = [j for j in nbs if sp3c(j) and m.H[j] in (3, 2, 1)]
            if not cand:
                raise Ungroupable(f"{'ether' if m.el[z] == 'O' else 'sulfide'} with no alkyl neighbour to absorb")
            others = [j for j in nbs if j not in cand]
            if any(m.arom[j] is False and not sp3c(j) for j in others if True) and any(
                    any(oo == 2 for oo in m.nb[j].values()) for j in others):
                raise Ungroupable("vinyl ether (no subgroup)")
            x = sorted(cand, key=absorb_rank)[0]
            if m.el[z] == "O":
                g = {3: "CH3O", 2: "CH2O", 1: "CH-O"}[m.H[x]]
            else:
                g = {3: "CH3S", 2: "CH2S", 1: "CHS"}[m.H[x]]
            take(g, z, x)
        elif m.el[z] == "N" and not m.arom[z]:
            nbs = list(m.nb[z])
            if any(m.el[j] != "C" for j in nbs):
                raise Ungroupable("N bonded to a hetero atom")
            if any(o != 1 for o in m.nb[z].values()):
                raise Ungroupable("imine / nitrile-like nitrogen")
            ar = [j for j in nbs if m.arom[j]]
            if ar:
                if len(nbs) == 1 and m.H[z] == 2:
                    take("ACNH2", ar[0], z)
                    continue
                raise Ungroupable("N-substituted aniline (no subgroup)")
            cand = [j for j in nbs if sp3c(j)]
            if m.H[z] == 2:
                x = cand[0] if cand else None
                if x is None or m.H[x] not in (3, 2, 1):
                    raise Ungroupable("primary amine on a carbon with no subgroup")
                take({3: "CH3NH2", 2: "CH2NH2", 1: "CHNH2"}[m.H[x]], z, x)
            elif m.H[z] == 1:
                ok = [j for j in cand if m.H[j] in (3, 2, 1)]
                if not ok:
                    raise Ungroupable("secondary amine with no absorbable neighbour")
                x = sorted(ok, key=absorb_rank)[0]
                take({3: "CH3NH", 2: "CH2NH", 1: "CHNH"}[m.H[x]], z, x)
            elif m.H[z] == 0 and len(nbs) == 3:
                ok = [j for j in cand if m.H[j] in (3, 2)]
                if not ok:
                    raise Ungroupable("tertiary amine with no CH3/CH2 neighbour")
                x = sorted(ok, key=absorb_rank)[0]
                take("CH3N" if m.H[x] == 3 else "CH2N", z, x)
            else:
                raise Ungroupable("nitrogen of an unrecognised kind")

    # ---- alkenes and alkynes
    for c in range(n):
        if m.el[c] != "C" or m.arom[c] or claimed[c]:
            continue
        for j, o in list(m.nb[c].items()):
            if j < c or claimed[j] or claimed[c] or m.el[j] != "C" or m.arom[j]:
                continue
            if o == 2:
                if sum(1 for oo in m.nb[c].values() if oo == 2) > 1 or sum(1 for oo in m.nb[j].values() if oo == 2) > 1:
                    raise Ungroupable("cumulated double bonds")
                hh = tuple(sorted((m.H[c], m.H[j]), reverse=True))
                t = {(2, 1): "CH2=CH", (1, 1): "CH=CH", (2, 0): "CH2=C", (1, 0): "CH=C", (0, 0): "C=C"}
                if hh not in t:
                    raise Ungroupable("ethylene (no subgroup)")
                take(t[hh], c, j)
            elif o == 3:
                if m.H[c] and m.H[j]:
                    raise Ungroupable("acetylene HC#CH (no subgroup: CH#C needs a carbon neighbour)")
                take("CH_C" if (m.H[c] or m.H[j]) else "C_C", c, j)
    # ---- heteroaromatic rings the table knows: pyridine, thiophene
    for r in ring_sets:
        if any(claimed[a] for a in r) or not all(m.arom[a] for a in r):
            continue
        els = Counter(m.el[a] for a in r)
        subs = sum(1 for a in r for j in m.nb[a] if j not in r)
        if len(r) == 6 and els == Counter({"C": 5, "N": 1}) and not any(m.H[a] and m.el[a] == "N" for a in r):
            g = {0: "C5H5N", 1: "C5H4N", 2: "C5H3N"}.get(subs)
            if not g:
                raise Ungroupable("pyridine with three or more substituents")
            take(g, *r)
        elif len(r) == 5 and els == Counter({"C": 4, "S": 1}):
            g = {0: "C4H4S", 1: "C4H3S", 2: "C4H2S"}.get(subs)
            if not g:
                raise Ungroupable("thiophene with three or more substituents")
            take(g, *r)
    # ---- the benzene ring and what hangs on it
    for a in range(n):
        if claimed[a] or not m.arom[a]:
            continue
        if m.el[a] != "C":
            raise Ungroupable(f"aromatic {m.el[a]} outside pyridine/thiophene (no subgroup)")
        if m.H[a] == 1:
            take("ACH", a)
            continue
        exo = [j for j in m.nb[a] if not m.arom[j] or m.nb[a][j] != 1.5]
        if len(exo) != 1:
            take("AC", a)
            continue
        x = exo[0]
        if sp3c(x) and m.H[x] in (3, 2, 1):
            if sum(1 for j in m.nb[x] if m.arom[j]) > 1:
                raise Ungroupable("sp3 carbon bridging two aromatic carbons (ACCH2+AC or 2 AC+CH2: not unique)")
            take({3: "ACCH3", 2: "ACCH2", 1: "ACCH"}[m.H[x]], a, x)
        else:
            take("AC", a)
    # ---- the remaining sp3 carbons
    for a in range(n):
        if claimed[a]:
            continue
        if m.el[a] != "C":
            raise Ungroupable(f"{m.el[a]} atom no subgroup covers")
        if m.arom[a] or any(o != 1 for o in m.nb[a].values()):
            raise Ungroupable("unsaturated carbon pattern no subgroup covers")
        h = m.H[a]
        if h == 4:
            raise Ungroupable("methane / a carbon with no heavy neighbour (no subgroup)")
        take(("C", "CH", "CH2", "CH3")[h], a)
    if not all(claimed):
        raise Ungroupable("internal: unclaimed atoms")
    return dict(out)


def _is_nitro_only(m):
    """charges are allowed only as the N(+)/O(-) pair of a nitro group."""
    ch = [(m.el[a], m.chg[a]) for a in range(m.n) if m.chg[a]]
    return len(ch) % 2 == 0 and all(c in (("N", 1), ("O", -1)) for c in ch) \
        and sum(1 for c in ch if c[0] == "N") == sum(1 for c in ch if c[0] == "O")


# ----------------------------------------------------------------------------- data

def strip(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def group_table():
    t = {}
    for name, main, R, Q in re.findall(
            r"\{\s*name\s+(\S+?);\s*mainGroup\s+(\S+?);\s*R\s+([0-9.]+);\s*Q\s+([0-9.]+);", GROUPS.read_text()):
        t[name] = (float(R), float(Q), main)
    return t


def smiles_by_cas(chem):
    cas, smi = {}, {}
    for l in (chem / "casn.dat").read_text(errors="replace").splitlines():
        mm = re.match(r"\s*(\d+)CASN\s*\t(\S+)", l)
        if mm:
            cas[mm.group(1)] = mm.group(2)
    for l in (chem / "smil.dat").read_text(errors="replace").splitlines():
        mm = re.match(r"\s*(\d+)SMIL\s*\t(\S+)", l)
        if mm:
            smi[mm.group(1)] = mm.group(2)
    return {cas[i]: smi[i] for i in cas if i in smi}


def record_info(p):
    t = p.read_text()
    s = strip(t)
    cas = re.search(r"(?m)^CAS\s+(\S+?);", s)
    form = re.search(r"(?m)^formula\s+(\S+?);", s)
    un = re.search(r"(^|\s)unifac\s*\((.*?)\)\s*;", s, re.S)
    groups = None
    if un:
        groups = {g: int(n) for g, n in re.findall(r"group\s+(\S+?)\s*;\s*count\s+(\d+)\s*;", un.group(2))}
    return {"name": p.stem, "text": t, "cas": cas.group(1) if cas else None,
            "formula": form.group(1) if form else None, "groups": groups}


# Components whose decomposition IS unique but whose UNIFAC gamma fails the sanity window
# (bin/curate/unifac_gamma_infdil.py: gamma-infinity in hexane and in water inside (1e-3, 1e9)).
# Withheld with the number, so the next reader sees why a derivable molecule has no groups.
WITHHELD = {
    "C4H4": "its record is WRITTEN by bin/curate/rrho_thermo.py (check_rrho_thermo holds its blocks to that tool's output); a groups block added here would be overwritten or refused",
    "ethyleneGlycol": "decomposes uniquely (1 _CH2OH_2) but UNIFAC gives gamma-infinity 1.5e10 in hexane, outside (1e-3, 1e9)",
}


def derive_all(chem):
    table = group_table()
    sm = smiles_by_cas(chem)
    res = {}
    for p in sorted(COMP.glob("*.dat")):
        r = record_info(p)
        out = {"rec": r, "smiles": sm.get(r["cas"]), "groups": None, "why": None}
        if not r["cas"] or r["cas"] not in sm:
            out["why"] = "no structure in the ChemSep listing for this CAS"
        elif not r["formula"]:
            out["why"] = "record has no formula to check the structure against"
        else:
            try:
                m = perceive_aromatic(parse_smiles(sm[r["cas"]]))
                if formula_of(m) != parse_formula(r["formula"]):
                    out["why"] = (f"structure {sm[r['cas']]} is {dict(formula_of(m))}, "
                                  f"record formula is {r['formula']}: not the same substance")
                else:
                    out["groups"] = decompose(m, table)
            except (Ungroupable, ValueError, IndexError, KeyError) as ex:
                out["why"] = str(ex)
        if p.stem in WITHHELD and out["groups"]:
            out["groups"], out["why"] = None, WITHHELD[p.stem]
        res[p.stem] = out
    return res


def fmt(g):
    return " + ".join(f"{n} {k}" for k, n in sorted(g.items()))


# ----------------------------------------------------------------------------- writing

CITE = ("Hansen, Rasmussen, Fredenslund, Schiller & Gmehling, Ind. Eng. Chem. Res. 30 (1991) 2352 "
        "(the subgroup definitions, data/standards/parameters/UNIFAC/groups.dat)")


def write_record(name, d):
    p = COMP / f"{name}.dat"
    t = p.read_text()
    if re.search(r"(^|\s)unifac\s*\(", strip(t)):
        raise ValueError("already carries UNIFAC groups -- never replaced")
    g = d["groups"]
    lst = " ".join(f"{{ group {k}; count {n}; }}" for k, n in sorted(g.items(), key=lambda kv: kv[0]))
    line = f"    unifac ( {lst} );   // derived from structure {d['smiles']} by {SCRIPT}\n"
    m = re.search(r"(?m)^groups\s*\n?\{\n", t)
    inline = re.search(r"(?m)^groups\s*\{([^\n{}]*(?:\([^\n]*\)[^\n{}]*)*)\}[ \t]*$", t)   # `groups { joback (...); }` on one line
    if m:
        t = t[:m.end()] + line + t[m.end():]
    elif inline:
        rest = inline.group(1).strip()
        t = (t[:inline.start()] + "groups\n{\n" + line + (f"    {rest}\n" if rest else "") + "}" + t[inline.end():])
    else:
        blk = f"groups\n{{\n{line}}}\n\n"
        pm = re.search(r"(?m)^provenance\s*\n?\{", t)
        t = (t[:pm.start()] + blk + t[pm.start():]) if pm else (t.rstrip("\n") + "\n\n" + blk)
    ent = (f"    unifacGroups\n    {{\n        origin        definition;\n"
           f"        method        \"cut from the molecular structure {d['smiles']} (atom count reproduces the record's "
           f"formula) into {fmt(g)} by the rules of {SCRIPT}; no table of decompositions was consulted\";\n"
           f"        citation      \"{CITE}\";\n        reviewStatus  interim;\n    }}\n")
    pm = re.search(r"(?m)^provenance\s*\n?\{\n", t)
    if pm:
        t = t[:pm.end()] + ent + t[pm.end():]
    else:
        t = t.rstrip("\n") + "\n\nprovenance\n{\n" + ent + "}\n"
    p.write_text(t)


# ----------------------------------------------------------------------------- main

def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chemsep", default=None)
    ap.add_argument("--validate", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--write", nargs="*", default=None)
    ap.add_argument("--smiles")
    ap.add_argument("--gamma-check", action="store_true", help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    if a.smiles:
        m = perceive_aromatic(parse_smiles(a.smiles))
        try:
            print(fmt(decompose(m, group_table())))
        except Ungroupable as ex:
            print(f"ungroupable: {ex}")
        return 0
    chem = Path(a.chemsep) if a.chemsep else (CHEMSEP_DEFAULT if (CHEMSEP_DEFAULT / "casn.dat").exists() else CHEMSEP_FALLBACK)
    res = derive_all(chem)
    have = {k: v for k, v in res.items() if v["rec"]["groups"]}
    if a.validate:
        agree, dis, skip = 0, [], 0
        for k, v in have.items():
            if v["groups"] is None:
                skip += 1
                continue
            if v["groups"] == v["rec"]["groups"]:
                agree += 1
            else:
                dis.append((k, v["rec"]["groups"], v["groups"]))
        n = agree + len(dis)
        print(f"records with curated UNIFAC groups: {len(have)}; derivable by the rules: {n}; "
              f"not derivable (reason listed below): {skip}")
        print(f"AGREE {agree}/{n} = {100.0 * agree / max(n, 1):.1f} %   DISAGREE {len(dis)}")
        for k, c, d in dis:
            print(f"  DISAGREE {k}: record {fmt(c)}  |  derived {fmt(d)}")
        why = Counter()
        for k, v in have.items():
            if v["groups"] is None:
                why[v["why"]] += 1
        for w, c in why.most_common():
            print(f"  not derivable x{c}: {w}")
        return 0
    todo = {k: v for k, v in res.items() if not v["rec"]["groups"]}
    new = {k: v for k, v in todo.items() if v["groups"]}
    if a.list:
        print(f"components without UNIFAC groups: {len(todo)}; derivable: {len(new)}")
        for k, v in sorted(new.items()):
            print(f"  + {k}: {fmt(v['groups'])}   [{v['smiles']}]")
        why = Counter(v["why"] for v in todo.values() if not v["groups"])
        print("--- stay ungrouped:")
        for k, v in sorted(todo.items()):
            if not v["groups"]:
                print(f"  - {k}: {v['why']}")
        print("--- by reason:")
        for w, c in why.most_common():
            print(f"  {c:4d}  {w}")
        return 0
    if a.write is not None:
        names = a.write or sorted(new)
        for k in names:
            if k not in new:
                print(f"{k}: NOT written -- {todo.get(k, {}).get('why') or 'already has groups or unknown'}")
                continue
            write_record(k, new[k])
            print(f"{k}: {fmt(new[k]['groups'])}")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
