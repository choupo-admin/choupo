#!/usr/bin/env python3
"""C198: the boron records of Felmy & Weare (1986) rendered from their evidence table.

    bin/curate/boron_c198.py            write the governed records
    bin/curate/boron_c198.py --check    exit 1 unless every governed file is byte-identical to the render

data/curation/batches/boron_c198/readings.tsv holds every number the paper prints for the boron system, with
its table, its page and three readings of it (text layer, page image at 200 dpi, page image at 300 dpi).
The governed records are the eight cation-anion pairs (Table 3), the theta / psi mixing terms of Table 4,
the lambda / zeta terms of the neutral B(OH)3 of Table 5, and the formation records of the two
calcium / magnesium ion pairs and the two polyborates.

The formation constants are NOT computed here.  The paper prints standard chemical potentials mu0/RT
(Table 2), and a constant needs the mu0 of H2O, Ca2+ and Mg2+, which are Harvie, Moller & Weare (1984)'s
and are not in the literature folder.  The constants are those of the public-domain databank
(sources.tsv PW1), and the derivation from the primary waits for Harvie et al. (1984).
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


def chem_record(name, masters, nuw, logk, mu, rx):
    hdr = [
        TOP,
        f"  chemistry/{name}-formation.dat -- {rx}",
        "",
        f"  logK25 = {logk}: the constant of the public-domain databank (pitzer.dat), which states no primary.  The paper",
        f"  ({CITE}) prints the standard chemical potential of the species, mu0/RT = {mu} (Table 2, p. 2773);",
        "  a constant needs the mu0 of the other species of the reaction as well, which are Harvie, Moller & Weare (1984)'s",
        "  and are not in the literature folder, so the constant is NOT derived here: that waits for the primary.",
        "  25 C only; the paper and the databank give no enthalpy, so none is written (a case at another temperature is",
        "  announced by the engine as running outside the data).  The identity is the PITZER route's (D2): never mixed with",
        "  the Davies route's  BOH4-formation  (logK -9.24 plus an enthalpy).",
        BOT]
    mst = "".join(f" {{ ion {i}; nu {n}; }}" for i, n in masters)
    body = (f"\nrecordType aqueousSpeciation;\nschemaVersion 1;\n\nspecies {name}; masters ({mst} ); nuWater {nuw};\n"
            f"      logK25 {logk}; source \"USGS PHREEQC pitzer.dat (public domain), log_k {logk}, delta_h 0 (not stated); "
            f"the species' mu0/RT is {mu} in {CITE}, Table 2, p. 2773\";\n")
    return "\n".join(hdr) + body


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
    out[CHEM / "B3O3OH4-formation.dat"] = chem_record("B3O3OH4", [("H3BO3", 3), ("H", -1)], -2, -7.528, by["mu03"]["value"],
        "the first polyborate, written from the neutral master:  3 B(OH)3 = B3O3(OH)4- + 2 H2O + H+")
    out[CHEM / "B4O5OH4-formation.dat"] = chem_record("B4O5OH4", [("H3BO3", 4), ("H", -2)], -3, -16.134, by["mu04"]["value"],
        "the second polyborate, written from the neutral master:  4 B(OH)3 = B4O5(OH)4 2- + 3 H2O + 2 H+")
    out[CHEM / "CaBOH4-formation.dat"] = chem_record("CaBOH4", [("Ca", 1), ("H3BO3", 1), ("H", -1)], 1, -7.589, by["mu05"]["value"],
        "the calcium borate ion pair, written from its masters:  Ca2+ + B(OH)3 + H2O = CaB(OH)4+ + H+")
    out[CHEM / "MgBOH4-formation.dat"] = chem_record("MgBOH4", [("Mg", 1), ("H3BO3", 1), ("H", -1)], 1, -7.84, by["mu06"]["value"],
        "the magnesium borate ion pair, written from its masters:  Mg2+ + B(OH)3 + H2O = MgB(OH)4+ + H+")
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
