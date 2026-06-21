# SOURCES — `h2o2_synthetic`

## Reaction rate constants (A, b, Ea)

**Source: none. The rate constants are SYNTHETIC** — hand-authored, illustrative
values chosen so the chain-branching structure ignites and is stiff. They are
not transcribed, paraphrased, fitted to, or extracted from any published
mechanism. Do not cite them. Do not use the resulting τ_ign quantitatively.

A real curated mechanism (transcribed from a primary paper, cited per reaction)
should replace these before promotion. Candidate primaries to transcribe from,
when done properly:

- M. Ó Conaire, H.J. Curran, J.M. Simmie, W.J. Pitz, C.K. Westbrook,
  *Int. J. Chem. Kinet.* **36** (2004) 603–622.
- M.P. Burke, M. Chaos, Y. Ju, F.L. Dryer, S.J. Klippenstein,
  *Int. J. Chem. Kinet.* **44** (2012) 444–474.
- "San Diego Mechanism" (UC San Diego Combustion Research Group).

(Each is freely *available* but distributed all-rights-reserved / cite-to-use —
hence not bundled here; transcribe values from the primary, with attribution.)

## Species thermodynamics (NOT in this folder)

The Cp(T), Hf298 and S298 of all nine species come from the curated Choupo
catalogue, `data/standards/components/{H2,O2,H,O,OH,HO2,H2O2,water,N2}.dat`.
Each of those files carries its own `provenance{}` block citing the primary
source for its thermo. Those are the values that fix the equilibrium and the
heat release — they are real and reviewed.
