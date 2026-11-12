#!/usr/bin/env python3
"""Gate: no NEW unit or sizing pass prices a liquid property itself.

    bin/curate/check_liquid_property_ratchet.py

THE RULE (DEV.md 4c C378, rule 1; docs/architecture/settled-contracts.md,
"A UNIT NEVER PRICES A LIQUID PROPERTY ITSELF").  A unit asks the one door,
`liquidProperty::evaluate` (src/thermo/LiquidPropertyDoor.H), for a liquid
density, viscosity or surface tension; it does not read a component's
stored liquid volume (`.Vliq()`) and it does not write a density,
viscosity, surface tension or diffusivity as a literal.

THE DEBT.  Slice 0 found units that still do (the plan's inventory,
docs/design/thermophysical-slice0-plan.md section 1); converging them onto
the door MOVES NUMBERS and is the pilot's work, unit by unit.  Their sites
are pinned per file in bin/curate/liquid_property_ratchet_debt.tsv.  The
ratchet is TWO-SIDED: a file with more sites than its pin FAILS (a new raw
read or literal), and a file with fewer FAILS too, asking for its pin to be
lowered in the same commit -- a debt that is paid and not written down
would let the next site in for free.

WHAT IT COUNTS, in src/unitOperations and src/postProcessing (comments
excluded):
  vliq     `.Vliq()` -- a component's 25 C liquid molar volume read directly;
  literal  an identifier beginning rho/RHO/density/mu/sigma/D_solute/Dab
           assigned a NON-ZERO numeric literal, or a non-zero default of
           a lookup of rho, rho_feed, rho_diafiltrate, viscosity,
           liquidViscosity, surfaceTension, sigma or diffusivity.
A constant routed through a `ConstantSource` (core/PropertySourceLog.H) is
not a literal here: its value and its words are one object the table prints.

WHAT IT DOES NOT CHECK.  A raw number spelled another way (a literal with
another name, a computed constant); thermo/ (the kernel itself) and
propertyOps/ (the props bench reads records by design).  It is a ratchet
on the two spellings the inventory found, not a proof of the rule.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEBT = ROOT / "bin" / "curate" / "liquid_property_ratchet_debt.tsv"
NAME = "check_liquid_property_ratchet"
SCAN = [ROOT / "src" / "unitOperations", ROOT / "src" / "postProcessing"]
VLIQ = re.compile(r"\.Vliq\(\)")
LITERAL = re.compile(
    r"\b(rho|Rho|RHO|density|mu|sigma|D_solute|Dab)\w*\s*=\s*"
    r"([1-9][0-9.]*|0\.[0-9]*[1-9][0-9]*)([eE][+-]?[0-9]+)?\s*;"
    r"|\"(rho|rho_feed|rho_diafiltrate|viscosity|liquidViscosity|surfaceTension|sigma|diffusivity)\","
    r"\s*([1-9]|0\.[0-9]*[1-9])")
COMMENT = re.compile(r"^\s*(//|\*)")


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
                code = line.split("//")[0]
                n = len(VLIQ.findall(code))
                if n:
                    found[(rel, "vliq")] = found.get((rel, "vliq"), 0) + n
                if LITERAL.search(code):
                    found[(rel, "literal")] = found.get((rel, "literal"), 0) + 1
    return found, files


def main() -> int:
    found, files = count()
    if files < 100:
        print(f"{NAME}: FAIL -- only {files} source files under the scan roots; "
              "a collapsed scan cannot vouch for anything")
        return 1
    if "--write" in sys.argv[1:]:
        lines = ["# file\tkind\tcount -- the debt of check_liquid_property_ratchet (C378 slice 0);",
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
                  "(src/thermo/LiquidPropertyDoor.H) instead")
        for (f, k), pin, now in sorted(shrank):
            print(f"  PAID    {f}: {k} {now} (pinned {pin}) -- lower the pin in "
                  f"{DEBT.relative_to(ROOT)} in this commit")
        return 1
    total = sum(found.values())
    print(f"{NAME}: OK -- {files} files of src/unitOperations and src/postProcessing hold "
          f"{total} raw liquid-property site(s) ({sum(v for k, v in found.items() if k[1] == 'vliq')} "
          f"`.Vliq()` reads, {sum(v for k, v in found.items() if k[1] == 'literal')} literals), "
          f"each within its pin; none new.  NOT CHECKED: a raw number spelled another way, "
          f"thermo/ and propertyOps/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
