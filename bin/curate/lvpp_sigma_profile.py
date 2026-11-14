#!/usr/bin/env python3
# lvpp_sigma_profile.py -- build the `cosmo { LVPP-HFTZVP-2018 { ... } }` set of a
# catalogue component from the LVPP sigma-profile database, release 18.07.
#
#     Copyright (C) 2026 Vítor Geraldes
#     SPDX-License-Identifier: GPL-3.0-or-later
#
# WHAT THIS IS FOR (DEV.md 4c C310; record docs/design/cosmo-sac-lvpp-hftzvp-2018.md)
#
#   Choupo's COSMO-SAC model has two variants on one set of equations.  The
#   2002 one runs on VT-2005 profiles, which the public tree may not ship.
#   The LVPP-HFTZVP-2018 one runs on the LVPP database's GAMESS HF/TZVP
#   profiles with the constants Ferrarini, Flores, Muniz & Soares fitted to
#   them (AIChE J. 64 (2018) 3443, doi:10.1002/aic.16194).  This tool turns
#   one LVPP 18.07 `.gout` file into that variant's set, and joins the
#   database to the catalogue by IDENTITY, never by name.
#
# THE SOURCE, so this is reproducible without me:
#
#     curl -LO https://github.com/lvpp/sigma/releases/download/18.07/HF_TZVP.zip
#     sha256  bd17aaeebb430641d704830b71b93637833d77a32e41cde38b528a0483659d49
#     1713 GAMESS output files (*.gout), named by chemical name, no CAS.
#     Licence: MIT, Copyright (c) 2017 LVPP (the LICENSE at tag 18.07).
#
#   Unzip it under thirdParty/lvpp-sigma-1807/ (gitignored): third-party
#   originals are never committed (CLAUDE.md section 7).
#
# WHAT IS THEIRS AND WHAT IS OURS.  The segment table (position, charge,
# area of every surface segment) and the cavity area and volume are LVPP's,
# read straight off the file.  The 51-number profile is COMPUTED HERE from
# their segments, and every record this writes says so.
#
# THE PROFILE PROTOCOL IS READ FROM THE ENGINE, never repeated here.  The
# constants of the variant were fitted together with the way its profiles are
# built, so the averaging radius and decay live in ONE place -- the
# LVPP18_PROTOCOL string in src/thermo/activityCoefficient/CosmoSac.cpp, which
# the engine also demands, word for word, of every set it runs.  This tool
# parses r_av and f_decay out of that string and writes the string itself into
# the record's `protocol`.
#
# THE AVERAGING (Bell et al., J. Chem. Theory Comput. 16 (2020) 2635, Eq. 4,
# the Lin & Sandler erratum form):
#
#     sigma_m = SUM_n sigma_n w_mn / SUM_n w_mn
#     w_mn    = (r_n^2 r_av^2 / (r_n^2 + r_av^2))
#               * exp(-f_decay * d_mn^2 / (r_n^2 + r_av^2))
#
# with r_n = sqrt(a_n/pi), d_mn in Angstrom (the file's bohr converted), and
# sigma_n = q_n / a_n recomputed from the charge and the area as Bell 2020
# recommends (the printed sigma column is truncated).  r_av = 1.4 A is
# Ferrarini's (p. 11); f_decay = 3.57 is the reading SELECTED for the open
# choice the paper leaves (the record says how).
#
# THE IDENTITY JOIN.  The archive has names only, and a name is not an
# identity.  The molecule's InChIKey is computed from the file's OWN geometry
# (RDKit: connectivity and bond orders from the 3-D coordinates, neutral
# molecule, stereo from 3-D) and joined to the catalogue component whose
# InChIKey thirdParty/thermoml/identity.json resolved (PubChem and CACTUS
# agreeing, formula checked).  Rules:
#   * full-key match with exactly ONE file          -> matched;
#   * no full match, the catalogue key carries no stereo layer (UHFFFAOYSA),
#     exactly ONE file shares the connectivity block -> matched, and the
#     record says the LVPP geometry is one stereoisomer;
#   * several files on one key giving IDENTICAL profiles (one calculation
#     filed under two names)                          -> matched, both cited;
#   * several files on one key that differ (conformers, two geometries)
#                                                     -> AMBIGUOUS, not written;
#   * a component without a resolved InChIKey, or whose molecule LVPP lacks,
#     or a file RDKit cannot perceive               -> unmatched, listed.
#   The formula computed from the geometry must equal the catalogue's
#   `formula` or the match is refused.
#
# USAGE
#     lvpp_sigma_profile.py gamess <file.gout> [--name X]   print one set
#     lvpp_sigma_profile.py match  [--gout-dir D] [--write] [--report F]
#
# `match` without --write changes nothing; with --write it inserts or
# replaces the LVPP-HFTZVP-2018 set inside each matched component's `cosmo {}`
# block under data/standards/components/.  RDKit is required for `match`
# (pip install rdkit); without it the tool refuses by name.
"""Build COSMO-SAC LVPP-HFTZVP-2018 sets from LVPP 18.07 GAMESS outputs."""
import argparse
import json
import math
import pathlib
import re
import sys
from collections import Counter, defaultdict

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
ENGINE_COSMO = ROOT / "src/thermo/activityCoefficient/CosmoSac.cpp"
COMPONENTS = ROOT / "data/standards/components"
IDENTITY = ROOT / "thirdParty/thermoml/identity.json"
GOUT_DIR = ROOT / "thirdParty/lvpp-sigma-1807/gout"
ARCHIVE_SHA = "bd17aaeebb430641d704830b71b93637833d77a32e41cde38b528a0483659d49"
SET = "LVPP-HFTZVP-2018"

