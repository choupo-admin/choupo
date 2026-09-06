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

WHAT IT DOES NOT CHECK, said plainly rather than implied:

  * A default consumed by an if-CHAIN rather than a factory -- `HeatExchanger`
    (`epsNTU`), `Crystalliser` (`equilibrium`), `SprayDryer` (`marshall`),
    `BatchStill` (`rayleigh`).  Those defaults ARE reachable (each is the
    chain's else branch), so this gate's claim holds for them trivially; what
    it cannot see is the neighbouring defect, that a MISTYPED model name in
    such a chain falls into the default instead of refusing.  That is a
    separate rule and would need a separate gate.
  * A default built from a variable rather than a literal (`HeatExchanger.cpp`
    passes a `def` computed per block).  Arm (a) is literal-level.
  * Whether a registered name is the RIGHT default for the physics.  The gate
    checks reachability, never judgement.
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


def main():
    sites, failures = scan(SRC)

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
        f"engine had invented.  NOT COVERED: a default consumed by an "
        f"if-chain rather than a factory (its else branch makes it reachable, "
        f"but a MISTYPED name there still falls into it silently -- a "
        f"different rule); a default built from a variable rather than a "
        f"literal; and whether a registered default is the RIGHT one for the "
        f"physics.")


if __name__ == "__main__":
    main()
