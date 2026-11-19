#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: no NEW unit or sizing pass prices a liquid property itself.

    bin/curate/check_liquid_property_ratchet.py            # check
    bin/curate/check_liquid_property_ratchet.py --write    # re-pin the debt (say why in the commit)

THE RULE (DEV.md 4c C378, rule 1; docs/architecture/settled-contracts.md,
"A UNIT NEVER PRICES A LIQUID PROPERTY ITSELF").  A unit asks the one door,
`liquidProperty::evaluate` (src/thermo/LiquidPropertyDoor.H); a constant it
keeps is a `ConstantSource` (core/PropertySourceLog.H) whose value and words
are one object the run prints.

SIX CLASSES are counted, per file of src/unitOperations and
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
  keyRead        a property word READ FROM A DICTIONARY by a unit (`found(`,
                 `lookup...(` of "viscosity", "diffusivity", "rho", "rho_feed",
                 "rho_diafiltrate", "mu_feed", "D_solute", "liquidViscosity",
                 "liquidDiffusivity", "liquidDensity", "density", "surfaceTension",
                 "sigma", "thermalConductivity"): the reader of a value TYPED IN THE
                 UNIT'S BLOCK (DEV.md 4c C402).  A family leaves this class when it
                 calls unitTypedProperties::refuse (src/unitOperations/
                 UnitTypedProperties.H); THE MEMBRANE FAMILY (src/unitOperations/
                 membrane/, batch/BatchDiafilter.cpp) holds ZERO, enforced below
                 whatever the pin file says;
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

DECLARED EXCEPTIONS (C421 slice E): a file whose SUBJECT is the property (the props
evaluator, a reference equation of state, the steam tables) or a dataset's own
experimental conditions (the membrane benches) reads records by design; it is listed in
DECLARED_EXCEPTIONS with its class and its reason, holds no pin, and a class not listed
for it still fails.

FALSE POSITIVES ARE EXEMPT, NOT PINNED (C402 rest, step 1): a kW <-> W or
kmol <-> mol conversion on a duty, a name that merely contains "mu" or "nu"
(`amountPerKmol`), a statistical weight `sigma = 1.0`, a relief accumulation
fraction, `PackingRBF.H`'s flooding gradient (Pa/m) and a few bounds are listed
in FALSE_POSITIVES with the reason of each; no probe line may match one.

WHAT IT CANNOT SEE, said here and in its claim: a density, viscosity or
surface tension built from an expression with a non-literal term and no
property name (a variable read from a dictionary under an unrelated key, a
constant from another header spelled otherwise); a brine density outside
997-1030 under a name that does not say sea, brine or saline; a conversion
line that names neither a volume nor a flow; a guard written as an
`if`/`else` rather than a ternary is COUNTED (none today).  thermo/ (the
kernel itself) is outside its roots; src/propertyOps IS inside them (C402):
the property layer and names that are not liquid properties are DECLARED
EXCEPTIONS with their reasons.  The three membrane benches (PoreTransportBench,
PolarisationIndex, FitParametersMembrane) no longer read a film `viscosity` /
`density` typed in an op: they ask the door and refuse typed ones (C435 (4),
paid).  What stays pinned there is FitParametersMembrane's one read of a typed
neutral-solute `diffusivity` (keyRead 1).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEBT = ROOT / "bin" / "curate" / "liquid_property_ratchet_debt.tsv"
NAME = "check_liquid_property_ratchet"
SCAN = [ROOT / "src" / "unitOperations", ROOT / "src" / "postProcessing", ROOT / "src" / "propertyOps"]   # propertyOps since C402 (MB-05): the bench readers of a typed viscosity / density are debt, counted
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
#  C398 slice (d), review row DG-06: the declared quantity asked of the package
#  directly (`diffusivityLiquidEffective(`), a Wilke-Chang constructed in any
#  form (`WilkeChang w(...)`, `WilkeChang w{...}`, `= WilkeChang(...)`), and a
#  liquid-diffusivity model built outside the package, are each a unit pricing
#  a liquid property itself.
DIRECT_OTHER = re.compile(
    r"(\.|->)(viscosityLiquid\(|surfaceTension\(|diffusivityLiquid\(|diffusivityLiquidEffective\("
    r"|thermalConductivityLiquid\()"
    r"|stokesEinstein::factor(For)?\(|\bWilkeChang\s+\w+\s*[({]|=\s*(std::make_unique<)?WilkeChang\s*[(>{]"
    r"|make_(unique|shared)<\s*(const\s+)?WilkeChang\s*>|\busing\s+\w+\s*=\s*(Choupo::)?WilkeChang\b"
    r"|\btypedef\s+(Choupo::)?WilkeChang\b|(\.|->)diffusivityLiquidBinary\s*\("
    r"|\bLiquidDiffusivityModel::New\s*\(")