BOHR_TO_A = 0.52917721067        # CODATA 2014, the value usnistgov/COSMOSAC uses
SIGMA_MIN, SIGMA_MAX, NGRID = -0.025, 0.025, 51


def engine_protocol():
    """The protocol string the engine demands, and r_av / f_decay parsed
    from it.  ONE home: a profile built one way and consumed as another is
    wrong in a way no output would show."""
    txt = ENGINE_COSMO.read_text()
    m = re.search(r'LVPP18_PROTOCOL\s*=\s*"([^"]+)"', txt)
    if not m:
        sys.exit("could not read LVPP18_PROTOCOL from CosmoSac.cpp -- refusing to "
                 "average with constants of my own")
    proto = m.group(1)
    rav = re.search(r"r_av ([0-9.]+) A", proto)
    fdec = re.search(r"f_decay ([0-9.]+)", proto)
    if not (rav and fdec and "d in A" in proto and "sigma = q/a" in proto):
        sys.exit(f"LVPP18_PROTOCOL '{proto}' does not name r_av, f_decay, the "
                 "distance unit and the sigma rule -- refusing to guess")
    return proto, float(rav.group(1)), float(fdec.group(1))


def read_gout(path):
    """Cavity area [A^2] and volume [A^3], the final segment table, and the
    final geometry (element, x, y, z in A)."""
    t = path.read_text(errors="replace")
    areas = re.findall(r"Total surface area of cavity \(A\*\*2\)\s*=\s*([0-9.]+)", t)
    vols = re.findall(r"Total volume of cavity \(A\*\*3\)\s*=\s*([0-9.]+)", t)
    if not areas or not vols or "NR.  ATOM" not in t:
        raise ValueError("no COSMO cavity / segment table")
    if "EXECUTION OF GAMESS TERMINATED NORMALLY" not in t:
        raise ValueError("GAMESS did not terminate normally")
    blk = t.split("NR.  ATOM")[-1].split("=====")[0]
    xyz, q, a = [], [], []
    for ln in blk.splitlines()[1:]:
        p = ln.split()
        if len(p) < 8:
            continue
        xyz.append([float(p[2]), float(p[3]), float(p[4])])
        q.append(float(p[5]))
        a.append(float(p[6]))
    if not xyz:
        raise ValueError("empty segment table")
    geo = t.split("COORDINATES OF ALL ATOMS ARE (ANGS)")
    if len(geo) < 2:
        raise ValueError("no final geometry")
    atoms = []
    for ln in geo[-1].splitlines()[3:]:
        p = ln.split()
        if len(p) != 5:
            break
        atoms.append((p[0].capitalize(), int(round(float(p[1]))),
                      float(p[2]), float(p[3]), float(p[4])))
    a = np.array(a)
    return (float(areas[-1]), float(vols[-1]), np.array(xyz) * BOHR_TO_A,
            a, np.array(q) / a, atoms)


