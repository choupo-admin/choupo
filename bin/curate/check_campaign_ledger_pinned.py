#!/usr/bin/env python3
"""Gate: the two BATCH CAMPAIGN LEDGERS are pinned, in both directions.

    bin/curate/check_campaign_ledger_pinned.py

WHY THIS EXISTS.  Found 2026-09-20, by the 2026-08-12 question asked once
more: which blocks of the result JSON can a golden row actually read?

`choupoBatch` publishes two structured, time-stamped ledgers that nothing
else in this engine produces -- `transfers` (the MATERIAL ledger: one record
per material edge, with the per-component `dn`, the transported `H_kJ` and
its validity) and `energyLedger` (one record per SEGMENT of constant physics
on one vessel, with `E_kJ`, its validity, the basis and the service
temperature).  Both are emitted as top-level ARRAYS of objects, which is
neither the `"<name>": {}` shape nor an `operationResults[].diagnostics`
object, so no golden row kind could reach either.  `ledger` (bin/runTests)
is the kind that now can, and this gate is what keeps it honest.

WHAT WAS ALREADY COVERED, measured before anything was built -- because a
gate justified by a defect that does not exist is worse than none:

  * the campaign COUNTS were pinned corpus-wide (`transfers_logged`,
    `transfers_H_valid`/`_invalid`, `energy_records_valid`/`_invalid`), so a
    record silently appearing or going unpriceable was already visible IN
    TOTAL -- never per vessel, per edge or per kind;
  * the ENERGY ledger's per-(unit, kind) total is MIRRORED by choupoBatch
    into `kpis[<unit>]["E_<kind>_total_kJ"]`, and all 41 valid groups in the
    corpus already carried that `kpi` row in their golden.  So the brief this
    gate was written from ("nothing pins either") was measurably wrong for
    the energy ledger's NUMBERS, and that is why no `ledger` row duplicates
    them: a second home for one number in one file is the arity sin in a
    golden.

  What had NO home anywhere was the whole MATERIAL ledger below the campaign
  totals -- `dn` per component on each edge, the transported `H_kJ`, and
  which group is priceable at all.  On `still06_ledger_mixed_validity`, the
  witness built for exactly this, five transfers moved benzene, toluene and
  compA between four vessels and not one of those numbers was read by
  anything.

WHAT THIS CHECKS, per candidate case:
  (a) MATERIAL, PUBLISHED IS PINNED: every (edge, kind) group the run
      publishes has a `ledger` row for each component of its `dn` union, for
      `H_kJ` when at least one of its records is priceable, and for `valid`.
  (b) ENERGY, PUBLISHED IS PINNED: every (unit, kind) group has a `ledger`
      row for `valid`; and every group with at least one priceable record
      has the `kpi <unit> E_<kind>_total_kJ` row that is that number's ONE
      home.
  (c) PINNED IS PUBLISHED: every `ledger` row names a group and field the
      run still publishes -- a row matching nothing reads as coverage it
      does not give.
  (d) THE ENERGY BLOCK REPRODUCES THE PINNED TOTAL: summed over each group's
      priceable records, the BLOCK's own `E_kJ` equals the `E_<kind>_total_kJ`
      the same run publishes as a KPI, to 1e-9 relative.  This is what makes
      the block's numbers falsifiable without a duplicate row: the golden
      pins the KPI, and this arm pins the block TO the KPI.
  (e) THE MATERIAL BLOCK REPRODUCES THE PINNED CAMPAIGN TOTAL: summed over
      the `external` records alone, the block's `dn` equals
      `campaign.moles_kmol_external_out`, to 1e-9 relative.  `externalIntake`
      is deliberately NOT summed -- the engine's own `externalOut`
      accumulator excludes it, and the two diafilter cases are where that
      difference is visible (3.03 against 6.06 kmol on diafilter01).

CANDIDATES.  Every case whose `controlDict` declares `application
choupoBatch` -- the two ledgers are filled nowhere else in the engine, which
was checked by grep and not remembered (`choupoCtrl`'s main.cpp names neither,
so the `tutorials/ctrl` half of the brief this was written from is not a
subject at all) -- plus any case whose golden already carries `ledger` rows,
so arm (c) cannot be escaped by a row that stops matching, MINUS the cases
carrying a declared opt-out marker.  A candidate that publishes no ledger at
all is FINE and passes silently -- an adsorber that never discharges, a
reactor with no ledgered segment -- and the silence means "nothing was
published", never "the check did not run".  How many are in that state is on
the CLAIM LINE, recounted every run, and deliberately not written here.

TWO DEFENSIVE BRANCHES ARE UNREACHABLE TODAY and are named rather than
implied: a case that publishes a ledger and ships no `expected` (all 36 ship
one), and a case that publishes a material ledger whose golden does not pin
`campaign.moles_kmol_external_out` (all 25 pin it).  They are kept because
both would be silent losses of coverage, and they were fired BY HAND against
a doctored cache rather than left unexercised -- see the sabotage table.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER A LEDGER NUMBER IS RIGHT.  A wrong `dn` pins as happily as a
    right one.  This gate is about the two blocks being falsifiable.
  * THE TIME DISTRIBUTION.  A `ledger` row is the (subject, kind)
    AGGREGATE over the campaign, so a REDISTRIBUTION of the same total
    across instants -- cycle 1's amount moving into cycle 2 on
    `batch23_tsa_cycles` -- leaves every row unchanged.  That was a
    deliberate choice and the measurement behind it is in `get_ledger`
    (bin/runTests): keying on a record's own `tStart` is not a key, because
    three corpus cases log TWO `feedAmendment` records on one edge at one
    instant.  It is a real gap and the campaign TIMELINE this data will be
    drawn into is where it will be felt first.
  * `basis`, `T_service_K`, `tStart`/`tEnd` and the `H_missing`/`E_missing`
    reason lists.  None has a row kind that reads it.  `T_service_K` is
    caught INDIRECTLY where a case allocates utilities (the chosen utility's
    name is part of a `utility` row's key), and nowhere else.
  * ANY LEDGER OUTSIDE choupoBatch.  There is none today; the discovery
    would not see one.

SABOTAGES, all performed BY HAND and restored byte-identical (sha256 compared
before and after; the cache ones doctor a COPY of the suite's case-output
cache and touch no tracked file).  Predicted / happened:

  S1  delete a `ledger ... material.discrete.dn.benzene` row
        -> arm (a) FAILS naming the edge and the component        as predicted
  S2  delete a `ledger ... material.discrete.valid` row
        -> arm (a) FAILS                                          as predicted
  S3  delete a `ledger potA energy.reboiler.valid` row
        -> arm (b) FAILS                                          as predicted
  S4  delete the `kpi potA E_reboiler_total_kJ` row
        -> arm (b) FAILS naming that KPI as the number's ONE home  as predicted
  S5  add `ledger ghost->ghost material.discrete.dn.X`
        -> arm (c) FAILS ("a row that matches nothing")            as predicted
  S6  add `ledger potA energy.reboiler.E_kJ` (the DUPLICATE home)
        -> the arity branch FAILS naming the kpi row instead       as predicted
  S7  doctor the CACHED `energyLedger` E_kJ to -400
        -> arm (d) FAILS quoting block -400 vs KPI -413.617021183  as predicted
  S8  doctor a CACHED `external` transfer's `dn.CO2`
        -> arm (e) FAILS quoting 0.08625 vs the campaign 0.08476   as predicted
  S9  move a ledger-publishing case's `expected` aside
        -> the no-golden branch FAILS (otherwise unreachable:
           all 36 publishing cases ship one)                       as predicted
  S10 change a validity WORD in a golden (`partial` -> `valid`).
        This one tests bin/runTests, not this gate, and it is the
        2026-09-05 lesson re-fired: a word-valued row must not fall
        through to the numeric comparison.
        -> the CASE fails: "got 'partial' expected 'valid'"         as predicted
  S11 remove `ledger` from the `--record-append` kind allowlist,
      delete the golden's ledger rows, re-append
        -> the rows do NOT come back and the tool reports
           "refreshed" with an unchanged file, in SILENCE.  Its
           positive half (allowlist intact) appends all 22 back.
           This is the 2026-09-04 verdict-row trap, reproduced      as predicted
  S12 make one record of the `transfers` block unreadable JSON
        -> the unreadable-block branch FAILS.
           **FIRST ATTEMPT PROVED NOTHING and is recorded as such:**
           the string edited (`"from": "bed", "to": ...`) occurs
           TWICE in the run output and its first occurrence is in
           the `recipeLog` block, which this gate does not parse --
           so the gate passed, correctly, over an intact subject.
           *A sabotage has to land inside the block under test*, and
           a whole-output string match does not guarantee that.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from suite_cache import SCOPED, scope_sentence, stdout_of   # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_OF_SCOPE = object()
REL = 1.0e-9


#  A DECLARED OPT-OUT IS NOT A SUBJECT.  `.expect-nonconvergence` and
#  `.known-broken` are this suite's two honest ways of saying a case does not
#  produce an answer, and all three of the corpus's non-zero-exit batch cases
#  carry the first (batch12_adsorber_refused_P is a REFUSAL by design; the two
#  ignition cases blow up as a lesson).  Running them here would make the gate
#  report "the case exits 2" as a defect of the ledgers, which it is not -- and
#  `--record` skips them by the same two names for the same reason.  They are
#  COUNTED and named in the claim, never dropped in silence.
MARKERS = (".expect-nonconvergence", ".known-broken")


def candidates():
    """({case: why}, [opted-out case]) -- every choupoBatch case, plus any case
    already pinning `ledger` rows, minus the declared opt-outs."""
    found, optout = {}, []
    for cd in sorted(ROOT.glob("tutorials/**/system/controlDict")):
        text = cd.read_text(errors="replace")
        m = re.search(r'^\s*application\s+(\w+)\s*;', text, re.M)
        if m and m.group(1) == "choupoBatch":
            found[cd.parent.parent] = "declares application choupoBatch"
    for exp in sorted(ROOT.glob("tutorials/**/expected")):
        for line in exp.read_text(errors="replace").splitlines():
            if line.split()[:1] == ["ledger"]:
                found.setdefault(exp.parent, "already carries ledger rows")
                break
    for case in list(found):
        if any((case / m).is_file() for m in MARKERS):
            del found[case]
            optout.append(case)
    return found, optout


def records(txt, block):
    """The objects of a top-level one-object-per-line array, or []."""
    m = re.search(r'^  "%s": \[\n(.*?)\n  \]' % block, txt, re.S | re.M)
    if not m:
        return []
    out = []
    for line in m.group(1).splitlines():
        line = line.strip().rstrip(",")
        try:
            out.append(json.loads(line))
        except ValueError:
            return None            # an unreadable block is a finding, not []
    return out


def kpis_of(txt, unit):
    """{key: float} of one unit's KPI object.

    SEARCHED INSIDE THE `kpis` SECTION ONLY, not over the whole output.
    `"streams": {` is emitted BEFORE `"kpis": {`, a unit and a stream MAY
    share a name (identity is (kind, sector, name), never name alone --
    2026-09-06), and a whole-output search would then read the stream's
    object and report the unit's total as absent.  `bin/runTests`'
    `auto_generate` slices the same section for the same reason.
    """
    sec = re.search(r'^  "kpis": \{$(.*?)^  \},?$', txt, re.S | re.M)
    if not sec:
        return {}
    m = re.search(r'^\s*"%s": \{(.*)$' % re.escape(unit), sec.group(1), re.M)
    if not m:
        return {}
    return {k: float(v) for k, v in
            re.findall(r'"(\w+)":\s*(-?[0-9][0-9.eE+-]*)', m.group(1))}


def norm(s):
    return re.sub(r"[ \t]+", "_", s)


def run_output(case: Path):
    txt = stdout_of(case)
    if txt is None and SCOPED:
        return OUT_OF_SCOPE, None
    if txt is None:
        proc = subprocess.run([str(ROOT / "choupoBatch"), str(case)],
                              capture_output=True, text=True)
        if proc.returncode != 0:
            return None, f"the case exits {proc.returncode}"
        txt = proc.stdout
    return txt, None


def published(txt):
    """(material, energy) group maps, or None when a block is unreadable.

    material: {(edge, kind): {"comps": {c: sum}, "nvalid": n, "nrec": n}}
    energy:   {(unit, kind): {"E": sum over valid, "nvalid": n, "nrec": n}}
    """
    tr = records(txt, "transfers")
    en = records(txt, "energyLedger")
    if tr is None or en is None:
        return None
    mat, eng = {}, {}
    for r in tr:
        try:
            g = mat.setdefault((norm(r["from"]) + "->" + norm(r["to"]),
                                r["kind"]),
                               {"comps": {}, "nvalid": 0, "nrec": 0,
                                "H": 0.0})
            for c, v in r["dn"].items():
                g["comps"][c] = g["comps"].get(c, 0.0) + v
            g["nrec"] += 1
            if "H_kJ" in r:
                g["nvalid"] += 1
                g["H"] += r["H_kJ"]
        except (KeyError, TypeError):
            return None
    for r in en:
        try:
            g = eng.setdefault((norm(r["unit"]), r["kind"]),
                               {"E": 0.0, "nvalid": 0, "nrec": 0})
            g["nrec"] += 1
            if "E_kJ" in r:
                g["nvalid"] += 1
                g["E"] += r["E_kJ"]
        except (KeyError, TypeError):
            return None
    return mat, eng


def word(g):
    if g["nvalid"] == g["nrec"]:
        return "valid"
    return "invalid" if g["nvalid"] == 0 else "partial"


def golden(case: Path):
    """({(kind,name,key)}, {(name,key): value}) from the `expected` file, or
    (None, None) when the case ships none."""
    exp = case / "expected"
    if not exp.is_file():
        return None, None
    rows, kpi = set(), {}
    for line in exp.read_text(errors="replace").splitlines():
        p = line.split()
        if len(p) < 4 or p[0].startswith("#"):
            continue
        rows.add((p[0], p[1], p[2]))
        if p[0] == "kpi":
            kpi[(p[1], p[2])] = p[3]
    return rows, kpi


def close(a, b):
    scale = max(abs(a), abs(b))
    return abs(a - b) <= (REL * scale if scale > 1e-12 else 1e-12)


def main() -> int:
    cases, optout = candidates()
    if not cases:
        print("check_campaign_ledger_pinned: FAILED\n"
              "  no candidate case was found.  A gate with no subject reports"
              " PASS forever -- fix the discovery, do not retire the check.")
        return 1

    problems, npins, nsilent, nskipped, ngroups = [], 0, 0, 0, 0
    for case in sorted(cases):
        rel = case.relative_to(ROOT).as_posix()
        txt, err = run_output(case)
        if txt is OUT_OF_SCOPE:
            nskipped += 1
            continue
        if txt is None:
            problems.append(f"{rel}: {err}")
            continue
        pub = published(txt)
        if pub is None:
            problems.append(
                f"{rel}: a campaign ledger block could not be read record by"
                " record.  An UNREADABLE block does not fail a golden -- it"
                " simply stops being checked -- so it is a failure HERE.")
            continue
        mat, eng = pub
        rows, kpi = golden(case)
        if rows is None:
            if not mat and not eng:
                nsilent += 1
                continue
            problems.append(
                f"{rel}: publishes a campaign ledger and ships no `expected`."
                "  Remedy: bin/runTests --record " + rel)
            continue
        if not mat and not eng:
            nsilent += 1

        want = set()
        #  (a) MATERIAL, published implies pinned.
        for (edge, kind), g in sorted(mat.items()):
            ngroups += 1
            for c in sorted(g["comps"]):
                want.add(("ledger", edge, f"material.{kind}.dn.{c}"))
            if g["nvalid"]:
                want.add(("ledger", edge, f"material.{kind}.H_kJ"))
            want.add(("ledger", edge, f"material.{kind}.valid"))
        #  (b) ENERGY, published implies pinned -- the WORD here, the NUMBER
        #      through the kpi row that is its one home.
        for (unit, kind), g in sorted(eng.items()):
            ngroups += 1
            want.add(("ledger", unit, f"energy.{kind}.valid"))
            if g["nvalid"]:
                k = ("kpi", unit, f"E_{kind}_total_kJ")
                if k not in rows:
                    problems.append(
                        f"{rel}: publishes {g['nvalid']} priceable"
                        f" `{kind}` energy record(s) for unit '{unit}' and the"
                        f" golden carries no `kpi {unit} E_{kind}_total_kJ`"
                        " row -- that KPI is the ONE home of the block's own"
                        " total (no `ledger` row duplicates it), so with it"
                        " absent the number is pinned by nothing."
                        "  Remedy: bin/runTests --record-append " + rel)
                else:
                    npins += 1
        for t in sorted(want - rows):
            problems.append(
                f"{rel}: publishes {t[2]} for '{t[1]}' that NO `ledger` row"
                " pins -- the campaign ledger may drift by any amount with"
                " the suite still green."
                "  Remedy: bin/runTests --record-append " + rel)
        #  (c) pinned implies published.
        for t in sorted(r for r in rows if r[0] == "ledger"):
            #  `get_ledger` WILL resolve `energy.<kind>.E_kJ` -- a kind names
            #  WHERE a number is read from and nothing else, which is the
            #  separation this format has paid for twice.  The POLICY that
            #  it must not be pinned THERE is this gate's, so it gets its own
            #  sentence rather than the generic "matches nothing", which
            #  would be false: the run does publish it.
            if t[2].startswith("energy.") and t[2].endswith(".E_kJ"):
                problems.append(
                    f"{rel}: pins {t[2]} for '{t[1]}' as a `ledger` row."
                    "  That number's ONE home is `kpi " + t[1] + " E_"
                    + t[2].split(".")[1] + "_total_kJ`, which choupoBatch"
                    " mirrors from the same records; a second home for it in"
                    " one golden is the arity sin.  Remedy: delete this row"
                    " -- arm (d) already holds the block TO that KPI.")
                continue
            if t not in want:
                problems.append(
                    f"{rel}: pins {t[2]} for '{t[1]}', which the run does NOT"
                    " publish -- a row that matches nothing reads as coverage"
                    " it does not give.")
        npins += len(want & rows)

        #  (d) the ENERGY block reproduces the KPI the golden pins.
        for (unit, kind), g in sorted(eng.items()):
            if not g["nvalid"]:
                continue
            k = kpis_of(txt, unit).get(f"E_{kind}_total_kJ")
            if k is None:
                problems.append(
                    f"{rel}: the `energyLedger` block carries {g['nvalid']}"
                    f" priceable `{kind}` record(s) for '{unit}' and the run"
                    f" publishes no `E_{kind}_total_kJ` KPI for it -- the"
                    " block's total then has no pinnable home at all.")
            elif not close(g["E"], k):
                problems.append(
                    f"{rel}: the `energyLedger` block sums to {g['E']!r} kJ"
                    f" for ({unit}, {kind}) while the same run's"
                    f" `E_{kind}_total_kJ` KPI reads {k!r} -- the block the"
                    " GUI reads and the number the golden pins disagree.")
        #  (e) the MATERIAL block reproduces the campaign external total.
        if mat:
            ext = sum(v for (e, kind), g in mat.items() if kind == "external"
                      for v in g["comps"].values())
            nout = kpis_of(txt, "campaign").get("moles_kmol_external_out")
            if nout is None:
                problems.append(
                    f"{rel}: publishes a material ledger and no"
                    " `campaign.moles_kmol_external_out` KPI -- arm (e) has"
                    " nothing to reproduce the block against.")
            elif not close(ext, nout):
                problems.append(
                    f"{rel}: the `transfers` block's `external` records sum"
                    f" to {ext!r} kmol while the same run's"
                    f" `campaign.moles_kmol_external_out` reads {nout!r} --"
                    " the ledger and the campaign balance disagree about what"
                    " left the plant.")
            elif ("kpi", "campaign", "moles_kmol_external_out") not in rows:
                problems.append(
                    f"{rel}: publishes `campaign.moles_kmol_external_out` and"
                    " the golden does not pin it, so arm (e) reproduces the"
                    " block against a number nothing checks."
                    "  Remedy: bin/runTests --record-append " + rel)

    if problems:
        print("check_campaign_ledger_pinned: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    if SCOPED and nskipped == len(cases):
        print("check_campaign_ledger_pinned: FAILED\n"
              "  every one of the %d candidate case(s) is OUT OF SCOPE -- the"
              " caller ran none of them, so this gate checked nothing."
              % len(cases))
        return 1

    njudged = len(cases) - nskipped
    print("check_campaign_ledger_pinned: OK -- %d campaign-ledger quantit(ies)"
          " pinned across %d (subject, kind) group(s) in %d candidate"
          " choupoBatch case(s), in both directions (published implies pinned,"
          " pinned implies published); %d candidate(s) publish no ledger at"
          " all and pass silently.  The MATERIAL ledger's per-component `dn`,"
          " its transported `H_kJ` and both ledgers' validity WORD are pinned"
          " by `ledger` rows; the ENERGY ledger's per-(unit, kind) total is"
          " pinned by the `kpi E_<kind>_total_kJ` row that is its one home,"
          " and the block is required to REPRODUCE it (and the campaign's"
          " `moles_kmol_external_out`) within 1e-9.  NOT CHECKED: whether any"
          " ledger number is RIGHT; the TIME DISTRIBUTION (a row is the"
          " campaign aggregate, so moving an amount between instants moves no"
          " row); `basis`, `T_service_K`, `tStart`/`tEnd` and the"
          " `H_missing`/`E_missing` reason lists, which no row kind reads; and"
          " any ledger outside choupoBatch, of which there is none."
          "  NOT JUDGED: %d batch case(s) carrying a declared opt-out marker"
          " (%s) -- they produce no answer to pin."
          % (npins, ngroups, njudged, nsilent, len(optout),
             ", ".join(c.name for c in optout) or "none")
          + scope_sentence(njudged, nskipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
