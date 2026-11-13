#!/usr/bin/env python3
"""Gate: no NEW unit or sizing pass prices a liquid property itself.

    bin/curate/check_liquid_property_ratchet.py            # check
    bin/curate/check_liquid_property_ratchet.py --write    # re-pin the debt (say why in the commit)

THE RULE (DEV.md 4c C378, rule 1; docs/architecture/settled-contracts.md,
"A UNIT NEVER PRICES A LIQUID PROPERTY ITSELF").  A unit asks the one door,
`liquidProperty::evaluate` (src/thermo/LiquidPropertyDoor.H); a constant it
keeps is a `ConstantSource` (core/PropertySourceLog.H) whose value and words
are one object the run prints.

FIVE CLASSES are counted, per file of src/unitOperations and
src/postProcessing (block comments, comment lines and `//` tails excluded):
  vliq           a component's stored 25 C liquid volume read directly
                 (`.Vliq()` or `->Vliq()`);
  direct         a liquid property asked of the package without the door
                 (`viscosityLiquid(`, `surfaceTension(`, `diffusivityLiquid(`,
                 `thermalConductivityLiquid(`, `stokesEinstein::factor[For](`,
                 an own `WilkeChang` instance, and a `density(` call whose
                 LAST argument is `<anything>::Liquid` -- so an alias of the
                 enum is the same site);
  phaseVariable  a package `density(` call whose last argument is neither
                 `<...>::Liquid` nor `<...>::Vapour` (a phase VARIABLE, or a
                 function of the state), EXCEPT where the call is the false
                 branch of a ternary that tests that same variable
                 `== <...>::Liquid` in the same statement -- the guard idiom
                 of every multiphase site (the liquid branch asks the door,
                 so the variable is not Liquid where the package is asked).
                 A regex cannot know a variable's value; this rule counts
                 every call it cannot PROVE is not a liquid density;
  literal        a liquid-property number written in the code: a non-zero
                 literal given to a name that says density, viscosity,
                 surface tension or diffusivity (by `=`, `{}`, `( )` or in a
                 comma list), such a name set to a constant EXPRESSION of
                 literals only (`1.0e-3 / 1000.0`, `1.0 * std::pow(10.0,
                 -6)`), a non-zero default of a lookup whose key says so, a
                 water- or seawater-like density literal (997 to 1030) given
                 to ANY name or used as a ternary fall-back, a literal of
                 1000 to 1299 given to a sea/brine/saline name, a kinematic
                 `nu` of 1e-6;
  conversion     a bare `/ 1000`, `* 1000` or `1.0e3` on a line that makes a
                 volume or a volumetric flow (`Q... =`, `volume`, `m3`,
                 `/ rho`, judged with string literals blanked) -- where a
                 1000 kg/m3 density may hide as a unit conversion.
`vliq`, `literal` and `conversion` are judged line by line; `direct` and
`phaseVariable` per STATEMENT (the code joined up to each `;`), because a
call may be split over lines.
The debt that exists is pinned in bin/curate/liquid_property_ratchet_debt.tsv
per (file, class); the ratchet is TWO-SIDED (a new site fails; a paid one
asks for its pin to be lowered in the same commit).

ITS OWN FIXTURES.  The eighteen probe lines of the door review
(docs/reviews/2026-11-13-c378-door-review/ratchet_probe.tsv) and nine of the
ten of the re-review (docs/reviews/2026-11-13-c378-door-rereview/
ratchet_probe_new.tsv, DX-02: all but the constant from another header,
which is NOT CHECKED) are classified on every run, and the gate FAILS if any
of them is not caught: a hole a review found cannot reopen silently.

FALSE POSITIVES PINNED AS DEBT, said here and in the claim: a kg/kmol ->
kg/mol or kmol -> mol conversion on a volume line (`/ rho`) is counted, and
`PackingRBF.H`'s flooding gradient `dPflood = 1025.0` (Pa/m) is counted as a
seawater-like literal.

WHAT IT CANNOT SEE, said here and in its claim: a density, viscosity or
surface tension built from an expression with a non-literal term and no
property name (a variable read from a dictionary under an unrelated key, a
constant from another header spelled otherwise); a brine density outside
997-1030 under a name that does not say sea, brine or saline; a conversion
line that names neither a volume nor a flow; a guard written as an
`if`/`else` rather than a ternary is COUNTED (none today).  thermo/ (the
kernel itself) and propertyOps/ (the props bench reads records by design)
are outside its roots.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEBT = ROOT / "bin" / "curate" / "liquid_property_ratchet_debt.tsv"
NAME = "check_liquid_property_ratchet"
SCAN = [ROOT / "src" / "unitOperations", ROOT / "src" / "postProcessing"]
#  A positive literal, and a property-like NAME (the left-hand side).
LIT = r"([1-9][0-9.]*|0\.[0-9]*[1-9][0-9]*)([eE][+-]?[0-9]+)?"
PNAME = (r"\b\w*(rho|Rho|RHO|density|Density|[Kk]gPerM3|visc|Visc|sigma|Sigma|surfaceTension"
         r"|nu_?\w*|mu_?\w*|muL|muG|D_solute|Dab|kinematic)\w*")
#  Water- and seawater-like densities, given to ANY name (997 .. 1030 kg/m3).
WATERLIKE = r"(99[789]|10[0-2][0-9]|1030)(\.[0-9]*)?"
#  The classes judged LINE BY LINE.
LINE_CLASSES = {
    "vliq": re.compile(r"(\.|->)Vliq\(\)"),
    "literal": re.compile(
        PNAME + r"\s*(=|\{)\s*" + LIT + r"\s*[;},]"
        r"|" + PNAME + r"\s*\(\s*" + LIT + r"\s*\)\s*[;,){]"
        + r"|" + PNAME + r"\s*=\s*(?=[^;]*[1-9])([-+*/(). \t0-9eE,]|std::pow)+;"
        r"|\"(\w*(rho|density|Density|visc|Visc|sigma|surfaceTension|diffusivity|Diffusivity)\w*)\","
        r"\s*([1-9]|0\.[0-9]*[1-9])"
        r"|[?:]\s*" + WATERLIKE + r"\s*[;),]"
        r"|\b\w+\s*(=|\{)\s*" + WATERLIKE + r"\s*[;}]"
        r"|\b(scalar|double|float|auto)\s+\w+\s*\(\s*" + WATERLIKE + r"\s*\)\s*[;,]"
        r"|\b\w*([Ss]ea|[Bb]rine|[Ss]aline)\w*\s*(=|\{|\()\s*1[0-2][0-9][0-9](\.[0-9]*)?\s*[;})]"
        r"|\b\w*nu\w*\s*(=|\{)\s*1(\.0*)?e-0?6\b"),
    "conversion": re.compile(
        r"^(?=.*[*/]\s*(1000(\.0*)?|1(\.0*)?[eE]\+?0*3)\b(?![.0-9eE]))"
        r"(?=.*(\bQ\w*\s*=|[Vv]olume|m3\b|/\s*rho))"),
}
#  The class judged per STATEMENT (lines joined up to the `;`), because a
#  call may be split over lines.  The density call is judged by its LAST
#  argument (see `density_calls`).
DIRECT_OTHER = re.compile(
    r"(\.|->)(viscosityLiquid\(|surfaceTension\(|diffusivityLiquid\(|thermalConductivityLiquid\()"
    r"|stokesEinstein::factor(For)?\(|\bWilkeChang\s+\w+\s*\(")
DENSITY_CALL = re.compile(r"(\.|->)density\s*\(")
CLASSES = ("vliq", "direct", "phaseVariable", "literal", "conversion")
COMMENT = re.compile(r"^\s*(//|\*)")
STRING = re.compile(r'"(\\.|[^"\\])*"')
#  The door review's eighteen probe lines and the re-review's nine caught
#  ones (docs/reviews/2026-11-13-c378-door-rereview/ratchet_probe_new.tsv,
#  all but n05, which is NOT CHECKED below), every one of which must be
#  caught.  A "\n" is a line break: the scan is per statement.
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
    #  the re-review (DX-02)
    "const scalar rho_w(1000.0);",
    "const scalar nu = 1.0 * std::pow(10.0, -6);",
    "const scalar Qv = mdot / 1.0e3;",
    "const scalar r = pkg.density(T, P, x, DP::Liquid);",
    "const scalar seawater = 1025.0;",
    "auto rhoOf = [&](scalar t) { return thermo.density(t, P, x, DensityPhase::Liquid); };",
    "const scalar nu = 1.0e-3 / 1000.0;",
    "const scalar r = pkg.density(T, P, x,\n                               DensityPhase::Liquid);",
    "const DensityPhase ph = DensityPhase::Liquid;\n    const scalar rho = thermo.density(T, P, x, ph);",
]


def call_args(text, open_paren):
    """The top-level arguments of the call whose `(` is at `open_paren`,
    and the index just past its `)` (None if the statement ends first)."""
    depth, args, cur = 0, [], []
    for i in range(open_paren, len(text)):
        c = text[i]
        if c in "([{":
            depth += 1
            if depth == 1:
                continue
        elif c in ")]}":
            depth -= 1
            if depth == 0:
                args.append("".join(cur).strip())
                return args, i + 1
        elif c == "," and depth == 1:
            args.append("".join(cur).strip())
            cur = []
            continue
        cur.append(c)
    return None, None


def ternary_colon(text, q):
    """The `:` that closes the ternary whose `?` is at `q` (not a `::`)."""
    depth = 0
    i = q + 1
    while i < len(text):
        c = text[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
            if depth < 0:
                return None
        elif c == ":" and depth == 0:
            if text[i:i + 2] == "::" or text[i - 1] == ":":
                i += 2 if text[i:i + 2] == "::" else 1
                continue
            return i
        i += 1
    return None


def guarded(stmt, var, at):
    """True when the call at `at` is the FALSE branch of a ternary that tests
    `var == <...>::Liquid` -- the guard idiom of every multiphase site: the
    liquid branch asks the door, so the variable is not Liquid here."""
    for m in re.finditer(r"\b" + re.escape(var) + r"\s*==\s*(\w+::)*Liquid\s*\?", stmt):
        if m.end() > at:
            continue
        colon = ternary_colon(stmt, m.end() - 1)
        if colon is not None and colon < at:
            return True
    return False


def density_calls(stmt):
    """Classify every package `density(` call of a statement by its LAST
    argument: a literal `<...>::Liquid` is `direct`; a literal
    `<...>::Vapour` is not counted; anything else (a phase VARIABLE, a
    function of the state) is `phaseVariable`, unless the call sits in the
    false branch of a ternary that tests that variable against Liquid."""
    direct = phase_var = 0
    for m in DENSITY_CALL.finditer(stmt):
        args, _ = call_args(stmt, m.end() - 1)
        if not args:
            continue
        last = args[-1]
        if re.fullmatch(r"(\w+::)*Vapour", last):
            continue
        if re.fullmatch(r"(\w+::)*Liquid", last):
            direct += 1
        elif not (re.fullmatch(r"\w+", last) and guarded(stmt, last, m.start())):
            phase_var += 1
    return direct, phase_var


BLOCK = re.compile(r"/\*.*?\*/", re.S)


def code_lines(text):
    """The code of each line: block comments blanked (their line breaks
    kept), comment lines and `//` tails removed."""
    text = BLOCK.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    for line in text.splitlines():
        if COMMENT.match(line):
            yield ""
        else:
            yield line.split("//")[0]


def classify(text):
    """Counts per class over a source TEXT (a file, or a fixture)."""
    hits = {}
    lines = list(code_lines(text))
    for code in lines:
        for k, rx in LINE_CLASSES.items():
            subject = STRING.sub('""', code) if k == "conversion" else code
            n = len(rx.findall(subject)) if k == "vliq" else (1 if rx.search(subject) else 0)
            if n:
                hits[k] = hits.get(k, 0) + n
    for stmt in " ".join(lines).split(";"):
        n = len(DIRECT_OTHER.findall(stmt))
        d, v = density_calls(stmt)
        if n + d:
            hits["direct"] = hits.get("direct", 0) + n + d
        if v:
            hits["phaseVariable"] = hits.get("phaseVariable", 0) + v
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
            for k, n in classify(p.read_text(errors="replace")).items():
                found[(rel, k)] = found.get((rel, k), 0) + n
    return found, files


def main() -> int:
    missed = [f for f in FIXTURES if not classify(f.replace("\\n", "\n"))]
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
          + "), each within its pin; none new; the two door reviews' "
          f"{len(FIXTURES)} probe lines all caught (direct and phaseVariable per "
          "statement).  NOT CHECKED: a value built from a non-literal term under a name "
          "that says no property (a variable read under an unrelated key, a constant "
          "spelled otherwise in another header), a brine density outside 997-1030 under "
          "a name that says no sea/brine, a conversion line that names no volume or flow, "
          "thermo/ and propertyOps/; counted and pinned although false: a kg/kmol or "
          "kmol/mol conversion on a volume line and PackingRBF.H's dPflood 1025 Pa/m; "
          "a phase-variable density call guarded by if/else rather than a ternary would "
          "be counted too (none today).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
