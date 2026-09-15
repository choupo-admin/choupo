#!/usr/bin/env python3
"""Generate the comparison tables of the Tutorials Guide's SDEM validation
section -- Choupo against Fernandez de Labastida & Yaroshchuk, Membranes 11
(2021) 272 (CC BY 4.0) -- from the ENGINE and the DIGITISED FIGURES, never
typed.

    bin/curate/gen_sdem_validation.py          # (re)write docs/tutorialsGuide-sdem-*.tex
    bin/curate/gen_sdem_validation.py --check  # report drift, write nothing (the gate)

WHAT IS WRITTEN (each file is one table body the hand-written part
docs/tutorialsGuide-sdemValidation.tex \\input{}s):
  tutorialsGuide-sdem-ambipolar.tex   Table 1's salt permeances against the
                                      ambipolar identity on its own ion values
  tutorialsGuide-sdem-<salt>.tex      one per dominant salt: every digitised
                                      point of that salt's two panels, with
                                      the engine at the SAME flux in the trace
                                      limit and at the paper's 2e-4 M
  tutorialsGuide-sdem-notatrace.tex   the not-a-trace ratio per salt
  tutorialsGuide-sdem-sensitivity.tex the two permeances the paper leaves as
                                      bounds, swept

HOW THE ENGINE IS DRIVEN.  The probes are the ones check_sdem builds (its
build_probe / run_at_flux are imported, so the table and the gate cannot
disagree about what a probe is): a one-element NF270 case from the NaCl
witness with the salt's Table 1 row, k_film = 1 m/s and a 1 mbar element
(intrinsic and uniform), feed pressure driven until J_w_avg is the figure's
J_v to 0.5 %.  Two probes per salt: traces at 2e-7 M (the trace limit the
paper's analytical fit assumes) and at the paper's own 2e-4 M.

f = 1/(1 - R) throughout, the paper's own quantity (R = 1 - 1/f).  An
occluded marker (partly hidden under another series' symbol in the figure)
is flagged with a dagger; a blank paper-fit cell is a point past the end of
the drawn line.
"""
import sys
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate"))
import check_sdem as G   # noqa: E402  -- the probes and the Table 1 rows have ONE home

DOCS = ROOT / "docs"
SALT_LABEL = {"NaCl": "NaCl", "MgCl2": "MgCl$_2$", "Na2SO4": "Na$_2$SO$_4$", "MgSO4": "MgSO$_4$"}
ION_LABEL = {"Na": "Na$^+$", "Mg": "Mg$^{2+}$", "NH4": "NH$_4^+$", "Cl": "Cl$^-$", "NO3": "NO$_3^-$", "SO4": "SO$_4^{2-}$"}
FIG_OF = {"NaCl": "1", "MgCl2": "2", "Na2SO4": "3", "MgSO4": "4"}


def ff(v):
    if v is None or v == "":
        return "--"
    return f"{v:.1f}" if abs(v) >= 10 else f"{v:.3f}"


def pct(a, b):
    return "--" if (a is None or b is None) else f"{(a / b - 1) * 100:+.1f}"


