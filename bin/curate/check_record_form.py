#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Record-form gate: the settled shape of a data record, enforced where it
was regressed -- INCLUDING drafts under docs/design/.

WHY THIS EXISTS.  On 2026-07-27 a design draft written from an external
proposal's file shape silently reintroduced `role`, a second standard state
and six single-valued ceremony fields -- every one of them settled against.
Nothing caught it, and the reason is mechanical: the 25 check_* gates guard
`data/standards/` and `tutorials/`, and the draft lived in `docs/design/`,
the one place with no net.  A doctrine without an executable gate regresses.

WHAT IT CHECKS.  The rules are the six practices in
`.claude/skills/choupo-record/SKILL.md`, which are standard in both the
commercial and the open-source process simulators in industrial use -- two
independent lineages that arrived at them separately.  Only the
mechanically checkable ones are here; the rest live in the skill, where they
reach the author before the file is written.

  1. no `role` on a component  -- role belongs to the (component, phase)
     pair, not the substance (water: solvent here, solute there);
  2. ONE formation datum per component -- the other phases derive through
     hvap/hfus, as Component::h_formation already does;
  3. no `reference` naming a standard state inside a component -- the rung
     is the property method's, declared per phase;
  4. no single-valued ceremony field (the amplifier rule): a key whose only
     possible value is the one written is doctrine in the wrong place.

  5. (ARM `pair-sets`, contract K3, Theory Guide sec:pair-sets) a pair record
     of the activity models (NRTL, UNIQUAC, Wilson) holds its parameters in
     ONE of two shapes: one unnamed `parameters` block (the set `default`) OR
     `sets { <name> { parameters ... } }` with `preferred <name>;` (required
     from two sets on) -- never both, never a set without `parameters`.
     THE DEFECT IT WOULD HAVE CAUGHT: before K3 two legitimate
     parametrisations of one pair (a partially miscible pair fitted to
     bubble temperatures AND to tie lines) could live only as a case's
     inline variation, so a case choosing the LLE set could not cite the
     catalogue; once records may carry sets, a record that names no
     preferred set, or keeps a stray top-level `parameters`, would make the
     engine's choice of set ambiguous or refused at run time.  The same arm
     runs the witness case's REFUSAL probe when a build is present: an
     unknown `set` name must stop the run by name, listing the record's
     sets; with no binary the probe is printed SKIPPED, never silent.

Scope: data/standards/components/, plus every draft dict under
docs/design/.  Sealed tutorial mirrors inherit from standards and are not
scanned twice.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  Keys whose only possible value is the one written: doctrine, not setting.
#  Each maps to the one place the doctrine belongs.
#  NOT here, though an earlier version of this gate said so: `formulation`.
#  It carries SIX distinct values across the corpus (gammaPhi, gammaGamma,
#  phiPhi, electrolyteGammaPhi, diluteSolution, consistent), so it is a real
#  knob and listing it would have failed the first design draft that used the
#  actual manifest form.  Every key below was checked against the corpus and
#  occurs ZERO times -- they are invented fields, not corpus fields.
CEREMONY = {
    "equilibriumCondition": "always zero affinity -- state it once in the docs",
    "componentDiscovery":   "one value; the rule belongs in the docs",
    "crossCheck":           "automatic whenever both routes exist",
    "introduces":           "derivable from the reactions' stoichiometry",
    "reporting":            "glass-box shows everything; that is `verbosity`",
}

#  A component may carry formation data for several phases ONLY as a
#  derived convenience -- never as stored primaries.  One datum, one home.
#  VALUE form only: `dHf_298 -285830;`.  The same token also opens the
#  provenance sub-block (`dHf_298 { origin ... }`) -- that is metadata ABOUT
#  the one value, not a second value.  A gate that cries wolf gets disabled,
#  which is worse than no gate.
DHF = re.compile(r'^\s*dHf_298\s+-?[\d.]', re.M)
ROLE = re.compile(r'^\s*role\s+\S+\s*;', re.M)
REFERENCE = re.compile(r'^\s*reference\s+\S+\s*;', re.M)


def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//.*$', '', t, flags=re.M)


def scan(path, label, bad, pending, *, component, design):
    t = strip(path.read_text())

    if component:
        if ROLE.search(t):
            #  `role` is LIVE: SystemClassifier, Stripper, Evaporator and
            #  SprayDryer all read it, and retiring it is a NAMED roadmap item
            #  (property-architecture 6b.3), not a finished decision.  A gate
            #  may only enforce what is TRUE -- enforcing an aspiration fails
            #  the corpus and gets switched off.  So: fatal where the NEW form
            #  is being designed, counted where the migration is still owed.
            (bad if design else pending).append(
                f"{label}: `role` on a component -- role is a property of the "
                f"(component, phase) PAIR, not the substance")
        n = len(DHF.findall(t))
        if n > 1:
            bad.append(f"{label}: {n} formation data -- ONE per component, in "
                       f"its natural phase; the others derive through "
                       f"hvap/hfus (Component::h_formation)")
        if REFERENCE.search(t):
            bad.append(f"{label}: `reference` names a standard state inside a "
                       f"component -- the rung belongs to the phase's property "
                       f"method (ReferenceRung), not the substance")

    for key, why in CEREMONY.items():
        if re.search(rf'^\s*{key}\s', t, re.M):
            bad.append(f"{label}: `{key}` is a single-valued field "
                       f"({why}) -- the amplifier rule: a knob with one "
                       f"position is not a knob")


bad, pending = [], []

