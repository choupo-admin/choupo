# RECORD_SPEC — the staging record envelope (Codex parecer, 2026-07-24)

Every numeric record in `data/tmp/` carries this envelope, even though the runtime
does not read it yet.  **Zero usable science may live only in a comment.**

```text
recordType      <e.g. diffusionCoefficient | acidDissociation | partitionCoefficient
                 | solubility | cosmoSurface | saftParameterSet>;
schemaVersion   1;
recordId        <stable-slug>;            // unique, filename-consistent
participants    ( <substance> [<substance> ...] );   // the ARITY, explicit
property        <name>;   // or: model <name>;  for parameter sets
conditions
{
    temperature   <value> K;
    pressure      <value> Pa;      // omit when not applicable
    phase         <aqueous|liquid|solid|gas>;
    composition   <e.g. infiniteDilution | x_i ...>;   // omit if N/A
    pH            <value>;         // omit if N/A
}
value                                  // or `parameters { ... }` for model sets
{
    <name>   <number> <unit>;          // UNITS ALWAYS EXPLICIT
    uncertainty <number> <unit>;       // when reported
}
validity   { temperatureRange ( <lo> <hi> ) K; concentrationRange ...; }
provenance
{
    origin      measured|regressed|derived|estimated;
    citation    "<authors, journal, vol (year) pages>";
    doi         "<doi or ->";
    licence     "<licence or 'facts, primary-cited' or 'rightsPending'>";
    evidenceId  <evidence/<id> or ->;
    curator     "<agent/human>";
    retrieved   2026-07-24;
}
status          candidate|verified|flagged|rightsPending;
```

## ARITY rule (which home a value belongs to)
- **arity 1, intrinsic** → `components/<name>.candidate.dat`
  (identity, Tc/Pc/omega, phase-declared Cp, thermochemistry WITH phase,
   pure-liquid molar volume, PURE PC-SAFT + COSMO as NAMED SETS w/ variant+provenance)
- **arity >= 2 / system / state** → `parameters/...`
  - `parameters/transport/diffusion/<solute>-<solvent>.candidate.dat`  (D_aq)
  - `parameters/partition/<system>.candidate.dat`                       (logKow)
  - `parameters/solubility/<solute>-<solvent>.candidate.dat`            (SLE)
  - `parameters/PCSAFT/<i>-<j>.candidate.dat`   (ONLY kij / cross-association)
- **a real equilibrium/reaction** → `chemistry/aqueousSpeciation/<reaction>.candidate.dat`
  (pKa steps; `pI` POINTS to the equilibria; `chargeAtPH7` is DERIVED — never stored)
- **measured/計算 raw material** → `evidence/<dataset-id>/{metadata.dat,data.csv}`
  (a parameter REFERENCES its evidence; it never duplicates it)

## Derivations
A value computed from another (Stokes radius from D via Stokes-Einstein) is NOT a
second independent datum: record it inside the SAME record as a `derived {}` block
stating the equation, the viscosity and T used, `origin derived`.

## Legal status
`rightsPending` = value obtained from a paywalled/compilation source, kept for
INTERNAL evaluation only in this private tier; never promotable as-is.  EU sui
generis database right: systematic extraction of a table is a risk even when each
value is a fact.
