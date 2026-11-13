#!/usr/bin/env python3
"""Gate: no NEW unit or sizing pass prices a liquid property itself.

    bin/curate/check_liquid_property_ratchet.py            # check
    bin/curate/check_liquid_property_ratchet.py --write    # re-pin the debt (say why in the commit)

THE RULE (DEV.md 4c C378, rule 1; docs/architecture/settled-contracts.md,
"A UNIT NEVER PRICES A LIQUID PROPERTY ITSELF").  A unit asks the one door,
`liquidProperty::evaluate` (src/thermo/LiquidPropertyDoor.H); a constant it
keeps is a `ConstantSource` (core/PropertySourceLog.H) whose value and words
are one object the run prints.

FOUR CLASSES are counted, per file of src/unitOperations and
src/postProcessing (comment lines excluded):
  vliq        a component's stored 25 C liquid volume read directly
              (`.Vliq()` or `->Vliq()`);
  direct      a liquid property asked of the package without the door
              (`density(... DensityPhase::Liquid)`, `viscosityLiquid(`,
              `surfaceTension(`, `diffusivityLiquid(`,
              `thermalConductivityLiquid(`, `stokesEinstein::factor[For](`,
              an own `WilkeChang` instance);
  literal     a liquid-property number written in the code: a non-zero
              literal given to a name that says density, viscosity, surface
              tension or diffusivity (by `=`, `{}` or in a comma list), a
              non-zero default of a lookup whose key says so, a water-like
              density literal (1000, 997, 998, 999) given to ANY name or used
              as a ternary fall-back, a kinematic `nu` of 1e-6;
  conversion  a bare `/ 1000` or `* 1000` on a line that makes a volume or a
              volumetric flow (`Q... =`, `volume`, `m3`, `/ rho`) -- where a
              1000 kg/m3 density may hide as a unit conversion.
The debt that exists is pinned in bin/curate/liquid_property_ratchet_debt.tsv
per (file, class); the ratchet is TWO-SIDED (a new site fails; a paid one
asks for its pin to be lowered in the same commit).

ITS OWN FIXTURES.  The eighteen probe lines of the door review
(docs/reviews/2026-11-13-c378-door-review/ratchet_probe.tsv) are classified
on every run, and the gate FAILS if any of them is not caught: a hole the
review found cannot reopen silently.

WHAT IT CANNOT SEE, said here and in its claim: a density, viscosity or
surface tension built from an expression with no literal (a variable read
from a dictionary under an unrelated key, a constant from another header
spelled otherwise); a conversion line that names neither a volume nor a
flow; a kg/kmol -> kg/mol conversion on a volume line is COUNTED (a false
positive, pinned as debt).  thermo/ (the kernel itself) and propertyOps/
(the props bench reads records by design) are outside its roots.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEBT = ROOT / "bin" / "curate" / "liquid_property_ratchet_debt.tsv"
NAME = "check_liquid_property_ratchet"
SCAN = [ROOT / "src" / "unitOperations", ROOT / "src" / "postProcessing"]
CLASSES = {
    "vliq": re.compile(r"(\.|->)Vliq\(\)"),
    "direct": re.compile(
        r"(\.|->)(density\([^;]*DensityPhase::Liquid|viscosityLiquid\(|surfaceTension\("
        r"|diffusivityLiquid\(|thermalConductivityLiquid\()"
        r"|stokesEinstein::factor(For)?\(|\bWilkeChang\s+\w+\s*\("),
    "literal": re.compile(
        r"\b\w*(rho|Rho|RHO|density|Density|[Kk]gPerM3|visc|Visc|sigma|Sigma|surfaceTension"
        r"|nu_?\w*|mu_?\w*|muL|muG|D_solute|Dab|kinematic)\w*\s*(=|\{)\s*"
        r"([1-9][0-9.]*|0\.[0-9]*[1-9][0-9]*)([eE][+-]?[0-9]+)?\s*[;},]"
        r"|\"(\w*(rho|density|Density|visc|Visc|sigma|surfaceTension|diffusivity|Diffusivity)\w*)\","
        r"\s*([1-9]|0\.[0-9]*[1-9])"
        r"|[?:]\s*(1000|997|998|999)(\.[0-9]*)?\s*[;),]"
        r"|\b\w+\s*(=|\{)\s*(1000|997|998|999)(\.[0-9]*)?\s*[;}]"
        r"|\b\w*nu\w*\s*(=|\{)\s*1(\.0*)?e-0?6\b"),
    "conversion": re.compile(
        r"^(?=.*[*/]\s*1000(\.0*)?\b(?![.0-9eE]))(?=.*(\bQ\w*\s*=|[Vv]olume|m3\b|/\s*rho))"),
}
COMMENT = re.compile(r"^\s*(//|\*)")
#  The door review's probe lines, every one of which must be caught.
FIXTURES = [
    "scalar v = thermo.comp(i).Vliq();",
    "scalar v = c->Vliq();",
    "const scalar rho_w = 1000.0;",
    "const scalar rho = ok ? a : 1000.0;",
    "scalar h = 0.7e-3, mu_feed = 1.0e-3, x = 2;",
    "const scalar rhoL{998.2};",
    "const scalar waterKgPerM3 = 1000.0;",
    "const scalar mu = thermo.viscosityLiquid(T, x);",
    "const scalar r = thermo.density(T, P, x, DensityPhase::Liquid);",
    "const scalar s = thermo.surfaceTension(T, x);",
    "const scalar D = thermo.diffusivityLiquid(T, i, j);",
    "const scalar r = op->lookupScalarOrDefault(\"rho_feed\", 1000.0);",
    "const scalar r = op->lookupScalarOrDefault(\"liquidDensity\", 1000.0);",
    "const auto f = stokesEinstein::factorFor(thermo, iW, T);",
    "constexpr double kRhoWater = 1000.0;",
    "scalar sigma = 0.072;",
    "scalar nu_solvent = 1.0e-6;",
    "const scalar Q = F * 1000.0 * MW / 1000.0;",
]


def classify(code):
    hits = {}
    for k, rx in CLASSES.items():
        n = len(rx.findall(code)) if k in ("vliq", "direct") else (1 if rx.search(code) else 0)
        if n:
            hits[k] = n
    return hits


def count():
    found = {}
    files = 0
    for base in SCAN:
        for p in sorted(base.rglob("*")):
            if p.suffix not in (".cpp", ".H") or not p.is_file():
                continue
            files += 1
            rel = p.relative_to(ROOT).as_posix()
            for line in p.read_text(errors="replace").splitlines():
                if COMMENT.match(line):
                    continue
                for k, n in classify(line.split("//")[0]).items():
                    found[(rel, k)] = found.get((rel, k), 0) + n
    return found, files


def main() -> int:
    missed = [f for f in FIXTURES if not classify(f)]
    if missed:
        print(f"{NAME}: FAIL -- {len(missed)} of the door review's {len(FIXTURES)} probe "
              "lines are no longer caught:")
        for f in missed:
            print(f"  NOT CAUGHT  {f}")
        return 1
    found, files = count()
    if files < 100:
        print(f"{NAME}: FAIL -- only {files} source files under the scan roots; "
              "a collapsed scan cannot vouch for anything")
        return 1
    if "--write" in sys.argv[1:]:
        lines = ["# file\tclass\tcount -- the debt of check_liquid_property_ratchet (C378 slice 0);",
                 "# it may only shrink: lower a count in the commit that removes a site"]
        lines += [f"{k[0]}\t{k[1]}\t{v}" for k, v in sorted(found.items())]
        DEBT.write_text("\n".join(lines) + "\n")
        print(f"{NAME}: WROTE {len(found)} pin(s) to {DEBT.relative_to(ROOT)}")
        return 0
    if not DEBT.exists():
        print(f"{NAME}: FAIL -- {DEBT.relative_to(ROOT)} is missing")
        return 1
    pins = {}
    for line in DEBT.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        f, k, n = line.split("\t")
        pins[(f, k)] = int(n)
    grew = [(k, pins.get(k, 0), v) for k, v in found.items() if v > pins.get(k, 0)]
    shrank = [(k, n, found.get(k, 0)) for k, n in pins.items() if found.get(k, 0) < n]
    if grew or shrank:
        print(f"{NAME}: FAIL -- {len(grew)} file(s) price a liquid property themselves beyond "
              f"their pin, {len(shrank)} pin(s) above what the file now holds.")
        for (f, k), pin, now in sorted(grew):
            print(f"  NEW     {f}: {k} {now} (pinned {pin}) -- ask liquidProperty::evaluate "
                  "(src/thermo/LiquidPropertyDoor.H), or tag the constant as a ConstantSource")
        for (f, k), pin, now in sorted(shrank):
            print(f"  PAID    {f}: {k} {now} (pinned {pin}) -- lower the pin in "
                  f"{DEBT.relative_to(ROOT)} in this commit")
        return 1
    by = {}
    for (f, k), v in found.items():
        by[k] = by.get(k, 0) + v
    print(f"{NAME}: OK -- {files} files of src/unitOperations and src/postProcessing hold "
          f"{sum(by.values())} raw liquid-property site(s) ("
          + ", ".join(f"{k} {by.get(k, 0)}" for k in CLASSES)
          + "), each within its pin; none new; the door review's "
          f"{len(FIXTURES)} probe lines all caught.  NOT CHECKED: a value built with no "
          "literal (a variable read under an unrelated key, a constant spelled otherwise "
          "in another header), a conversion line that names no volume or flow, thermo/ "
          "and propertyOps/; a kg/kmol conversion on a volume line is counted (pinned).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