DENSITY_CALL = re.compile(r"(\.|->)density\s*\(")
CLASSES = ("vliq", "direct", "phaseVariable", "literal", "keyRead", "conversion")
#  A property word read from a unit's dictionary (C402).  The membrane family
#  is migrated: it holds none, and a new one there fails whatever the pins say.
KEYREAD = re.compile(
    r"\b(found|lookup\w*)\s*\(\s*\"(viscosity|diffusivity|rho|rho_feed|rho_diafiltrate|mu_feed|D_solute"
    r"|liquidViscosity|liquidDiffusivity|liquidDensity|density|surfaceTension|sigma|thermalConductivity)\"")
ZERO_KEYREAD = ("src/unitOperations/membrane/", "src/unitOperations/batch/BatchDiafilter")
#  C402 (step 1): the detector's FALSE POSITIVES, each with its reason.  A line
#  that matches one of these is NOT counted in the class named; every pattern is
#  anchored on a name or a marker that cannot be a liquid property, and none of
#  them may catch one of the FIXTURES (the gate checks that too).
#  (class, regex on the code of the line, reason)
FALSE_POSITIVES = [
    ("conversion", re.compile(r"\b(H_(in|out|mid)|h_(in|out)|Cp_\w+|dHcryst\w*|UA\w*|T_jacket_?|sensibleJ"
                              r"|Q_?(kW|W)\b|Q\w*_(kW|W)\b|\w*KW\b|y\[n\])"),
     "a duty: kW <-> W or kmol <-> mol on an enthalpy, heat-capacity or UA product"),
    ("conversion", re.compile(r"\b(Q_cryst|Q_sensible)\b"),
     "a duty: crystallisation / sensible heat, kmol -> mol"),
    ("conversion", re.compile(r"\b(c_b|conc)\[\w+\]\s*\*\s*1\.0e3\s*/\s*rho|=\s*(c_b|conc)\[\w+\]"),
     "kmol/m3 -> mol/kg water; rho is the door's"),
    ("conversion", re.compile(r"\bW_kg_h\s*/\s*rd\.rho\s*\*\s*1000\.0\s*/\s*60\.0"),
     "m3 -> L and h -> min; rd.rho is the one door's phaseDensity"),
    ("conversion", re.compile(r"\bQw\s*=\s*std::abs\(Q_kW\)"),
     "a duty, kW -> W"),
    ("literal", re.compile(r"\bamountPerKmol\b"),
     "kmol -> mol factor; the name contains 'mu' (a-MU-nt)"),
    ("literal", re.compile(r"\bscalar\s+nu\s*=\s*1\.0\s*;"),
     "van't Hoff factor, a count, not a kinematic viscosity"),
    ("literal", re.compile(r"\baccumulation\w*\s*=|\bdPflood\s*="),
     "a relief accumulation fraction / psi limit; a flooding gradient in Pa/m"),
    ("literal", re.compile(r"\boperatorAnnualHours\b|\biHi\s*=\s*1000\.0"),
     "operator hours per year; an upper bound of a root scan"),
    ("literal", re.compile(r"\bso\.upper\s*="),
     "an upper bound (a temperature) for a root search"),
    ("literal", re.compile(r"\bf\s*=\s*1000\.0\s*;"),
     "the kJ -> J factor of a unit-string parser"),
    ("literal", re.compile(r"\bsigma\s*=\s*1\.0\s*;"),
     "a statistical weight (fit residual), not a surface tension"),
    ("conversion", re.compile(r'kp\(""\)\s*\*\s*1000\.0\s*\*\s*kp\(""\)'),
     "kmol/s -> mol/s times the pump's own published molar volume, which is the pump's door density (C421 slice E)"),
    ("literal", re.compile(r"\bwaterRefDensity\s*=\s*999\.0107539518483"),
     "the reference density of API 520's specific gravity (water, the standard's own datum): a definition inside a"
     " formula, not the process liquid's property; the value is the one the open `fluids` implementation takes (the"
     " standard itself was not read), and the header says so (C421 slice E)"),
    ("literal", re.compile(r"\bc\.rho\s*=\s*1\.0;\s*c\.mu\s*=\s*1\.0"),
     "dimensionless Re-Pr grid: properties normalised to 1"),
    ("literal", re.compile(r"\bmu_l\s*=\s*279\.0e-6\b|\brho_v\s*=\s*0\.5956\b"),
     "C421 door slice A: Rohsenow::verify() reproduces Incropera & DeWitt's worked example with the TEXTBOOK's"
     " saturated-water table values (A.6, 100 C: 279e-6, 957.9, 0.5956, 58.9e-3, 4217): the inputs of a published"
     " anchor, not a package's liquid; the package's water would test the package, not the formula"),
]
#  C421: a keyRead site that must stay, declared with its reason (a statement-level exemption).
KEYREAD_EXEMPT = [
    (re.compile(r"\bf\.rho\s*=\s*d->lookupScalar\(\s*\"rho\""),
     "C421 door slice A: bellDelaware::readFluid() is read ONLY by the props bench (BellDelawareBench, which reproduces"
     " Hewitt, Shires & Bott Example 6.2 and Serth Example 6.1 from the BOOK's own fluid properties: the case header says"
     " 'the bench is the textbook's inputs, not a package's'); the unit (HeatExchanger) reads readSpec only and takes its"
     " fluid from the streams through the door"),
]
#  C421 door slice E (the property layer and the bench tools): a FILE whose SUBJECT is
#  the property or the stored datum itself reads records, or a typed experimental
#  condition, BY DESIGN.  Each is a declared exception, with the class it covers and
#  the reason; it is NOT pinned debt, and a new class in one of these files still
#  fails.  (file, class) -> reason.
DECLARED_EXCEPTIONS = {
    ("src/propertyOps/PropertyEvaluator.cpp", "direct"):
        "the props bench's evaluator IS the property layer: it asks the package for each property the case names"
        " at the scan state, to print what the package answers (a unit would ask the door)",
    ("src/propertyOps/PropertyPoint.cpp", "direct"):
        "propertyPoint reports the package's own surface tension at a state: the property layer, not a consumer",
    ("src/propertyOps/ReferenceEoSOp.cpp", "keyRead"):
        "`rho` is the independent variable of a reference equation of state (T, rho), not a liquid property typed in a unit",
    ("src/propertyOps/ReferenceEoSOp.cpp", "phaseVariable"):
        "the reference fluid's own density(T, p, branch): the subject of the op is the reference equation of state",
    ("src/propertyOps/SteamTables.cpp", "keyRead"):
        "`rho` is the independent variable of IAPWS-IF97 region 3 (T, rho): a state, not a typed liquid property",
    ("src/propertyOps/LleResidual.cpp", "keyRead"):
        "`sigma` is a mole-fraction weight of a fit residual, not a surface tension",
    ("src/propertyOps/DataReconciliation.cpp", "keyRead"):
        "`sigma` is a measurement's standard deviation, not a surface tension",
    ("src/propertyOps/EstimateComponent.cpp", "keyRead"):
        "`density` is the reference value a group-contribution estimate is compared with (the estimator's subject), not a unit input",
    ("src/propertyOps/ThielePellet.cpp", "keyRead"):
        "`thermalConductivity` is the catalyst pellet's (a solid), not a liquid",
}
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
    #  C398 slice (d), DG-06
    "st.DL = thermo.diffusivityLiquidEffective(p.T, x);",
    "const WilkeChang wc{nullptr};",
    "auto wc = WilkeChang(nullptr);",
    "auto m = LiquidDiffusivityModel::New(d);",
    #  review row DG-14
    "return std::make_unique<WilkeChang>(nullptr);",
    "using WC = WilkeChang;",
    "const scalar d = model->diffusivityLiquidBinary(a, b, T, mu);",
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
    #  C402: a property word read from the unit's own block (the membrane family's old readers)
    "if (b->found(\"viscosity\")) { mu_feed = b->lookupScalar(\"viscosity\"); }",
    "if (mt->found(\"diffusivity\")) { D = mt->lookupScalar(\"diffusivity\"); }",
    "const scalar rho = opDict->lookupScalarOrDefault(\"rho_feed\", r0);",
    "rho_ = op->lookupScalar(\"rho\", Dims::density);",
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
            if any(fk == k and frx.search(subject) for fk, frx, _ in FALSE_POSITIVES):
                continue
            n = len(rx.findall(subject)) if k == "vliq" else (1 if rx.search(subject) else 0)
            if n:
                hits[k] = hits.get(k, 0) + n
    for stmt in " ".join(lines).split(";"):
        n = len(DIRECT_OTHER.findall(stmt))
        d, v = density_calls(stmt)
        kr = len(KEYREAD.findall(stmt))
        if kr and any(rx.search(stmt) for rx, _ in KEYREAD_EXEMPT):
            kr = 0
        if kr:
            hits["keyRead"] = hits.get("keyRead", 0) + kr
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
                if (rel, k) in DECLARED_EXCEPTIONS:
                    continue
                found[(rel, k)] = found.get((rel, k), 0) + n
    return found, files


def main() -> int:
    swallowed = [f for f in FIXTURES for fk, frx, _ in FALSE_POSITIVES
                 if frx.search(f.replace("\\n", "\n"))]
    if swallowed:
        print(f"{NAME}: FAIL -- a false-positive exemption swallows a probe line:")
        for f in swallowed:
            print(f"  SWALLOWED  {f}")
        return 1
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
    zero = [(k, v) for k, v in found.items()
            if k[1] == "keyRead" and k[0].startswith(ZERO_KEYREAD)]
    if zero:
        print(f"{NAME}: FAIL -- the membrane family reads a property word from a unit block again:")
        for (f, k), v in sorted(zero):
            print(f"  ZERO    {f}: keyRead {v} -- a membrane unit asks the package through the door "
                  "(liquidProperty::density / evaluate / soluteDiffusivity); a typed value is refused by "
                  "unitTypedProperties::refuse")
        return 1
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
          "thermo/ and propertyOps/; a duty line that carries none of the exempt markers is counted although false (none today); the exemptions are listed in FALSE_POSITIVES; a phase-variable density call guarded by if/else rather than a ternary would "
          "be counted too (none today).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
