#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_thermo_tables -- the species-table home (data/standards/thermoTables/)
is complete, is what the report prints, has ONE home per species, is read only
when a case DECLARES it, and never outranks a curated record.

    bin/curate/check_thermo_tables.py
    CHOUPO_ALLOW_NO_NASA_PDF=1 bin/curate/check_thermo_tables.py   # arm (b) SKIPPED

WHY THIS EXISTS.  858 gas species were written into
data/standards/thermoTables/NASA-TP-2002-211556/ by machine
(bin/curate/nasa_tp2002_to_choupo.py table); 894 since 2026-11-21 (C458:
the 34 radicals moved in from components/, and B and SiO2 joined when the
condensed-phase rule stopped compB and silica from blocking their gases).
Every record carries a role decided from its formula (`gasOnly` for a radical,
atom or listed biradical, `gasData` for a closed-shell molecule; retag --check).  A home of that size is outside
every golden: a record edited by hand, a species silently added to or dropped
from the folder, a duplicate of a curated component, or an engine that starts
reading the home without being asked would each leave the suite green, because
a golden pins what a run PRINTS and no case but one reads the home.

ARMS.
  (a) INDEX: every <name>.dat of the home is listed under `## written` in
      INDEX.md and every listed name has its file.
  (b) TRANSCRIPTION: each record's dHf_298, s_298, Tlow/Tcommon/Thigh and
      NASA9 low/high lines equal what the tool's own checked()+block()
      produce for the record's `nasaEntry` from the report (the tool's
      functions are IMPORTED, not reimplemented).  The report is a public-
      domain PDF fetched into thirdParty/; ABSENT, this arm FAILS naming the
      fetch command (a check that cannot run must not pass) -- unless
      CHOUPO_ALLOW_NO_NASA_PDF=1, which reports it SKIPPED in the claim line.
  (c) ONE HOME: no record's name or formula is also a components/ record's,
      except the tool's own isomer rule (cmd_table): the table record's
      nasaEntry carries an isomer label (a comma) and every components/
      record of that formula is itself NASA-sourced under a different entry;
      and a components/ record that is a condensed phase or a synthetic
      stand-in is not a home for a GAS species of its formula (the tool's
      not_a_gas_home, imported: graphite does not hold atomic carbon C(g),
      C458).  A name collision has no exemption.  Since C458 (2026-11-21)
      the 34 radicals that sat in components/ live here: a radical is not a
      component.
  (d) DECLARED ONLY (behaviour): the witness
      tutorials/props/gibbs/thermoTable01_propane_radicals runs (temp copy,
      CHOUPO_HOME=repo) with `[thermoTable]` announced and exit 0; with the
      `speciesTables` line removed it must FAIL naming C3H7_npropyl (the
      first of its four table species, all radicals since C458); with
      `speciesTables ( NoSuchTable );` it must FAIL naming NoSuchTable.
  (e) A CURATED RECORD WINS (source): Database.cpp consults speciesTables()
      only under a guard `!fs::exists(standard)` (and only when not sealed).

