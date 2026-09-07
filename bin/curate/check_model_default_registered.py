#!/usr/bin/env python3
"""Gate: a model slot's DEFAULT never names something its own factory cannot build.

    bin/curate/check_model_default_registered.py

WHY THIS EXISTS.  A student writes a `massTransfer {}` block on a spiral-wound
module and forgets the `model` key.  The engine reads

    MassTransferModel::New(mt->lookupWordOrDefault("model", "constant"))

and dies with `unknown model 'constant'.  Registered: SchockMiquel` -- naming a
model the ENGINE invented in its own default.  The reader never wrote the word
`constant`; no document could have warned them against it; and the message
sends them looking for a name that has not existed since 2026-08-23, when the
constant film model was pruned as a duplicate of the bare `k_film` scalar.

The defect is not the refusal, which is loud and correct.  It is that the
DEFAULT and the REGISTRY are two homes for one vocabulary, and only one of them
was updated.  `src/core/RegistryRefusal.H` says in its own words that it cannot
see this class ("a factory whose default names something it cannot build is a
different defect ... and this header cannot see it").  This gate is the other
half.

THE RULE, which is what to remember: **a default must never name what the
factory cannot build.**  Where there is no honest default, refuse and name the
routes that exist -- which is what SpiralWoundModule now does for the
`massTransfer {}` block.

WHAT IT CHECKS

  (a) STRUCTURAL, AND IT RECOUNTS.  Every `X::New(...)` call site in src/ whose
      argument carries a literal `lookupWordOrDefault("<key>", "<default>")` is
      matched against the registrations in X's own factory file, recomputed on
      every run from `register*("name"` across the tree.  A default that is not
      registered FAILS, naming the site, the default and what is registered.
      Nothing is transcribed from a list: the population is recounted here, and
      the count is printed, because a measurement taken once and remembered is
      a derived fact with a second home.

  (b) THE PROBE.  The construct itself -- the exact defect, rebuilt in a
      throwaway pair of files under the scan root -- must still be rejected.  A
      scanner that has quietly stopped matching the shape it exists to find
      passes arm (a) trivially, since every real site would then be invisible.
      The probe is written, scanned and deleted; nothing under src/ is touched.

  (c) THE NEGATIVE.  A probe whose default IS registered must pass, so the gate
      can tell the two states apart rather than refusing every default it sees.

  (d) THE CATCH-ALL ELSE, OBSERVED.  The paragraph this docstring used to end
      with named the neighbouring defect and left it: a default consumed by an
      if-CHAIN is reachable (it is the else branch), but a MISTYPED word in
      such a chain falls into it instead of refusing.  It did, in five places,
      and two of them were found by transposing one character in a corpus
      case:

        crystalliser02_msmpr   `model MSMPR;` -> `MSMRP;`         exit 0, the
            equilibrium yield 0.395776 in place of the population balance's
            0.277787 (+42 %), and all twelve PBE KPIs simply gone;
        sprayDryer04_profiles  `langrishKockel` -> `langrishKocke`  exit 0 and
            EVERY KPI byte-identical, the lumped short-cut running in place of
            the axial trajectory -- visible only in profile.csv, which stopped
            being an axial profile and became a size distribution.  No golden
            can see that;
        column02_simultaneous  `simultaneous` -> `simultaneou`    exit 0, the
            Wang-Henke sweep (79 iterations) in place of the MESH Newton (5);
        column04_multifeed_sidedraw  a side draw's `phase vapour;` -> `vapou;`
            drew LIQUID, byte-identical to a liquid draw, where the vapour
            draw the author asked for moves the reboiler duty by 10 %;
        pneumaticConveyor02_bends    a bend's `type longRadius;` -> `longRadus;`
            priced a long-radius sweep and PRINTED the mistyped word beside it.

      So this arm RUNS each of those five cases twice from a scratch copy:
      once with the word mutated (the run must refuse, naming the word AND
      listing what the site accepts) and once with the word replaced by a
      DIFFERENT ACCEPTED ALIAS (the run must not refuse for that reason).  The
      pair is the point: a site that refused every word would pass the first
      half alone.  Nothing under src/ or tutorials/ is touched -- the case is
      copied to a temp directory and edited there.

WHAT IT DOES NOT CHECK, said plainly rather than implied:

  * A default built from a variable rather than a literal (`HeatExchanger.cpp`
    passes a `def` computed per block).  Arm (a) is literal-level.
  * Whether a registered name is the RIGHT default for the physics.  The gate
    checks reachability, never judgement.
  * Whether the list a site hands `registryRefusal::message` is the list its
    branches really accept.  That is a hand-written enumeration beside the
    branches it enumerates, and only a reader can hold the two together.
  * Every if-chain in the tree.  Arm (d) covers the five sites named above.
    `HeatExchanger` (`epsNTU`) and `BatchStill` (`rayleigh`) read a word the
    same way and are NOT covered here; they were out of the slice that built
    this arm and are named so the next reader does not mistake this list for
    the whole population.

SABOTAGES PERFORMED BY HAND on 2026-09-07, each restored and the engine
rebuilt afterwards.  The lines are what the gate actually printed:

  S1  Crystalliser's refusal deleted (the catch-all else restored) ->
      "Crystalliser model: `MSMRP` was ACCEPTED (exit 0).  The chain's else is
      a catch-all again, ..."
  S2  SprayDryer's refusal deleted -> "SprayDryer chamber model:
      `langrishKocke` was ACCEPTED (exit 0). ..."  This one is the reason the
      arm runs a case instead of reading source: the sabotaged run's KPIs are
      byte-identical to the good one's.
  S8  the side-draw phase refusal deleted -> "DistillationColumn side-draw
      phase: `liquide` was ACCEPTED (exit 0). ..."
  S9  the alias half.  `model == "msmpr"` dropped from the crystalliser chain,
      so the site refused a word it is supposed to take -> "Crystalliser
      model: the ACCEPTED alias `msmpr` was refused too.  A site that refuses
      every word passes the first half of this arm while accepting none of its
      own vocabulary."

S2 also corrected the gate: its first failure message quoted the crystalliser's
"+42 % yield" for EVERY site, which was false of four of the five.  A failure
message that carries one site's fact to another teaches the reader to distrust
it, so the specific numbers live in this docstring and the message points here.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"

REGISTER = re.compile(
    r'\bregister(?:Type|Model|Method|Correlation|Builtin\w*)?\s*\(\s*"([^"]+)"')
NEW_SITE = re.compile(r'(\w+)::New\s*\(([^;]{0,600}?)\)\s*;', re.S)
DEFAULTED = re.compile(
    r'lookupWordOrDefault\s*\(\s*"([^"]*)"\s*,\s*"([^"]+)"')


def registrations(root: Path):
    """file basename -> set of names it registers.  Recounted, never stored."""
    out = {}
    for p in sorted(root.rglob("*")):
        if p.suffix not in (".cpp", ".H") or not p.is_file():
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        names = {m.group(1) for m in REGISTER.finditer(text)}
        if names:
            out.setdefault(p.name, set()).update(names)
    return out


def scan(root: Path):
    """Return (sites, failures).  A site is (path, line, cls, key, default)."""
    regs = registrations(root)
    sites, failures = [], []
    for p in sorted(root.rglob("*.cpp")):
        text = p.read_text(encoding="utf-8", errors="replace")
        for m in NEW_SITE.finditer(text):
            cls, arg = m.group(1), m.group(2)
            d = DEFAULTED.search(arg)
            if not d:
                continue
            key, default = d.group(1), d.group(2)
            line = text[:m.start()].count("\n") + 1
            rel = p.relative_to(root)
            sites.append((rel, line, cls, key, default))
            known = regs.get(cls + ".cpp", set())
            if not known:
                failures.append(
                    f"{rel}:{line}  {cls}::New default `{key} {default};` -- no "
                    f"factory file {cls}.cpp found to check it against")
            elif default not in known:
                failures.append(
                    f"{rel}:{line}  {cls}::New defaults `{key}` to "
                    f"'{default}', which {cls}::registerBuiltins does NOT "
                    f"register.  Registered: {' '.join(sorted(known))}.  "
                    f"A default must never name what the factory cannot "
                    f"build: register it, or refuse and name the routes "
                    f"that exist.")
    return sites, failures


PROBE_FACTORY = '''#include <string>
namespace Choupo {{
void ProbeFactory_registerBuiltins()
{{
    registerType("realThing", nullptr);
}}
}}
'''
PROBE_CALLER = '''#include <string>
namespace Choupo {{
void probeUse(const DictPtr& d)
{{
    auto m = ProbeFactory::New(d->lookupWordOrDefault("model", "{default}"));
}}
}}
'''


def probe(default_name: str):
    """Build the construct in a scratch tree and return this gate's failures."""
    tmp = Path(tempfile.mkdtemp(prefix="choupo-default-probe-"))
    try:
        (tmp / "ProbeFactory.cpp").write_text(PROBE_FACTORY.format(),
                                              encoding="utf-8")
        (tmp / "ProbeCaller.cpp").write_text(
            PROBE_CALLER.format(default=default_name), encoding="utf-8")
        _, failures = scan(tmp)
        return failures
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


