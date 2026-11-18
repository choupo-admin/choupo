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
import os
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

#  THE WITNESS IS A PROBE, BUILT IN A TEMPORARY DIRECTORY (architect's ruling,
#  2026-11-19: a shipped tutorial must not carry a parameter set made up for the
#  occasion).  No honest second set of any catalogue pair exists yet, so this
#  arm turns a COPY of the catalogue's nButanol-water record into two sets --
#  `lle` = the record's own numbers, `probe_vle` = the tau numbers scaled by
#  0.7, a PROBE and never a published set -- and runs a minimal props case.
#  A missing binary FAILS (as check_activity_domain's behaviour arms do): a
#  check that cannot run must not pass.
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
PAIR_REC = ROOT / "data/standards/parameters/NRTL/nButanol-water.dat"


def sets_probe():
    """Returns (problems, note)."""
    if not PROPS.exists():
        return ([f"pair-sets probe: {PROPS.relative_to(ROOT)} is not built -- a "
                 "check that cannot run must not pass"], "")
    src = PAIR_REC.read_text()
    m = re.search(r'\nparameters\s*\{(.*?)\n\}', src, re.S)
    prov = re.search(r'\nprovenance\s*\{', src)
    if not m or not prov:
        return (["pair-sets probe: the catalogue record nButanol-water.dat no "
                 "longer has a plain `parameters` block and a `provenance` block"], "")
    body = m.group(1)

    def scale(mm):
        return f"{mm.group(1)}{float(mm.group(2)) * 0.7:.8f};"
    probe_body = re.sub(r'(\b(?:a_ij|b_ij|a_ji|b_ji)\s+)(-?[\d.]+);', scale, body)
    head = src[:m.start()]
    #  C413 (slice 3): a case's own pair record is a VARIATION of the catalogue's, under the pair's own
    #  name, and the entry reads `nButanol-water { }` -- the probe is built that way.
    head = re.sub(r"(\nrecordType[^\n]*\n)", lambda mm: mm.group(1) + 'variationOf nButanol-water;\nvariationReason "check_record_form pair-sets probe";\n', head, count=1)
    rec = (head + "\npreferred lle;\nsets\n{\n"
           "    lle { parameters {" + body + "\n} fittedTo lle; }\n"
           "    probe_vle { parameters {" + probe_body + "\n} "
           "provenance { origin assumed; method \"PROBE, scaled 0.7, never a published set\"; }"
           " fittedTo vle; }\n}\n")
    tmp = Path(tempfile.mkdtemp(prefix="rfpairsets."))
    problems = []
    try:
        (tmp / "constant/parameters/NRTL").mkdir(parents=True)
        (tmp / "system").mkdir()
        (tmp / "constant/parameters/NRTL/nButanol-water.dat").write_text(rec)
        (tmp / "system/controlDict").write_text(
            'application  choupoProps;\ndescription  "check_record_form pair-sets probe";\nverbosity 2;\n')
        (tmp / "system/propsDict").write_text(
            "operations\n(\n    { name p; type propertyPoint; state { T 373.15 K; P 1 atm;"
            " composition { nButanol 0.8; water 0.2; } } properties ( P_bubble ); }\n);\n")
        base = ("recordType thermophysicalPropertySystem;\nschemaVersion 1;\n"
                "components ( nButanol water );\nequilibrium\n{\n formulation gammaPhi;\n"
                " liquid { activityModel { model NRTL; binaryParameters {\n"
                "   nButanol-water { %s }\n } } standardState pureLiquid; }\n"
                " vapour { fugacityModel idealGas; }\n}\n")
        env = dict(os.environ, CHOUPO_HOME=str(ROOT))

        def run(source, setword):
            #  `source` is now only the choice of home: the catalogue (the case's variation file
            #  is hidden while it runs) or the case's own variation record
            local = tmp / "constant/parameters/NRTL/nButanol-water.dat"
            hidden = tmp / "nButanol-water.dat.hidden"
            if source.startswith("data/standards"):
                if local.exists():
                    local.rename(hidden)
            elif hidden.exists():
                hidden.rename(local)
            (tmp / "constant/thermoPhysPropDict").write_text(base % setword)
            r = subprocess.run([str(PROPS), str(tmp)], capture_output=True, text=True,
                               timeout=300, env=env, cwd=tmp)
            out = r.stdout + r.stderr
            pm = re.search(r'"P_bubble":\s*([0-9.eE+-]+)', out)
            return r.returncode, out, (float(pm.group(1)) if pm else None)

        rc0, o0, p_cat = run("data/standards/parameters/NRTL/nButanol-water.dat", "")
        rc1, o1, p_def = run("constant/parameters/NRTL/pair-sets-probe.dat", "")
        rc2, o2, p_lle = run("constant/parameters/NRTL/pair-sets-probe.dat", "set lle;")
        rc3, o3, p_vle = run("constant/parameters/NRTL/pair-sets-probe.dat", "set probe_vle;")
        rc4, o4, _ = run("constant/parameters/NRTL/pair-sets-probe.dat", "set no_such_set;")
        if None in (p_cat, p_def, p_lle, p_vle):
            problems.append("pair-sets probe: a run returned no P_bubble: "
                            + (o0 + o1 + o2 + o3)[-300:])
        else:
            for tag, v in (("default", p_def), ("set lle", p_lle)):
                if abs(v - p_cat) > 1e-9 * abs(p_cat):
                    problems.append(f"pair-sets probe (a): {tag} gives P_bubble {v!r}, "
                                    f"the catalogue record gives {p_cat!r}")
            if abs(p_vle - p_cat) < 1e-6 * abs(p_cat):
                problems.append("pair-sets probe (b): `set probe_vle;` gives the SAME "
                                "P_bubble as the preferred set")
            if "set lle" not in o2 or "set probe_vle" not in o3:
                problems.append("pair-sets probe (b): the [builder] line does not name the set used")
            if ", set probe_vle" not in o3 or ", set lle" not in o2:
                problems.append("pair-sets probe (b): the resolved view does not name the set used")
        if rc4 == 0 or "no_such_set" not in o4 or "probe_vle" not in o4 or "lle" not in o4:
            problems.append("pair-sets probe (c): `set no_such_set;` did not refuse by name "
                            "listing the record's sets")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return (problems, "probe on a temporary copy of nButanol-water: default and set lle equal the "
                      "catalogue record, probe_vle differs, set named in the builder line and the "
                      "resolved view, an unknown set refused by name")


_probs, probe_note = sets_probe()
bad.extend(_probs)
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
