#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_nanofiltran_as_received -- 2 former gates run as ARMS of one script (DEV.md 4c C419).

Former gates, each moved here verbatim as a function (its own docstring first,
its own checks, its own printed lines): check_nanofiltran_paper, check_nanofiltran_reference.
Each arm prints exactly what its gate printed; this runner prints ONE claim
line first (`check_nanofiltran_as_received: OK -- ...`) that carries every arm's own claim, then
the arms' output, and exits non-zero when any arm does.  An arm that fails does
not stop the others: every verdict is reported.
"""

import contextlib
import io
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

def arm_nanofiltran_paper():
    """Gate: the NanoFiltran paper's two comparisons -- its Table 2 (the stiff
case) and its Fig. 3 (Bowen & Mohammad's CA30 measurements) -- held where
Choupo meets them.

    bin/curate/check_nanofiltran_paper.py            # the gate
    bin/curate/check_nanofiltran_paper.py --table    # also print the tables
                                                     # the cases' headers and
                                                     # the design record quote

WHY THIS EXISTS (2026-10-24, DEV.md 4c C145, Vitor: "Tens aqui o paper
original para criar um caso de comparacao").  The paper -- V. Geraldes,
A.M. Brites Alves, J. Membr. Sci. 321 (2008) 172-182 -- is the publisher's
and is not in the tree; its numbers enter as cited facts in two homes:
PAPER_TABLE2 in bin/curate/nanofiltran/regenerate_paper.py (Table 2,
transcribed) and the case's constant/experimental/
geraldes_alves2008_fig3.csv (Fig. 3, digitised).

ONE CASE PER PAPER (DEV.md 4c C147).  The former nanofiltran02 (Table 2,
Fig. 4) and nanofiltran03 (Fig. 3) are parts C and B of
tutorials/props/membrane/nanofiltran_geraldesAlves2008, whose propsDict views
generates the paper's tables and figures (held by check_postprocessing).
Below, "nanofiltran02" and "nanofiltran03" name those parts: their ops, the
part of the propsDict header that documents them, and their anchor rows of
the one golden; an arm that re-runs one runs a copy of that part alone
(bin/curate/nanofiltran/paper_case.py).  NanoFiltran's own runs on
them are committed in bin/curate/nanofiltran/paper.tsv (regenerate_paper.py,
which REFUSES without gfortran; this gate never needs it -- a check that
cannot run must not pass, and this one reruns only Choupo).

THE ARMS.
  (a) THE TRANSCRIPTION AND THE READING ARE THEIR SOURCES'.  paper.tsv's
      `paper` rows equal PAPER_TABLE2; the Fig. 3 CSV was written by the
      digitiser as it now stands (its recorded digitiser_sha256 is the
      script's: an edited script leaves the CSV STALE and it is refused),
      from the image the script names, and every row's data values are its
      own pixel position under the calibration line the CSV records (a
      hand-edited value is caught).
  (b) TABLE 2 IS NANOFILTRAN AS RECEIVED.  At every N the as-received
      program's iterations equal the table's, Mg2+, Cl- and the potential
      agree to 1e-5 and the trace Na+ to 5e-5; and the Davies-corrected
      program does NOT reproduce it (Na+ more than 5 % away) -- the table
      carries the ln 10.
  (c) CHOUPO AGAINST THE CORRECTED NANOFILTRAN, CODE TO CODE.  nanofiltran02
      run at 401/801/1601 nodes (order 1.8-2.2) and Richardson-extrapolated
      agrees with NanoFiltran (Davies and Born constants corrected, D matched,
      ND 102/204 extrapolated) within 1e-6 on the three permeates and the
      potential (NanoFiltran's volts converted to CODATA R and F), and on the
      pore's two faces (concentrations and potential: the ends of Fig. 4's
      profile) within 1e-5.
  (d) THE CASES SAY WHAT WAS MEASURED.  nanofiltran02's header table (every
      row of the accounting and of the grid study) equals paper.tsv and the
      case's own run to its printed digits; nanofiltran03's results table
      equals the run and the CSV.  Prose that goes stale fails here.
  (e) THE ANCHORS.  nanofiltran02's anchor rows equal paper.tsv's corrected
      NanoFiltran (the potential converted), nanofiltran03's equal the
      MEASURED permeates c_b (1 - R_obs) of the CSV; every anchored number of
      the cases' own runs lies inside its band, and no band is more than
      twice the measured disagreement plus the reading error (a band sized
      to hide a disagreement is caught).
  (f) FIG. 3, THE INPUTS AND NANOFILTRAN.  Every nanofiltran03 op carries
      the measurement's feed (the mean of its two markers' c_Cl), the dye
      level, c_X of Eq. 43 and J_v of Eq. 44 or 45 (1e-9), the stirred cell
      at Re 26 900 with NanoFiltran's viscosity; Choupo agrees with
      NanoFiltran converged on matched inputs within 1e-6; NanoFiltran with
      the paper's settings lands on the digitised line within 2.5 times the
      line's reading error wherever the line was read (the inputs were read
      right); the dye's permeate is exactly zero and its exclusion announced.

WHAT THIS GATE DOES NOT CHECK, said plainly: whether the DSPM-DE model is
right for CA30 (several of its inputs are FITS to these very data, by
Bowen & Mohammad -- agreement is not a prediction); the measurement
uncertainty (neither paper states one; the bands carry the reading error
only); the paper's Fig. 4 beyond the profile's two faces (the figure is
not digitised: the profile is NanoFiltran's own output at N = 350, which is
what the figure draws); Choupo's temperature dependence of D (it has none:
a finding).

BY-HAND SABOTAGES (2026-10-24), each restored (engine ones rebuilt) and the
gate re-run to OK (docs/design/a-stiff-pore-solved-at-once.md section 13.5):
  S1  the excluded ion left out of the wall's electroneutrality (engine) ->
      FAILED (f), but as a REFUSAL of nanofiltran03, not a disagreement: the
      coupled film then has no electroneutral solution.  Hence S1b.
  S1b the excluded ion's film removed (its k x 1e6; engine) -> FAILED (f),
      code to code, 2.5 % on Na+ at the lowest chloride.
  S2  one measured R_obs hand-edited in the CSV -> FAILED (a) (not its
      pixel), (e) and (d).
  S3  the digitiser edited, the CSV not rerun -> FAILED (a) (stale).
  S4  one op's c_X edited -> FAILED (f): the equation and the permeate.
  S5  one number of nanofiltran02's header table edited -> FAILED (d).
  S6  one Table 2 value mistranscribed in PAPER_TABLE2 -> FAILED (a).
  S7  one experiment anchor's band widened to 0.3 -> FAILED (e).