def main():
    check = "--check" in sys.argv
    figs = G.read_figures()
    out = {}

    # --- ambipolar identity on Table 1 ---------------------------------
    rows = []
    for salt, row in G.TABLE1.items():
        cat, zp, Pp = row["cation"]; an, zm, Pm = row["anion"]
        Ps = G.ambipolar(zp, Pp, zm, Pm)
        rows.append(f"{SALT_LABEL[salt]} & {ION_LABEL[cat]} & {Pp:g} & {ION_LABEL[an]} & {Pm:g} & {row['Ps']:g} & {Ps:.2f} & {pct(Ps, row['Ps'])} \\\\")
    out["ambipolar"] = "\n".join(rows) + "\n"

    with tempfile.TemporaryDirectory() as tmp:
        probes = {}
        for salt in G.TABLE1:
            tl = Path(tmp) / f"tl_{salt}"; G.build_probe(tl, salt, 1e-3)
            re_ = Path(tmp) / f"re_{salt}"; G.build_probe(re_, salt, 1.0)
            probes[salt] = (tl, re_)
        for salt in G.TABLE1:
            cat, _, _ = G.TABLE1[salt]["cation"]; an, _, _ = G.TABLE1[salt]["anion"]
            tl, re_ = probes[salt]
            lines = []
            series = [salt] + [s for s in ("NH4", "Na", "Cl", "NO3") if s in G.TRACES[salt]]
            for sname in series:
                pts = sorted((r for r in figs if r["salt"] == salt and r["series"] == sname), key=lambda r: r["x"])
                ions = [cat, an] if sname == salt else [sname]
                for ion in ions:
                    first = True
                    for i, r in enumerate(pts):
                        ktl = G.run_at_flux(tl, r["x"]); kre = G.run_at_flux(re_, r["x"])
                        f_tl = 1.0 / (1.0 - ktl["R_obs_" + ion]); f_re = 1.0 / (1.0 - kre["R_obs_" + ion])
                        lab = (ION_LABEL[ion] + (" (dominant)" if sname == salt else " (trace)")) if first else ""
                        first = False
                        dag = "$^\\dagger$" if r["quality"] == "occluded" else ""
                        lines.append(f"{lab} & {r['x']:.1f} & {ff(r['f_exp'])}{dag} & {ff(r['f_line'])} & {ff(f_tl)} & {ff(f_re)} & {pct(f_tl, r['f_line'])} \\\\")
                    lines.append("\\addlinespace[2pt]")
            out[salt] = "\n".join(lines) + "\n"

        # --- not-a-trace ratios: every trace ion of every salt at that salt's
        #     5th measured flux (the (a) panel's), from the two probes directly
        rows = []
        for salt in G.TABLE1:
            x5 = sorted(r["x"] for r in figs if r["salt"] == salt and r["series"] == salt)[4]
            tl, re_ = probes[salt]
            ktl = G.run_at_flux(tl, x5); kre = G.run_at_flux(re_, x5)
            cells = []
            for ion in ("Na", "NH4", "Cl", "NO3"):
                if ion not in G.TRACES[salt]:
                    cells.append("--"); continue
                f_tl = 1.0 / (1.0 - ktl["R_obs_" + ion]); f_re = 1.0 / (1.0 - kre["R_obs_" + ion])
                cells.append(f"{f_re / f_tl:.2f}")
            rows.append(f"{SALT_LABEL[salt]} & {x5:.1f} & " + " & ".join(cells) + " \\\\")
        out["notatrace"] = "\n".join(rows) + "\n"

        # --- the two bounds, swept ------------------------------------------
        rows = []
        line_nh4_nacl = [r for r in figs if r["salt"] == "NaCl" and r["series"] == "NH4"][4]   # 36.2 um/s
        for P in (60.0, 120.0, 300.0, 1000.0):
            d = Path(tmp) / f"nacl_nh4_{int(P)}"; G.build_probe(d, "NaCl", 1e-3)
            rec = next((d / "constant" / "assets").glob("NF270_probe_*.dat"))
            import re
            rec.write_text(re.sub(r"\n(\s*)NH4\s+[0-9.e+-]+\s+m/s;", f"\n\\g<1>NH4     {P * 1e-6:.4e}  m/s;", rec.read_text()))
            k = G.run_at_flux(d, line_nh4_nacl["x"])
            f = 1.0 / (1.0 - k["R_obs_NH4"])
            rows.append(f"NaCl & NH$_4^+$ & {P:g} & {line_nh4_nacl['x']:.1f} & {ff(f)} & {ff(line_nh4_nacl['f_line'])} & {pct(f, line_nh4_nacl['f_line'])} \\\\")
        line_nh4_na2so4 = [r for r in figs if r["salt"] == "Na2SO4" and r["series"] == "NH4"][3]  # 27.2 um/s
        for P in (0.8, 3.0, 10.0, 30.0):
            d = Path(tmp) / f"na2so4_na_{P}"; G.build_probe(d, "Na2SO4", 1e-3)
            rec = next((d / "constant" / "assets").glob("NF270_probe_*.dat"))
            rec.write_text(re.sub(r"\n(\s*)Na\s+[0-9.e+-]+\s+m/s;", f"\n\\g<1>Na      {P * 1e-6:.4e}  m/s;", rec.read_text()))
            k = G.run_at_flux(d, line_nh4_na2so4["x"])
            f = 1.0 / (1.0 - k["R_obs_NH4"])
            rows.append(f"Na$_2$SO$_4$ & Na$^+$ (sets NH$_4^+$) & {P:g} & {line_nh4_na2so4['x']:.1f} & {ff(f)} & {ff(line_nh4_na2so4['f_line'])} & {pct(f, line_nh4_na2so4['f_line'])} \\\\")
        out["sensitivity"] = "\n".join(rows) + "\n"

    #  Each file is a COMPLETE table environment: an \input{} inside a tabular
    #  trips the LaTeX file hooks (a \relax lands before \bottomrule --
    #  "Misplaced \noalign"), so the environment travels with its body.
    CAP = {"NaCl": "Dominant NaCl, Figure 1 of the paper.", "MgCl2": "Dominant MgCl$_2$, Figure 2 of the paper.",
           "Na2SO4": "Dominant Na$_2$SO$_4$, Figure 3 of the paper.", "MgSO4": "Dominant MgSO$_4$, Figure 4 of the paper."}
    HEAD = "ion & $J_v$ & $f$ measured & $f$ paper's fit & $f$ Choupo, trace limit & $f$ Choupo, paper's feed & dev.\\ (\\%) \\\\ \\midrule\n"
    def wrap(key, body):
        if key in CAP:
            return ("\\begin{footnotesize}\\setlength{\\tabcolsep}{4pt}\n\\begin{longtable}{@{}lrrrrrr@{}}\n"
                    "\\caption{" + CAP[key] + "  $f = 1/(1-R)$; $J_v$ in $\\mu$m/s.  ``measured'' and ``paper's fit'' are read from the figure "
                    "($\\dagger$: marker partly hidden, larger reading error; --: the drawn line stops before the point); ``trace limit'' and "
                    "``paper's feed'' are Choupo at the same flux with the trace salts at $2\\times10^{-7}$ and $2\\times10^{-4}$~mol/L; "
                    "the last column is Choupo (trace limit) against the paper's fit.}\\\\\n"
                    "\\toprule\n" + HEAD + "\\endfirsthead\n\\toprule\n" + HEAD + "\\endhead\n\\bottomrule\n\\endfoot\n"
                    + body + "\\end{longtable}\n\\end{footnotesize}\n")
        if key == "ambipolar":
            return ("\\begin{center}\\footnotesize\n\\begin{tabular}{@{}llrlrrrr@{}}\\toprule\n"
                    "salt & cation & $P_+$ & anion & $P_-$ & $P_s$ (Table 1) & $P_s$ ambipolar & dev.\\ (\\%) \\\\ \\midrule\n"
                    + body + "\\bottomrule\n\\end{tabular}\n\\end{center}\n")
        if key == "notatrace":
            return ("\\begin{center}\\footnotesize\n\\begin{tabular}{@{}lrrrrr@{}}\\toprule\n"
                    "salt & $J_v$ ($\\mu$m/s) & Na$^+$ & NH$_4^+$ & Cl$^-$ & NO$_3^-$ \\\\ \\midrule\n"
                    + body + "\\bottomrule\n\\end{tabular}\n\\end{center}\n")
        if key == "sensitivity":
            return ("\\begin{center}\\footnotesize\n\\begin{tabular}{@{}llrrrrr@{}}\\toprule\n"
                    "salt & permeance swept & value ($\\mu$m/s) & $J_v$ ($\\mu$m/s) & $f$ (Choupo, trace limit) & $f$ (paper's line) & dev.\\ (\\%) \\\\ \\midrule\n"
                    + body + "\\bottomrule\n\\end{tabular}\n\\end{center}\n")
        return body
    header = ("% GENERATED by bin/curate/gen_sdem_validation.py from the engine and\n"
              "% tutorials/steady/membranes/membrane12_sdem_nf270_nacl_traces/constant/experimental/fdl2021_figures.csv\n"
              "% -- do not edit; regenerate.  Checked for drift by the same script with --check.\n")
    stale = []
    for key, body in out.items():
        p = DOCS / f"tutorialsGuide-sdem-{key}.tex"
        text = header + wrap(key, body)
        if check:
            if not p.exists() or p.read_text() != text:
                stale.append(p.name)
        else:
            p.write_text(text)
    if check:
        if stale:
            print("gen_sdem_validation: STALE -- " + ", ".join(stale) + " differ from what the engine and the digitised CSV give today; run bin/curate/gen_sdem_validation.py and commit")
            return 1
        print(f"gen_sdem_validation: OK -- {len(out)} generated table file(s) of the Tutorials Guide's SDEM validation section match the engine and the digitised CSV (106 figure points, trace limit and 2e-4 M, two permeance sweeps).  NOT CHECKED: the hand-written prose around them.")
        return 0
    print(f"wrote {len(out)} table file(s) under docs/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