#  (d) THE CATCH-ALL ELSE.  One row per if-chain that reads a declared word:
#      the case, the file to edit, a regex that matches ONLY the dict entry
#      (never the prose around it), the mutated word, and an accepted alias.
#      The regex keeps groups 1 and 2 and swaps what is between them.
CHAINS = [
 ("Crystalliser model",
  "tutorials/steady/crystallisation/crystalliser02_msmpr",
  r'^(\s*model\s+)MSMPR(\s*;)', "MSMRP", "msmpr"),
 ("DistillationColumn model",
  "tutorials/steady/distillation/column02_simultaneous",
  r'^(\s*model\s+)simultaneous(\s*;)', "simultaneou", "MESH"),
 ("SprayDryer chamber model",
  "tutorials/steady/drying/sprayDryer04_profiles",
  r'^(\s*model\s+)langrishKockel(\s*;)', "langrishKocke", "distributed"),
 ("DistillationColumn side-draw phase",
  "tutorials/steady/distillation/column04_multifeed_sidedraw",
  r'(phase\s+)liquid(\s*;\s*rate)', "liquide", "vapour"),
 ("PneumaticConveyor bend type",
  "tutorials/steady/solids/pneumaticConveyor02_bends",
  r'(\{\s*RoverD[^}\n]*type\s+)longRadius(\s*;)', "shortRadus",
  "shortRadius"),
]