"""
    import csv
    import hashlib
    import json
    import math
    import os
    import re
    import shutil
    import subprocess
    import sys
    import tempfile
    from pathlib import Path

    ROOT = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(ROOT / "bin" / "curate" / "nanofiltran"))
    sys.path.insert(0, str(ROOT / "bin" / "curate"))
    import regenerate_paper as rp  # noqa: E402  (pure Python here; never builds)
    import paper_case  # noqa: E402

    PROPS = ROOT / "choupoProps"
    CASE = paper_case.CASE
    CASE2 = CASE3 = CASE          # parts C and B of the one case
    DIGITISER = ROOT / "bin" / "curate" / "digitise_geraldes_alves2008.py"
    GRIDS = (401, 801, 1601)
    VOLT = (8.314462618 / 96485.33212) / (8.314 / 96500.0)   # NanoFiltran volts -> CODATA volts

    fails = []


    def run_case(case_dir):
        env = dict(os.environ, CHOUPO_HOME=str(ROOT))
        r = subprocess.run([str(PROPS), str(case_dir)], capture_output=True, text=True,
                           timeout=1800, env=env)
        return r.returncode, r.stdout + r.stderr


    def diags_of(out):
        if "<<<Choupo:result-begin>>>" not in out:
            return None
        res = json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                            .split("<<<Choupo:result-end>>>")[0])
        return {o["name"]: o.get("diagnostics", {}) for o in res.get("operationResults", [])}


    def copy_case(part, dst, edit=None, only=None):
        """A copy of PART ('B' Fig. 3, 'C' Table 2) of the paper's case alone, or of the
    ops named in `only`."""
        keep = (lambda op: op in only) if only else (lambda op: paper_case.part_of(op) == part)
        return paper_case.subset_case(dst, keep, edit)


    def table():
        rows = {}
        for r in rp.read_table():
            rows[(r["section"], r["variant"], r["key"], r["quantity"])] = r
        return rows


    def tv(T, *key):
        r = T.get(key)
        if r is None:
            fails.append("paper.tsv has no row %s" % "/".join(map(str, key)))
            return float("nan")
        return float(r["value"])


    def anchors(part):
        out = {}
        for line in (CASE / "expected").read_text().splitlines():
            f = line.split()
            if (len(f) >= 6 and f[0] == "diag" and f[5] == "anchor"
                    and paper_case.part_of(f[1]) == part):
                out[(f[1], f[2])] = (float(f[3]), float(f[4]))
        return out


    def fig3_rows():
        text = rp.FIG3_CSV.read_text()
        meta = dict(re.findall(r"^# (image_sha256|digitiser_sha256) (\S+)", text, re.M))
        cal = re.search(r"^# calibration: x = \(px - ([\d.]+)\)/([\d.]+) ; y = \(([\d.]+) - py\)/([\d.]+)",
                        text, re.M)
        rows = list(csv.DictReader(l for l in text.splitlines() if not l.startswith("#")))
        return meta, cal, rows


    # ---- (a) --------------------------------------------------------------------
    def arm_sources(T):
        for N, na, mg, cl, dpsi, it in rp.PAPER_TABLE2:
            for q, v in zip(("Na", "Mg", "Cl", "dPsi_m_V"), (na, mg, cl, dpsi)):
                r = T.get(("table2", "paper", str(N), q))
                if r is None or abs(float(r["value"]) - v) > 1e-12 * abs(v) or r["iterations"] != str(it):
                    fails.append("(a) paper.tsv's Table 2 row N %d %s is not PAPER_TABLE2's" % (N, q))
        meta, cal, rows = fig3_rows()
        me = hashlib.sha256(DIGITISER.read_bytes()).hexdigest()
        if meta.get("digitiser_sha256") != me:
            fails.append("(a) the Fig. 3 CSV is STALE: written by a digitiser hashing %s, the"
                         " script now hashes %s -- rerun bin/curate/digitise_geraldes_alves2008.py"
                         % (meta.get("digitiser_sha256"), me))
        m = re.search(r'^IMAGE_SHA256 = "([0-9a-f]{64})"', DIGITISER.read_text(), re.M)
        if not m or meta.get("image_sha256") != m.group(1):
            fails.append("(a) the Fig. 3 CSV records image %s, the digitiser names %s"
                         % (meta.get("image_sha256"), m.group(1) if m else None))
        if not cal:
            fails.append("(a) the Fig. 3 CSV carries no calibration line")
            return len(rows)
        xl, sx, y0, sy = (float(g) for g in cal.groups())
        for r in rows:
            x = (float(r["px_x"]) - xl) / sx
            y = (y0 - float(r["px_y"])) / sy
            if abs(x - float(r["cCl_molm3"])) > 6e-4 or abs(y - float(r["Robs_exp"])) > 6e-5:
                fails.append("(a) Fig. 3 row %s at c_Cl %s: its value is not its pixel under the"
                             " recorded calibration (%.4f, %.5f) -- hand-edited?"
                             % (r["series"], r["cCl_molm3"], x, y))
        return len(rows)


    # ---- (b) --------------------------------------------------------------------
    def arm_table2(T):
        worst = {"Na": 0.0, "other": 0.0}
        for N, na, mg, cl, dpsi, it in rp.PAPER_TABLE2:
            for q, v in zip(("Na", "Mg", "Cl", "dPsi_m_V"), (na, mg, cl, dpsi)):
                r = T.get(("table2", "asReceived", str(N), q))
                if r is None:
                    fails.append("(b) paper.tsv has no as-received row N %d %s" % (N, q))
                    continue
                rel = abs(float(r["value"]) - v) / abs(v)
                bound = 5e-5 if q == "Na" else 1e-5
                worst["Na" if q == "Na" else "other"] = max(worst["Na" if q == "Na" else "other"], rel)
                if rel > bound:
                    fails.append("(b) N %d %s: NanoFiltran as received gives %s, Table 2 %g (%.1e > %g)"
                                 % (N, q, r["value"], v, rel, bound))
                if r["iterations"] != str(it):
                    fails.append("(b) N %d: NanoFiltran as received took %s iterations, Table 2 says %d"
                                 % (N, r["iterations"], it))
            dav = tv(T, "table2", "daviesPatched", str(N), "Na")
            if not abs(dav - na) / na > 0.05:
                fails.append("(b) N %d: the Davies-corrected program is within 5 %% of Table 2's Na+"
                             " (%g vs %g) -- then the table does not carry the ln 10" % (N, dav, na))
        return worst


    # ---- (c) --------------------------------------------------------------------
    def profile_faces(csvpath):
        rows = list(csv.DictReader(open(csvpath)))
        return rows[0], rows[-1]


    def arm_stiff(tmp, T):
        runs, faces = {}, {}
        for n in GRIDS:
            def edit(t, n=n):
                t = re.sub(r"nodes\s+\d+;", "nodes %d;" % n, t)
                return t
            c = copy_case("C", tmp / ("s%d" % n), edit, only=("N350",))
            rc, out = run_case(c)
            d = diags_of(out) if rc == 0 else None
            if d is None:
                fails.append("(c) nanofiltran02 did not run at %d nodes (exit %d):\n%s" % (n, rc, out[-1200:]))
                return None
            runs[n] = d["N350"]
            faces[n] = profile_faces(c / "pore_N350.csv")
        ratio = (GRIDS[2] - 1) / (GRIDS[1] - 1)
        ext, orders, worst = {}, [], 0.0
        for q, key, ref in (("Na", "c_perm_Na_p1", tv(T, "stiff", "daviesBorn_ext", "102/204", "Na")),
                            ("Mg", "c_perm_Mg_p1", tv(T, "stiff", "daviesBorn_ext", "102/204", "Mg")),
                            ("Cl", "c_perm_Cl_p1", tv(T, "stiff", "daviesBorn_ext", "102/204", "Cl")),
                            ("dPsi", "dPsi_m_V_p1",
                             VOLT * tv(T, "stiff", "daviesBorn_ext", "102/204", "dPsi_m_V"))):
            v = [runs[n][key] for n in GRIDS]
            e = v[2] + (v[2] - v[1]) / (ratio * ratio - 1.0)
            ext[q] = e
            e1, e2 = v[1] - v[0], v[2] - v[1]
            if abs(e2) > 1e-10 * abs(v[2]):
                p = math.log(abs(e1 / e2), 2.0)
                orders.append(p)
                if not 1.8 <= p <= 2.2:
                    fails.append("(c) %s: observed order %.2f" % (q, p))
            rel = abs(e - ref) / abs(ref)
            worst = max(worst, rel)
            if rel > 1e-6:
                fails.append("(c) %s: Choupo extrapolated %.10g vs NanoFiltran (corrected) %.10g"
                             " -- %.1e > 1e-6" % (q, e, ref, rel))
        worstFace = 0.0
        for fi, (lab, nflab) in enumerate((("face0", "face0"), ("face1", "face1"))):
            for q, col in (("Na", "c_Na_molm3"), ("Mg", "c_Mg_molm3"), ("Cl", "c_Cl_molm3"),
                           ("psi_V", "psi_V")):
                v = [float(faces[n][fi][col]) for n in GRIDS]
                e = v[2] + (v[2] - v[1]) / (ratio * ratio - 1.0)
                ref = tv(T, "stiff", "daviesBorn_ext", "102/204", nflab + "_" + q)
                if q == "psi_V":
                    ref *= VOLT
                rel = abs(e - ref) / abs(ref)
                worstFace = max(worstFace, rel)
                if rel > 1e-5:
                    fails.append("(c) the pore's %s %s: Choupo %.8g vs NanoFiltran %.8g (%.1e > 1e-5)"
                                 % ("feed face" if fi == 0 else "permeate face", q, e, ref, rel))
        return ext, orders, worst, worstFace


    # ---- (d) + (e) for nanofiltran02 ---------------------------------------------
    def fmt_like(word, v):
        """v printed with the decimals of `word`."""
        dec = len(word.split(".")[1]) if "." in word else 0
        return "%.*f" % (dec, v)


    def arm_case2_text(T, ext, case_run):
        text = (CASE2 / "system" / "propsDict").read_text()
        n350 = case_run["N350"]
        expect = {
            "Table 2 (the paper)": [tv(T, "table2", "paper", "350", q) for q in ("Na", "Mg", "Cl", "dPsi_m_V")],
            "NanoFiltran as received": [tv(T, "table2", "asReceived", "350", q) for q in ("Na", "Mg", "Cl", "dPsi_m_V")],
            "+ its Davies corrected (ln 10)": [tv(T, "table2", "daviesPatched", "350", q) for q in ("Na", "Mg", "Cl", "dPsi_m_V")],
            "+ its D input matched (Vogel, K_d)": [tv(T, "stiff", "daviesPatched_matchedD_tol1e-4", "350", q) for q in ("Na", "Mg", "Cl", "dPsi_m_V")],
            "+ its Born constant in CODATA values": [tv(T, "stiff", "daviesBorn_tol1e-4", "350", q) for q in ("Na", "Mg", "Cl", "dPsi_m_V")],
            "+ converged (TOL 1e-4 -> 1e-9)": [tv(T, "stiff", "daviesBorn_tol1e-9", "350", q) for q in ("Na", "Mg", "Cl", "dPsi_m_V")],
            "+ grid extrapolated (ND 102/204)": [tv(T, "stiff", "daviesBorn_ext", "102/204", q) for q in ("Na", "Mg", "Cl", "dPsi_m_V")],
            "Choupo, extrapolated (801/1601 nodes)": [ext["Na"], ext["Mg"], ext["Cl"], ext["dPsi"]],
            "Choupo, op N350": [n350["c_perm_Na_p1"], n350["c_perm_Mg_p1"], n350["c_perm_Cl_p1"], n350["dPsi_m_V_p1"]],
        }
        checked = 0
        for label, vals in expect.items():
            m = re.search(r"^\s+" + re.escape(label) + r"\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)",
                          text, re.M)
            if not m:
                fails.append("(d) nanofiltran02's header has no row `%s`" % label)
                continue
            for w, v in zip(m.groups(), vals):
                if fmt_like(w, v) != w:
                    fails.append("(d) nanofiltran02's header row `%s` prints %s where the measurement"
                                 " is %s" % (label, w, fmt_like(w, v)))
                checked += 1
        #  the grid-study table
        for N, na, *_rest in rp.PAPER_TABLE2:
            if N == 300:
                continue
            m = re.search(r"^\s+N %d\s+([\d.]+)\s+(\d+)\s+([\d.]+)\s+(\d+)" % N, text, re.M)
            if not m:
                fails.append("(d) nanofiltran02's grid-study table has no row N %d" % N)
                continue
            d = case_run["N%d" % N]
            want = [fmt_like(m.group(1), na), str(rp.PAPER_TABLE2[[r[0] for r in rp.PAPER_TABLE2].index(N)][5]),
                    fmt_like(m.group(3), d["c_perm_Na_p1"]), str(int(d["poreNewton_p1"]))]
            if list(m.groups()) != want:
                fails.append("(d) nanofiltran02's grid-study row N %d reads %s, the measurement %s"
                             % (N, list(m.groups()), want))
            checked += 4
        return checked


    def arm_case2_anchors(T, case_run):
        anc = anchors("C")
        n350 = case_run["N350"]
        refs = {
            ("N350", "c_perm_Na_p1"): tv(T, "stiff", "daviesBorn_ext", "102/204", "Na"),
            ("N350", "c_perm_Mg_p1"): tv(T, "stiff", "daviesBorn_ext", "102/204", "Mg"),
            ("N350", "c_perm_Cl_p1"): tv(T, "stiff", "daviesBorn_ext", "102/204", "Cl"),
            ("N350", "dPsi_m_V_p1"): VOLT * tv(T, "stiff", "daviesBorn_ext", "102/204", "dPsi_m_V"),
        }
        if set(anc) != set(refs):
            fails.append("(e) nanofiltran02's anchors are %s, not the four N350 rows" % sorted(anc))
        for k, ref in refs.items():
            if k not in anc:
                continue
            v, band = anc[k]
            if abs(v - ref) > 1e-11 * abs(ref):
                fails.append("(e) nanofiltran02 anchor %s %s = %r, paper.tsv says %r" % (k + (v, ref)))
            err = abs(n350[k[1]] - ref) / abs(ref)
            if err > band:
                fails.append("(e) nanofiltran02 %s: %.2e from NanoFiltran, outside its band %g" % (k[1], err, band))
            if band > 2.0 * err + 1e-6 and band > 1e-6 * 3:
                fails.append("(e) nanofiltran02 %s: band %g is more than twice the measured %.1e" % (k[1], band, err))
        return len(refs)


    # ---- (f) + (d) + (e) for nanofiltran03 ---------------------------------------
    def experiments():
        _, _, rows = fig3_rows()
        out = {}
        for dye, k, cl in rp.fig3_experiments():
            out["dye%g_p%d" % (dye, k)] = (dye, cl)
        marks = {}
        for dye in sorted({float(r["dye_molm3"]) for r in rows}):
            for ion in ("Na", "Cl"):
                rs = sorted((r for r in rows if float(r["dye_molm3"]) == dye and r["ion"] == ion),
                            key=lambda r: float(r["cCl_molm3"]))
                for k, r in enumerate(rs, 1):
                    marks[("dye%g_p%d" % (dye, k), ion)] = r
        return out, marks


    def op_blocks(text):
        """Part B's op blocks (the dye ops) of the one propsDict."""
        return {n: b for n, b in paper_case.op_blocks(text).items()
                if paper_case.part_of(n) == "B"}


    def arm_case3(T, tmp):
        exps, marks = experiments()
        text = (CASE3 / "system" / "propsDict").read_text()
        blocks = op_blocks(text)
        if set(blocks) != set(exps):
            fails.append("(f) nanofiltran03's ops %s are not the CSV's experiments %s"
                         % (sorted(blocks), sorted(exps)))
        mu = math.exp(-10.5 + 530.0 / (298.0 - 146.0))
        num = lambda pat, b: float(re.search(pat, b).group(1))
        for op, (dye, cl) in exps.items():
            b = blocks.get(op)
            if b is None:
                continue
            try:
                got = dict(NaCl=num(r"NaCl\s+([-\d.eE+]+);", b), dye=num(r"Na3Dye\s+([-\d.eE+]+);", b),
                           X=num(r"chargeDensity\s+([-\d.eE+]+);", b), Jv=num(r"J_v\s+\(\s*([-\d.eE+]+)\s*\)", b),
                           mu=mu, rho=997.0,   # C435 (4): the case no longer carries them; the door prices the film and the c2c arm below holds the answer to NanoFiltran at 1e-6
                           om=num(r"omega\s+([-\d.eE+]+);", b), r=num(r"radius\s+([-\d.eE+]+);", b),
                           T=num(r"\bT\s+([-\d.eE+]+)\s*K;", b))
            except AttributeError:
                fails.append("(f) op %s lacks one of feed / chargeDensity / J_v / massTransfer / T" % op)
                continue
            want = dict(NaCl=cl, dye=dye, X=rp.cx_eq43(dye, cl), Jv=rp.jv_eq44_45(dye, cl), mu=mu,
                        rho=997.0, r=rp.L_CELL, T=298.0)
            for k, w in want.items():
                if abs(got[k] - w) > 1e-9 * max(abs(w), 1e-300):
                    fails.append("(f) op %s: %s = %r where the paper's equations give %r" % (op, k, got[k], w))
            Re = got["om"] * got["r"] ** 2 * got["rho"] / got["mu"]
            if abs(Re - rp.RE_CELL) > 1e-6 * rp.RE_CELL:
                fails.append("(f) op %s: the stirred cell's Re is %.3f, not 26 900" % (op, Re))
            if "a 0.23;  b 0.567;  c 0.33;" not in b or "model      StirredCell;" not in b:
                fails.append("(f) op %s: not the paper's Sh = 0.23 Re^0.567 Sc^0.33 stirred cell" % op)
        rc, out = run_case(copy_case("B", tmp / "case3"))
        d = diags_of(out) if rc == 0 else None
        if d is None:
            fails.append("(f) nanofiltran03 did not run (exit %d):\n%s" % (rc, out[-1500:]))
            return None
        if out.count("the pore EXCLUDES it") < 1:
            fails.append("(f) the dye's exclusion is not announced")
        c2c, lineWorst, lineN, residuals = 0.0, 0.0, 0, []
        for op, (dye, cl) in exps.items():
            r = d.get(op, {})
            if r.get("c_perm_Dye_p1", -1.0) != 0.0:
                fails.append("(f) op %s: the dye's permeate is %r, not exactly 0" % (op, r.get("c_perm_Dye_p1")))
            for ion in ("Na", "Cl"):
                cb = cl + 3.0 * dye if ion == "Na" else cl
                ref = tv(T, "fig3", "matched_ext", op, "cperm_" + ion)
                rel = abs(r["c_perm_%s_p1" % ion] - ref) / ref
                c2c = max(c2c, rel)
                if rel > 1e-6:
                    fails.append("(f) op %s %s: Choupo %.10g vs NanoFiltran (matched) %.10g (%.1e > 1e-6)"
                                 % (op, ion, r["c_perm_%s_p1" % ion], ref, rel))
                mk = marks[(op, ion)]
                if mk["Robs_NanoFiltran_line"]:
                    nfl = tv(T, "fig3", "paperSettings", op, "Robs_" + ion)
                    dl = abs(nfl - float(mk["Robs_NanoFiltran_line"]))
                    lineWorst = max(lineWorst, dl / float(mk["dRobs_line"]))
                    lineN += 1
                    if dl > 2.5 * float(mk["dRobs_line"]):
                        fails.append("(f) op %s %s: NanoFiltran with the paper's settings gives R_obs"
                                     " %.4f, the paper's line reads %s +- %s -- the inputs are not"
                                     " the paper's" % (op, ion, nfl, mk["Robs_NanoFiltran_line"],
                                                       mk["dRobs_line"]))
                Rc = r["Robs_%s_p1" % ion]
                residuals.append((op, ion, cl, float(mk["Robs_exp"]), Rc, nfl if mk["Robs_NanoFiltran_line"] else
                                  tv(T, "fig3", "paperSettings", op, "Robs_" + ion), cb, mk))
        #  (e) the anchors: the MEASURED permeates
        anc = anchors("B")
        want = {}
        for op, ion, cl, Rexp, Rc, Rnf, cb, mk in residuals:
            want[(op, "c_perm_%s_p1" % ion)] = (cb * (1.0 - Rexp), cb * float(mk["dRobs"]))
        if set(anc) != set(want):
            fails.append("(e) nanofiltran03's anchors %d rows, the measured permeates %d"
                         % (len(anc), len(want)))
        for k, (cp_exp, read) in want.items():
            if k not in anc:
                continue
            v, band = anc[k]
            if abs(v - cp_exp) > 1e-9 * abs(cp_exp):
                fails.append("(e) nanofiltran03 anchor %s %s = %r, the CSV gives %r" % (k + (v, cp_exp)))
            got = d[k[0]][k[1]]
            err = abs(got - cp_exp) / abs(cp_exp)
            if err > band:
                fails.append("(e) nanofiltran03 %s %s: %.3f from the measurement, outside its band %g"
                             % (k + (err, band)))
            if band > 2.0 * err + read / abs(cp_exp) + 0.01:
                fails.append("(e) nanofiltran03 %s %s: band %g is wider than twice the measured"
                             " disagreement %.3f plus the reading error %.3f" % (k + (band, err, read / abs(cp_exp))))
        return d, c2c, lineWorst, lineN, residuals


    def results_table(residuals):
        lines = ["  RESULTS (R_obs = 1 - c_p/c_b; experiment = Bowen & Mohammad as Fig. 3 plots it,",
                 "  read +- the reading error; NanoFiltran = the paper's own settings, ND 20):",
                 "    dye  c_Cl     ion   experiment       Choupo    NanoFiltran   Choupo - exp"]
        for op, ion, cl, Rexp, Rc, Rnf, cb, mk in sorted(residuals, key=lambda t: (float(t[0][3:].split("_")[0]), t[2], t[1] != "Na")):
            dye = op[3:].split("_")[0]
            lines.append("    %-4s %-8s %-4s %8.3f +- %.3f  %8.3f  %8.3f      %+7.3f"
                         % (dye, "%.3f" % cl, ion + ("+" if ion == "Na" else "-"), Rexp,
                            float(mk["dRobs"]), Rc, Rnf, Rc - Rexp))
        rms = math.sqrt(sum((t[4] - t[3]) ** 2 for t in residuals) / len(residuals))
        rmsnf = math.sqrt(sum((t[5] - t[3]) ** 2 for t in residuals) / len(residuals))
        lines.append("  root-mean-square of R_obs - experiment over the %d symbols: Choupo %.3f,"
                     " NanoFiltran %.3f." % (len(residuals), rms, rmsnf))
        return lines, rms, rmsnf


    def arm_case3_text(lines):
        text = (CASE3 / "system" / "propsDict").read_text()
        body = "\n".join(lines)
        if body not in text:
            fails.append("(d) nanofiltran03's results table is not the measurement; it should read:\n"
                         + body)


    def main():
        if not PROPS.exists():
            print("check_nanofiltran_paper: FAILED -- no choupoProps binary (build first)")
            return 1
        T = table()
        nrows = arm_sources(T)
        worst2 = arm_table2(T)
        with tempfile.TemporaryDirectory(prefix="nanofiltran_paper_") as d:
            tmp = Path(d)
            stiff = arm_stiff(tmp, T)
            rc, out = run_case(copy_case("C", tmp / "case2"))
            run2 = diags_of(out) if rc == 0 else None
            if run2 is None:
                fails.append("nanofiltran02 did not run at its own grids (exit %d)" % rc)
            res3 = arm_case3(T, tmp)
        checked = n2 = 0
        if stiff and run2:
            checked = arm_case2_text(T, stiff[0], run2)
            n2 = arm_case2_anchors(T, run2)
        lines, rms, rmsnf = results_table(res3[4]) if res3 else ([], 0, 0)
        if res3:
            arm_case3_text(lines)
        if "--table" in sys.argv:
            print("\n".join(lines))
        if fails:
            print("check_nanofiltran_paper: FAILED")
            for f in fails:
                print("  " + f)
            return 1
        ext, orders, worst, worstFace = stiff
        d3, c2c, lineWorst, lineN, residuals = res3
        print("check_nanofiltran_paper: OK -- Table 2 transcribed as PAPER_TABLE2 and reproduced by"
              " NanoFiltran AS RECEIVED (iterations exact, Na+ within %.1e, the rest within %.1e),"
              " which the Davies-corrected program is not: the table carries the ln 10; Choupo's"
              " stiff pore at 401/801/1601 nodes (order %.2f-%.2f), extrapolated, agrees with the"
              " corrected NanoFiltran within %.1e on the permeates and the potential and %.1e on"
              " the pore's faces; %d printed numbers of part C's header (the former nanofiltran02) and its %d anchors"
              " are the measurement's; the Fig. 3 CSV (%d markers) is the digitiser's, fresh and"
              " pixel-consistent; part B's 10 ops (the former nanofiltran03) are the paper's Eqs. 43-46 at the read"
              " feeds, Choupo meets NanoFiltran on them within %.1e, NanoFiltran with the paper's"
              " settings lands on the drawn line within %.1f reading errors at %d markers, and"
              " against EXPERIMENT the rms of R_obs is %.3f (NanoFiltran's %.3f) inside every"
              " anchor.  NOT CHECKED: whether the model is right for CA30 (its inputs are fits to"
              " these data), any measurement uncertainty (none stated), Fig. 4 beyond the profile's"
              " faces, D(T)."
              % (worst2["Na"], worst2["other"], min(orders), max(orders), worst, worstFace,
                 checked, n2, nrows, c2c, lineWorst, lineN, rms, rmsnf))
        return 0
    return main()