#  A scan over nothing keeps no form (2026-08-15 fleet census): this gate
#  shared the check_true_ions death shape -- rename a scanned root and
#  glob/rglob return nothing, zero violations over zero records, permanently
#  green.  docs/design was even a silent `is_dir()` skip, in the one place
#  this gate exists to guard.  A scanner refuses when it cannot see its
#  subjects.
components_dir = ROOT / "data/standards/components"
design = ROOT / "docs/design"
for label, root in (("data/standards/components", components_dir),
                    ("docs/design", design)):
    if not root.is_dir():
        print(f"record-form gate FAILED: scan root `{label}` does not exist "
              f"-- this gate cannot see what it audits, and a green verdict "
              f"over an absent tree would be the check_true_ions failure "
              f"again.")
        sys.exit(1)

n_components = 0
for p in sorted(components_dir.glob("*.dat")):
    n_components += 1
    scan(p, f"data/standards/components/{p.name}", bad, pending,
             component=True, design=False)

n_design = 0
for p in sorted(design.rglob("*")):
    if not p.is_file():
        continue
    rel = str(p.relative_to(ROOT))
    if p.suffix in (".md", ".tex", ".png", ".pdf"):
        continue          # prose may DISCUSS a retired field
    n_design += 1
    scan(p, rel, bad, pending, component=("/components/" in rel),
         design=True)

#  Collapsed-scan floors (2026-08-15 fleet census, check_true_ions
#  precedent): 247 component records / 35 design dicts observed; each floor
#  sits a round 5x+ below.
if n_components < 40 or n_design < 5:
    print(f"record-form gate FAILED: only {n_components} component record(s) "
          f"and {n_design} design dict(s) scanned -- the corpus holds far "
          f"more, so the scan surface has collapsed and a verdict over it "
          f"would describe nothing.")
    sys.exit(1)

#  ---- arm pair-sets (K3) ---------------------------------------------------
def top_level_has(t, key):
    """`key` at brace depth 0 of the stripped record text."""
    depth = 0
    for line in t.splitlines():
        if depth == 0 and re.match(rf'\s*{key}\b', line):
            return True
        depth += line.count('{') - line.count('}')
    return False


def named_sets(t):
    """Names of the sub-blocks of the top-level `sets { ... }` block, or
    None when the record has no `sets` block."""
    m = re.search(r'^\s*sets\s*\{', t, re.M)
    if not m:
        return None
    body, depth, names, cur = t[m.end():], 1, [], ''
    for c in body:
        if c == '{':
            if depth == 1 and cur.split():
                names.append(cur.split()[-1])
            depth += 1
            cur = ''
        elif c == '}':
            depth -= 1
            if depth == 0:
                break
            cur = ''
        elif depth == 1:
            cur = '' if c == ';' else cur + c
    return names


n_pair_sets = 0
pair_records = []
for model in ("NRTL", "UNIQUAC", "Wilson"):
    pair_records += sorted((ROOT / "data/standards/parameters" / model).glob("*.dat"))
pair_records += sorted((ROOT / "tutorials/props/molecular/pairSets01_butanol_water_two_sets"
                        / "constant/parameters/NRTL").glob("*.dat"))      # the witness record
if True:
    for p in pair_records:
        t = strip(p.read_text())
        names = named_sets(t)
        if names is None:
            continue
        n_pair_sets += 1
        label = str(p.relative_to(ROOT))
        if top_level_has(t, "parameters"):
            bad.append(f"{label}: a top-level `parameters` block BESIDE `sets` -- two homes for one fact")
        if not names:
            bad.append(f"{label}: `sets {{ }}` holds no set")
        if len(set(names)) != len(names):
            bad.append(f"{label}: a set name is used twice ({names})")
        m = re.search(r'^\s*preferred\s+(\S+)\s*;', t, re.M)
        if len(names) > 1 and not m:
            bad.append(f"{label}: {len(names)} sets and no `preferred <name>;`")
        if m and m.group(1) not in names:
            bad.append(f"{label}: `preferred {m.group(1)};` names no set ({names})")

witness = ROOT / "tutorials/props/molecular/pairSets01_butanol_water_two_sets"
probe_note = "witness refusal probe: SKIPPED (no choupoProps binary in this tree)"
binary = ROOT / "choupoProps"
if witness.is_dir() and binary.exists():
    tmp = Path(tempfile.mkdtemp(prefix="rfpairsets."))
    try:
        case = tmp / "case"
        shutil.copytree(witness, case,
                        ignore=shutil.ignore_patterns("expected", "results*", "log.*"))
        tp = case / "constant" / "thermoPhysPropDict"
        tp.write_text(tp.read_text().replace("set probe_vle;", "set no_such_set;"))
        r = subprocess.run([str(binary), str(case)], capture_output=True, text=True,
                           timeout=120, cwd=str(case))
        out = r.stdout + r.stderr
        if r.returncode == 0 or "no_such_set" not in out or "probe_vle" not in out:
            bad.append("pair-sets witness: an unknown `set` name did NOT stop the run "
                       "by name listing the record's sets")
        probe_note = "witness refusal probe: unknown set refused by name, sets listed"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
print(f"record-form gate arm pair-sets: {n_pair_sets} pair record(s) with sets checked; {probe_note}")

if pending:
    print(f"record-form gate: {len(pending)} record(s) still carry `role` -- "
          f"the named migration (property-architecture 6b.3) has not run.  "
          f"Counted, not failed: the field is live in the engine.")

if bad:
    print("record-form gate FAILED:")
    for x in bad:
        print("  " + x)
    print("\n  see .claude/skills/choupo-record/SKILL.md -- and start from an "
          "existing record, never from an external format")
    sys.exit(1)

print(f"record-form gate: component records and design drafts keep the settled "
      f"form ({n_components} components, {n_design} design dicts scanned; an "
      f"absent or collapsed scan root REFUSES)")
