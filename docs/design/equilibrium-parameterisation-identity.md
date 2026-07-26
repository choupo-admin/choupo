# ADR: equilibrium parameterisation identity (D2 design — ratified three-way 2026-07-26)

**Status: DESIGN RATIFIED — data migration NOT started** (the ratified order:
materialise this design, then migrate).  Companions: the arity doctrine
(`docs/ai/data-doctrine.md`), the property architecture (level 2), the
ethanol-Henry incident of 2026-07-26 (the trap this ADR closes).

## The problem

The same physical equilibrium (e.g. CH4(g) = CH4(aq) in water) is served
today by TWO independently curated homes with different conventions:

    parameters/Henry/CH4-water.dat       H_xp, mole-fraction, van't Hoff,
                                         Trange 273-373 (Sander 2015)
    chemistry/CH4-dissolution.dat        molal log K, 5-term PHREEQC
                                         analytic, lit to 100 C+

Neither is a copy of the other — they are DIFFERENT PRIMARY
parameterisations in different conventions.  The failure mode is not their
coexistence; it is (a) curating a THIRD number for the same thing (the
ethanol trap), and (b) conversions between conventions done by hidden
knowledge in code.

## The identity model

**Unit of identity = the curated PARAMETERISATION**, not the pair, not the
pair×convention:

    ParameterisationId
        gasSpecies          (typed)
        dissolvedSpecies    (typed)
        solvent             (typed)
        convention          (a versioned profile, below)
        correlation         (mathematical form)
        source              (primary citation)
        domain              (T / P / composition validity)

Multiple parameterisations for the same physical equilibrium are
LEGITIMATE (different primaries, domains, forms, revisions).  What is
forbidden:

    duplicated (value, source, convention)          -> arity error
    two `recommended` overlapping the same
      selection profile + domain with no priority   -> selection error

## The physical family

Each parameterisation declares its physical equilibrium through TYPED
references (`gasSpecies`, `dissolvedSpecies`, `solvent`) — the registry
DERIVES the family (all parameterisations of one equilibrium) from those
facts.  No bidirectional `crossRef` pairs in the files (two links can
diverge); an explicit `relatedParameterisation` only where derivation
cannot see the relation.

## Convention profiles (not recordType defaults)

Conventions are VERSIONED, IMMUTABLE, CITABLE profiles:

    convention Sander-Hxp-v1;       -> gasStandardState idealGas;
                                       compositionBasis liquidMoleFraction;
                                       referencePressure 1 atm;
                                       temperatureForm vanTHoff;
    convention PHREEQC-gasMolal-v1; -> the network's operational convention

A record writes `convention <name>;` and overrides only what deviates.
The resolver can print the fully expanded form (declared profile, inherited
fields, local overrides, provenance of each).  NEVER defaulted by profile:
source, validityRange, correlation coefficients, the species/solvent
identities, quality status (INTERIM / recommended).

## Conversion and the cross-convention diagnostic

Any conversion between conventions is EXPLICIT and announced: origin and
target standard states, composition basis, the conversion equation, every
auxiliary datum used (solvent density, molar mass, reference pressure,
ideality assumption), T, and the validity domain.

The cross-convention gate compares parameterisations of one family over
their COMMON domain (T, value A, value B converted, deviations, sources).
It FAILS only when the records claim identity (same source, same physical
parameterisation, declared equivalence, or one declared as a converted
representation of the other).  Between independent primaries a discrepancy
is a CURATION FINDING (INFO/WARNING) — never an automatic error.

**Availability is not applicability**: a Henry parameterisation existing
for ethanol-water does not make Henry the recommended model for ethanol —
the ThermoResolver selects the surface; the catalogue only serves it.

## Legacy adapter and migration (posture C2, F2 precedent)

When the schema lands: the loader converts legacy records to the canonical
in-memory representation immediately (no solver code ever sees legacy
fields); ALL dev-corpus cases re-imported in ONE wave; a gate refuses
remaining legacy schemas in dev; physical goldens unchanged; historical
release tags stay immutable and runnable with their own version.  The
adapter is a clearly marked migration device, never a second permanent
architecture.

## What is deliberately NOT in this ADR

The transfer-term grammar (D3 — contract only:
`standardStateCorrection(species, solvents, T, I)` with
unavailable -> named announced gap); any new folder layout for
parameterisations; any migration of the existing 206 + 8 records.  Those
start only after this design is exercised by the first migrated pair.