def average(xyz, a_n, s_n, rav, fdecay):
    """The Lin & Sandler erratum / Bell 2020 Eq. 4 averaging, O(n^2), exact."""
    r2 = a_n / math.pi
    rav2 = rav * rav
    d2 = ((xyz[:, None, :] - xyz[None, :, :]) ** 2).sum(-1)
    den = r2[None, :] + rav2
    w = (r2[None, :] * rav2 / den) * np.exp(-fdecay * d2 / den)
    return (w * s_n[None, :]).sum(1) / w.sum(1)


def profile(sigma, a_n):
    """Area per bin on the 51-node grid, each segment split linearly between
    its two bracketing nodes; a segment beyond the grid lands on the end node
    (counted and reported)."""
    grid = np.linspace(SIGMA_MIN, SIGMA_MAX, NGRID)
    step = grid[1] - grid[0]
    p = np.zeros(NGRID)
    clipped = 0
    for s, a in zip(sigma, a_n):
        if s <= grid[0] or s >= grid[-1]:
            clipped += (s < grid[0] or s > grid[-1])
            p[0 if s <= grid[0] else -1] += a
            continue
        k = min(int((s - grid[0]) / step), NGRID - 2)
        f = (s - grid[k]) / step
        p[k] += a * (1.0 - f)
        p[k + 1] += a * f
    return p, clipped


def build_set(path, proto, rav, fdecay):
    area, vol, xyz, a_n, s_n, atoms = read_gout(path)
    p, clipped = profile(average(xyz, a_n, s_n, rav, fdecay), a_n)
    #  THE AREA THE RECORD CARRIES IS THE PROFILE'S OWN SUM, to the printed
    #  digit (2026-11-11).  GAMESS prints the cavity area to 2 decimals; the
    #  segments sum to it only within that rounding.  The model forms each
    #  probability as p_i(sigma)/A_i and the mixture's as SUM x_i p_i / SUM
    #  x_i A_i: if A_i is not the profile's own total the mixture probability
    #  does not sum to one, and the residual term stops obeying Gibbs-Duhem --
    #  measured by check_gibbs_duhem at R = 3e-4 (acetone/chloroform) before
    #  this line, against 1e-6 allowed.  So the area is the sum of the 51
    #  numbers as printed; GAMESS's own figure stays the reconciliation below.
    p = np.round(p, 6)
    cavity = area
    area = float(p.sum())
    dev = abs(area - cavity) / cavity * 100.0
    #  The reconciliation: the profile is the segments' area distributed on
    #  the grid, the cavity area is GAMESS's own sum.  Two readings of one
    #  quantity from two parts of one file must agree.
    if dev > 1.0:
        raise ValueError(f"profile carries {p.sum():.3f} A^2, cavity {area:.3f} A^2 "
                         f"({dev:.2f} %)")
    return {"area": area, "cavity": cavity, "volume": vol, "p": p, "clipped": clipped,
            "segments": len(a_n), "atoms": atoms, "dev_pct": dev}


def block_text(name, fname, s, proto, identity_note):
    rows = []
    for i in range(0, NGRID, 6):
        rows.append("            " + "  ".join(f"{v:11.6f}" for v in s["p"][i:i + 6]))
    return (
        f"    {SET}\n"
        "    {\n"
        "        model       COSMOSAC;\n"
        f"        variant     \"{SET}\";\n"
        f"        protocol    \"{proto}\";\n"
        f"        source      \"LVPP sigma-profile database release 18.07 "
        f"(github.com/lvpp/sigma, asset HF_TZVP.zip, sha256 {ARCHIVE_SHA[:16]}...), "
        f"file {fname}; MIT License, Copyright (c) 2017 LVPP; cite Ferrarini, Flores, "
        f"Muniz & Soares, AIChE J. 64 (2018) 3443, doi:10.1002/aic.16194, and "
        f"doi:10.5281/zenodo.3613786; identity: {identity_note}\";\n"
        "        derivation  \"segment areas, charges and the cavity volume are LVPP's (GAMESS "
        "HF/TZVP COSMO output); `area` is the sum of LVPP's segment areas as binned "
        "(GAMESS's printed cavity area agrees within its 2-decimal rounding); the 51-point profile is COMPUTED BY CHOUPO from LVPP's surface "
        "segments by bin/curate/lvpp_sigma_profile.py under the protocol above "
        "(Bell et al. 2020 Eq. 4 averaging, sigma = q/a, area split linearly between "
        "grid nodes)\";\n"
        "        licence     MIT;\n"
        "        installed   true;\n"
        f"        area        {s['area']:.6f};   // sum of the profile below; GAMESS prints {s['cavity']:.2f}\n"
        f"        volume      {s['volume']:.2f};\n"
        "        sigmaProfile  (\n" + "\n".join(rows) + "\n        );\n"
        "    }\n")


