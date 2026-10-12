#!/usr/bin/env python3
"""Generate the FEASIBILITY -> BASIC-DESIGN comparison of the green-ammonia
sequence (DEV.md 4c C68, the addition accepted from a second opinion: "a
feasibility -> basic-design comparison of consumptions, investment and
profitability, each difference traced to the model change") from the
ENGINE, never typed.

    bin/curate/gen_ammonia_stage_comparison.py           # (re)write the section
    bin/curate/gen_ammonia_stage_comparison.py --check   # report drift, write nothing (the gate)
    bin/curate/gen_ammonia_stage_comparison.py --cache D # development only: keep the three
                                                         # result JSONs in D and reuse them
                                                         # (never with --check, which always runs)

WHERE IT IS WRITTEN.  Between two marker lines in
tutorials/plant/greenAmmonia03_basicDesign/README.md.  The comparison is
read by the student who has reached the basic-design rung and asks what
refining the study changed; that README is the page the GUI opens with the
case, it carried two hand-written feasibility-vs-basic-design tables of its
own (which had drifted from the engine), and those are replaced by this one
home.  The sequence map in ammoniaRoutes01_screening's README points here.

WHAT IS RUN.  Three engine runs, each a fresh copy in a temporary directory
(never the gitignored run outputs of the tutorial tree, which are whatever
binary ran last):
  A  greenAmmonia02_feasibility150bar, as committed;
  C  greenAmmonia03_basicDesign, as committed (its DesignSpec, ~1 min);
  B  A with ONE edit to its postDict: the basic design's appraisal TIMELINE
     (construction period, capital schedule, ramp-up, start-up cost --
     read from C's published `economics.timeline`, never typed here).
     B - A is the NPV the changed ASSUMPTION moves, measured by the engine.
Every number in the section is read from those runs' result JSON.

THE NPV DECOMPOSITION, AND WHERE THIS SCRIPT DOES ARITHMETIC OF ITS OWN.
At a fixed timeline the engine's DCF (`appraise`, EconomicsPass.cpp) is
LINEAR in R, C_RM, C_UT, C_OL, FCI and WC, so C - B splits EXACTLY into one
term per input, and the C_UT term per utility service and the FCI term per
equipment item.  That needs the DCF's coefficients, so this script carries a
transcription of `appraise`'s cash-flow rule -- a second home, accepted
because it is HELD TO THE ENGINE: the transcription must reproduce the
engine's NPV of A, B and C to 1e-9 relative, and the per-item FCI split must
reproduce the engine's FCI (1.18 sum C_BM + 0.50 sum C_BM_base, Turton Eq
7.5) to 1e-9, or the script FAILS rather than print a decomposition of a
different DCF.  The reverse order (the plant change first, at the
feasibility's one-year timeline) uses the transcription alone and is labelled
so.  C_OL is not published; it is recovered from the engine's own COM_d
identity (COM_d = 0.180 FCI + 2.73 C_OL + 1.23 (C_RM + C_UT)).

WHAT IT REFUSES.  Any appraisal input that differs between the two cases and
is not one this comparison traces (the timeline, which B measures, and N_np,
the declared operator count) FAILS the run, as does any difference in
constant/economics (prices, labour rate), the utility records or the costing
block: a difference in an assumption that nobody traced must not be filed
under a model change.

WHAT IT DOES NOT CLAIM.  The "why" column is authored prose.  It is held to
the runs where a number is substituted into it, and every DIRECTION it states
(less conversion, more recycle, a hotter last bed, a plant losing money in
every year, the heat recovery exceeding the whole NPV difference, ...) is a
`claim()` the runs must satisfy or the script fails; but a sentence can still
be wrong about the physics in a way no direction catches.  The bed/Gibbs
equilibrium difference is traced to three causes whose shares are NOT
separated (said in the table).  Nothing here says either stage's answer is
right -- both rest on the same author-set prices.

SABOTAGES (by hand, 2026-10-12; each restored afterwards, each caught):
  S1  a stale number: the committed FCI cell for the basic design edited
      59.14 -> 59.41 -> --check exit 1, the diff names the one line.
  S2  a removed row: the "converter pressure drop" row deleted from the
      committed section -> --check exit 1, the diff shows the missing row.
  S3  the transcription broken: the 0.180 FCI term dropped from
      `coefficients` -> exit 1 before anything is written ("the DCF
      transcription does not reproduce the engine's NPV of run A:
      -448.34e6 against -493.10e6"), so a decomposition of a different DCF
      cannot be printed.
  S4  a direction reversed: run C's effluent temperature set below run A's
      in a cached result -> exit 1, "the section's prose says 'the last bed
      leaves hotter and lower in pressure', and the runs no longer do".
  S5  an untraced assumption: the basic design's `streamFactor` edited
      0.90 -> 0.85 -> --check exit 1 before any run, naming the input.
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLANT = ROOT / "tutorials" / "plant"
FEAS = "greenAmmonia02_feasibility150bar"
BASIC = "greenAmmonia03_basicDesign"
README = PLANT / BASIC / "README.md"
BEGIN = "<!-- BEGIN GENERATED: bin/curate/gen_ammonia_stage_comparison.py -->"
END = "<!-- END GENERATED: bin/curate/gen_ammonia_stage_comparison.py -->"
TOL = 1e-9

#  The appraisal inputs this comparison TRACES when they differ.  Anything
#  else that differs fails the run.
TRACED_TIMELINE = ("constructionPeriod", "capitalSchedule", "rampUp", "startupCostFraction")
TRACED_COUNT = ("N_np",)


def fail(msg):
    print("gen_ammonia_stage_comparison: FAILED -- " + msg)
    sys.exit(1)


# ---------------------------------------------------------------- dict text
def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def block(text, name):
    """The body of the top-level `name { ... }` block (comments stripped)."""
    t = strip_comments(text)
    m = re.search(r"(?m)^" + re.escape(name) + r"\s*\{", t)
    if not m:
        return None
    i, depth = m.end(), 1
    while depth:
        c = t[i]
        depth += (c == "{") - (c == "}")
        i += 1
    return t[m.end():i - 1]


def scalars(body):
    """`key value;` entries of a block body, nested blocks flattened with a
    dotted prefix; a `sensitivity {}` block is an analysis, not an input."""
    out, depth, prefix, buf = {}, 0, [], ""
    for tok in re.findall(r"\{|\}|[^{};]+;?", body):
        tok = tok.strip()
        if not tok:
            continue
        if tok == "{":
            prefix.append(buf.strip().split()[-1] if buf.strip() else "?")
            buf = ""
            continue
        if tok == "}":
            prefix.pop()
            continue
        if tok.endswith(";"):
            s = (buf + " " + tok[:-1]).strip()
            buf = ""
            if "sensitivity" in prefix or not s:
                continue
            k, _, v = s.partition(" ")
            out[".".join(prefix + [k])] = " ".join(v.split())
        else:
            buf += " " + tok
    return out


def norm(path):
    return " ".join(strip_comments(path.read_text()).split())


# ------------------------------------------------------------------ the runs
def run_case(src, work, edit=None):
    dst = work / src.name
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "design", "reports", "iterations"))
    if edit:
        edit(dst)
    p = subprocess.run([str(ROOT / "choupoSolve"), "."], cwd=dst, capture_output=True,
                       text=True, env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"},
                       timeout=900)
    if p.returncode != 0:
        fail(f"{src.name}{' (counterfactual)' if edit else ''} exited {p.returncode}:\n"
             + p.stdout[-2000:] + p.stderr[-2000:])
    s = p.stdout
    b = s.rfind("<<<Choupo:result-begin>>>")
    e = s.rfind("<<<Choupo:result-end>>>")
    if b < 0 or e < b:
        fail(f"{src.name}: no result block on stdout")
    d = json.loads(s[b + len("<<<Choupo:result-begin>>>"):e])
    if not d.get("converged"):
        fail(f"{src.name}: the run did not converge")
    return d


def with_timeline(tl):
    def edit(case):
        pd = case / "system" / "postDict"
        t = pd.read_text()
        fmt = lambda v: "( " + " ".join(f"{x:g}" for x in v) + " )"
        new = (f"constructionPeriod  {tl['constructionPeriod']};\n"
               f"    capitalSchedule     {fmt(tl['capitalSchedule'])};\n"
               f"    rampUp              {fmt(tl['rampUp'])};\n"
               f"    startupCostFraction {tl['startupCostFraction']:g};")
        t2, n = re.subn(r"constructionPeriod\s+1\s*;", new, t)
        if n != 1:
            fail(f"the counterfactual edit found {n} `constructionPeriod 1;` lines in {FEAS}'s postDict, not 1")
        pd.write_text(t2)
    return edit


# ------------------------------------------------- the DCF, transcribed
def timeline_of(d):
    tl = d["economics"].get("timeline")
    if not tl:
        return {"constructionPeriod": 1, "capitalSchedule": [1.0], "rampUp": [],
                "startupCostFraction": 0.0}
    return tl


def inputs_of(d, sf):
    ec, k = d["economics"], d["kpis"]["economics"]
    FCI, COM = ec["FCI"], ec["COM_d"]
    C_RM, C_UT = k["C_RM"], k["C_UT"]
    return {"R": ec["revenue"], "C_RM": C_RM, "C_UT": C_UT,
            "C_OL": (COM - 0.180 * FCI - 1.23 * (C_RM + C_UT)) / 2.73,
            "FCI": FCI, "WC": ec["WC"], "COM_d": COM,
            "depLife": FCI / ec["depreciation"], "salvage": sf}


def coefficients(tl, ec, depLife, salvageFraction):
    """d NPV / d input at a fixed timeline: the cash-flow rule of
    EconomicsPass.cpp `appraise`, one coefficient per input."""
    i, tau, N = ec["discountRate"], ec["taxRate"], int(round(ec["projectLife"]))
    Nc = tl["constructionPeriod"]
    Ndepr = int(round(depLife))
    df = lambda t: (1.0 + i) ** (-t)
    p = lambda t: tl["rampUp"][t - 1] if 1 <= t <= len(tl["rampUp"]) else 1.0
    c = {"R": 0.0, "var": 0.0, "C_OL": 0.0, "FCI": 0.0, "WC": -1.0 + df(N)}
    for k in range(1, Nc + 1):
        c["FCI"] -= tl["capitalSchedule"][k - 1] * df(k - Nc)
    for t in range(1, N + 1):
        c["R"] += df(t) * (1 - tau) * p(t)
        c["var"] -= df(t) * (1 - tau) * 1.23 * p(t)
        c["C_OL"] -= df(t) * (1 - tau) * 2.73
        c["FCI"] -= df(t) * (1 - tau) * 0.180
        if t == 1:
            c["FCI"] -= df(t) * (1 - tau) * tl["startupCostFraction"]
        if t <= Ndepr:
            c["FCI"] += df(t) * tau / depLife
    c["FCI"] += df(N) * salvageFraction * (1 - tau)
    return c


def npv(x, c):
    return (c["R"] * x["R"] + c["var"] * (x["C_RM"] + x["C_UT"]) + c["C_OL"] * x["C_OL"]
            + c["FCI"] * x["FCI"] + c["WC"] * x["WC"])


def close(a, b, what):
    if abs(a - b) > TOL * max(1.0, abs(b)):
        fail(f"{what}: {a!r} against the engine's {b!r}")


# ------------------------------------------------------------ the equipment
def fci_share(q):
    """An item's share of FCI = 1.18 C_BM + 0.50 C_BM_base (Turton Eq 7.5),
    C_BM_base = C_p (B1 + B2) at F_M = F_P = 1."""
    c = q.get("cost")
    if not c:
        return 0.0, 0.0
    f = c["factors"]
    return c["bareModule"], 1.18 * c["bareModule"] + 0.50 * c["purchased"] * (f["B1"] + f["B2"])


def group_of(q):
    t, unit = q["type"], q["unit"]
    if t == "compressor":
        return "compressors"
    if t == "catalystCharge":
        return "catalyst"
    if t == "reliefValve":
        return "reliefValves"
    if t == "storageTank":
        return "storage"
    if t == "vessel" and (unit == "Converter" or q.get("sector") == "CONVERTER"):
        return "converter"
    if t == "vessel":
        return "drums"
    if t == "shellTubeHX":
        if unit in ("FeedPreheater", "EffluentCooler", "FEHE"):
            return "heatRecovery"
        if unit.startswith("CONVERTER."):
            return "interbed"
        return "otherHX"
    fail(f"equipment item {q['item']} ({t}) has no group in this comparison")


GROUPS = [
    ("compressors", "compressors (4)"),
    ("converter", "converter pressure vessel"),
    ("catalyst", "catalyst charge"),
    ("heatRecovery", "feed heating / effluent cooling exchangers"),
    ("interbed", "interbed coolers"),
    ("otherHX", "the five other exchangers"),
    ("drums", "separator and let-down drums (3)"),
    ("storage", "NH3 storage tanks (2)"),
    ("reliefValves", "relief valves"),
]


def groups(d):
    g = {k: {"CBM": 0.0, "FCI": 0.0, "n": 0, "uncosted": 0} for k, _ in GROUPS}
    for q in d["equipment"]:
        k = group_of(q)
        cbm, f = fci_share(q)
        g[k]["CBM"] += cbm
        g[k]["FCI"] += f
        g[k]["n"] += 1
        g[k]["uncosted"] += 0 if q.get("cost") else 1
    return g


def item(d, name):
    for q in d["equipment"]:
        if q["item"] == name:
            return q
    fail(f"no equipment item {name}")


def util(d):
    """utility -> (EUR/h, duty kW, kg/s), allocated rows only."""
    u = {}
    for r in d["utilityAllocation"]:
        if not r["allocated"]:
            continue
        a = u.setdefault(r["utility"], [0.0, 0.0, 0.0])
        a[0] += r["eur_h"]
        a[1] += abs(r["duty_kW"])
        a[2] += r["kg_s"]
    return u


def unallocated(d):
    return [(r["unit"], r["duty_kW"], r["T"]) for r in d["utilityAllocation"]
            if not r["allocated"] and not r["carried"]]


# ------------------------------------------------------------- formatting
def f(v, n=2):
    return "—" if v is None else f"{v:,.{n}f}".replace(",", " ")


def dlt(a, b, n=2):
    if a is None or b is None:
        return "—"
    return f"{b - a:+,.{n}f}".replace(",", " ")


def M(v):
    return v / 1e6


def build(A, B, C, sfA, sfC, salA, salC):
    ecA, ecC = A["economics"], C["economics"]
    kA, kC = A["kpis"]["economics"], C["kpis"]["economics"]
    cA, cC = A["computed"], C["computed"]
    H_A, H_C = sfA * 8760.0, sfC * 8760.0
    tA, tC = timeline_of(A), timeline_of(C)
    xA, xB, xC = inputs_of(A, salA), inputs_of(B, salA), inputs_of(C, salC)

    # ---- hold the transcription to the engine ---------------------------
    for x, d, tl, sal, nm in ((xA, A, tA, salA, "A"), (xB, B, timeline_of(B), salA, "B"),
                              (xC, C, tC, salC, "C")):
        co = coefficients(tl, d["economics"], x["depLife"], sal)
        close(npv(x, co), d["economics"]["NPV"],
              f"the DCF transcription does not reproduce the engine's NPV of run {nm}")
    for d, nm in ((A, FEAS), (C, BASIC)):
        close(sum(fci_share(q)[1] for q in d["equipment"]), d["economics"]["FCI"],
              f"the per-item FCI split does not reproduce {nm}'s FCI")
    if any(timeline_of(B)[k] != tC[k] for k in TRACED_TIMELINE):
        fail("the counterfactual run B did not publish the basic design's timeline")

    coC = coefficients(tC, ecC, xC["depLife"], salC)
    coA = coefficients(tA, ecA, xA["depLife"], salA)
    npvA, npvB, npvC = ecA["NPV"], B["economics"]["NPV"], ecC["NPV"]
    npvD = npv(xC, coA)          # the basic-design plant at the feasibility's timeline

    uA, uC = util(A), util(C)
    gA, gC = groups(A), groups(C)
    sA, sC = A["streams"], C["streams"]

    tpd_A, tpd_C = cA["NH3_t_day"], cC["NH3_t_day"]
    th_A, th_C = cA["NH3_t_h"], cC["NH3_t_h"]
    ty = lambda th, H: th * H
    perT = lambda kw, th: kw / th                     # kWh per t
    gwh = lambda kw, H: kw * H / 1e6                  # GWh/yr
    kg_t = lambda kgs, th: kgs * 3.6 / th              # kg/s -> t/h, per t/h of NH3
    U = lambda u, k, i: u.get(k, [0.0, 0.0, 0.0])[i]

    #  The authored prose states DIRECTIONS; each one is held to the runs here,
    #  so a run that reverses one fails instead of printing a false sentence.
    def claim(ok, sentence):
        if not ok:
            fail(f"the section's prose says {sentence!r}, and the runs no longer do")
    yA_, yC_ = cA["y_NH3_converter"], cC["y_NH3_converter"]
    claim(yC_ < yA_, "the beds convert less per pass")
    claim(cC["recycle_ratio"] > cA["recycle_ratio"], "the loop recirculates more")
    claim(cC["purge_kmol_h"] > cA["purge_kmol_h"], "the purge is larger")
    claim(A["streams"]["HotEffluent"]["T"] < C["streams"]["HotEffluent"]["T"]
          and A["streams"]["HotEffluent"]["P"] > C["streams"]["HotEffluent"]["P"],
          "the last bed leaves hotter and lower in pressure")
    claim(A["kpis"]["pinch"]["Q_H_min_kW"] < U(uA, "hitecSalt", 1),
          "the feasibility pinch says the bought feed heating can be recovered")
    claim(cC["V_catalyst_m3"] > item(A, "Converter")["values"]["V_R"],
          "the space-velocity rule was optimistic")
    claim(U(uC, "hitecSalt", 0) == 0.0 and U(uA, "hitecSalt", 0) > 0.0,
          "only the feasibility case buys feed heating")
    for d, nm in ((A, "feasibility"), (C, "basic design")):
        claim(all(r["afterTaxProfit"] < 0 for r in d["economics"]["cashFlow"] if r["year"] >= 1),
              f"the {nm} plant loses money in every operating year")
    claim(xA["R"] - xA["COM_d"] < xC["R"] - xC["COM_d"],
          "the feasibility plant loses more per year")
    claim(xC["FCI"] > xA["FCI"], "the basic design has the larger FCI")

    out = []
    w = out.append
    w(BEGIN)
    w("<!-- Generated from three engine runs of the two cases; do not edit by hand.  "
      "Regenerate with `bin/curate/gen_ammonia_stage_comparison.py`; `bin/runTests` "
      "fails when this section no longer matches the engine. -->")
    w("")
    w("## From feasibility to basic design: what changed, and why")
    w("")
    w(f"The same plant at two stages: [`{FEAS}`](../{FEAS}) (illustrated design stage FEL-2) and this "
      f"case (FEL-3, process side). Both declare `estimateClass {ecA['estimateClass']}` with the same "
      f"{ecA['accLo']:g} / +{ecA['accHi']:g} % band: the class is the author's statement of how far "
      "the project is defined, so it did not move with the stage. Every number below comes from the "
      "engine's runs of the two cases (the one exception is labelled where it appears); the *why* "
      "column traces each difference to what changed between them, and says so where a difference "
      "could not be traced. The 50 bar alternative is a different design, not a stage, and is not a "
      "column here.")
    w("")
    w("**Read this first: most of the NPV difference is NOT the better models.** "
      "The feasibility flowsheet has no feed/effluent exchanger *by construction* — its converter "
      "feed is heated by molten salt bought as a utility, which its own pinch pass says the next "
      "stage can recover — and this case builds that exchanger. That one flowsheet decision is worth "
      "more than the whole NPV difference; the model refinements (kinetic beds, Ergun, Kern, one "
      "converter shell, a costed catalyst) together move the NPV the OTHER way. The appraisal's "
      "start-up years are a changed assumption, measured separately below.")
    w("")

    # ---- consumptions ----------------------------------------------------
    w("### Production and consumptions")
    w("")
    w("| quantity | feasibility | basic design | difference | why |")
    w("|---|---|---|---|---|")
    w(f"| NH₃ produced, t/day | {f(tpd_A)} | {f(tpd_C)} | {dlt(tpd_A, tpd_C)} | Both stages buy the "
      "same declared make-up, so production moves only by what the purge and the let-down gas carry "
      "out: the beds convert less per pass, the loop recirculates more, and the purge (a fixed "
      "fraction of the recycle) is larger. *Reactor model.* |")
    w(f"| NH₃ produced, t/yr | {f(ty(th_A, H_A), 0)} | {f(ty(th_C, H_C), 0)} | "
      f"{dlt(ty(th_A, H_A), ty(th_C, H_C), 0)} | {sfA * 8760:g} h/yr on stream in both "
      f"(`streamFactor` {sfA:g}). |")
    h2A, h2C = sA["H2Feed"]["F_mass"], sC["H2Feed"]["F_mass"]
    n2A, n2C = sA["N2Feed"]["F_mass"], sC["N2Feed"]["F_mass"]
    w(f"| H₂ consumed, kg/t NH₃ | {f(h2A * 3600 / th_A, 1)} | {f(h2C * 3600 / th_C, 1)} | "
      f"{dlt(h2A * 3600 / th_A, h2C * 3600 / th_C, 1)} | The same feed over a slightly smaller "
      "product. *Reactor model* (through the purge). |")
    w(f"| H₂ consumed, t/yr | {f(h2A * 3.6 * H_A, 0)} | {f(h2C * 3.6 * H_C, 0)} | "
      f"{dlt(h2A * 3.6 * H_A, h2C * 3.6 * H_C, 0)} | Declared make-up: identical. |")
    w(f"| N₂ consumed, kg/t NH₃ | {f(n2A * 3600 / th_A, 1)} | {f(n2C * 3600 / th_C, 1)} | "
      f"{dlt(n2A * 3600 / th_A, n2C * 3600 / th_C, 1)} | As H₂. |")
    w(f"| N₂ consumed, t/yr | {f(n2A * 3.6 * H_A, 0)} | {f(n2C * 3.6 * H_C, 0)} | "
      f"{dlt(n2A * 3.6 * H_A, n2C * 3.6 * H_C, 0)} | Declared make-up: identical. |")
    eA, eC = U(uA, "electricity", 1), U(uC, "electricity", 1)
    rcA = item(A, "RecycleComp")["values"]["power"]
    rcC = item(C, "RecycleComp")["values"]["power"]
    w(f"| electricity, kWh/t NH₃ | {f(perT(eA, th_A), 1)} | {f(perT(eC, th_C), 1)} | "
      f"{dlt(perT(eA, th_A), perT(eC, th_C), 1)} | Every compressor's shaft power is DECLARED. "
      f"The one change: the recycle compressor, re-tuned by the author from {rcA:g} to {rcC:g} kW so "
      "the loop sits again at the base case's pressure against the beds' Ergun drop. "
      "*Pressure-drop model, and an author's re-tune — not a computed compression.* |")
    w(f"| electricity, GWh/yr | {f(gwh(eA, H_A))} | {f(gwh(eC, H_C))} | "
      f"{dlt(gwh(eA, H_A), gwh(eC, H_C))} | As above. |")
    hsA, hsC = U(uA, "hitecSalt", 1), U(uC, "hitecSalt", 1)
    fehe = C["kpis"]["FEHE"]["Q_kW"]
    w(f"| converter-feed heating BOUGHT (molten salt), kWh/t NH₃ | {f(perT(hsA, th_A), 1)} | "
      f"{f(perT(hsC, th_C), 1)} | {dlt(perT(hsA, th_A), perT(hsC, th_C), 1)} | The feasibility "
      "flowsheet has no feed/effluent exchanger by construction, so the feed is heated by molten salt "
      f"bought as a utility; here the FEHE carries {f(fehe / 1000)} MW from bed 3's effluent. "
      "*Flowsheet decision (heat recovery built), not model fidelity* — the feasibility's own pinch "
      f"pass targets a minimum heating of {f(A['kpis']['pinch']['Q_H_min_kW'] / 1000)} MW. |")
    w(f"| converter-feed heating bought, GWh/yr | {f(gwh(hsA, H_A))} | {f(gwh(hsC, H_C))} | "
      f"{dlt(gwh(hsA, H_A), gwh(hsC, H_C))} | As above. |")
    stA, stC = U(uA, "steamGenerationHP", 2), U(uC, "steamGenerationHP", 2)
    stkA, stkC = U(uA, "steamGenerationHP", 1), U(uC, "steamGenerationHP", 1)
    heA, heC = sA["HotEffluent"], sC["HotEffluent"]
    w(f"| HP steam raised (credit), t/t NH₃ | {f(kg_t(stA, th_A), 3)} | {f(kg_t(stC, th_C), 3)} | "
      f"{dlt(kg_t(stA, th_A), kg_t(stC, th_C), 3)} | The steam is the reaction heat less what heats "
      "the loop gas from the converter inlet to its outlet. The ammonia formed per pass is the same "
      f"({f(cA['NH3_per_pass_kmol_h'], 1)} / {f(cC['NH3_per_pass_kmol_h'], 1)} kmol/h: the make-up "
      "fixes it), so the reaction heat is too; but the beds' gas is heated through "
      f"{f(heC['T'] - sC['PreheatedFeed']['T'], 1)} K against the Gibbs reactor's "
      f"{f(heA['T'] - sA['PreheatedFeed']['T'], 1)} K, and there is "
      f"{f((sC['PreheatedFeed']['F'] / sA['PreheatedFeed']['F'] - 1) * 100, 1)} % more of it, so "
      "more of the heat leaves with the effluent (to the FEHE) and less is raised — in the two "
      "interbed coolers, not inside the converter. *Reactor model.* |")
    w(f"| HP steam raised, MW | {f(stkA / 1000)} | {f(stkC / 1000)} | {dlt(stkA / 1000, stkC / 1000)} "
      "| As above. |")
    cwA, cwC = U(uA, "coolingWater", 1), U(uC, "coolingWater", 1)
    cwmA, cwmC = U(uA, "coolingWater", 2), U(uC, "coolingWater", 2)
    w(f"| cooling water, kWh/t NH₃ | {f(perT(cwA, th_A), 1)} | {f(perT(cwC, th_C), 1)} | "
      f"{dlt(perT(cwA, th_A), perT(cwC, th_C), 1)} | The effluent cooler's duty is gone into the "
      f"FEHE, and the water cooler starts from the FEHE's hot outlet "
      f"({f(sC['CooledEffluent']['T'] - 273.15, 1)} °C) instead of the effluent cooler's declared "
      f"{f(sA['CooledEffluent']['T'] - 273.15, 1)} °C. *Heat recovery built.* |")
    w(f"| cooling water circulated, t/t NH₃ | {f(kg_t(cwmA, th_A), 1)} | {f(kg_t(cwmC, th_C), 1)} | "
      f"{dlt(kg_t(cwmA, th_A), kg_t(cwmC, th_C), 1)} | As above. |")
    rfA, rfC = U(uA, "refrigerationNH3", 1), U(uC, "refrigerationNH3", 1)
    w(f"| refrigeration (−20 °C chiller), kWh/t NH₃ | {f(perT(rfA, th_A), 1)} | {f(perT(rfC, th_C), 1)} | "
      f"{dlt(perT(rfA, th_A), perT(rfC, th_C), 1)} | More gas reaches the chiller (the larger "
      "recycle) carrying the same ammonia to condense. *Reactor model.* |")
    w(f"| refrigeration, GWh/yr | {f(gwh(rfA, H_A))} | {f(gwh(rfC, H_C))} | "
      f"{dlt(gwh(rfA, H_A), gwh(rfC, H_C))} | As above. |")
    lpA, lpC = U(uA, "steamLP", 1), U(uC, "steamLP", 1)
    w(f"| LP steam (drum heating), kWh/t NH₃ | {f(perT(lpA, th_A), 2)} | {f(perT(lpC, th_C), 2)} | "
      f"{dlt(perT(lpA, th_A), perT(lpC, th_C), 2)} | Follows the separator's flows. |")
    unA, unC = unallocated(A), unallocated(C)
    w(f"| duty no catalogue utility serves, kW | {f(sum(-x[1] for x in unA), 1)} "
      f"({', '.join(x[0] for x in unA)}) | {f(sum(-x[1] for x in unC), 1)} "
      f"({', '.join(x[0] for x in unC)}) | {dlt(sum(-x[1] for x in unA), sum(-x[1] for x in unC), 1)} "
      "| The product flash at −35 °C, below every catalogue refrigerant: unpriced in BOTH, so both "
      "utility bills are lower bounds. The same gap, not a difference. |")
    w("")

    # ---- the loop and the converter -------------------------------------
    w("### The loop and the converter")
    w("")
    w("| quantity | feasibility | basic design | difference | why |")
    w("|---|---|---|---|---|")
    yA, yC = cA["y_NH3_converter"] * 100, cC["y_NH3_converter"] * 100
    bed3 = C["kpis"]["CONVERTER.Bed3"]
    w(f"| converter outlet NH₃, mol % | {f(yA)} | {f(yC)} | {dlt(yA, yC)} | Gibbs: 5 K short of "
      f"equilibrium at a declared {f(heA['T'] - 273.15, 1)} °C and {f(heA['P'] / 1e5, 1)} bar. Beds: "
      "adiabatic, bed 1 stopped at 515 °C (the catalyst-limit criterion), beds 2 and 3 at a 5 K "
      f"approach. Three causes, their shares NOT separated here: the last bed leaves "
      f"{f(heC['T'] - heA['T'], 1)} K hotter and {f((heA['P'] - heC['P']) / 1e5, 2)} bar lower (Ergun), "
      "and its approach is measured against the rate law's own equilibrium constant, not the "
      "package's Gibbs energy. *Reactor model.* |")
    rrA, rrC = cA["recycle_ratio"], cC["recycle_ratio"]
    w(f"| recycle / make-up, mol/mol | {f(rrA, 3)} | {f(rrC, 3)} | {dlt(rrA, rrC, 3)} | Less "
      "conversion per pass, the same ammonia per pass: more gas goes round. *Reactor model.* |")
    pgA, pgC = cA["purge_kmol_h"], cC["purge_kmol_h"]
    w(f"| purge, kmol/h | {f(pgA)} | {f(pgC)} | {dlt(pgA, pgC)} | A declared fraction of the "
      "recycle in both, so it follows the recycle. |")
    vA = item(A, "Converter")["values"]
    vcat = cC["V_catalyst_m3"]
    w(f"| catalyst volume, m³ | {f(vA['V_R'])} | {f(vcat)} | {dlt(vA['V_R'], vcat)} | Rule → "
      "criterion. Feasibility: a vessel sized on an ASSUMED space velocity (20 000 Nm³/(m³ h), "
      "normal basis). Basic design: the three bed volumes SOLVED by the rate law against 515 °C and "
      f"two 5 K approaches; the last bed alone is {f(C['kpis']['CONVERTER.Bed3']['V_R'])} m³, because "
      "the rate collapses near equilibrium. *Reactor model; the rule of thumb was optimistic here.* |")
    sh = item(C, "CONVERTER/shell")["values"]
    w(f"| converter pressure vessel, m³ (D × H, m) | {f(vA['V_R'])} ({f(vA['D'])} × {f(vA['H'])}) | "
      f"{f(sh['V_R'])} ({f(sh['D'])} × {f(sh['H'])}) | {dlt(vA['V_R'], sh['V_R'])} | Feasibility: the "
      "space-velocity vessel at a declared L/D. Basic design: ONE shell holding the three beds and "
      "the two interbed coolers stacked at the beds' one diameter, which the DesignSpec solves so "
      "the largest bed drop meets its 1 bar budget (DEV.md 4c C69). *Reactor model + one-shell "
      "construction.* |")
    dpA = (sA["PreheatedFeed"]["P"] - heA["P"]) / 1e5
    dpC = (sC["PreheatedFeed"]["P"] - heC["P"]) / 1e5
    w(f"| converter pressure drop, bar | {f(dpA)} | {f(dpC)} | {dlt(dpA, dpC)} | Feasibility: no "
      "flow model — the number is the loop pressure minus the Gibbs reactor's DECLARED 150 bar. "
      "Basic design: Ergun integrated along each bed "
      f"({f(C['kpis']['CONVERTER.Bed1']['dP_bed_bar'])} + "
      f"{f(C['kpis']['CONVERTER.Bed2']['dP_bed_bar'])} + {f(bed3['dP_bed_bar'])} bar). "
      "*Pressure-drop model.* |")
    lpA_ = (sA["CompRecycle"]["P"] - sA["Recycle"]["P"]) / 1e5
    lpC_ = (sC["CompRecycle"]["P"] - sC["Recycle"]["P"]) / 1e5
    w(f"| loop pressure drop, recycle compressor discharge → separator, bar | {f(lpA_)} | {f(lpC_)} | "
      f"{dlt(lpA_, lpC_)} | Set in BOTH by the separator's DECLARED 140 bar and the declared "
      "compressor powers. The exchangers' Kern pressure drops are computed on their design sheets "
      "and NOT applied to the streams, so only the converter's share of this drop is modelled, and "
      "only at the basic design. *No difference by construction — not a measured agreement.* |")
    w("")

    # ---- capital and the appraisal ---------------------------------------
    w("### Investment")
    w("")
    w("Bare-module cost C_BM by equipment group, M EUR. FCI = 1.18 ΣC_BM + 0.50 ΣC_BM⁰, C_BM⁰ the "
      "same items at carbon steel and 1 bar (Turton's grassroots rule, the same in both), so a "
      "group's FCI effect below can differ in sign from its C_BM difference when its materials or "
      "pressures changed.")
    w("")
    w("| equipment group | feasibility | basic design | difference | why |")
    w("|---|---|---|---|---|")
    why_g = {
        "compressors": f"The recycle compressor's declared power, {rcA:g} → {rcC:g} kW (above). "
                       "*Pressure-drop model.*",
        "converter": "The space-velocity vessel → one shell around beds and coolers at 167 bar. "
                     "The coolers' shells are counted twice (here as converter height, and again "
                     "inside their own exchanger cost), an over-estimate C69 names. *Reactor model "
                     "+ one-shell construction.*",
        "catalyst": "NOT COSTED at feasibility (the vessel carries no charge); here the solved volume "
                    "× a declared bulk density × a declared price, both author-set. *Scope: a cost "
                    "the earlier stage left out.*",
        "heatRecovery": f"Feed heater + effluent cooler on assumed U ({f(item(A, 'FeedPreheater')['values']['A'], 0)} "
                        f"+ {f(item(A, 'EffluentCooler')['values']['A'], 0)} m²) → one FEHE designed by Kern "
                        f"({f(item(C, 'FEHE')['values']['A'], 0)} m², U {f(item(C, 'FEHE')['values']['U'], 0)} "
                        "W/m²/K). *Heat recovery built.*",
        "interbed": "New equipment: the beds need their heat removed between them. *Reactor model.*",
        "otherHX": "Assumed U → Kern design (e.g. the aftercooler's U "
                   f"{f(item(A, 'Aftercooler')['values']['U'], 0)} → {f(item(C, 'Aftercooler')['values']['U'], 0)} "
                   "W/m²/K); the chiller's duty grows with the recycle. *Exchanger model.*",
        "drums": f"The separator is sized on its gas flow, which the larger recycle raises "
                 f"({f(item(A, 'Separator')['values']['V_R'])} → {f(item(C, 'Separator')['values']['V_R'])} m³). "
                 "*Reactor model, through the recycle.*",
        "storage": "Sized on the product flow: no material difference.",
        "reliefValves": "Sized here (API 520) and NOT costed by rule (DEV.md 4c C62); none at "
                        "feasibility. No cost difference — a scope difference.",
    }
    for k, label in GROUPS:
        a, c = gA[k], gC[k]
        cell = lambda g: ("—" if g["n"] == 0 else
                          ("not costed" if g["uncosted"] == g["n"] else f(M(g["CBM"]))))
        dc = "—" if a["CBM"] == 0.0 and c["CBM"] == 0.0 else dlt(M(a["CBM"]), M(c["CBM"]))
        w(f"| {label} | {cell(a)} | {cell(c)} | {dc} | {why_g[k]} |")
    w(f"| **ΣC_BM** | {f(M(sum(g['CBM'] for g in gA.values())))} | "
      f"{f(M(sum(g['CBM'] for g in gC.values())))} | "
      f"{dlt(M(sum(g['CBM'] for g in gA.values())), M(sum(g['CBM'] for g in gC.values())))} | |")
    w("")
    w("| appraisal | feasibility | basic design | difference | why |")
    w("|---|---|---|---|---|")
    w(f"| FCI, M EUR | {f(M(ecA['FCI']))} | {f(M(ecC['FCI']))} | {dlt(M(ecA['FCI']), M(ecC['FCI']))} | "
      "The equipment above, through the same Turton rule. |")
    w(f"| working capital, M EUR | {f(M(ecA['WC']))} | {f(M(ecC['WC']))} | {dlt(M(ecA['WC']), M(ecC['WC']))} | "
      "Built up from the same days: the product stock is valued at the cost of manufacture and the "
      "minimum cash is 15 days of it, so both fall with COM_d. |")
    w(f"| TCI, M EUR | {f(M(ecA['TCI']))} | {f(M(ecC['TCI']))} | {dlt(M(ecA['TCI']), M(ecC['TCI']))} | FCI + WC. |")
    w(f"| revenue R, M EUR/yr | {f(M(ecA['revenue']))} | {f(M(ecC['revenue']))} | "
      f"{dlt(M(ecA['revenue']), M(ecC['revenue']))} | The production above, at the same price. |")
    w(f"| raw materials C_RM, M EUR/yr | {f(M(kA['C_RM']))} | {f(M(kC['C_RM']))} | "
      f"{dlt(M(kA['C_RM']), M(kC['C_RM']))} | The same declared make-up at the same prices. |")
    w(f"| utilities C_UT (net of the steam credit), M EUR/yr | {f(M(kA['C_UT']))} | {f(M(kC['C_UT']))} | "
      f"{dlt(M(kA['C_UT']), M(kC['C_UT']))} | Almost all of it the molten salt no longer bought; the "
      "split by service is in the decomposition below. |")
    w(f"| operating labour C_OL, M EUR/yr | {f(M(xA['C_OL']), 3)} | {f(M(xC['C_OL']), 3)} | "
      f"{dlt(M(xA['C_OL']), M(xC['C_OL']), 3)} | Turton's operator count from a DECLARED equipment "
      "count `N_np`: 12 (4 compressors, 7 exchangers, 1 reactor) → 15 (4, 8, 3 beds). The three beds "
      "share one shell; counting them as three is the author's choice. |")
    w(f"| COM_d, M EUR/yr | {f(M(ecA['COM_d']))} | {f(M(ecC['COM_d']))} | "
      f"{dlt(M(ecA['COM_d']), M(ecC['COM_d']))} | 0.180 FCI + 2.73 C_OL + 1.23 (C_RM + C_UT): the "
      "utilities fall, the capital-driven term rises. |")
    w(f"| R − C_RM − C_UT, M EUR/yr | {f(M(kA['grossMargin_RM_UT']))} | {f(M(kC['grossMargin_RM_UT']))} | "
      f"{dlt(M(kA['grossMargin_RM_UT']), M(kC['grossMargin_RM_UT']))} | An upper bound in both (the "
      "unpriced −35 °C duty). |")
    tlA = (f"{tA['constructionPeriod']} yr, all capital at start-up; full production from year 1")
    tlC = (f"{tC['constructionPeriod']} yr, capital ( {' '.join(f'{v:g}' for v in tC['capitalSchedule'])} ); "
           f"ramp-up ( {' '.join(f'{v:g}' for v in tC['rampUp'])} ); start-up cost "
           f"{tC['startupCostFraction']:g} × FCI")
    w(f"| construction and start-up | {tlA} | {tlC} | — | **A changed ASSUMPTION** (author-set, "
      "DEV.md 4c C63), not a consequence of any model; its effect is measured below. |")
    w(f"| discount rate, tax, life | {ecA['discountRate']:g}, {ecA['taxRate']:g}, {ecA['projectLife']:g} yr | "
      f"{ecC['discountRate']:g}, {ecC['taxRate']:g}, {ecC['projectLife']:g} yr | — | The same; the script "
      "fails if any appraisal input it does not trace differs. |")
    w(f"| NPV at 10 %, M EUR | {f(M(npvA))} | {f(M(npvC))} | {dlt(M(npvA), M(npvC))} | Decomposed below. |")
    irr = lambda e: "not defined (NPV(i) has no sign change)" if e["IRR"] is None else f"{e['IRR'] * 100:.2f} %"
    pb = lambda e: "never within the project life" if e["discountedPayback"] is None else f"{e['discountedPayback']:.2f} yr"
    w(f"| IRR | {irr(ecA)} | {irr(ecC)} | — | The plant loses money in every operating year at these "
      "prices, in both. |")
    w(f"| discounted payback | {pb(ecA)} | {pb(ecC)} | — | As IRR. |")
    w(f"| estimate class (declared) | {ecA['estimateClass']} ({ecA['accLo']:g} / +{ecA['accHi']:g} %) | "
      f"{ecC['estimateClass']} ({ecC['accLo']:g} / +{ecC['accHi']:g} %) | — | The author's statement "
      "of the project's definition. A design stage is not an AACE class: the cost method is Turton's "
      "equipment-factored estimate at both stages. |")
    w("")

    # ---- NPV decomposition -------------------------------------------------
    rows = []
    rows.append(("the appraisal's start-up years (construction "
                 f"{tA['constructionPeriod']} → {tC['constructionPeriod']} yr, ramp-up, start-up cost), "
                 "measured by re-running the feasibility case with them", npvB - npvA,
                 "**changed assumption**"))
    dR = coC["R"] * (xC["R"] - xA["R"])
    rows.append(("revenue: slightly less ammonia (the purge)", dR, "reactor model"))
    if abs(xC["C_RM"] - xA["C_RM"]) > 1e-6 * xA["C_RM"]:
        fail("C_RM differs between the stages; the comparison's prose assumes the same make-up")
    allU = sorted(set(uA) | set(uC))
    kind_u = {"hitecSalt": ("converter-feed heating no longer bought (molten salt)", "**heat recovery built**"),
              "coolingWater": ("cooling water (the effluent cooler gone into the FEHE)", "**heat recovery built**"),
              "refrigerationNH3": ("refrigeration (more recycle through the chiller)", "reactor model"),
              "steamGenerationHP": ("HP steam credit (less steam raised)", "reactor model"),
              "electricity": ("electricity (recycle compressor re-tuned for the Ergun drop)", "pressure-drop model"),
              "steamLP": ("LP steam (drum heating)", "reactor model (flows)")}
    for k in allU:
        if k not in kind_u:
            fail(f"utility {k} has no traced reason in this comparison")
        d_eur = (U(uC, k, 0) * H_C - U(uA, k, 0) * H_A)
        rows.append((kind_u[k][0], coC["var"] * d_eur, kind_u[k][1]))
    if abs(sum(U(uC, k, 0) * H_C - U(uA, k, 0) * H_A for k in allU) - (xC["C_UT"] - xA["C_UT"])) > 1e-6 * abs(xA["C_UT"]):
        fail("the per-utility C_UT split does not reproduce the engine's C_UT")
    rows.append(("operating labour (N_np 12 → 15, a declared count)", coC["C_OL"] * (xC["C_OL"] - xA["C_OL"]),
                 "count"))
    kind_g = {"compressors": "pressure-drop model", "converter": "reactor model + one shell",
              "catalyst": "**scope** (not costed before)", "heatRecovery": "**heat recovery built**",
              "interbed": "reactor model", "otherHX": "exchanger model", "drums": "reactor model",
              "storage": "reactor model (production)", "reliefValves": "—"}
    for k, label in GROUPS:
        dF = gC[k]["FCI"] - gA[k]["FCI"]
        if dF == 0.0:
            continue
        rows.append((f"capital: {label}", coC["FCI"] * dF, kind_g[k]))
    rows.append(("working capital (follows COM_d)", coC["WC"] * (xC["WC"] - xA["WC"]), "follows the above"))
    total = sum(r[1] for r in rows)
    close(npvA + total, npvC, "the NPV decomposition does not sum to the basic design's NPV")

    w("### Where the NPV moved")
    w("")
    w(f"From {f(M(npvA))} to {f(M(npvC))} M EUR. The first step re-runs the feasibility case with the "
      "basic design's start-up years — a changed ASSUMPTION, measured by the engine. The remaining "
      "steps are the plant's differences at the basic design's timeline: the engine's cash-flow rule "
      "is linear in each of them, so they split exactly (this script reproduces the engine's NPV of "
      "all three runs before it prints a single row).")
    w("")
    w("| step | NPV effect, M EUR | kind of change |")
    w("|---|---|---|")
    w(f"| feasibility, as published | {f(M(npvA))} | |")
    for lab, v, kind in rows:
        w(f"| {lab} | {dlt(0.0, M(v))} | {kind} |")
    w(f"| **basic design, as published** | **{f(M(npvC))}** | |")
    w("")
    bykind = {}
    for lab, v, kind in rows:
        key = kind.replace("*", "")
        key = ("model fidelity" if any(s in key for s in ("model", "one shell")) else key)
        bykind[key] = bykind.get(key, 0.0) + v
    order = ["heat recovery built", "model fidelity", "scope (not costed before)", "changed assumption",
             "count", "follows the above"]
    w("| by kind | NPV effect, M EUR |")
    w("|---|---|")
    for k in order:
        if k in bykind:
            w(f"| {k} | {dlt(0.0, M(bykind[k]))} |")
    leftover = set(bykind) - set(order) - {"—"}
    if leftover:
        fail(f"kinds without a summary row: {sorted(leftover)}")
    w("")
    #  The prose around the tables makes claims about these numbers; hold it to them.
    hr, mf, sc = bykind["heat recovery built"], bykind["model fidelity"], bykind["scope (not costed before)"]
    if not (hr > npvC - npvA > 0 and mf < 0 and sc < 0 and mf + sc < 0):
        fail("the prose says the heat recovery built exceeds the whole NPV difference and the model "
             "refinements and the catalyst's scope move it the other way; the numbers no longer say so")
    w(f"**So:** building the heat recovery the feasibility flowsheet left out is worth {dlt(0.0, M(hr))} "
      f"M EUR — more than the whole difference. The model refinements together are worth "
      f"{dlt(0.0, M(mf))} M EUR (the converter shell around a catalyst volume "
      f"{f(vcat / vA['V_R'], 1)} times the space-velocity rule's, the interbed coolers, less steam, "
      f"more refrigeration), costing the catalyst the feasibility left out {dlt(0.0, M(sc))}, and the "
      f"start-up years {dlt(0.0, M(bykind['changed assumption']))}. A student who reads the "
      f"{dlt(M(npvA), M(npvC))} M EUR as \"the better model found money\" has it backwards: at "
      "feasibility the same exchanger was already visible in the pinch target, and the better "
      "models made the plant dearer.")
    w("")
    w("**The start-up years are worth a different amount on each plant, and that is not a rounding "
      f"matter.** On the feasibility plant (engine run) they move the NPV by {dlt(M(npvA), M(npvB))} "
      f"M EUR; on the basic-design plant by {dlt(M(npvD), M(npvC))} M EUR (this one computed with this "
      "script's transcription of the cash-flow rule, which reproduced the engine's three NPVs — not "
      "an engine run). Two parts of the timeline scale with the plant and pull opposite ways: both "
      "plants lose money in every operating year at these prices, so the ramp-up (producing "
      f"{' % and '.join(f'{v * 100:g}' for v in tC['rampUp'])} % in the first years) loses LESS, and "
      "gains more on the plant that loses more per year — the feasibility one; while the capital "
      "compounded over the construction years and the start-up cost weigh more on the plant with the "
      "larger FCI — the basic design. Taken in that other order — the plant first, at the "
      f"feasibility's one-year timeline — the plant differences are worth {dlt(M(npvA), M(npvD))} "
      f"M EUR instead of {dlt(M(npvB), M(npvC))}.")
    w("")
    npsv = sum(1 for q in C["equipment"] if q["type"] == "reliefValve")
    w("**Not comparable, and said rather than adjusted:** the catalyst charge is costed only at the "
      f"basic design; the {npsv} relief valves exist only at the basic design and are costed at "
      "neither; the interbed coolers' shells are counted twice at the basic design; the FEHE is costed "
      f"at its designed {f(item(C, 'FEHE')['values']['A'], 0)} m² while the flowsheet converges on a "
      f"declared {f(item(C, 'FEHE')['values']['A_rated'], 0)} m²; and the start-up years were declared "
      "only for the basic design.")
    w(END)
    return "\n".join(out) + "\n"


def main():
    check = "--check" in sys.argv
    A_dir, C_dir = PLANT / FEAS, PLANT / BASIC

    # ---- what may differ between the two appraisals --------------------
    pA, pC = (A_dir / "system" / "postDict").read_text(), (C_dir / "system" / "postDict").read_text()
    eA, eC = scalars(block(pA, "economics")), scalars(block(pC, "economics"))
    for k in sorted(set(eA) | set(eC)):
        if eA.get(k) != eC.get(k) and k not in TRACED_TIMELINE + TRACED_COUNT:
            fail(f"the appraisal input `{k}` differs ({eA.get(k)} / {eC.get(k)}) and this "
                 "comparison does not trace it")
    if norm(A_dir / "constant" / "economics") != norm(C_dir / "constant" / "economics"):
        fail("constant/economics (prices, labour rate) differs between the stages")
    for u in sorted((A_dir / "constant" / "utilities").glob("*.dat")):
        v = C_dir / "constant" / "utilities" / u.name
        if not v.exists() or norm(u) != norm(v):
            fail(f"utility record {u.name} differs between the stages")
    if " ".join((block(pA, "costing") or "").split()) != " ".join((block(pC, "costing") or "").split()):
        fail("the costing block differs between the stages")
    sfA, sfC = float(eA["streamFactor"]), float(eC["streamFactor"])
    salA, salC = float(eA.get("salvageFraction", 0)), float(eC.get("salvageFraction", 0))

    cache = Path(sys.argv[sys.argv.index("--cache") + 1]) if "--cache" in sys.argv else None
    if cache and not check and all((cache / f"{n}.json").exists() for n in "ABC"):
        A, B, C = (json.loads((cache / f"{n}.json").read_text()) for n in "ABC")
    else:
        with tempfile.TemporaryDirectory(prefix="ammoniaStages.") as tmp:
            work = Path(tmp)
            A = run_case(A_dir, work / "A")
            C = run_case(C_dir, work / "C")
            B = run_case(A_dir, work / "B", edit=with_timeline(timeline_of(C)))
        if cache:
            cache.mkdir(parents=True, exist_ok=True)
            for n, d in zip("ABC", (A, B, C)):
                (cache / f"{n}.json").write_text(json.dumps(d))

    section = build(A, B, C, sfA, sfC, salA, salC)
    text = README.read_text()
    i, j = text.find(BEGIN), text.find(END)
    if i < 0 or j < i:
        fail(f"{README.relative_to(ROOT)} carries no generated section between the markers")
    current = text[i:j + len(END)] + "\n"
    summary = (f"NPV {A['economics']['NPV'] / 1e6:.2f} -> {C['economics']['NPV'] / 1e6:.2f} M EUR, "
               "decomposed and reproduced from three engine runs")
    if current == section:
        print(f"gen_ammonia_stage_comparison: OK -- the feasibility -> basic-design section of "
              f"{README.relative_to(ROOT)} matches the engine ({summary}); the prose's "
              "stated directions are held to the runs, NOT whether each 'why' sentence is true of the "
              "physics")
        return 0
    if check:
        import difflib
        print(f"gen_ammonia_stage_comparison: FAILED -- {README.relative_to(ROOT)} no longer matches "
              "the engine (run bin/curate/gen_ammonia_stage_comparison.py, then commit):")
        sys.stdout.writelines(difflib.unified_diff(current.splitlines(True), section.splitlines(True),
                                                   "committed", "engine", n=0))
        return 1
    README.write_text(text[:i] + section.rstrip("\n") + text[j + len(END):])
    print(f"gen_ammonia_stage_comparison: wrote {README.relative_to(ROOT)} ({summary})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
