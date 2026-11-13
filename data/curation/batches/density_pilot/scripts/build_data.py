#!/usr/bin/env python3
"""Build the measured-density data files of the density pilot (C378) from the
local ThermoML mirror (a finding aid; see thermoml_blocks.py).

Every file starts with `#` lines naming the ARTICLE (authors, title, journal,
year, volume, pages, DOI) -- the archive is never the citation -- the
composition basis, the stated-uncertainty column and the review status
`transcribedNotCheckedAgainstArticle`: the values were read from the archive's
copy of the article's table, not yet from the article itself.

usage: build_data.py            (writes the d*.tsv files next to this script's parent)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import thermoml_blocks as tb

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T_ = ('Temperature, K', None)
P_ = ('Pressure, kPa', None)


def header(root, doi, what, basis, extra=()):
    c = tb.citation(root)
    au = "; ".join(a.replace("[", "(").replace("]", ")") for a in c["authors"])
    h = [f"# source article: {au}",
         f"# title: {c['title']}",
         f"# journal: {c['journal']} {c['year']}, {c['vol']}, {c['page']}",
         f"# DOI: {doi}",
         f"# what: {what}",
         f"# composition basis: {basis}",
         "# U_kg_m3: the expanded uncertainty STATED per point in the article's table"
         " (blank where none is stated)",
         "# status: transcribedNotCheckedAgainstArticle (read from the ThermoML archive's"
         " copy of the article's data; the measurements belong to the article)"]
    h += [f"# {e}" for e in extra]
    return h


def write(name, hdr, cols, rows):
    path = os.path.join(OUT, name)
    with open(path, "w") as f:
        f.write("\n".join(hdr) + "\n")
        f.write("\t".join(cols) + "\n")
        for r in rows:
            f.write("\t".join("" if v is None else (f"{v:.10g}" if isinstance(v, float) else str(v))
                              for v in r) + "\n")
    print(name, len(rows), "points")


def pick(rows, key, compnum_to_name, want):
    for k in rows[0]:
        if isinstance(k, tuple) and k[0] == key and compnum_to_name.get(k[1]) == want:
            return k
    return None


def binary_density(doi, block, fixed_P_kPa=None):
    root, comps, bl = tb.blocks(doi)
    b = [x for x in bl if x["block"] == block][0]
    names = {n: comps[n]["name"] for n in comps}
    return root, comps, b, names


def main():
    # ---- D2: water + ethanol -------------------------------------------------
    doi = "10.1016/j.fluid.2004.11.019"
    root, comps, bl = tb.blocks(doi)
    rows = []
    for b in bl:
        names = {n: comps[n]["name"] for n in comps}
        if b["block"] == "1":                       # pure ethanol
            for r in b["rows"]:
                rows.append((r[T_], r[P_], 1.0, r["_val"], r["_U"], b["block"]))
        else:
            kx = [k for k in b["rows"][0] if k[0] == "Mole fraction"][0]
            assert names[kx[1]] == "ethanol", names
            for r in b["rows"]:
                if r[kx] == 1.0:        # the pure-ethanol points repeat block 1: kept once
                    continue
                rows.append((r[T_], r[P_], r[kx], r["_val"], r["_U"], b["block"]))
    write("d2_waterEthanol_pecar2005.tsv",
          header(root, doi, "mass density of liquid water + ethanol and of pure ethanol, vibrating tube",
                 "mole fraction of ethanol (block 1 is pure ethanol, x = 1)"),
          ["T_K", "P_kPa", "x_ethanol", "rho_kg_m3", "U_kg_m3", "block"], rows)

    doi = "10.1021/je800150h"
    root, comps, bl = tb.blocks(doi)
    b = [x for x in bl if x["block"] == "9"][0]
    names = {n: comps[n]["name"] for n in comps}
    kx = [k for k in b["rows"][0] if k[0] == "Mole fraction"][0]
    xname = names[kx[1]]
    rows = []
    for r in b["rows"]:
        xe = r[kx] if xname == "ethanol" else 1.0 - r[kx]
        rows.append((r[T_], 101.0, xe, r["_val"], r["_U"], b["block"]))
    write("d2b_waterEthanol_rehmanAnsari2008.tsv",
          header(root, doi, "mass density of the binary liquid H2O + C2H5OH at 101 kPa (the binary block of a ternary study with LiCl)",
                 f"mole fraction of ethanol (the archive gives the mole fraction of '{xname}')",
                 extra=["pressure: 101 kPa is the block's stated constant"]),
          ["T_K", "P_kPa", "x_ethanol", "rho_kg_m3", "U_kg_m3", "block"], rows)

    # ---- D3: aqueous NaOH ----------------------------------------------------
    doi = "10.1021/acs.jced.9b00536"
    root, comps, bl = tb.blocks(doi)
    b = [x for x in bl if x["block"] == "2"][0]
    names = {n: comps[n]["name"] for n in comps}
    kw = [k for k in b["rows"][0] if k[0] == "Mass fraction"][0]
    assert names[kw[1]] == "sodium hydroxide"
    rows = [(r[T_], 100.0, r[kw], r["_val"], r["_U"], b["block"]) for r in b["rows"]]
    write("d3a_naoh_galindoLuna2019.tsv",
          header(root, doi, "mass density of aqueous NaOH, 0.1 MPa (100 kPa stated constant)",
                 "mass fraction of NaOH"),
          ["T_K", "P_kPa", "w_NaOH", "rho_kg_m3", "U_kg_m3", "block"], rows)

    doi = "10.1021/je700265d"
    root, comps, bl = tb.blocks(doi)
    b = bl[0]
    names = {n: comps[n]["name"] for n in comps}
    km = [k for k in b["rows"][0] if k[0] == "Molality, mol/kg"][0]
    assert names[km[1]] == "sodium hydroxide"
    M_NaOH = 39.99711        # g/mol; used only to give the mass fraction beside the molality
    rows = []
    for r in b["rows"]:
        m = r[km]
        w = m * M_NaOH / (1000.0 + m * M_NaOH)
        rows.append((r[T_], r[P_], m, w, r["_val"], r["_U"], b["block"]))
    write("d3b_naoh_hnedkovsky2007.tsv",
          header(root, doi, "mass density of aqueous NaOH, 323-573 K, 2 and 10 MPa",
                 "molality of NaOH, mol/kg water (w_NaOH derived here with M = 39.99711 g/mol, for convenience only)"),
          ["T_K", "P_kPa", "m_NaOH_mol_kg", "w_NaOH", "rho_kg_m3", "U_kg_m3", "block"], rows)

    # ---- D4: CO2 in water ----------------------------------------------------
    doi = "10.1021/je034260i"
    root, comps, bl = tb.blocks(doi)
    b = bl[0]
    rows = [(r[T_], r[P_], r["_val"], r["_U"], b["block"]) for r in b["rows"]]
    write("d4a_co2water_hebach2004.tsv",
          header(root, doi, "mass density of the water + CO2 system at elevated pressure (the archive states no composition per point)",
                 "none stated per point; the aqueous phase is CO2-saturated at its T and P per the article"),
          ["T_K", "P_kPa", "rho_kg_m3", "U_kg_m3", "block"], rows)

    doi = "10.1021/je5009125"
    root, comps, bl = tb.blocks(doi)
    b = [x for x in bl if x["block"] == "1"][0]
    names = {n: comps[n]["name"] for n in comps}
    kx = [k for k in b["rows"][0] if k[0] == "Mole fraction"][0]
    assert names[kx[1]] == "carbon dioxide"
    rows = [(r[T_], r[P_], r[kx], r["_val"], r["_U"], b["block"]) for r in b["rows"]]
    write("d4b_co2water_mcbrideWright2015.tsv",
          header(root, doi, "mass density of aqueous CO2 solutions, 274-449 K, up to 100 MPa",
                 "mole fraction of CO2 in the solution (the loaded composition)"),
          ["T_K", "P_kPa", "x_CO2", "rho_kg_m3", "U_kg_m3", "block"], rows)

    doi = "10.1016/j.jct.2015.06.034"
    root, comps, bl = tb.blocks(doi)
    rows = []
    for b in bl:
        ph = list(b["props"].values())[0][1]
        for r in b["rows"]:
            rows.append((r[T_], r[P_], r["_val"], r["_U"], b["block"], ph))
    write("d4c_co2water_efika2016.tsv",
          header(root, doi, "saturated phase densities of CO2 + H2O, 293-450 K, up to 64 MPa (the aqueous phase is the 'Liquid' of block 1 and 'Liquid mixture 1' of block 3; blocks 2 (gas) and 4 (CO2-rich liquid) are the other phase)",
                 "none stated per point (saturated phases)"),
          ["T_K", "P_kPa", "rho_kg_m3", "U_kg_m3", "block", "phase_label"], rows)

    # ---- D5: NaCl + water + ethanol -----------------------------------------
    doi = "10.1021/je020173z"
    root, comps, bl = tb.blocks(doi)
    names = {n: comps[n]["name"] for n in comps}
    B = {b["block"]: b for b in bl}
    # saturated NaCl solutions: block 15 (density, w_ethanol) joined to block 16 (w_NaCl as property)
    kE = [k for k in B["15"]["rows"][0] if k[0] == "Mass fraction"][0]
    assert names[kE[1]] == "ethanol"
    wNaCl = {(r[T_], round(r[kE], 6)): r["_val"] for r in B["16"]["rows"]}
    rows = []
    for r in B["15"]["rows"]:
        rows.append((r[T_], 101.32, r[kE], wNaCl.get((r[T_], round(r[kE], 6))), r["_val"], r["_U"], "15+16"))
    write("d5a_naclEthanolWater_saturated_galleguillos2003.tsv",
          header(root, doi, "mass density of NaCl-SATURATED ethanol + water solutions (w_NaCl is the saturation composition, block 16)",
                 "mass fractions of ethanol and of NaCl in the ternary solution"),
          ["T_K", "P_kPa", "w_ethanol", "w_NaCl", "rho_kg_m3", "U_kg_m3", "block"], rows)
    kE = [k for k in B["18"]["rows"][0] if k[0] == "Mass fraction" and names[k[1]] == "ethanol"][0]
    kN = [k for k in B["18"]["rows"][0] if k[0] == "Mass fraction" and names[k[1]] == "sodium chloride"][0]
    rows = [(r[T_], 101.3, r[kE], r[kN], r["_val"], r["_U"], "18") for r in B["18"]["rows"]]
    write("d5b_naclEthanolWater_unsaturated_galleguillos2003.tsv",
          header(root, doi, "mass density of ethanol + NaCl + water solutions, unsaturated",
                 "mass fractions of ethanol and of NaCl in the ternary solution"),
          ["T_K", "P_kPa", "w_ethanol", "w_NaCl", "rho_kg_m3", "U_kg_m3", "block"], rows)


if __name__ == "__main__":
    main()