# ------------------------------------------------------------------ identity
def need_rdkit():
    try:
        from rdkit import Chem, RDLogger              # noqa: F401
        from rdkit.Chem import rdDetermineBonds       # noqa: F401
    except ImportError:
        sys.exit("lvpp_sigma_profile.py match: REFUSED -- RDKit is required to "
                 "compute an InChIKey from each file's geometry (pip install rdkit); "
                 "a name is not an identity and no fallback to names is offered")
    RDLogger.DisableLog("rdApp.*")
    return Chem, rdDetermineBonds


def geometry_mol(atoms, Chem, rdb):
    """A neutral RDKit molecule perceived from the file's 3-D geometry."""
    xyz = f"{len(atoms)}\n\n" + "\n".join(
        f"{el} {x:.6f} {y:.6f} {z:.6f}" for el, _, x, y, z in atoms) + "\n"
    mol = Chem.MolFromXYZBlock(xyz)
    if mol is None:
        raise ValueError("RDKit could not read the geometry")
    rdb.DetermineBonds(mol, charge=0)
    Chem.SanitizeMol(mol)
    Chem.AssignStereochemistryFrom3D(mol)
    return mol


def geometry_key(atoms, Chem, rdb):
    """InChIKey and Hill formula of a neutral molecule from its 3-D geometry."""
    mol = geometry_mol(atoms, Chem, rdb)
    key = Chem.MolToInchiKey(mol)
    if not key:
        raise ValueError("no InChIKey")
    return key, hill("".join(el for el, *_ in atoms))


def catalogue_formula(name):
    m = re.search(r"^\s*formula\s+([^;\s]+)\s*;", (COMPONENTS / f"{name}.dat").read_text(), re.M)
    return m.group(1) if m else None


def hill(f):
    """Normalise a formula string to Hill order for comparison."""
    cnt = Counter()
    for el, n in re.findall(r"([A-Z][a-z]?)(\d*)", f or ""):
        cnt[el] += int(n) if n else 1
    order = (["C", "H"] if "C" in cnt else []) + sorted(e for e in cnt
                                                        if "C" not in cnt or e not in ("C", "H"))
    return "".join(e + (str(cnt[e]) if cnt[e] > 1 else "") for e in order if cnt[e])


def insert_set(dat, block):
    """Insert or replace the LVPP-HFTZVP-2018 leaf inside the record's
    `cosmo {}` block (created at the end of the record when absent)."""
    t = dat.read_text()
    m = re.search(r"^cosmo\s*\{", t, re.M)
    if not m:
        t = t.rstrip("\n") + "\n\ncosmo\n{\n" + block + "}\n"
        dat.write_text(t)
        return
    depth, i = 0, m.end() - 1
    for j in range(i, len(t)):
        if t[j] == "{":
            depth += 1
        elif t[j] == "}":
            depth -= 1
            if depth == 0:
                end = j
                break
    body = t[m.end():end]
    old = re.search(r"\n    " + re.escape(SET) + r"\n    \{.*?\n    \}\n", body, re.S)
    body = (body[:old.start()] + "\n" + block + body[old.end():]) if old else \
        (body.rstrip(" ") + block)
    dat.write_text(t[:m.end()] + body + t[end:])