def arm_nanofiltran_reference():
    """Gate: Choupo's DSPM-DE pore and NanoFiltran agree on the SAME model --
code-to-code, to the two programs' discretisation error.

    bin/curate/check_nanofiltran_reference.py

WHY THIS EXISTS (2026-10-22, DEV.md 4c C138 slice 2).  Slice 1 built a
finite-difference pore solver for the DSPM-DE law, "the method of
NanoFiltran" (Geraldes & Alves, J. Membr. Sci. 321 (2008) 172-182), and
compared it with nothing but itself and an analytic limit.  Vitor handed
over NanoFiltran; it lives in bin/curate/nanofiltran/ (as received, built
and run by regenerate.py), and its numbers are committed in
bin/curate/nanofiltran/reference.tsv and, as ANCHOR rows, in the golden
of the paper's case tutorials/props/membrane/nanofiltran_geraldesAlves2008
(its part A, the former nanofiltran01_dspmde_reference; one case per paper
since DEV.md 4c C147 -- the arms below run a copy of part A alone,
bin/curate/nanofiltran/paper_case.py).
This gate holds the agreement -- WITHOUT gfortran: a check that cannot run
must not pass, and this one never needs the compiler; regenerating the
reference is regenerate.py's own job, and it REFUSES without gfortran.

WHAT THIS GATE CHECKS.

  (a) THE INPUTS ARE THE RULE'S.  The committed NanoFiltran inputs
      (bin/curate/nanofiltran/cases/) equal what regenerate.py's input rule
      writes from the shipped example (pure Python, no compiler), and the
      vendored sources hash to the values the README records -- so the
      anchors cannot have been produced from a hand-edited input or a
      modified program.
  (b) THE ANCHORS ARE THE TABLE'S.  Every reference.tsv row has an anchor
      row in the case's `expected` carrying the same extrapolated permeate
      concentration (1e-11 relative), and no anchor row lacks a table row.
  (c) CODE TO CODE.  The case is run at 401, 801 and 1601 nodes; per row the
      observed order of Choupo's pore is measured (1.8..2.2 wherever the
      differences stand above round-off) and its Richardson extrapolation is
      compared with NanoFiltran's (ND 102 / 204): within 2e-6 relative on
      every one of the table's rows.
  (d) THE CASE'S OWN GRID.  At the case's 801 nodes every row lies inside
      the anchor's tolerance, and that tolerance is at least the measured
      801-node error (so a too-tight anchor fails here, not at random).
  (e) THE DECLARATIONS REFUSE.  An unknown `hindrance`, `activity` and
      `wallClosure` word, the RETIRED `hindrance legacy` (with its reason:
      the steric partition counted twice; DEV.md 4c C141), the RETIRED
      `method closedForm` (with its reason: K_c > 1 at low Peclet number;
      C142 -- until then two probes declared `wallClosure` and `activity
      bulkOverPoreDavies` under it), and a non-DSPM-DE law on the bench --
      each refuses by name.

WHAT THIS GATE DOES NOT CHECK, said plainly: whether NanoFiltran is right
(two programs agreeing is verification, not validation); the as-received
program's Davies rows (its ln-for-log10 constant is a finding, the anchors
use the one-line-corrected copy); the default DSPM-DE path (its goldens and
check_pore_solver arm (d) hold it); any measured membrane.

BY-HAND SABOTAGES (2026-10-22), each restored (engine ones rebuilt) and the
gate re-run to OK:
  S1  DechadilokDeen2006 K_d = H instead of H/Phi (the then-default
      `legacy` diffusive factor, retired 2026-10-24) -> FAILED, but NOT where predicted: the case no longer RAN --
      at J_v = 2e-5 m/s on 401 nodes the pore's continuation in J_v stalled
      (DSPM-DE refused), so arm (c) reported the run, not a disagreement.
  S2  A(eps, T) divided by ln 10 (NanoFiltran's own constant on log10) ->
      FAILED (c)+(d) on example_davies: Choupo then gives Na+ 7.824252 where
      the as-received NanoFiltran gives 7.824214 -- the finding reproduced to
      5e-6 (the rest is the constant's fifth figure).
  S3  `wallClosure porePermeate` ignored (the B_s closure kept) -> FAILED
      (c)/(d), and not only on the polarised op: at k = 10 m/s the wall
      closure still moves the example's trace Na+ by 1.0e-5.
  S4  one anchor's value edited in `expected` -> FAILED (b).
  S5  the membrane charge in one committed INPUT.XLS edited -> FAILED (a).
  S6  the `hindrance` refusal removed (an unknown word fell to the then-
      default `legacy`; since 2026-10-24 there is no such default) ->
      FAILED (e) -- the run still exited 1, because the legacy pore stalls as
      in S1, and only the needle (the refusal's own sentence) told the two
      apart: a refusal for another reason is not the refusal under test.
"""
    import json
    import math
    import os
    import re
    import shutil
    import subprocess
    import sys
    import tempfile
    from hashlib import sha256
    from pathlib import Path

    ROOT = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(ROOT / "bin" / "curate" / "nanofiltran"))
    import regenerate as nf  # noqa: E402  (pure-Python input rule; never builds here)
    import paper_case  # noqa: E402

    CASE = paper_case.CASE
    PART_A = lambda op: paper_case.part_of(op) == "A"   # noqa: E731
    PROPS = ROOT / "choupoProps"
    GRIDS = (401, 801, 1601)
    CASE_NODES = 801
    TOL_CODE = 2.0e-6          # Choupo extrapolated vs NanoFiltran extrapolated

    #  The vendored sources, byte for byte as received (README.md records them).
    SOURCE_SHA256 = {
        "src/NANOFILTRAN.F": "104962dd36dc31d1f4794e93e682e1394639586414d3ad6a076c8e31f15e3f33",
        "src/LINEAR.F":      "704852b0b5ed5ab057964e24878bd433f3dbcedc3550594165d2728fb806d5b9",
        "src/SIMPLEX.F":     "c0d158ede21f05b3b5e80bf7a88babc9aca8df41b8bbe23f40e06476b3660e99",
        "shipped/INPUT.XLS": "0e56d7ab07b0d17382411606d31ca75798239a2741bded3208bccbb900d84442",
        "shipped/IONS.XLS":  "bbf2b6e7703b63fd3ea8c9c4c101b5e6cd75ac9a8c3b0e1bc8414f1a8a68f859",
    }

    fails = []


    def run_case(case_dir):
        env = dict(os.environ, CHOUPO_HOME=str(ROOT))
        r = subprocess.run([str(PROPS), str(case_dir)], capture_output=True, text=True,
                           timeout=1800, env=env)
        return r.returncode, r.stdout + r.stderr


    def diags_of(out):
        if "<<<Choupo:result-begin>>>" not in out:
            return None
        res = json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                            .split("<<<Choupo:result-end>>>")[0])
        return {o["name"]: o.get("diagnostics", {}) for o in res.get("operationResults", [])}


    def copy_case(dst, nodes=None, props=None):
        """Part A of the paper's case alone (paper_case.subset_case), its node count
    rewritten when asked."""
        def edit(text):
            if nodes is not None:
                text = re.sub(r"nodes\s+\d+;", f"nodes {nodes};", text)
            if props is not None:
                text = props(text)
            return text
        return paper_case.subset_case(dst, PART_A, edit)


    def anchors():
        rows = {}
        if not (CASE / "expected").is_file():
            fails.append("(b) the case has no `expected` file")
            return rows
        for line in (CASE / "expected").read_text().splitlines():
            f = line.split()
            if len(f) >= 6 and f[0] == "diag" and f[5] == "anchor" and PART_A(f[1]):
                rows[(f[1], f[2])] = (float(f[3]), float(f[4]))
        return rows


    # ---- (a) ------------------------------------------------------------------
    def arm_inputs():
        here = ROOT / "bin" / "curate" / "nanofiltran"
        for rel, h in SOURCE_SHA256.items():
            p = here / rel
            if not p.is_file():
                fails.append(f"(a) {rel} is missing")
            elif sha256(p.read_bytes()).hexdigest() != h:
                fails.append(f"(a) {rel} no longer hashes to the value recorded as received")
        n = 0
        if (here / "cases" / "IONS.XLS").read_bytes() != nf.ions_xls():
            fails.append("(a) cases/IONS.XLS differs from what the matching rule writes")
        for case in nf.CASES:
            for p, jv in enumerate(case["jv"], 1):
                f = here / "cases" / f"{case['op']}_p{p}" / "INPUT.XLS"
                if not f.is_file() or f.read_bytes() != nf.input_xls(case, jv, nf.NDS[1]):
                    fails.append(f"(a) {f.relative_to(here)} is missing or differs from the rule")
                n += 1
        return n


    # ---- (b) ------------------------------------------------------------------
    def arm_anchors(ref, anc):
        keys = set()
        for r in ref:
            key = (r["op"], f"c_perm_{r['ion']}_p{r['point']}")
            keys.add(key)
            if key not in anc:
                fails.append(f"(b) no anchor row for {key[0]} {key[1]}")
                continue
            v, _ = anc[key]
            if abs(v - r["cp_ext"]) > 1e-11 * abs(r["cp_ext"]) + 1e-300:
                fails.append(f"(b) anchor {key[0]} {key[1]} = {v!r} but reference.tsv says "
                             f"{r['cp_ext']!r}")
        extra = sorted(set(anc) - keys)
        if extra:
            fails.append(f"(b) anchor rows with no reference.tsv row: {extra}")
        return len(keys)


    # ---- (c), (d) ---------------------------------------------------------------
    def arm_code_to_code(tmp, ref, anc):
        runs = {}
        for n in GRIDS:
            rc, out = run_case(copy_case(tmp / f"g{n}", nodes=n))
            d = diags_of(out) if rc == 0 else None
            if d is None:
                fails.append(f"(c) the case did not run at {n} nodes (exit {rc}):\n{out[-1500:]}")
                return None
            runs[n] = d
        worst, orders, worst_case_grid = 0.0, [], 0.0
        ratio = (GRIDS[2] - 1) / (GRIDS[1] - 1)
        for r in ref:
            key = f"c_perm_{r['ion']}_p{r['point']}"
            try:
                v = [runs[n][r["op"]][key] for n in GRIDS]
            except KeyError:
                fails.append(f"(c) the case publishes no {r['op']} {key}")
                continue
            ext = v[2] + (v[2] - v[1]) / (ratio * ratio - 1.0)
            e1, e2 = v[1] - v[0], v[2] - v[1]
            if abs(e2) > 1e-9 * abs(v[2]) and abs(e1) > 0:
                p = math.log(abs(e1 / e2), 2.0)
                orders.append(p)
                if not 1.8 <= p <= 2.2:
                    fails.append(f"(c) {r['op']} {key}: observed order {p:.2f} (expected 2)")
            rel = abs(ext - r["cp_ext"]) / abs(r["cp_ext"])
            worst = max(worst, rel)
            if rel > TOL_CODE:
                fails.append(f"(c) {r['op']} {key}: Choupo extrapolated {ext:.10g} vs "
                             f"NanoFiltran {r['cp_ext']:.10g} -- {rel:.2e} relative > {TOL_CODE}")
            # (d) the case's own grid against its anchor tolerance
            here = runs[CASE_NODES][r["op"]][key]
            err = abs(here - r["cp_ext"]) / abs(r["cp_ext"])
            worst_case_grid = max(worst_case_grid, err)
            a = anc.get((r["op"], key))
            if a is not None:
                if err > a[1]:
                    fails.append(f"(d) {r['op']} {key}: {CASE_NODES} nodes is {err:.2e} from "
                                 f"NanoFiltran, outside its anchor tolerance {a[1]:.1e}")
        return worst, orders, worst_case_grid


    # ---- (e) ------------------------------------------------------------------
    def arm_refusals(tmp):
        probes = [
            ("hindrance banana", lambda t: t.replace("hindrance  DechadilokDeen2006;",
                                                     "hindrance  banana;", 1),
             ["unknown DSPM-DE hindrance 'banana'", "DechadilokDeen2006"]),
            #  The retired word refuses with its reason, not as an unknown word
            #  (DEV.md 4c C141): a case that asked for the old default must be
            #  told why it is gone, never moved to the new one in silence.
            ("hindrance legacy", lambda t: t.replace("hindrance  DechadilokDeen2006;",
                                                     "hindrance  legacy;", 1),
             ["`hindrance legacy;`, which is RETIRED",
              "counted the steric partition twice in diffusion",
              "hindrance DechadilokDeen2006;"]),
            ("activity banana", lambda t: t.replace("activity   ideal;", "activity   banana;", 1),
             ["unknown DSPM-DE activity 'banana'", "bulkOverPoreDavies"]),
            ("wallClosure banana", lambda t: t.replace("wallClosure porePermeate;",
                                                       "wallClosure banana;", 1),
             ["unknown DSPM-DE pore solver wallClosure 'banana'", "porePermeate"]),
            #  The retired pore method, refused with its reason (DEV.md 4c C142).
            ("method closedForm",
             lambda t: re.sub(r"(name\s+example_davies;.*?)poreSolver \{[^}]*\}",
                              r"\1poreSolver { method closedForm; }", t, count=1, flags=re.S),
             ["`method closedForm;`, which is RETIRED", "K_c > 1"]),
            ("another law on the bench", lambda t: t.replace("transport DSPM-DE;",
                                                             "transport SDEM;", 1),
             ["only the DSPM-DE law honours an imposed"]),
        ]
        fired = 0
        for tag, edit, needles in probes:
            case = copy_case(tmp / ("refuse_" + re.sub(r"\W+", "_", tag)), props=edit)
            plain = copy_case(tmp / ("plain_" + re.sub(r"\W+", "_", tag)))
            if (case / "system" / "propsDict").read_text() == (plain / "system" / "propsDict").read_text():
                fails.append(f"(e) the probe `{tag}` could not be built (its anchor text moved)")
                continue
            rc, out = run_case(case)
            if rc == 0:
                fails.append(f"(e) `{tag}` was ACCEPTED (exit 0)")
                continue
            miss = [s for s in needles if s not in out]
            if miss:
                fails.append(f"(e) `{tag}` exited {rc} without naming {miss}:\n{out[-800:]}")
                continue
            fired += 1
        return fired


    def main():
        if not PROPS.exists():
            print("check_nanofiltran_reference: FAILED -- no choupoProps binary (build first)")
            return 1
        ref = nf.read_reference()
        anc = anchors()
        with tempfile.TemporaryDirectory(prefix="nanofiltran_") as d:
            tmp = Path(d)
            n_inputs = arm_inputs()
            n_anch = arm_anchors(ref, anc)
            c2c = arm_code_to_code(tmp, ref, anc)
            fired = arm_refusals(tmp)
        if fails:
            print("check_nanofiltran_reference: FAILED")
            for f in fails:
                print("  " + f)
            return 1
        worst, orders, caseGrid = c2c
        print(f"check_nanofiltran_reference: OK -- {n_inputs} NanoFiltran inputs are the "
              f"matching rule's and its 5 vendored files hash as received; {n_anch} anchors "
              f"equal reference.tsv; Choupo's pore at 401/801/1601 nodes shows order "
              f"{min(orders):.2f}-{max(orders):.2f} and, extrapolated, agrees with NanoFiltran "
              f"extrapolated (ND 102/204) within {worst:.1e} relative on all {len(ref)} rows "
              f"(bound {TOL_CODE:g}); at the case's {CASE_NODES} nodes the worst row is "
              f"{caseGrid:.1e} from NanoFiltran, inside every anchor; {fired} refusals fire by "
              f"name.  NOT CHECKED: whether NanoFiltran is right (code-to-code is not "
              f"validation), the as-received program's Davies constant (a finding), the default "
              f"DSPM-DE path, any measured membrane.")
        return 0
    return main()


