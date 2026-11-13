#!/usr/bin/env python3
"""C198: the boron records of Felmy & Weare (1986) rendered from their evidence table.

    bin/curate/boron_c198.py            write the governed records
    bin/curate/boron_c198.py --check    exit 1 unless every governed file is byte-identical to the render

data/curation/batches/boron_c198/readings.tsv holds every number the paper prints for the boron system, with
its table, its page and three readings of it (text layer, page image at 200 dpi, page image at 300 dpi).
The governed records are the eight cation-anion pairs (Table 3), the theta / psi mixing terms of Table 4,
the lambda / zeta terms of the neutral B(OH)3 of Table 5, and the formation records of the two
calcium / magnesium ion pairs and the two polyborates (derived from Table 2 and Harvie et al. Table 4).

The formation constants are DERIVED here from mu0/RT: the borate paper's Table 2 and Harvie, Moller & Weare
(1984) Table 4 (rows hv_* of readings.tsv); formation_check.tsv holds the arithmetic and the comparison with
the public-domain databank.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = ROOT / "data/curation/batches/boron_c198"
PITZER = ROOT / "data/standards/parameters/Pitzer"
CHEM = ROOT / "data/standards/chemistry"

CITE = "Felmy & Weare, Geochim. Cosmochim. Acta 50 (1986) 2771-2783"
LINE = ("-------------------------------------------------------------------------------")
TOP = "/*--------------------------------*- Choupo -*--------------------------------*\\"
BOT = "\\*-----------------------------------------------------------------------------*/"


def readings():
    rows = []
    lines = (BATCH / "readings.tsv").read_text().splitlines()
    head = lines[0].split("\t")
    for ln in lines[1:]:
        c = ln.split("\t")
        rows.append(dict(zip(head, c)))
    return rows


def num(s):
    v = float(s)
    return repr(v)


def provenance(kind_note, row_ids, table, page):
    return (
        "\nprovenance\n{\n"
        "    origin        literature;\n"
        f"    source        \"{CITE}, {table}, p. {page}\";\n"
        f"    method        \"{kind_note}\";\n"
        f"    readings      \"{row_ids}: read three times (text layer, page image at 200 dpi, page image at 300 dpi), "
        "data/curation/batches/boron_c198/readings.tsv\";\n"
        "    fitBasis      inSample;   // the paper's own fit: these values reproduce the paper, they do not test it\n"
        "    validity\n    {\n"
        "        temperature { min 298.15 K; max 298.15 K; }\n"
        "        note        \"25 C: the paper gives no temperature dependence for any of these terms\";\n"
        "    }\n"
        "}\n")


def pair_record(a, b, vals, ids, row):
    # a cation, b anion
    nm = f"{a}-{b}"
    hdr = [
        TOP,
        f"  Pitzer binary ion-interaction parameters --- {a} / {b} in aqueous solution.",
        "  Role: the beta0 / beta1 / Cphi set (alpha1 2.0) of the Pitzer virial expansion --",
        "  consumed by the pitzer (single-salt VLE) and pitzerHMW (multi-ion speciation)",
        "  activity engines.",
        f"  Source: {CITE}, Table 3, p. 2773, read from the page",
        "  image (the PRIMARY; the earlier record was transcribed from the public-domain",
        "  databank that carries the same numbers).  Fitted by the authors to isopiestic, emf",
        "  and solubility data at 25 C: in-sample.  No temperature dependence is given.",
        BOT]
    body = (
        "\nrecordType electrolytePairParameters;\nschemaVersion 1;\n\nmodel pitzer;\n\n"
        f"pair {{ cation {a}; anion {b}; }}\n\nparameters\n{{\n"
        f"    beta0 {num(vals['beta0'])};\n    beta1 {num(vals.get('beta1', '0'))};\n    beta2 0.0;\n"
        f"    Cphi {num(vals.get('Cphi', '0'))};\n    alpha1 2.0;\n    alpha2 12.0;\n}}\n\n"
        f"source \"{CITE}, Table 3, p. 2773 (25 C)\";\n")
    return "\n".join(hdr) + body + provenance(
        "values transcribed from the paper's table; no calculation", ids, "Table 3", "2773")


def mixing_record(kind, fields, value, desc, role, table, page, ids):
    hdr = [TOP, f"  Pitzer {desc}.", f"  Role: {role}",
           f"  Source: {CITE}, {table}, p. {page}, read from the page image.",
           "  Fitted by the authors at 25 C: in-sample.  No temperature dependence is given.", BOT]
    body = "\nrecordType electrolyteMixingParameter;\nschemaVersion 1;\n" + f"kind {kind};\n"
    for k, v in fields:
        body += f"{k} {v};\n"
    body += f"value {num(value)};\n"
    body += f"source \"{CITE}, {table}, p. {page} (25 C)\";\n"
    return "\n".join(hdr) + body + provenance("value transcribed from the paper's table; no calculation", ids, table, page)


DOI_FW = "10.1016/0016-7037(86)90226-7"
DOI_HMW = "10.1016/0016-7037(84)90098-X"
# reaction table: record, masters, nuWater, databank logK, text, reactants {id: n}, products {id: n}
REACTIONS = [
    ("BOH4", [("H3BO3", 1), ("H", -1)], 1, -9.239, "orthoborate from its masters:  B(OH)3 + H2O = B(OH)4- + H+",
     {"mu01": 1, "hv_H2O": 1}, {"mu02": 1, "hv_H": 1}),
    ("B3O3OH4", [("H3BO3", 3), ("H", -1)], -2, -7.528, "the first polyborate, written from the neutral master:  3 B(OH)3 = B3O3(OH)4- + 2 H2O + H+",
     {"mu01": 3}, {"mu03": 1, "hv_H2O": 2, "hv_H": 1}),
    ("B4O5OH4", [("H3BO3", 4), ("H", -2)], -3, -16.134, "the second polyborate, written from the neutral master:  4 B(OH)3 = B4O5(OH)4 2- + 3 H2O + 2 H+",
     {"mu01": 4}, {"mu04": 1, "hv_H2O": 3, "hv_H": 2}),
    ("CaBOH4", [("Ca", 1), ("H3BO3", 1), ("H", -1)], 1, -7.589, "the calcium borate ion pair, written from its masters:  Ca2+ + B(OH)3 + H2O = CaB(OH)4+ + H+",
     {"hv_Ca": 1, "mu01": 1, "hv_H2O": 1}, {"mu05": 1, "hv_H": 1}),
    ("MgBOH4", [("Mg", 1), ("H3BO3", 1), ("H", -1)], 1, -7.84, "the magnesium borate ion pair, written from its masters:  Mg2+ + B(OH)3 + H2O = MgB(OH)4+ + H+",
     {"hv_Mg": 1, "mu01": 1, "hv_H2O": 1}, {"mu06": 1, "hv_H": 1}),
]
import math

NAMES = {"mu01": "boric acid aq", "mu02": "orthoborate ion", "mu03": "triborate ion", "mu04": "tetraborate ion",
         "mu05": "calcium orthoborate ion pair", "mu06": "magnesium orthoborate ion pair",
         "hv_H2O": "water", "hv_H": "hydrogen ion", "hv_Ca": "calcium ion", "hv_Mg": "magnesium ion"}


def derive(by, reac, prod):
    g = sum(n * float(by[k]["value"]) for k, n in prod.items()) - sum(n * float(by[k]["value"]) for k, n in reac.items())
    return g, -g / math.log(10.0)


def src_of(k, by):
    r = by[k]
    return (f"{CITE}, {r['table']}, p. {r['page']}" if k.startswith("mu")
            else f"Harvie, Moller & Weare, Geochim. Cosmochim. Acta 48 (1984) 723-751, {r['table']}, p. {r['page']}")


def provenance_derived(name, by, reac, prod, logk, g, lk):
    ins = ""
    for k, n in list(reac.items()) + list(prod.items()):
        r = by[k]
        doi = DOI_FW if k.startswith("mu") else DOI_HMW
        ins += (f"            {{ quantity \"mu0/RT of {NAMES[k]}\"; value {float(r['value'])!r}; "
                f"table \"{r['table']}, p. {r['page']}\"; doi \"{doi}\"; }}\n")
    rx = " + ".join(f"{n} x {NAMES[k]}" for k, n in reac.items()) + "  ->  " + " + ".join(f"{n} x {NAMES[k]}" for k, n in prod.items())
    return (
        "\nprovenance\n{\n    logK25\n    {\n"
        "        origin        derived;\n"
        f"        method        \"log K = -(sum of mu0/RT of the products minus sum of the reactants)/ln 10, mu0/RT of B-OH species from Felmy & Weare (1986) Table 2 and of H2O, H+, Ca2+, Mg2+ from Harvie, Moller & Weare (1984) Table 4; reaction {rx}; delta mu0/RT = {g:.4f}; log K = {lk:.5f}\";\n"
        "        inputs\n        (\n" + ins + "        );\n"
        f"        databankCrossCheck \"the public-domain databank pitzer.dat carries log K {logk}; difference {lk - logk:+.5f}, inside the rounding of the databank's three decimals\";\n"
        "        uncertainty   \"not quantified: the two papers print mu0/RT to two or three decimals, so log K is good to about 0.001\";\n"
        "        validity { temperature { min 298.15 K; max 298.15 K; } note \"25 C: no enthalpy is printed in either paper\"; }\n"
        "        reviewStatus  autoPromoted;\n"
        "        review        { by none; }\n"
        "        reviewReason  \"derived by bin/curate/boron_c198.py from numbers read from page images; not yet read back by a human\";\n"
        "    }\n}\n")


def chem_record(name, masters, nuw, logk, rx, reac, prod, by, case_local=False):
    g, lk = derive(by, reac, prod)
    hdr = [
        TOP,
        f"  chemistry/{name}-formation.dat{' (CASE-LOCAL, the Pitzer route)' if case_local else ''} -- {rx}",
        "",
        f"  logK25 = {logk} is DERIVED from the standard chemical potentials mu0/RT printed in {CITE} (Table 2, p. 2773)",
        "  and in Harvie, Moller & Weare, Geochim. Cosmochim. Acta 48 (1984) 723-751 (Table 4, p. 728); the arithmetic",
        f"  is in data/curation/batches/boron_c198/formation_check.tsv (delta mu0/RT = {g:.4f}, log K = {lk:.5f}).  The",
        "  public-domain databank (pitzer.dat) carries the same constant to its three decimals: a cross-check, not the origin.",
        "  25 C only; neither paper gives an enthalpy, so none is written (a case at another temperature is announced by the",
        "  engine as running outside the data).  The identity is the PITZER route's (D2): never mixed with the Davies route's",
        "  BOH4-formation of the catalogue (logK -9.24 plus an enthalpy).",
        BOT]
    mst = "".join(f" {{ ion {i}; nu {n}; }}" for i, n in masters)
    body = (f"\nrecordType aqueousSpeciation;\nschemaVersion 1;\n\nspecies {name}; masters ({mst} ); nuWater {nuw};\n"
            f"      logK25 {logk}; source \"derived from mu0/RT of Felmy & Weare (1986) Table 2 p. 2773 and Harvie, Moller & Weare (1984) Table 4 p. 728; "
            f"cross-check: USGS PHREEQC pitzer.dat (public domain) log_k {logk}\";\n")
    return "\n".join(hdr) + body + provenance_derived(name, by, reac, prod, logk, g, lk)


def formation_table(by):
    rows = ["id\treaction\tdelta_mu0_over_RT\tlogK_derived\tlogK_databank\tdifference\tinputs"]
    for name, mst, nuw, logk, txt, reac, prod in REACTIONS:
        g, lk = derive(by, reac, prod)
        ins = "; ".join(f"{n} x {NAMES[k]} {float(by[k]['value'])} ({by[k]['table']} p. {by[k]['page']})"
                        for k, n in list(prod.items()) + [(k, -n) for k, n in reac.items()])
        rows.append(f"{name}\t{txt.split(':')[-1].strip()}\t{g:.4f}\t{lk:.5f}\t{logk}\t{lk - logk:+.5f}\t{ins}")
    return "\n".join(rows) + "\n"


def render():
    R = readings()
    by = {r["id"]: r for r in R}
    out = {}
    # pairs
    pairs = {}
    for r in R:
        if r["id"].startswith("pair"):
            pid = r["id"].split("_")[0]
            pairs.setdefault(pid, {"a": r["a"], "b": r["b"], "vals": {}, "ids": []})
            pairs[pid]["vals"][r["kind"]] = r["value"]
            pairs[pid]["ids"].append(r["id"])
    for p in pairs.values():
        out[PITZER / "pairs" / f"{p['a']}-{p['b']}.dat"] = pair_record(p["a"], p["b"], p["vals"], ", ".join(p["ids"]), None)
    # theta, psi
    for r in R:
        if r["kind"] == "theta":
            a, b = r["a"], r["b"]
            out[PITZER / "theta" / f"{a}-{b}.dat"] = mixing_record(
                "theta", [("a", a), ("b", b)], r["value"], f"like-charge mixing parameter theta({a},{b}) --- the two anions {a} and {b}",
                f"the binary mixing (second-virial) correction of the two anions, active in the pitzerHMW engine whenever both coexist; it works with the psi term and never replaces the single-pair beta / Cphi sets.",
                "Table 4", "2773", r["id"])
        if r["kind"] == "psi":
            a, b, c = r["a"], r["b"], r["c"]
            out[PITZER / "psi" / f"{a}-{b}-{c}.dat"] = mixing_record(
                "psi", [("a", a), ("b", b), ("c", c)], r["value"], f"ternary mixing parameter psi({a},{b}|{c}) --- the two anions {a} and {b} with the common cation {c}",
                "the triple-ion correction, active in the pitzerHMW engine only when the three ions coexist; it refines theta and the binary sets.",
                "Table 4", "2773", r["id"])
        if r["kind"] == "lambda":
            n, ion = r["a"], r["b"]
            out[PITZER / "lambda" / f"{n}-{ion}.dat"] = mixing_record(
                "lambda", [("n", n), ("ion", ion)], r["value"], f"neutral-species interaction parameter lambda({n},{ion}) --- dissolved boric acid with the ion {ion}",
                "the salting-out second virial of the NEUTRAL boric acid with one ion, in the pitzerHMW engine.  Convention of the paper (p. 2773): lambda(B(OH)3,H) = 0.",
                "Table 5", "2774", r["id"])
        if r["kind"] == "zeta":
            n, c, a = r["a"], r["b"], r["c"]
            out[PITZER / "zeta" / f"{n}-{c}-{a}.dat"] = mixing_record(
                "zeta", [("n", n), ("c", c), ("a", a)], r["value"], f"neutral-cation-anion triplet zeta({n},{c},{a}) --- dissolved boric acid with {c} and {a}",
                "the higher-order neutral term of boric acid with a cation and an anion together, in the pitzerHMW engine.",
                "Table 5", "2774", r["id"])
    # chemistry
    for name, mst, nuw, logk, txt, reac, prod in REACTIONS:
        if name == "BOH4":
            out[ROOT / "tutorials/props/electrolyte/borate01_felmyWeare/constant/chemistry/BOH4-formation.dat"] = chem_record(name, mst, nuw, logk, txt, reac, prod, by, True)
        else:
            out[CHEM / f"{name}-formation.dat"] = chem_record(name, mst, nuw, logk, txt, reac, prod, by)
    out[BATCH / "formation_check.tsv"] = formation_table(by)
    return out


def main():
    out = render()
    if "--check" in sys.argv:
        bad = [str(p.relative_to(ROOT)) for p, t in out.items() if not p.exists() or p.read_text() != t]
        if bad:
            print("FAIL: boron_c198 -- not byte-identical: " + ", ".join(bad))
            return 1
        print(f"boron_c198: OK -- {len(out)} governed files reproduce from readings.tsv")
        return 0
    for p, t in out.items():
        p.write_text(t)
    print(f"boron_c198: wrote {len(out)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