def run_chain_case(tmp, label, case, pattern, word, tag):
    """Copy the case, swap the word, run it.  Returns (rc, output)."""
    dst = Path(tmp) / (Path(case).name + "-" + tag)
    shutil.copytree(ROOT / case, dst)
    fd = dst / "system" / "flowsheetDict"
    text = fd.read_text(encoding="utf-8")
    new, n = re.subn(pattern, lambda m: m.group(1) + word + m.group(2), text,
                     flags=re.M)
    if n == 0:
        return None, (f"{label}: the gate's own pattern matched NOTHING in "
                      f"{case}/system/flowsheetDict.  A pattern anchored where "
                      f"its subject does not live is a check that cannot fire "
                      f"-- repoint it at the entry the case really writes.")
    fd.write_text(new, encoding="utf-8")
    r = subprocess.run([str(ROOT / "choupoSolve"), "."], cwd=str(dst),
                       capture_output=True, text=True, timeout=600)
    return (r.returncode, r.stdout + r.stderr), None


def chain_arm():
    """Run each if-chain site with a bad word and with an accepted alias."""
    fails, ok = [], []
    with tempfile.TemporaryDirectory(prefix="choupo-chain-") as tmp:
        for label, case, pattern, bad, alias in CHAINS:
            got, why = run_chain_case(tmp, label, case, pattern, bad, "bad")
            if why:
                fails.append(why)
                continue
            rc, out = got
            if rc == 0:
                fails.append(
                    f"{label}: `{bad}` was ACCEPTED (exit 0).  The chain's "
                    f"else is a catch-all again, so a mistyped word silently "
                    f"selects the default and the run reports a different "
                    f"model's answer at exit 0.  See this gate's docstring "
                    f"for what {Path(case).name} reported when it did.")
            elif f"'{bad}'" not in out:
                fails.append(f"{label}: refused `{bad}` without naming the "
                             f"word the reader wrote")
            elif "Accepted:" not in out:
                fails.append(
                    f"{label}: refused `{bad}` without listing what the site "
                    f"DOES take.  A refusal by name carries the names that "
                    f"exist (core/RegistryRefusal.H) -- otherwise the reader "
                    f"has to read the source to find the word.")
            else:
                got2, why2 = run_chain_case(tmp, label, case, pattern, alias,
                                            "alias")
                if why2:
                    fails.append(why2)
                    continue
                rc2, out2 = got2
                if rc2 != 0 and f"'{alias}'" in out2:
                    fails.append(
                        f"{label}: the ACCEPTED alias `{alias}` was refused "
                        f"too.  A site that refuses every word passes the "
                        f"first half of this arm while accepting none of its "
                        f"own vocabulary.")
                else:
                    ok.append(label)
    return fails, ok


