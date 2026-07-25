# STRATEGY — how to expand the DB usefully (think-first, per Vítor 2026-07-24)

## The honest diagnosis
The night's output was POOR because I optimised the WRONG axis: **breadth of
names + one parameter class** (identity, a little thermochemistry), fetched
one-compound-at-a-time.  A useful Choupo record is a **multi-parameter object**,
and the parameters that make it useful for NF/RO work are exactly the ones I did
not gather.  That is the "pobreza".

## What a genuinely useful component record needs (per compound)
| class | Choupo home | why it matters | I had it? |
|---|---|---|---|
| pure thermophysical (Tc,Pc,ω,Antoine,Cp,ΔHf,ρ,μ) | `component.dat` | VLE/energy | partial |
| **hydrodynamic / Stokes radius, aqueous D** | `component.dat` (solute) | **NF/RO rejection — the core** | **NO** |
| **COSMO-SAC σ-profile (51-pt, area, volume)** | `component.dat` `cosmo{}` | activity, prediction | **NO** |
| **PC-SAFT params (m, σ, ε/k, ε_AB, κ_AB)** | `component.dat` (SAFT) | EoS, electrolyte-SAFT | **NO** |
| **binary interaction (NRTL/UNIQUAC/Pitzer/kij)** | `parameters/<MODEL>/` | mixtures | **NO** |
| charge/pKa speciation | species/chemistry | electrolyte rejection | leads only |

## The efficient, LEGAL, BULK sources (stop the one-by-one waste)
The leverage move is to pull OPEN BULK databases ONCE and JOIN to my candidates
by InChIKey/CAS — not 200 PubChem calls.

1. **COSMO-SAC σ-profiles** — the single biggest win, covers sugars/amino
   acids/drugs in one shot:
   - **LVPP sigma database** (USP, R. de P. Soares; MIT) — ~2000+ profiles, GitHub.
   - **CHAOS** (CC-BY, ~53000) — the long tail.
   - **VT-2005** (Mullins, NIST bundle, public domain) — Choupo already ships 77.
   → download, match InChIKey, drop into each `cosmo{}` block (variant-tagged).
2. **PC-SAFT parameters** — published parameter TABLES (values are facts):
   Gross & Sadowski 2001 + open libraries (feos / Clapeyron.jl / thermo) that
   compile them; amino-acid & sugar ePC-SAFT from Held/Cameretti papers.
3. **Hydrodynamic / Stokes radius + aqueous D** — for the EXACT NF/RO benchmark
   solutes, review tables (e.g. membrane-rejection reviews) list Stokes radii;
   else Stokes-Einstein from open aqueous-diffusivity tabulations.
4. **Pure thermophysical** — NIST WebBook free + PubChem (as done) — but as ONE
   class among many, not the whole job.
5. **Binary parameters** — DECHEMA/ChemSep already in `data/local` (private);
   new pairs → fit from open VLE/activity data, or COSMO-SAC-predict.

## Legal frame (unchanged, safe)
All of the above are either open-licensed bulk DBs (MIT/CC-BY/public-domain) or
individual FACT values re-cited to primary, staged in the PRIVATE gitignored
`data/tmp`.  No public-repo redistribution of any compilation.

## Proposed workflow (per candidate, automated then human-checked)
1. Bulk-download LVPP + CHAOS + a PC-SAFT table once into `data/tmp/_sources/`.
2. Join by InChIKey → auto-fill `cosmo{}`, SAFT params, thermophysical.
3. Stokes-radius pass for the membrane solutes (the differentiator).
4. Emit a COMPLETE multi-parameter `.dat` per compound; human-curate.
→ This is the difference between a name list and a usable database.

## Open question for Vítor before I execute
Which axis first? My recommendation: **(1) COSMO-SAC σ-profiles in bulk** (biggest
coverage-per-effort, feeds activity prediction) **+ (3) Stokes radii for the NF/RO
solutes** (your differentiator).  PC-SAFT + binary params next.