def match(args):
    Chem, rdb = need_rdkit()
    proto, rav, fdecay = engine_protocol()
    ident = json.loads(IDENTITY.read_text())
    cat = {}
    for r in ident["records"]:
        if r.get("status") == "resolved" and r.get("inchiKey") \
                and (COMPONENTS / f"{r['component']}.dat").exists():
            cat[r["component"]] = r["inchiKey"]
    files = sorted(args.gout_dir.glob("*.gout"))
    if len(files) < 1000:
        sys.exit(f"only {len(files)} .gout files under {args.gout_dir} -- the 18.07 "
                 "archive holds 1713; unzip HF_TZVP.zip there first")
    bykey, byskel, perceived, failed = defaultdict(list), defaultdict(list), {}, {}
    for f in files:
        try:
            _, _, _, _, _, atoms = read_gout(f)
            key, formula = geometry_key(atoms, Chem, rdb)
        except Exception as ex:              # noqa: BLE001 -- reported per file
            failed[f.name] = str(ex)
            continue
        perceived[f.name] = (key, formula)
        bykey[key].append(f)
        byskel[key[:14]].append(f)
    matched, ambiguous, unmatched = [], [], []
    for comp, key in sorted(cat.items()):
        hit, note = bykey.get(key, []), "InChIKey " + key + " (full match)"
        if not hit and key.split("-")[1] == "UHFFFAOYSA" and len(byskel.get(key[:14], [])) == 1:
            hit = byskel[key[:14]]
            note = (f"InChIKey connectivity block {key[:14]} matches; the LVPP geometry "
                    f"is one stereoisomer ({perceived[hit[0].name][0]}), the catalogue "
                    "record carries no stereo layer")
        if not hit:
            unmatched.append((comp, key, "no LVPP 18.07 file with this InChIKey"))
            continue
        if len(hit) > 1:
            #  The archive holds some molecules twice under two names.  When the
            #  files give the SAME profile and cavity to the last printed digit
            #  they are one calculation filed twice, and either file is the
            #  molecule (the record cites both).  When they differ (conformers,
            #  or two geometries of one molecule) the choice is a modelling
            #  decision this tool does not take: AMBIGUOUS, not written.
            sets = [build_set(h, proto, rav, fdecay) for h in hit]
            same = all(abs(s["area"] - sets[0]["area"]) == 0.0
                       and np.array_equal(s["p"], sets[0]["p"]) for s in sets)
            if not same:
                ambiguous.append((comp, key, [h.name for h in hit]))
                continue
            note += ("; the archive files this molecule twice with identical "
                     "profiles: " + ", ".join(h.name for h in hit))
        f = hit[0]
        cf = hill(catalogue_formula(comp))
        gf = hill(perceived[f.name][1])
        if cf != gf:
            unmatched.append((comp, key, f"formula mismatch: catalogue {cf}, {f.name} {gf}"))
            continue
        matched.append((comp, f, note + f"; formula {gf}; resolved by "
                        "thirdParty/thermoml/identity.json (PubChem and CACTUS agree)"))
    written = 0
    for comp, f, note in matched:
        s = build_set(f, proto, rav, fdecay)
        if args.write:
            insert_set(COMPONENTS / f"{comp}.dat", block_text(comp, f.name, s, proto, note))
            written += 1
    rep = {"protocol": proto, "files": len(files), "perceived": len(perceived),
           "notPerceived": failed, "catalogueWithKey": len(cat),
           "matched": [(c, f.name, n) for c, f, n in matched],
           "ambiguous": ambiguous, "unmatched": unmatched}
    if args.report:
        args.report.write_text(json.dumps(rep, indent=1))
    print(f"LVPP 18.07: {len(files)} files, {len(perceived)} perceived by RDKit, "
          f"{len(failed)} not; catalogue components with a resolved InChIKey: {len(cat)}")
    print(f"  matched {len(matched)} (stereo-block matches "
          f"{sum('stereoisomer' in n for *_, n in matched)}), ambiguous {len(ambiguous)}, "
          f"unmatched {len(unmatched)}; written {written}")
    return 0


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gamess")
    g.add_argument("gout", type=pathlib.Path)
    g.add_argument("--name", default=None)
    m = sub.add_parser("match")
    m.add_argument("--gout-dir", type=pathlib.Path, default=GOUT_DIR)
    m.add_argument("--write", action="store_true")
    m.add_argument("--report", type=pathlib.Path, default=None)
    args = ap.parse_args()
    if args.cmd == "match":
        return match(args)
    proto, rav, fdecay = engine_protocol()
    s = build_set(args.gout, proto, rav, fdecay)
    print(f"//  {args.name or args.gout.stem}: {s['segments']} segments, profile area "
          f"{s['p'].sum():.4f} vs cavity {s['area']:.2f} A^2 ({s['dev_pct']:.3f} %), "
          f"{s['clipped']} beyond the grid")
    print("cosmo\n{\n" + block_text(args.name, args.gout.name, s, proto,
                                     "NOT JOINED (single-file mode)") + "}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
