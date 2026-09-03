#!/usr/bin/env python3
"""D2 closed-migration wave: typed equilibrium-parameterisation identity on
the parameters/Henry/ pair records (ADR docs/design/equilibrium-
parameterisation-identity.md, ratified 2026-07-26; wave approved by Vitor
2026-07-26 with the fail-closed conditions implemented here).

WHAT IT DOES.  Adds the typed identity (gasSpecies / dissolvedSpecies /
convention -- `solvent` is already a first-class field) to every Henry pair
record.  IDENTITY ONLY: no coefficient, no domain, no comment of the
original record is touched.

WHAT IT REFUSES (fail closed -- the ratified conditions):
  * derivation is MECHANICAL only where the correspondence is unambiguous
    from existing fields: a solute with no aqueous-speciation fact, no
    typed ion bridge, and no membership in the chemistry/ gas-liquid
    network is, by the record's own semantic (physical molecular
    solubility), gasSpecies = dissolvedSpecies = solute;
  * a solute participating in a REACTIVE aqueous network must appear in
    the EXPLICIT exception table below (hand-curated mapping + reason) --
    the script never picks a species by name/element/formula similarity;
  * a solute with known acid/base/hydrolysis character (SO2, HCl, volatile
    acids, amines, ...) is on the explicit WATCHLIST: still the molecular
    physical-solubility identity, but routed through the table so the
    decision is visible, reviewable curation -- never a silent default;
  * unexpected fields, a missing solute/solvent, or an EXISTING identity
    that disagrees with the derived one abort the whole wave (nothing is
    written when any file refuses).

MODES.
  (default)   derive everything; if zero refusals, write; else exit 1.
  --dry-run   derive + print the full per-file plan; never write.
  --check     conformance gate: exit 1 listing any record still lacking
              the typed identity (wired into runTests via
              check_legacy_schema.py).

Deterministic: files processed in sorted order; output is a pure function
of the tree.  Idempotent: an already-conformant file is never rewritten.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HENRY = ROOT / "data" / "standards" / "parameters" / "Henry"
COMPONENTS = ROOT / "data" / "standards" / "components"
CHEMISTRY = ROOT / "data" / "standards" / "chemistry"

CONVENTION = "Sander-Hxp-v1"

# Keys a plain Henry pair record may carry (anything else refuses).
EXPECTED_KEYS = {"solute", "solvent", "model", "H_ref", "T_ref",
                 "enthalpy", "Trange"}
IDENTITY_KEYS = {"gasSpecies", "dissolvedSpecies", "convention"}

# ---------------------------------------------------------------------------
# EXPLICIT EXCEPTION TABLES -- hand-curated, each entry a reviewed decision.
# The mapping for ALL of these is the molecular physical-solubility identity
# (gasSpecies = dissolvedSpecies = solute): what the table adds is the
# VISIBLE reason and the guarantee that no reactive solute slipped through
# the mechanical path.

# Solutes whose dissolved form participates in the corpus's reactive aqueous
# network (component `aqueousSpeciation <set>` + typed bridge).  The Henry
# pair is the PHYSICAL molecular-solubility record; the network's own
# gas-liquid record is an independent parameterisation.
NETWORK_PARTICIPANTS = {
    "CO2": "reactive aqueous speciation (carbonate); pair = physical"
           " molecular solubility; network home chemistry/CO2-dissolution.dat"
           " (same physical family -> cross-convention diagnostic)",
    "NH3": "reactive aqueous speciation (ammonia); pair = physical molecular"
           " solubility; network home chemistry/NH3-dissolution.dat"
           " (same physical family -> cross-convention diagnostic)",
    "H2S": "reactive aqueous speciation (sulfide); pair = physical molecular"
           " solubility; network record chemistry/H2S-dissolution.dat"
           " dissolves COMPOSITE 'H+ + HS-' (Henry+Ka1 fused): a DIFFERENT"
           " family -- no direct cross-convention comparison",
    "aceticAcid": "reactive aqueous speciation (aceticAcid); pair = physical"
           " molecular solubility (dilute limit); network home"
           " chemistry/aceticAcid-dissolution.dat (gas key C2H4O2 per the"
           " gasOf formula contract)",
    # Nonionising dissolved gases the PHREEQC network ALSO prices (their
    # chemistry/ record dissolves the same molecular species): the pair and
    # the network record are two parameterisations of ONE family -> the
    # cross-convention diagnostic compares them.
    "CH4": "nonionising dissolved gas (aqueousSpeciation none); independent"
           " PHREEQC parameterisation chemistry/CH4-dissolution.dat"
           " (same physical family -> cross-convention diagnostic)",
    "H2":  "nonionising dissolved gas (aqueousSpeciation none); independent"
           " PHREEQC parameterisation chemistry/H2-dissolution.dat"
           " (same physical family -> cross-convention diagnostic)",
    "N2":  "nonionising dissolved gas (aqueousSpeciation none); independent"
           " PHREEQC parameterisation chemistry/N2-dissolution.dat"
           " (same physical family -> cross-convention diagnostic)",
    "O2":  "nonionising dissolved gas (aqueousSpeciation none); independent"
           " PHREEQC parameterisation chemistry/O2-dissolution.dat"
           " (same physical family -> cross-convention diagnostic)",
}

# Known acid/base/hydrolysis character WITHOUT a corpus network: the pair is
# still the molecular physical solubility (Sander's own convention), but the
# derivation must be an explicit, reviewable decision -- Vitor's condition.
_WATCH_REASONS = {
    "SO2":  "hydrolyses to bisulfite above ~1 mol%% (record's own caveat);"
            " no sulfite network in the corpus -- physical molecular"
            " solubility, dilute limit",
    "HCl":  "strong acid, fully ionises in water; H below is the molecular"
            " (physical) limit; no chloride-ionisation gas record in corpus",
    "HCN":  "weak acid (pKa 9.2); no cyanide network in corpus",
    "HCHO": "hydrates to methylene glycol; no hydration network in corpus",
    "Cl2":  "hydrolyses/disproportionates; no chlorine network in corpus",
    "NO2":  "disproportionates in water; no nitrite/nitrate network in corpus",
    "HO2":  "weak radical acid; no network in corpus",
}
_VOLATILE_ACIDS = ("formicAcid", "valericAcid", "caproicAcid", "benzoicAcid")
_WEAK_ACIDS = ("phenol", "oCresol", "mCresol", "pCresol", "guaiacol",
               "ethanethiol", "methanethiol", "onePropanethiol")
_AMINES = ("methylamine", "dimethylamine", "ethylamine", "diethylamine",
           "cyclohexylamine", "aniline", "ethylenediamine", "morpholine",
           "piperazine", "piperidine", "pyridine", "pyrrolidine",
           "quinoline", "twoPicoline")
WATCHLIST = dict(_WATCH_REASONS)
for s in _VOLATILE_ACIDS:
    WATCHLIST[s] = ("volatile carboxylic acid; no ionisation network in"
                    " corpus -- physical molecular solubility, dilute limit")
for s in _WEAK_ACIDS:
    WATCHLIST[s] = ("weak acid; no ionisation network in corpus -- physical"
                    " molecular solubility, dilute limit")
for s in _AMINES:
    WATCHLIST[s] = ("volatile amine (weak base); no protonation network in"
                    " corpus -- physical molecular solubility, dilute limit")

# Per-(solute, solvent) exceptions: the two Krichevsky-Kasarnovsky /
# -Ilinskaya records of the ammonia loop.  Same H_xp standard-state
# convention (p_i = H x_i, ideal gas, van't Hoff anchor); v_inf / margulesA
# are MODEL extensions (Poynting + unsymmetric gamma), not a convention
# change -- so they carry the same profile, with the extra keys allowed.
KI_PAIRS = {
    ("H2", "NH3"): "Krichevsky-Kasarnovsky/Ilinskaya extensions (v_inf,"
                   " margulesA) within the same H_xp convention; solvent NH3"
                   " (the profile is a convention, not a solvent pin)",
    ("N2", "NH3"): "Krichevsky-Kasarnovsky/Ilinskaya extensions (v_inf,"
                   " margulesA) within the same H_xp convention; solvent NH3",
}
KI_EXTRA_KEYS = {"v_inf", "margulesA"}

IDENTITY_COMMENT = (
    "// Equilibrium-parameterisation identity (ADR 2026-07-26, D2 migration"
    " wave):\n"
    "// typed physical family + versioned convention profile.  Identity"
    " only --\n"
    "// no coefficient or domain touched.\n")


def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//.*$', '', t, flags=re.M)


def top_keys(stripped):
    return {m.group(1)
            for m in re.finditer(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s+[^;{]*;',
                                 stripped, re.M)}


def component_facts(name):
    """(aqueousSpeciation value or None, has typed bridge, formula or None)"""
    f = COMPONENTS / (name + ".dat")
    if not f.exists():
        return None, False, None
    t = strip(f.read_text())
    m = re.search(r'\baqueousSpeciation\s+(\S+)\s*;', t)
    fm = re.search(r'\bformula\s+(\S+)\s*;', t)
    bridged = bool(re.search(r'\baqueousMapping\b|\bdissociatesTo\b', t))
    return (m.group(1) if m else None), bridged, (fm.group(1) if fm else None)


def chemistry_gas_keys():
    keys = set()
    if CHEMISTRY.is_dir():
        for p in CHEMISTRY.glob("*.dat"):
            t = p.read_text()
            if "recordType gasLiquidEquilibrium;" not in t:
                continue
            t = strip(t)
            for pat in (r'\bgasSpecies\s+(\S+)\s*;', r'\bgas\s+(\S+)\s*;'):
                m = re.search(pat, t)
                if m:
                    keys.add(m.group(1).rstrip(';'))
    return keys


def unnamed_gas_keys(gas_keys):
    """Gas keys that no component record answers to by NAME.

    A chemistry record may name its gas species by formula (`gasSpecies
    C2H4O2;`).  Nothing resolves that to a component -- and nothing should,
    because a formula does not identify a substance.  So it is ANNOUNCED: a
    key listed here is one whose Henry pairs must be covered by an explicit
    NETWORK_PARTICIPANTS entry, and a new one appearing is a curator's cue.
    """
    if not COMPONENTS.is_dir():
        return sorted(gas_keys)
    names = {p.stem for p in COMPONENTS.glob("*.dat")}
    return sorted(k for k in gas_keys if k not in names)


def derive(path, gas_keys):
    """Return dict(plan) or raise ValueError with the refusal reason."""
    raw = path.read_text()
    t = strip(raw)
    keys = top_keys(t)
    sol = re.search(r'^\s*solute\s+(\S+)\s*;', t, re.M)
    svt = re.search(r'^\s*solvent\s+(\S+)\s*;', t, re.M)
    if not sol or not svt:
        raise ValueError("missing required `solute` or `solvent` field")
    solute, solvent = sol.group(1), svt.group(1)

    ki = (solute, solvent) in KI_PAIRS
    allowed = EXPECTED_KEYS | IDENTITY_KEYS | (KI_EXTRA_KEYS if ki else set())
    unexpected = keys - allowed
    if unexpected:
        raise ValueError(f"unexpected fields {sorted(unexpected)} -- refuse"
                         f" (human curation)")

    spec, bridged, formula = component_facts(solute)
    reactive = (spec is not None and spec != "none") or bridged
    #  NETWORK MEMBERSHIP IS TESTED BY NAME, NEVER BY FORMULA.
    #
    #  This line used to read `solute in gas_keys or (formula and formula in
    #  gas_keys)`, and the formula half is IDENTITY BY A NON-IDENTIFYING
    #  ATTRIBUTE -- the F2 contract's ban on name identity, in another
    #  spelling.  Isomers share a formula: `aceticAcid-dissolution.dat`
    #  declares `gasSpecies C2H4O2;`, and on 2026-09-03 the `formula` backfill
    #  gave `methylFormate.dat` its own `formula C2H4O2;` -- so the tool
    #  concluded that methyl formate takes part in the acetic-acid chemistry
    #  network and REFUSED its Henry pair, red on every suite run.
    #
    #  Measured before removing it: over all 205 pairs the formula route
    #  resolved exactly TWO solutes that the name route did not, and one of
    #  them (`aceticAcid`) is in NETWORK_PARTICIPANTS, which is tested FIRST.
    #  Its whole live effect was the one wrong answer.  The safety net for a
    #  network gas named by formula is the exception table, and `unnamed_gas_
    #  keys` below announces any gas key no component answers to by name so a
    #  curator can add one.
    in_network = solute in gas_keys

    if ki:
        derivation = "explicit exception: " + KI_PAIRS[(solute, solvent)]
    elif solute in NETWORK_PARTICIPANTS:
        derivation = "explicit exception: " + NETWORK_PARTICIPANTS[solute]
    elif reactive or in_network:
        raise ValueError(
            "automatic derivation refused\n"
            "        reason: reactive aqueous speciation / chemistry-network"
            " membership\n"
            "        required: explicit gas/dissolved mapping in the"
            " exception table")
    elif solute in WATCHLIST:
        derivation = "explicit watchlist entry: " + WATCHLIST[solute]
    else:
        derivation = "direct molecular identity"

    # Existing identity: verify agreement (idempotence + fail-closed).
    have = {k: re.search(rf'^\s*{k}\s+(\S+)\s*;', t, re.M)
            for k in IDENTITY_KEYS}
    present = {k: m.group(1) for k, m in have.items() if m}
    want = {"gasSpecies": solute, "dissolvedSpecies": solute,
            "convention": CONVENTION}
    if present:
        if set(present) != IDENTITY_KEYS:
            raise ValueError(f"partial identity {sorted(present)} -- refuse")
        diff = {k: (present[k], want[k]) for k in IDENTITY_KEYS
                if present[k] != want[k]}
        if diff:
            raise ValueError(f"existing identity disagrees with derivation:"
                             f" {diff} -- refuse (human curation)")
        status = "conformant"
    else:
        status = "pending"

    return dict(name=path.stem, path=path, raw=raw, solute=solute,
                solvent=solvent, derivation=derivation, status=status)


def plan_block(p):
    lines = [f"{p['name']}:",
             f"    solute field        {p['solute']}",
             f"    gasSpecies          {p['solute']}",
             f"    dissolvedSpecies    {p['solute']}",
             f"    solvent             {p['solvent']}",
             f"    convention          {CONVENTION}",
             f"    derivation          {p['derivation']}"]
    if p["status"] == "conformant":
        lines.append("    status              already conformant (no write)")
    return "\n".join(lines)


def write_identity(p):
    raw = p["raw"]
    m = re.search(r'^([ \t]*solvent[ \t]+\S+[ \t]*;[^\n]*\n)', raw, re.M)
    if not m:
        raise ValueError("cannot locate the solvent line to anchor the"
                         " identity block")
    block = ("\n" + IDENTITY_COMMENT
             + f"gasSpecies        {p['solute']};\n"
             + f"dissolvedSpecies  {p['solute']};\n"
             + f"convention        {CONVENTION};\n")
    out = raw[:m.end()] + block + raw[m.end():]
    p["path"].write_text(out)


def main():
    mode = "migrate"
    if "--dry-run" in sys.argv:
        mode = "dry-run"
    if "--check" in sys.argv:
        mode = "check"

    files = sorted(HENRY.glob("*.dat"))
    gas_keys = chemistry_gas_keys()

    plans, refused = [], []
    for f in files:
        try:
            plans.append(derive(f, gas_keys))
        except ValueError as e:
            refused.append((f.stem, str(e)))

    if mode == "check":
        pending = [p["name"] for p in plans if p["status"] == "pending"]
        for name, why in refused:
            print(f"REFUSED {name}: {why.splitlines()[0]}")
        for name in pending:
            print(f"PENDING {name}: typed identity absent")
        if refused or pending:
            print(f"henry-identity check FAILED: {len(pending)} pending,"
                  f" {len(refused)} refused of {len(files)}")
            return 1
        #  A gas key no component answers to by NAME is announced, never used
        #  to resolve identity.  It says which network members can only be
        #  reached through the exception table.
        unnamed = unnamed_gas_keys(gas_keys)
        note = ("" if not unnamed else
                "; %d chemistry gas key(s) name no component (%s) -- their"
                " Henry pairs are covered by the NETWORK_PARTICIPANTS table,"
                " never by formula match"
                % (len(unnamed), ", ".join(unnamed)))
        print(f"henry-identity check: {len(files)} records conformant{note}")
        return 0

    for p in plans:
        print(plan_block(p))
        print()
    for name, why in refused:
        print(f"{name}:\n    {why}\n")

    to_write = [p for p in plans if p["status"] == "pending"]
    conform = [p for p in plans if p["status"] == "conformant"]
    exc = [p for p in to_write + conform
           if p["derivation"].startswith("explicit")]

    if refused:
        print(f"REFUSALS PRESENT -- nothing written (fail closed).")
    elif mode == "migrate":
        for p in to_write:
            write_identity(p)

    print("summary:")
    print(f"    migrated            "
          f"{0 if (refused or mode != 'migrate') else len(to_write)}"
          + (f" (would migrate {len(to_write)})"
             if (mode == 'dry-run' and not refused) else ""))
    print(f"    already conformant  {len(conform)}")
    print(f"    explicit exceptions {len(exc)}")
    print(f"    refused             {len(refused)}")
    return 1 if refused else 0


if __name__ == "__main__":
    sys.exit(main())
