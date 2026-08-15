#!/usr/bin/env python3
"""Record-form gate: the settled shape of a data record, enforced where it
was regressed -- INCLUDING drafts under docs/design/.

WHY THIS EXISTS.  On 2026-07-27 a design draft written from an external
proposal's file shape silently reintroduced `role`, a second standard state
and six single-valued ceremony fields -- every one of them settled against.
Nothing caught it, and the reason is mechanical: the 25 check_* gates guard
`data/standards/` and `tutorials/`, and the draft lived in `docs/design/`,
the one place with no net.  A doctrine without an executable gate regresses.

WHAT IT CHECKS.  The rules are the six practices in
`.claude/skills/choupo-record/SKILL.md`, which are standard in both Aspen
Plus and DWSIM -- two independent industrial implementations.  Only the
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

Scope: data/standards/components/, plus every draft dict under
docs/design/.  Sealed tutorial mirrors inherit from standards and are not
scanned twice.
"""
import re
import sys
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