WHAT IT DOES NOT CHECK.  That the NASA report is right (its own H and S
self-consistency is checked()'s, held here by arm b); that a record was read
back against the page by a curator (the records say they were not); the
engine's resolution of any species other than the witness's; arm (e) is a
source-text arm, the behaviour of a curated-vs-table collision cannot be built
(arm c forbids the collision).  Arm (d) needs a built build/linux64Gcc/
choupoProps and FAILS without one.

SABOTAGES (by hand, restored).
  S1 one `- <name>` line deleted from INDEX.md           -> (a) FAILED.
  S2 one digit of one coefficient changed in a record    -> (b) FAILED.
  S3 the guard text `!fs::exists(standard)` removed from the source text
     handed to arm (e) (function called on the edited string) -> (e) FAILED.
"""
import os
import re
import shutil
import subprocess
import sys
import case_records
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
LABEL = "check_thermo_tables"
HOME = ROOT / "data" / "standards" / "thermoTables" / "NASA-TP-2002-211556"
COMP = ROOT / "data" / "standards" / "components"
BIN = ROOT / "build" / "linux64Gcc" / "choupoProps"
WITNESS = ROOT / "tutorials" / "props" / "gibbs" / "thermoTable01_propane_radicals"
PDF = ROOT / "thirdParty" / "nasa-tp2002" / "NASA-TP-2002-211556.pdf"
FETCH = "python3 bin/curate/nasa_tp2002_to_choupo.py --fetch verify"
ENTRY_RE = re.compile(r'(?m)^nasaEntry\s+"([^"]+)"\s*;')
FORMULA_RE = re.compile(r'(?m)^formula\s+([A-Za-z0-9]+)\s*;')
NAME_RE = re.compile(r'(?m)^name\s+(\S+?)\s*;')
T_ENTRY = re.compile(r'appendix D, pp?\. [\d-]+, entry (\S+?)(?:,\s|\s|;)')

fails = []
#  the importer's own rule for "a condensed or synthetic record of the same
#  formula is not a second home for a gas species" (C458): imported, not copied.
from nasa_tp2002_to_choupo import not_a_gas_home as T_not_a_gas_home


def read(p):
    return Path(p).read_text(errors="replace")


def norm(s):
    return " ".join(s.split())


def arm_a():
    idx = read(HOME / "INDEX.md")
    sec = idx.split("## written", 1)[1].split("## left out", 1)[0]
    listed = set(re.findall(r'(?m)^- (\S+)\s*$', sec))
    files = {p.stem for p in HOME.glob("*.dat")}
    for n in sorted(files - listed):
        fails.append("(a) %s.dat is in the home but not listed under `## written`" % n)
    for n in sorted(listed - files):
        fails.append("(a) INDEX.md lists %s but %s.dat does not exist" % (n, n))
    return len(files)


def arm_b():
    if not PDF.is_file():
        if os.environ.get("CHOUPO_ALLOW_NO_NASA_PDF") == "1":
            return None
        fails.append("(b) %s is absent, so the transcription cannot be checked; "
                     "fetch it with `%s` (or set CHOUPO_ALLOW_NO_NASA_PDF=1 to "
                     "SKIP this arm, reported in the claim)"
                     % (PDF.relative_to(ROOT), FETCH))
        return None
    import nasa_tp2002_to_choupo as T
    lines = T.report_lines()
    ad, b1 = T.parse(lines)
    page = T.page_of(lines)
    n = 0
    for p in sorted(HOME.glob("*.dat")):
        t = read(p)
        m = ENTRY_RE.search(t)
        if not m:
            fails.append("(b) %s: no nasaEntry" % p.name)
            continue
        entry = m.group(1)
        try:
            c = T.checked(entry, ad, b1, page)
        except SystemExit as ex:
            fails.append("(b) %s: report check refused: %s" % (p.name, ex))
            continue
        if T._safe(entry) != p.stem:
            fails.append("(b) %s: name is not _safe(%s)" % (p.name, entry))
        L, _ = T.block(entry, c)
        flat = norm(t)
        wants = [L[2].split("//")[0], L[3].split("//")[0]]
        wants += [x for x in L if re.match(r'\s*(Tlow|Tcommon|Thigh|low|high|model)\s', x)]
        for w in wants:
            if norm(w) not in flat:
                fails.append("(b) %s: does not carry `%s`" % (p.name, norm(w)[:80]))
        n += 1
    return n


def comp_index():
    by_name, by_formula = {}, {}
    for p in COMP.glob("*.dat"):
        t = read(p)
        me = T_ENTRY.search(t) if "TP-2002-211556" in t else None
        ent = me.group(1) if me else None
        by_name[p.stem] = ent
        nm = NAME_RE.search(t)
        if nm:
            by_name[nm.group(1)] = ent
        f = FORMULA_RE.search(t)
        if f and not T_not_a_gas_home(t):
            by_formula.setdefault(f.group(1), []).append((p.stem, ent))
    return by_name, by_formula


def arm_c():
    by_name, by_formula = comp_index()
    n = 0
    for p in sorted(HOME.glob("*.dat")):
        t = read(p)
        nm = NAME_RE.search(t)
        name = nm.group(1) if nm else p.stem
        for k in {name, p.stem}:
            if k in by_name:
                fails.append("(c) %s: name %s is also a components/ record" % (p.name, k))
        f = FORMULA_RE.search(t)
        me = ENTRY_RE.search(t)
        entry = me.group(1) if me else None
        if f and f.group(1) in by_formula:
            others = by_formula[f.group(1)]
            distinct = bool(entry) and "," in entry and all(e and e != entry for _, e in others)
            if not distinct:
                fails.append("(c) %s: formula %s is also components/ %s (no distinct NASA isomer labels)"
                             % (p.name, f.group(1), ", ".join(sorted(x for x, _ in others))))
        n += 1
    return n


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BIN)], cwd=str(case), capture_output=True, text=True,
                       env=env, timeout=600)
    return p.returncode, p.stdout + p.stderr


def arm_d():
    if not BIN.is_file():
        fails.append("(d) %s is not built; run `make all`" % BIN.relative_to(ROOT))
        return
    tmp = Path(tempfile.mkdtemp(prefix="thermotables."))
    try:
        def mk(tag, edit):
            d = tmp / tag
            case_records.copytree(WITNESS, d)
            f = d / "constant" / "thermoPhysPropDict"
            f.write_text(edit(read(f)))
            return d
        decl = re.compile(r'(?m)^speciesTables\s*\([^)]*\)\s*;[ \t]*\n')
        rc, out = run(mk("ok", lambda s: s))
        if rc != 0 or "[thermoTable]" not in out:
            fails.append("(d) witness: exit %d, `[thermoTable]` %s" %
                         (rc, "present" if "[thermoTable]" in out else "absent"))
        rc, out = run(mk("undeclared", lambda s: decl.sub("", s)))
        if rc == 0 or "C3H7_npropyl" not in out:
            fails.append("(d) without `speciesTables` the run must fail naming C3H7_npropyl "
                         "(exit %d, name %s)" % (rc, "named" if "C3H7_npropyl" in out else "not named"))
        rc, out = run(mk("nosuch", lambda s: decl.sub("speciesTables ( NoSuchTable );\n", s)))
        if rc == 0 or "NoSuchTable" not in out:
            fails.append("(d) `speciesTables ( NoSuchTable )` must fail naming it "
                         "(exit %d, name %s)" % (rc, "named" if "NoSuchTable" in out else "not named"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def arm_e(text=None):
    text = read(ROOT / "src" / "thermo" / "Database.cpp") if text is None else text
    ls = text.split("\n")
    sites = [i for i, l in enumerate(ls)
             if "speciesTables()" in l and not l.lstrip().startswith("//")]
    if not sites:
        fails.append("(e) Database.cpp no longer consults speciesTables()")
        return
    for i in sites:
        ctx = "\n".join(ls[max(0, i - 3):i + 1])
        if "!fs::exists(standard)" not in ctx or "!sealed" not in ctx:
            fails.append("(e) Database.cpp:%d consults speciesTables() without the guard "
                         "`!sealed && !fs::exists(standard)`" % (i + 1))


def main():
    nfiles = arm_a()
    nb = arm_b()
    nc = arm_c()
    arm_d()
    arm_e()
    if fails:
        for f in fails:
            print("FAIL " + f)
        print("%s: FAILED (%d finding(s))" % (LABEL, len(fails)))
        return 1
    bpart = ("(b) %d records held to the report" % nb) if nb is not None else \
            "(b) SKIPPED (CHOUPO_ALLOW_NO_NASA_PDF=1, report absent)"
    print("%s: OK  (a) %d files = INDEX; %s; (c) %d records, one home vs components/; "
          "(d) witness reads the table only when declared, refuses it undeclared and an unknown table; "
          "(e) Database.cpp guard present.  Domain: the NASA-TP-2002-211556 home only; "
          "not that the report is right, not curator read-back." % (LABEL, nfiles, bpart, nc))
    return 0


if __name__ == "__main__":
    sys.exit(main())
