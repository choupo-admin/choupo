#!/usr/bin/env python3
"""Gate: a spiral-wound STAGE -- vessels in parallel, elements in series --
built from element and feed-spacer RECORDS, with the spacer's own
correlations, their window and Schock & Miquel's hydraulic diameter.
    bin/curate/check_spiral_array.py

WHY THIS EXISTS (C146, 2026-10-24).  Until then `spiralWoundModule` marched
ONE pressure vessel; a standard element size was a hand table of four
areas inside SpiralWoundModule.cpp (`moduleDiameter` + `nModules`); the
feed spacer was two inline numbers (channelHeight, spacerPorosity) whose
hydraulic diameter, 2 h eps, is not the one the correlation's authors
defined; and the correlation's measured window was nowhere.  Now one unit
is one STAGE (`vessels <n>; elements <m>;`), the four standard sizes are
records (`Generic-2540 | -4040 | -8040 | -16040`), the feed spacer is a
record (`kind feedSpacer`) carrying its geometry, its correlations and
their window, and d_h is Schock & Miquel's Eq. (17).  This gate holds each
of those claims against something independent of the engine.

THE SOURCE.  G. Schock, A. Miquel, Mass transfer and pressure loss in
spiral wound modules, Desalination 64 (1987) 339-352 -- READ from the paper
on 2026-10-24 (Elsevier copyright; the paper is not in the tree, only the
numbers below, each cited).  Tab. 1 (p. 343) is transcribed here a SECOND
time, independently of the records.

WHAT THIS GATE CHECKS (every witness is RUN; nothing is read from a stale
converged/):
  (a) THE SPACER RECORDS AGAINST THE PAPER.  The five `SchockMiquel-*`
      records carry Tab. 1's h_SP, d_F and eps to 1e-9; S_V,SP = 4/d_F
      (Eq. 23) and d_h by Eq. (17), recomputed HERE from the record, agree
      with Tab. 1's printed S_V,SP and d_h within the table's rounding
      (0.05 1/mm, 0.005 mm); the mesh route (Eqs. 20-22 from Tab. 1's l_M)
      reproduces the tabulated eps within 0.005 -- the paper's own
      consistency; the correlation coefficients are Eq. (30)'s and
      Eq. (24)'s and the window is 100 < Re < 1000.  Spacer-28mil carries
      the SW30HR-380 sheet's 28 mil and marks its porosity and filament as
      estimates with notes.
  (b) THE ENGINE USES EQ. 17, AND THE CHANNEL THE RECORDS GIVE.  membrane21
      publishes `hydraulicDiameter` = Eq. (17) of the FT30 record to 1e-9,
      `leafWidth` = A/(2 n L) of Generic-8040, and its inlet crossflow times
      the channel section n W_leaf h eps recomputes the per-vessel feed
      flow to 1e-9.
  (c) THE GENERIC ELEMENTS.  Each `Generic-*` record carries the retired
      table's area (2.6 / 7.9 / 37.2 / 148.6 m2), an integer leaf count, a
      leaf length no longer than its 40-inch element, a nominal diameter
      matching its name, the FT30 spacer, NO stored leaf width and NO
      membrane; every geometric value is an estimate with a verification
      note; the DERIVED leaf width lies in 0.5-2.0 m (a stated plausibility
      band: a leaf is wound around a tube, its width is the permeate path);
      membrane21 announces exactly its three estimates and none for the
      FT30 spacer (whose values are the paper's).
  (d) PARALLEL SYMMETRY, IDENTITY.  A probe of Stage1 alone with `vessels 4`
      on F, against `vessels 1` on F/4: every outlet flow is exactly 4x, every
      composition and KPI identical to 1e-10 relative (the JSON's 12
      digits).
  (e) THE WINDOW.  A one-element probe at 0.3 of the flow (Re < 100) prints a
      `[window]` line for BOTH correlations, raises `extrapolation`
      advisories and exits 0; membrane21 (Re 132-265) prints none.
  (f) PER ION.  membrane21's `k_film_<ion>` profile columns are the spacer
      correlation on each ion's OWN D: at every node k_i/k_Na =
      (D_i/D_Na)^0.75 (Sc^0.25 -> k ~ D^0.75) to 1e-9, with D read here from
      the case's species records, and the inlet k_Na = 0.065 Re^0.875
      Sc^0.25 D/d_h recomputed from the published Q_b, the record's d_h and
      the declared viscosity to 1e-9.
  (g) THE STAGE CLOSES.  On membrane21's stream table each stage's feed
      equals its concentrate plus permeate (molar flows, per component) to
      1e-9 -- the outlets were scaled by the vessel count, both of them.
  (h) THE REFUSALS, each by name, from unsealed probes: `moduleDiameter`
      (retired, naming the Generic records); an element naming an unknown
      spacer (the registered list); a spacer declaring porosity AND the mesh;
      a spacer declaring hydraulicDiameter AND the filament; an element
      storing `leafWidth`; an element with `feedSpacer` AND `channelHeight`;
      a case `a` coefficient beside the spacer; a case correlation the spacer
      does not carry; `vessels 2.5`.

WHAT THIS GATE DOES **NOT** COVER.  Whether the generic estimates are good
ones (no element of the class was unrolled here); the transcription
against the PDF itself (this table is a second human reading); any
measured array performance (nothing here is compared with a plant); a
maldistribution between vessels (not modelled); the permeate-side
pressure drop; the spacer's edge bypass Schock & Miquel describe (p. 344).
That Eq. (30)'s window is 100-1000 is read off Fig. 9's axis; the paper
states the window in words only for Eq. (24) (p. 345).

SABOTAGE-VERIFIED 2026-10-24 (edits BY HAND, rebuilt where C++ moved, run,
restored; the gate never patches a source):
  S1  SpiralWoundModule: the permeate's `* nVessels` removed    CAUGHT by (d)
      (permeate 1/4 of 4 x the single vessel) and by (g) (stage 1 does not
      close).
  S2  SpiralWoundModule: d_h back to 2 h eps for a spacer       CAUGHT by (b)
      (1.3706 mm against Eq. 17's 0.9518) and by (f) (the absolute k).
  S3  SpiralWoundModule: the [window] block deleted             CAUGHT by (e).
  S4  SchockMiquel-FilmTecFT30.dat porosity 0.89 -> 0.90       CAUGHT by (a)
      (record vs Tab. 1), (b) and (f).  It ALSO disarmed two (h) probes,
      whose edit anchors on that line and silently did not land -- so every
      probe now refuses to run unbuilt and says so.
  S5  MembraneModule.cpp: the `leafWidth` refusal removed      CAUGHT by (h).
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_membrane_modules import (parse_record, si, word, close, run,  # noqa: E402
                                    result_of, copy_case, ROOT, ASSETS)

M21 = ROOT / "tutorials/steady/membranes/membrane21_two_stage_nf_array"

#  Schock & Miquel (1987) Tab. 1, p. 343 -- transcribed a second time.
#  name: (h_SP mm, d_F mm, l_M mm, eps, S_V,SP 1/mm, d_h mm)
TAB1 = {
    "SchockMiquel-TorayPEC1000": (0.54, 0.270, 2.3, 0.91, 14.8, 0.72),
    "SchockMiquel-Naltex1228":   (0.75, 0.375, 3.0, 0.90, 10.7, 0.96),
    "SchockMiquel-DesalRO":      (0.82, 0.410, 2.7, 0.88, 9.8, 0.97),
    "SchockMiquel-FilmTecFT30":  (0.77, 0.385, 2.8, 0.89, 10.4, 0.95),
    "SchockMiquel-DesalUF":      (1.51, 0.755, 3.1, 0.81, 5.3, 1.39),
}
SH = (0.065, 0.875, 0.25)        # Eq. (30), p. 347
FRICTION = (6.23, 0.3)           # Eq. (24), p. 345
WINDOW = (100.0, 1000.0)         # p. 345
#  The retired nominal table's areas (SpiralWoundModule.cpp before C146).
GENERIC = {"Generic-2540": (2.5, 2.6), "Generic-4040": (4.0, 7.9),
           "Generic-8040": (8.0, 37.2), "Generic-16040": (16.0, 148.6)}
INCH = 0.0254
UNIT_EXTRA = {"in": INCH}


def length(entry):
    if len(entry) == 2 and entry[1] in UNIT_EXTRA:
        return float(entry[0]) * UNIT_EXTRA[entry[1]]
    return si(entry)


def eq17(h, eps, Sv):
    return 4.0 * eps / (2.0 / h + (1.0 - eps) * Sv)


def unseal(src, dst):
    """A refusal probe must reach the refusal, not the seal: copy without the
    manifest (copy_case), so case-local records override the catalogue."""
    copy_case(src, dst)


def species_D(case, ion):
    t = (case / "constant/species" / (ion + ".dat")).read_text()
    t = re.sub(r"//[^\n]*", "", t)
    m = re.search(r"D0\s*\{\s*value\s+([0-9.eE+-]+)\s*;", t)
    return float(m.group(1))


def main():
    failures = []

    # ---------------- (a) the spacer records against Tab. 1 ----------------
    spacers = {}
    for p in sorted(ASSETS.glob("*.dat")):
        d = parse_record(p)
        if word(d.get("kind", [])) == "feedSpacer":
            spacers[word(d["name"])] = d
    for name, (h, dF, lM, eps, Sv, dh) in TAB1.items():
        d = spacers.get(name)
        if d is None:
            failures.append(f"(a) spacer record '{name}' not found")
            continue
        rh, rdF, reps = si(d["thickness"]), si(d["filamentDiameter"]), float(d["porosity"][0])
        for k, a, b in (("thickness", rh, h * 1e-3), ("filamentDiameter", rdF, dF * 1e-3),
                        ("porosity", reps, eps)):
            if not close(a, b):
                failures.append(f"(a) {name}: {k} {a} vs Tab. 1's {b}")
        for k in ("meshLength", "hydraulicDiameter"):
            if k in d:
                failures.append(f"(a) {name}: `{k}` stored -- it is derived (one home)")
        Sv_r = 4.0 / rdF * 1e-3                       # 1/mm
        if abs(Sv_r - Sv) > 0.05:
            failures.append(f"(a) {name}: S_V,SP 4/d_F = {Sv_r:.3f} 1/mm vs Tab. 1's {Sv}")
        #  Tab. 1 prints eps to 0.01 and d_h to 0.01 mm, and computed its d_h
        #  from its own (unrounded) eps: so Eq. 17 over eps +- 0.005, widened
        #  by half the d_h digit, must contain the printed d_h.
        dh_r = eq17(rh, reps, 4.0 / rdF) * 1e3        # mm
        lo = eq17(rh, reps - 0.005, 4.0 / rdF) * 1e3 - 0.005
        hi = eq17(rh, reps + 0.005, 4.0 / rdF) * 1e3 + 0.005
        if not lo <= dh <= hi:
            failures.append(f"(a) {name}: Eq. 17 d_h = {dh_r:.4f} mm (band {lo:.4f}-{hi:.4f} from the printed rounding) vs Tab. 1's {dh}")
        eps_mesh = 1.0 - 0.5 * math.pi * dF * dF * lM / (lM * lM * h)
        if abs(eps_mesh - eps) > 0.005:
            failures.append(f"(a) {name}: Eqs. 20-22 eps = {eps_mesh:.4f} vs Tab. 1's {eps}")
        mt, pd = d.get("massTransfer", {}), d.get("pressureDrop", {})
        if (word(mt.get("model", [])), word(pd.get("model", []))) != ("SchockMiquel", "SchockMiquel"):
            failures.append(f"(a) {name}: correlations are not Schock & Miquel's")
        if tuple(float(mt.get(k, ["nan"])[0]) for k in ("a", "b", "c")) != SH:
            failures.append(f"(a) {name}: Sh coefficients are not Eq. 30's {SH}")
        if tuple(float(pd.get(k, ["nan"])[0]) for k in ("a", "b")) != FRICTION:
            failures.append(f"(a) {name}: friction coefficients are not Eq. 24's {FRICTION}")
        for blk in (mt, pd):
            if tuple(blk.get("validity", {}).get("Re", [])) != WINDOW:
                failures.append(f"(a) {name}: window {blk.get('validity')} is not 100 < Re < 1000")
        prov = d.get("provenance", {})
        if "Desalination 64 (1987)" not in word(prov.get("source", [])):
            failures.append(f"(a) {name}: provenance.source does not cite the paper")
        if any(isinstance(b, dict) and word(b.get("origin", [])) == "estimated" for b in prov.values()):
            failures.append(f"(a) {name}: a Tab. 1 value is marked as an estimate")
    s28 = spacers.get("Spacer-28mil")
    if s28 is None:
        failures.append("(a) Spacer-28mil not found")
    else:
        if not close(si(s28["thickness"]), 28 * 25.4e-6):
            failures.append("(a) Spacer-28mil: thickness is not 28 mil")
        prov = s28.get("provenance", {})
        for k in ("porosity", "filamentDiameter"):
            b = prov.get(k, {})
            if not (word(b.get("origin", [])) == "estimated" and word(b.get("reviewStatus", [])) == "unverified"
                    and "verif" in word(b.get("notes", []))):
                failures.append(f"(a) Spacer-28mil: `{k}` is not marked an estimate with a verification note")

    # ---------------- (c) the generic element records ----------------------
    generics = {}
    for p in sorted(ASSETS.glob("Generic-*.dat")):
        d = parse_record(p)
        generics[word(d["name"])] = d
    if set(generics) != set(GENERIC):
        failures.append(f"(c) generic records {sorted(generics)} vs {sorted(GENERIC)}")
    for name, (inch, area) in GENERIC.items():
        d = generics.get(name)
        if d is None:
            continue
        A = si(d["activeArea"]); n = float(d["leaves"][0]); L = si(d["leafLength"])
        if not close(A, area):
            failures.append(f"(c) {name}: activeArea {A} vs the retired table's {area}")
        if n != round(n) or n < 1:
            failures.append(f"(c) {name}: leaves {n} is not a whole number >= 1")
        if not close(length(d["nominalDiameter"]), inch * INCH):
            failures.append(f"(c) {name}: nominalDiameter is not {inch} in")
        if not L <= length(d["elementLength"]):
            failures.append(f"(c) {name}: leafLength exceeds elementLength")
        if word(d.get("feedSpacer", [])) != "SchockMiquel-FilmTecFT30":
            failures.append(f"(c) {name}: not wound with the FT30 spacer")
        for k in ("leafWidth", "membrane", "channelHeight", "spacerPorosity"):
            if k in d:
                failures.append(f"(c) {name}: stores `{k}`")
        W = A / (2.0 * n * L)
        if not 0.5 <= W <= 2.0:
            failures.append(f"(c) {name}: derived leaf width {W:.3f} m outside the 0.5-2.0 m plausibility band")
        prov = d.get("provenance", {})
        for k in ("activeArea", "leaves", "leafLength"):
            b = prov.get(k, {})
            if not (word(b.get("origin", [])) == "estimated" and word(b.get("reviewStatus", [])) == "unverified"
                    and "verif" in word(b.get("notes", []))):
                failures.append(f"(c) {name}: `{k}` is not an estimate with a verification note")

    # ---------------- membrane21: (b) (c-announce) (e-neg) (f) (g) --------
    rc, out = run(M21)
    j = result_of(out) if rc == 0 else None
    if j is None:
        failures.append(f"membrane21 did not run (exit {rc}):\n" + out[-800:])
    else:
        ft = spacers.get("SchockMiquel-FilmTecFT30")
        g8 = generics.get("Generic-8040")
        h = si(ft["thickness"]); eps = float(ft["porosity"][0]); dF = si(ft["filamentDiameter"])
        dh = eq17(h, eps, 4.0 / dF)
        A = si(g8["activeArea"]); n = float(g8["leaves"][0]); L = si(g8["leafLength"])
        Wl = A / (2.0 * n * L)
        for unit in ("Stage1", "Stage2"):
            k = j["kpis"][unit]
            if not close(k.get("hydraulicDiameter", 0.0), dh):
                failures.append(f"(b) {unit}: hydraulicDiameter {k.get('hydraulicDiameter')} vs Eq. 17's {dh}")
            if not close(k.get("leafWidth", 0.0), Wl):
                failures.append(f"(b) {unit}: leafWidth {k.get('leafWidth')} vs A/(2nL) {Wl}")
            Q = k.get("feedFlowPerVessel", 0.0)
            if not close(k["u_crossflow_inlet"] * n * Wl * h * eps, Q):
                failures.append(f"(b) {unit}: u n W h eps = {k['u_crossflow_inlet'] * n * Wl * h * eps:.6e} vs the per-vessel feed {Q:.6e}")
            # (g) the stage closes on the stream table
        names = {"Stage1": ("feed", "concentrate1", "permeate1"),
                 "Stage2": ("boosted", "concentrate2", "permeate2")}
        for unit, (fi, r, pm) in names.items():
            S = j["streams"]
            if not all("composition" in S[x] for x in (fi, r, pm)):
                failures.append(f"(g) {unit}: a stream carries no composition")
                continue
            for c in j["components"]:
                fin = S[fi]["F"] * S[fi]["composition"][c]
                fout = S[r]["F"] * S[r]["composition"][c] + S[pm]["F"] * S[pm]["composition"][c]
                if not close(fin, fout, 1e-9):
                    failures.append(f"(g) {unit}: component {c} in {fin:.9e} vs out {fout:.9e}")
        # (c) the announcement
        est = re.findall(r"\[estimate\] module 'Generic-8040': `(\w+)`", out)
        if sorted(est) != sorted(["activeArea", "leaves", "leafLength"] * 2):
            failures.append(f"(c) membrane21 announced {sorted(est)} for Generic-8040 (two stages x three estimates expected)")
        if "[estimate] spacer 'SchockMiquel-FilmTecFT30'" in out:
            failures.append("(c) membrane21 announced an estimate for the FT30 spacer, whose values are Tab. 1's")
        # (e) negative
        if "[window]" in out:
            failures.append("(e) membrane21 runs inside the window and printed a [window] line")
        # (f) per ion
        mu = 1.0e-3; rho = 1000.0
        D = {ion: species_D(M21, ion) for ion in ("Na", "Cl", "NO3", "NH4")}
        prof = j["profiles"]["Stage1"]["columns"]
        for ion in ("Cl", "NO3", "NH4"):
            want = (D[ion] / D["Na"]) ** 0.75
            for a, b in zip(prof["k_film_" + ion], prof["k_film_Na"]):
                if not close(a / b, want, 1e-9):
                    failures.append(f"(f) k_{ion}/k_Na = {a / b:.12f} vs (D ratio)^0.75 = {want:.12f}")
                    break
        Ach = (A / (2.0 * L)) * h * eps
        u0 = prof["Q_b"][0] / Ach
        Re = rho * u0 * dh / mu
        Sc = mu / (rho * D["Na"])
        k0 = SH[0] * Re ** SH[1] * Sc ** SH[2] * D["Na"] / dh
        if not close(prof["k_film_Na"][0], k0, 1e-9):
            failures.append(f"(f) inlet k_Na {prof['k_film_Na'][0]:.9e} vs Eq. 30 on Eq. 17 {k0:.9e}")
        if not prof["k_film_Cl"][0] > prof["k_film_Na"][0]:
            failures.append("(f) k_Cl is not above k_Na: the film is not per ion")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        def stage1_only(dd, vessels, scale):
            fd = dd / "system/flowsheetDict"
            t = fd.read_text()
            i = t.index("    {\n        name        Booster;")
            t = t[:i] + ");\n"
            t = t.replace("vessels          4;", f"vessels          {vessels};")
            fd.write_text(t)
            for s in ("boosted", "concentrate2", "permeate2"):
                (dd / "0" / s).unlink()
            f = dd / "0/feed"
            def sc(m):
                return f"{m.group(1)}{float(m.group(2)) * scale:.10g} kmol/h;"
            f.write_text(re.sub(r"(\s+(?:water|Na|Cl|NO3|NH4)\s+)([0-9.eE+-]+) kmol/h;", sc, f.read_text()))

        # ---------------- (d) parallel symmetry -----------------------------
        res = {}
        for label, v, scale in (("four", 4, 1.0), ("one", 1, 0.25)):
            dd = tmp / ("sym_" + label)
            copy_case(M21, dd)
            stage1_only(dd, v, scale)
            rc, out = run(dd)
            res[label] = result_of(out) if rc == 0 else None
            if res[label] is None:
                failures.append(f"(d) symmetry probe '{label}' did not run (exit {rc}):\n" + out[-600:])
        if res.get("four") and res.get("one"):
            a, b = res["four"], res["one"]
            for s in ("concentrate1", "permeate1"):
                #  1e-10: the result JSON carries 12 significant digits, and a
                #  tolerance tighter than that channel measures the serialiser.
                if not close(a["streams"][s]["F"], 4.0 * b["streams"][s]["F"], 1e-10):
                    failures.append(f"(d) {s}: F(4 vessels on F) {a['streams'][s]['F']} vs 4 x F(1 vessel on F/4) {4 * b['streams'][s]['F']}")
                for c, x in a["streams"][s]["composition"].items():
                    if not close(x, b["streams"][s]["composition"][c], 1e-10):
                        failures.append(f"(d) {s}: x_{c} differs between the two")
            for kk in ("water_recovery", "R_obs_Na", "R_obs_Cl", "R_obs_NO3", "R_obs_NH4", "dP_feed", "J_w_avg"):
                if not close(a["kpis"]["Stage1"][kk], b["kpis"]["Stage1"][kk], 1e-10):
                    failures.append(f"(d) KPI {kk} differs: {a['kpis']['Stage1'][kk]} vs {b['kpis']['Stage1'][kk]}")

        # ---------------- (e) the window fires -------------------------------
        dd = tmp / "lowRe"
        copy_case(M21, dd)
        stage1_only(dd, 4, 0.3)
        p = dd / "system/flowsheetDict"
        p.write_text(p.read_text().replace("elements         6;", "elements         1;", 1))
        rc, out = run(dd)
        if rc != 0:
            failures.append(f"(e) the low-Re probe REFUSED (exit {rc}) -- a window announces:\n" + out[-600:])
        else:
            for what in ("mass-transfer", "friction"):
                if not re.search(r"\[window\] %s correlation 'SchockMiquel' of the feed spacer 'SchockMiquel-FilmTecFT30' EXTRAPOLATED" % what, out):
                    failures.append(f"(e) no [window] line for the {what} correlation at low Re")
            jj = result_of(out)
            if sum(1 for x in jj["advisories"] if x.get("category") == "extrapolation"
                   and "SchockMiquel-FilmTecFT30" in x.get("message", "")) < 2:
                failures.append("(e) the window did not reach the advisories")

        # ---------------- (h) the refusals -----------------------------------
        def refusal(label, mutate, must):
            dd = tmp / ("ref_" + label)
            unseal(M21, dd)
            try:
                mutate(dd)
            except (AssertionError, RuntimeError) as e:
                failures.append(f"(h) {label}: the probe could not be built ({e})")
                return
            rc, out = run(dd)
            missing = [m for m in must if m not in out]
            if rc == 0 or missing:
                failures.append(f"(h) {label}: exit {rc}, refusal text missing {missing}:\n" + out[-500:])

        def op(dd, old, new):
            p = dd / "system/flowsheetDict"
            t = p.read_text()
            if old not in t:
                raise RuntimeError(f"probe edit did not apply: {old[:40]!r}")
            p.write_text(t.replace(old, new, 1))

        def asset(dd, src_name, text_edit, dst_name=None):
            src = ASSETS / (src_name + ".dat")
            (dd / "constant/assets").mkdir(parents=True, exist_ok=True)
            before = src.read_text()
            after = text_edit(before)
            #  A probe whose edit did not land is not a probe: it would run the
            #  unedited record to exit 0 and read as a missing refusal (or,
            #  worse, a sabotage elsewhere would hide behind it).
            if after == before:
                raise RuntimeError(f"probe edit did not apply to {src.name}")
            (dd / "constant/assets" / ((dst_name or src_name) + ".dat")).write_text(after)

        refusal("moduleDiameter", lambda dd: op(dd, "module           Generic-8040;      // data",
                                                "moduleDiameter   8 in;      // data"),
                ["`moduleDiameter` is RETIRED", "Generic-8040", "Generic-16040"])
        refusal("unknownSpacer", lambda dd: asset(dd, "Generic-8040",
                lambda t: t.replace("feedSpacer       SchockMiquel-FilmTecFT30;", "feedSpacer       NoSuchSpacer;")),
                ["NoSuchSpacer", "SchockMiquel-FilmTecFT30", "Spacer-28mil"])
        refusal("porosityAndMesh", lambda dd: asset(dd, "SchockMiquel-FilmTecFT30",
                lambda t: t.replace("porosity          0.89;", "porosity          0.89;\nmeshLength        2.8 mm;")),
                ["`porosity` AND the mesh", "one home"])
        refusal("dhAndFilament", lambda dd: asset(dd, "SchockMiquel-FilmTecFT30",
                lambda t: t.replace("porosity          0.89;", "porosity          0.89;\nhydraulicDiameter 0.95 mm;")),
                ["`hydraulicDiameter` AND", "one home"])
        refusal("leafWidth", lambda dd: asset(dd, "Generic-8040",
                lambda t: t.replace("leafLength       0.854 m;", "leafLength       0.854 m;\nleafWidth        1.36 m;")),
                ["`leafWidth` is DERIVED"])
        refusal("spacerAndChannel", lambda dd: asset(dd, "Generic-8040",
                lambda t: t.replace("leafLength       0.854 m;", "leafLength       0.854 m;\nchannelHeight    0.77 mm;")),
                ["supplies the channel", "`channelHeight`", "one home"])
        refusal("caseCoefficient", lambda dd: op(dd, "viscosity      1.0e-3;          // Pa.s",
                                                 "a 0.08;\n                viscosity      1.0e-3;          // Pa.s"),
                ["massTransfer `a` beside the feed spacer", "one home"])
        refusal("foreignCorrelation", lambda dd: op(dd, "model          SchockMiquel;    // coefficients + window: the spacer record\n                viscosity",
                                                    "model          StirredCell;\n                viscosity"),
                ["'StirredCell' is not the correlation the feed spacer", "SchockMiquel"])
        refusal("fractionalVessels", lambda dd: op(dd, "vessels          4;", "vessels          2.5;"),
                ["`vessels` is a whole number"])

    if failures:
        print("check_spiral_array: FAILED")
        for f in failures:
            print("  " + f)
        return 1
    print("check_spiral_array: OK -- the five Schock & Miquel feed-spacer records carry Tab. 1's h_SP, d_F and eps "
          "(p. 343, a second transcription) and Eqs. 23/17 recomputed here reproduce its S_V,SP and d_h within the "
          "printed rounding, the mesh route (Eqs. 20-22) its eps within 0.005; Eq. 30 / Eq. 24 coefficients and the "
          "100 < Re < 1000 window on every record; Spacer-28mil marks its two estimates; the four Generic-* elements "
          "carry the retired table's areas, whole leaves, no stored width or membrane, the FT30 spacer, estimates "
          "with notes and a derived leaf width in 0.5-2.0 m; membrane21 publishes Eq. 17's d_h and A/(2nL), its "
          "crossflow recomputes the per-vessel feed, each stage closes per component to 1e-9, k_i/k_Na = "
          "(D_i/D_Na)^0.75 at every node and the inlet k_Na is Eq. 30 on Eq. 17 to 1e-9; 4 vessels on F are 4x one "
          "vessel on F/4 to 1e-10; a low-Re twin announces both windows and exits 0, membrane21 none; 9 refusals "
          "fire by name.  NOT CHECKED: whether the generic estimates are good, the transcription against the PDF, "
          "any measured array, vessel maldistribution, the permeate-side drop, the spacer's edge bypass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
