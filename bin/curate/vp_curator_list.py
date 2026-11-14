#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""vp_curator_list -- the CURATOR LIST of the C281 vapour-pressure refits.

    bin/curate/vp_curator_list.py [--out docs/reviews/<file>.md]

WHY (DEV.md 4c C281 step 3 and C283, Vitor 2026-11-10: "here a man in the
middle is needed").  `bin/choupo-curate vp` fits every usable laboratory's
measurements, discards outliers by a declared rule and GRADES the fit by a
declared acceptance (DEV.md 4c C285: max relative error over the kept points
<= 5 / 10 / 20 % clean / warning / severe, |Tnb - Tb| <= 1 / 2 / 4 K where Tb
lies outside their range, the worse of the two; refused above), promoting
every grade but refused.  Some cases a rule
cannot settle -- one laboratory against the others, a study the extraction
rules set aside, a curve that passes by a hair.  This list puts, for each
component, the fitted curve against EVERY archive study of it, beside the
AmbroseWalton estimate on the same points, so that a human can see which
laboratory disagrees and decide.  It decides nothing and promotes nothing:
the tool never reads it.

WHAT IT READS.  Each `curateNN_vp_<c>` case: the fitted Antoine and the
discarded points from its RESULT paragraph, its fitted studies from its
evidence.  The studies are extracted afresh from the local ThermoML cache
through the SAME functions the tool uses; the AmbroseWalton curve is
check_ambrose_walton_announced's independent Python on the record's own Tc,
Pc and omega.  Where the cache is absent the list cannot be built and the
script says so (exit 2), never writing a partial list.
"""
import argparse
import importlib.machinery
import importlib.util
import math
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate"))
import curation_roots  # noqa: E402  (where a curation case lives: ONE home, DEV.md 4c C295)


def load(name, path):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


cur = load("choupo_curate", ROOT / "bin" / "choupo-curate")
aw = load("check_aw", ROOT / "bin" / "curate" / "check_ambrose_walton_announced.py")


def scal(text, key):
    m = re.search(r"^%s\s+([-+0-9.eE]+)" % key, cur.crp.strip_comments(text), re.M)
    return float(m.group(1)) if m else None


def antoine_of(text):
    m = re.search(r"Antoine log10\(Psat/bar\) = ([-0-9.]+) - ([-0-9.]+)/\(T \+ ([-0-9.]+)\)",
                  " ".join(text.split()))
    return tuple(float(x) for x in m.groups()) if m else None


def errors(f, T, P_kPa):
    r = [abs(f(t) / p - 1.0) for t, p in zip(T, P_kPa)]
    return 100.0 * sum(r) / len(r), 100.0 * max(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="docs/reviews/2026-11-10-vapour-pressure-curator-list.md")
    a = ap.parse_args()
    comps = sorted(p.name for p in curation_roots.COMPONENTS.iterdir()
                   if curation_roots.is_case(p))
    index = cur.cache_root() / "index.json"
    if not index.exists():
        print(f"vp_curator_list: NOT RUN -- no ThermoML cache index at {index}; the "
              "studies cannot be extracted, so no list is written")
        return 2
    import json
    ix = json.loads(index.read_text())
    out = []
    summary = []
    work = Path(tempfile.mkdtemp(prefix="vp-curator-"))
    for comp in comps:
        case = cur.vp_case_dir(comp)
        if case is None:
            print(f"vp_curator_list: no case for {comp}")
            return 1
        pd = (case / "system" / "propsDict").read_text()
        res = re.search(r"@@RESULT-BEGIN@@(.*?)@@RESULT-END@@", pd, re.S)
        res = " ".join(res.group(1).split())
        fit = antoine_of(res)
        if fit is None:
            print(f"vp_curator_list: {case.name} carries no fitted result")
            return 1
        A, B, C = fit
        reason = re.search(r"(PROMOTED.*|NOT PROMOTED.*|PROMOTABLE.*)$", res)
        reason = reason.group(1) if reason else "(no reason recorded)"
        dm = re.search(r"Outliers discarded: (.*?)\. Its own", res)
        dropped_txt = dm.group(1) if dm else "none"
        dropped = cur.vp_dropped(dropped_txt)
        dois = re.findall(r'identity\s*\{\s*doi\s+"([^"]+)";\s*\}\s*role\s+fit;', pd)
        rec = (ROOT / "data" / "standards" / "components" / f"{comp}.dat").read_text()
        Tc, Pc, w, Tb = scal(rec, "Tc"), scal(rec, "Pc"), scal(rec, "omega"), scal(rec, "Tb")
        _, cas, key = cur.identity(comp)
        arts = sorted({e["doi"]: e for e in ix["entries"]
                       if any(c.get("inchikey") == key for c in e.get("compounds", []))}.values(),
                      key=lambda e: e["doi"])
        studies, aside = [], []
        for e in arts:
            xml = cur.cache_root() / (e["doi"] + ".xml")
            if not xml.exists():
                aside.append((e["doi"], "article file not in the local cache"))
                continue
            pth, why = cur.extract_vp(xml, key, work / comp)
            if pth is None:
                if "carries no pure" not in why:
                    aside.append((e["doi"], " ".join(why.split())[:140]))
                continue
            ds = cur.read_vp_dataset(pth)
            if ds["n"] == 0:
                continue
            authors = "; ".join(x.split(",")[0] for x in e.get("authors", [])[:3])
            studies.append(dict(ds, doi=e["doi"], authors=authors))
        studies.sort(key=lambda s: (-s["n"], s["doi"]))
        fits = lambda t: cur.antoine_P_kPa(A, B, C, t)
        awf = lambda t: aw.psat(t, Tc, Pc * 1e5, w) / 1e3
        Tnb = cur.antoine_Tnb(A, B, C)
        out.append(f"## {comp}\n")
        #  A record may declare no Tb (DEV.md 4c C287: a new component whose
        #  archive carries no boiling temperature at 101.3 kPa).
        tb_txt = "declares no Tb" if Tb is None else f"record Tb {Tb:g} K"
        gap_txt = "" if Tb is None else f" ({Tnb - Tb:+.2f} K from Tb)"
        out.append(f"CAS {cas}; {tb_txt}.  Fitted on {len(dois)} "
                   f"stud{'y' if len(dois) == 1 else 'ies'} (every usable one); "
                   f"Antoine log10(P/bar) = {A:.6f} - {B:.4f}/(T + {C:.4f}); its normal "
                   f"boiling point {Tnb:.2f} K{gap_txt}.\n")
        gm = re.search(r"fit grade (clean|warning|severe|refused)", reason)
        grade = gm.group(1) if gm else "--"
        out.append(f"**Fit grade (DEV.md 4c C285):** {grade}\n")
        out.append(f"**Tool decision:** {reason}\n")
        out.append(f"**Discarded as outliers:** {dropped_txt}\n")
        out.append("| study | role | n (kept) | T range / K | fit mean / max % | "
                   "AmbroseWalton mean / max % |")
        out.append("|---|---|---|---|---|---|")
        for st in studies:
            role = "fitted" if st["doi"] in dois else (
                f"not fitted (< {cur.MIN_INTERIOR} pts)" if st["n"] < cur.MIN_INTERIOR
                else "not fitted")
            nk = sum(1 for t, pk in zip(st["T"], st["P"])
                     if (st["doi"], round(t, 3), round(math.log10(pk * 1e3), 5)) not in dropped)
            m1 = errors(fits, st["T"], st["P"])
            m3 = errors(awf, st["T"], st["P"])
            fmt = lambda m: f"{m[0]:.2f} / {m[1]:.2f}"
            out.append(f"| `{st['doi']}` ({st['authors']}) | {role} | {st['n']} ({nk}) | "
                       f"{min(st['T']):g}-{max(st['T']):g} | {fmt(m1)} | {fmt(m3)} |")
        for d, why in aside:
            out.append(f"| `{d}` | set aside | -- | -- | {why} | |")
        out.append("")
        summary.append((comp, grade, ("PROMOTED" if reason.startswith("PROMOTED") else reason.split(":")[0].split(" by ")[0]), len(dois),
                        None if Tb is None else Tnb - Tb, re.search(r"max relative error ([0-9.]+) %", reason)))
    head = f"""# Vapour pressures refitted by `bin/choupo-curate vp`: the curator list

2026-11-10, DEV.md 4c C281 step 3, graded by C285.  GENERATED by
`bin/curate/vp_curator_list.py`; regenerate it, never edit it by hand.

This is where a human decides.  The tool fitted every usable study of each
component (objective twoStage: least squares in log10 P, then the largest
relative error in P minimised from it), discarded a point above 15 % after
the least-squares stage by name, and graded the fit by the default
acceptance of DEV.md 4c C285 (max relative error over the kept points up to
5 % clean, 10 % warning, 20 % severe, refused above; where Tb lies outside
their range, the normal boiling point's gap to it up to 1 / 2 / 4 K, the same
grades; the worse of the two), promoting every grade but refused -- a warning
or severe grade is voiced by the engine on every run that loads the record;
it never reads this list.  For each component: the fitted curve scored on EVERY
archive study of it -- the fitted ones, and those the extraction rules set
aside or left unfitted (fewer than 5 points) -- beside the AmbroseWalton
estimate (the record's Tc, Pc, omega) on the same points.  Errors are
relative in P, |P_model/P - 1|, in per cent, over ALL of a study's points
(the kept count is beside n).

What the list cannot tell a curator: whether the measurements are right (each
series is `transcribedNotCheckedAgainstArticle`), and whether a study that
disagrees with the others is the wrong one.

## Summary

| component | fit grade | tool decision | studies fitted | max error % (kept points) | Tnb - Tb / K |
|---|---|---|---|---|---|
"""
    for comp, g, r, n, dT, mx in summary:
        head += f"| {comp} | {g} | {r} | {n} | {mx.group(1) if mx else '--'} | {'no Tb' if dT is None else f'{dT:+.2f}'} |\n"
    text = head + "\n" + "\n".join(out) + "\n"
    (ROOT / a.out).write_text(text)
    print(f"vp_curator_list: wrote {a.out} ({len(comps)} components)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
