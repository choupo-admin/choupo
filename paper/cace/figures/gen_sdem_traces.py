#!/usr/bin/env python3
"""paper/cace/figures/gen_sdem_traces.py -- the data of the article's SDEM
figure (paper/cace/main.tex, Section "Nanofiltration"): trace-ion
transmission against the permeate flux on the MgSO4 feed of Fernandez de
Labastida & Yaroshchuk, Membranes 11 (2021) 272 (CC BY 4.0), as

    * the authors' MEASURED symbols and their drawn SDEM line, both read
      off their Figure 4b (the digitisation committed with the witness,
      tutorials/steady/membranes/membrane12_sdem_nf270_nacl_traces/
      constant/experimental/fdl2021_figures.csv);
    * Choupo's SDEM law with the paper's Table 1 permeances, run in the
      TRACE LIMIT (the traces at 1e-3 of the paper's concentration, the
      limit the authors' analytical line assumes) and at the paper's OWN
      trace concentration, 2e-4 mol/L per trace salt.

It builds the probes and drives the flux exactly as the regression check
bin/curate/check_sdem.py does (its build_probe / run_at_flux are IMPORTED,
not copied, so the figure and the check cannot drift apart).  Needs a native
build of this tree (`make all`).  Writes paper/cace/data/sdem_mgso4_traces.csv.

    python3 -I paper/cace/figures/gen_sdem_traces.py
"""
import csv
import importlib.util
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
spec = importlib.util.spec_from_file_location("check_sdem", ROOT / "bin" / "curate" / "check_sdem.py")
cs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cs)

SALT = "MgSO4"
SERIES = ("Na", "Cl", "NO3")          # NH4 hides under Na in the figure (check_sdem's note)


def main():
    figs = [r for r in cs.read_figures() if r["salt"] == SALT and r["series"] in SERIES]
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        probes = {}
        for label, scale in (("traceLimit", 1e-3), ("paperTrace", 1.0)):
            d = Path(tmp) / label
            cs.build_probe(d, SALT, scale)
            probes[label] = d
        for r in sorted(figs, key=lambda r: (r["series"], r["x"])):
            row = dict(series=r["series"], Jv_umps=r["x"], f_exp=r["f_exp"], df_reading=r["df"],
                       f_line=("" if r["f_line"] is None else r["f_line"]))
            for label, d in probes.items():
                k = cs.run_at_flux(d, r["x"])
                row["f_choupo_" + label] = 1.0 / (1.0 - k["R_obs_" + r["series"]])
            out.append(row)
            print(row, flush=True)
    dst = HERE.parent / "data" / "sdem_mgso4_traces.csv"
    dst.parent.mkdir(exist_ok=True)
    with open(dst, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        for row in out:
            w.writerow({k: (("%.6g" % v) if isinstance(v, float) else v) for k, v in row.items()})
    # one file per ion for pgfplots (Jv, measured f, the authors' line, Choupo
    # in the trace limit, Choupo at the paper's own trace concentration)
    for ion in SERIES:
        with open(dst.parent / ("sdem_%s.csv" % ion), "w") as f:
            f.write("Jv,fexp,fline,ftrace,fpaper\n")
            for row in out:
                if row["series"] == ion:
                    f.write("%s,%s,%s,%.6g,%.6g\n" % (
                        row["Jv_umps"], row["f_exp"], row["f_line"] if row["f_line"] != "" else "nan",
                        row["f_choupo_traceLimit"], row["f_choupo_paperTrace"]))
    print("wrote", dst, "and one sdem_<ion>.csv per ion")
    return 0


if __name__ == "__main__":
    sys.exit(main())