def main():
    sites, failures = scan(SRC)

    chain_fails, chain_ok = chain_arm()
    failures.extend(chain_fails)

    # (b) the probe: the defect itself must still be caught.
    caught = probe("thingNobodyRegistered")
    if not caught:
        failures.append(
            "PROBE SURVIVED: a factory default naming an unregistered model "
            "was NOT reported by the scanner.  Arm (a) is therefore proving "
            "nothing -- every real site would be invisible the same way.")

    # (c) the negative: a registered default must NOT be reported.
    clean = probe("realThing")
    if clean:
        failures.append(
            "NEGATIVE FAILED: a factory default naming a REGISTERED model was "
            "reported.  The gate cannot tell the two states apart: "
            + " | ".join(clean))

    if failures:
        print("check_model_default_registered: FAIL")
        for f in failures:
            print("  -", f)
        sys.exit(1)

    classes = sorted({s[2] for s in sites})
    print(
        f"check_model_default_registered: OK -- {len(sites)} factory call "
        f"site(s) across {len(classes)} factory class(es) take a literal "
        f"`model` default, and every one of those defaults is a name the "
        f"class's own registerBuiltins registers (both sides recounted here, "
        f"never transcribed).  The probe holds: the construct itself -- a "
        f"default naming a model nobody registered -- is still reported, and "
        f"the negative (a default that IS registered) is not.  Before this "
        f"existed, SpiralWoundModule defaulted the `massTransfer {{}}` block's "
        f"model to 'constant', pruned from the factory on 2026-08-23, so a "
        f"block that merely forgot its `model` key died naming a model the "
        f"engine had invented.  AND THE CATCH-ALL ELSE IS GONE: "
        f"{len(chain_ok)} if-chain site(s) that read a declared word -- "
        f"{', '.join(chain_ok)} -- were each RUN twice from a scratch copy of "
        f"a corpus case: a mistyped word refuses naming the word and listing "
        f"what the site accepts, and an accepted alias does not.  DOMAIN: "
        f"literal factory defaults across src/, plus those five if-chains.  "
        f"LIMITS: a default built from a variable rather than a literal is "
        f"invisible to arm (a); whether a registered default is the RIGHT one "
        f"for the physics is judgement, not reachability; whether the list a "
        f"site hands registryRefusal is the list its branches accept can only "
        f"be read, not derived; and arm (d) covers five if-chains, not every "
        f"one in the tree -- HeatExchanger (`epsNTU`) and BatchStill "
        f"(`rayleigh`) read a word the same way and are NOT covered.")


if __name__ == "__main__":
    main()