ARMS = [
    ("nanofiltran_paper", arm_nanofiltran_paper),
    ("nanofiltran_reference", arm_nanofiltran_reference),
]


def _claim(name, text):
    from gate_claim import claim_in
    import re
    c = claim_in(text, "check_" + name)
    c = c if c else (text.strip().splitlines() or ["(no output)"])[-1].strip()
    return "[" + name + "] " + re.sub(r"^\s*(\[[^\]]+\]|[\w.\-]+:)\s*OK\b\s*(--)?\s*", "", c)


def main():
    results = []
    for name, fn in ARMS:
        buf = io.StringIO()
        rc = 0
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            try:
                r = fn()
                rc = r if isinstance(r, int) else 0
            except SystemExit as e:
                rc = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
                if isinstance(e.code, str):
                    print(e.code)
            except Exception:
                traceback.print_exc()
                rc = 1
        results.append((name, rc, buf.getvalue()))
    bad = [n for n, rc, _ in results if rc != 0]
    if bad:
        print("check_nanofiltran_as_received: FAILED -- arm(s) " + ", ".join(bad))
    else:
        print("check_nanofiltran_as_received: OK -- " + " || ".join(_claim(n, t) for n, _, t in results))
    for name, rc, text in results:
        print("--- arm check_%s (exit %d)" % (name, rc))
        sys.stdout.write(text if text.endswith("\n") or not text else text + "\n")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
