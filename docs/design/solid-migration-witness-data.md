# Witness data for the authorised solid-equilibrium migration — staged, interim

> **KIND: SCOPE (validation targets, staged for review).**  The C2 migration
> was AUTHORISED 2026-08-08 (`solid-equilibrium-spike.md` §7).  Its witnesses
> need primary anchors; Vítor supplied the two papers the battery asked for,
> and this record stages their key values so the campaign starts from cited
> numbers, not from memory of a PDF.  Everything here is
> **reviewStatus interim** — transcribed 2026-08-08 from the papers' PDFs,
> pending Vítor's primary review (the standing batch-review pattern).
> Nothing below is curated into `data/standards/` — new data curation is
> reserved to Vítor; a case consuming a value stages it case-locally, as
> `fpd01` and `archer01` do.

---

## 1. Archer 1992 — the NaCl + H₂O phase diagram's fixed points

PRIMARY: D. G. Archer, *J. Phys. Chem. Ref. Data* **21** (1992) 793,
DOI 10.1063/1.555915.  Owner-provided PDF.  His global fit spans 250–600 K.

### 1a. The two invariant points (Table 5, calculated column)

| equilibrium | T / K | m / mol·kg⁻¹ |
|---|---|---|
| NaCl(cr) + NaCl·2H₂O(cr) + NaCl(aq) + H₂O(g) — the **peritectic** | 273.28 | 6.096 |
| NaCl·2H₂O(cr) + NaCl(aq) + H₂O(g) + H₂O(cr, I) — the **eutectic** | 252.15 | 5.138 |

(Reported experimental values beside each in Table 5 agree to ~0.01–0.2 K
and ~0.01–0.2 mol/kg; the reference solid below 273.28 K is the DIHYDRATE.)

### 1b. Formation properties (Table 6, 298.15 K, 0.1 MPa)

| substance | ΔfG° / kJ·mol⁻¹ | ΔfH° / kJ·mol⁻¹ | S° / J·K⁻¹·mol⁻¹ | Cp° / J·K⁻¹·mol⁻¹ |
|---|---|---|---|---|
| NaCl(cr) | −384.28 | −411.27 | 72.27 | 50.16 |
| NaCl·2H₂O(cr) | −858.75 | −997.24 | 162.51 | 137. |

### 1c. What this refines in the spike's D4b gap

The spike's both-active attempt registered **anhydrous** NaCl at 252.15 K /
6 mol/kg and found both candidates subsaturated.  Archer's Table 5 says the
physical solid in equilibrium at the eutectic is **NaCl·2H₂O**, which the
corpus does not carry at all — anhydrous NaCl genuinely leaves the stage at
273.28 K.  So the named gap sharpens from "a curated sub-zero Ksp(T) for
NaCl" to: **the sub-zero equilibrium solid is a different phase (the
dihydrate), and it is not curated.**  Architecturally this is GOOD news for
the ratified target: the eutectic witness is just two candidates (ice +
NaCl·2H₂O) under the same complementarity — no special case, exactly the
mechanism D4 already demonstrated.  Curating the dihydrate (a new component
record built on Table 6) is Vítor's, per the reserved list; the migration
does not wait for it (ruling R3).

### 1d. Already consumed elsewhere

Tables 9–10 (γ±/φ check values at 273–373 K) are consumed by
`tutorials/props/electrolyte/archer01_nacl_cold_to_hot` (staged interim,
cross-evaluation independence stated in V&V §3).

## 2. Marcilla, Ruíz & Olaya 1995 — the LLS quaternary

PRIMARY: A. Marcilla, F. Ruíz, M. M. Olaya, *Fluid Phase Equilibria* **105**
(1995) 71–91, DOI 10.1016/0378-3812(94)02595-R.  Water(W)–ethanol(E)–
1-butanol(B)–NaCl(SC) at 25.0 ± 0.1 °C; compositions in weight fraction
(×100).  Owner-provided PDF.  Salt by evaporation/AgNO₃ titration;
organics by GC; accuracy stated ~0.005 %.

### 2a. Ternary W–B–SC tie-lines (Table 4B) — two liquids, salt distributed

| aqueous W/B/SC | organic W/B/SC |
|---|---|
| 91.72 / 6.34 / 1.94 | 17.76 / 82.22 / 0.02 |
| 89.65 / 4.66 / 5.69 | 14.13 / 85.81 / 0.06 |
| 87.01 / 3.48 / 9.51 | 12.60 / 87.32 / 0.08 |
| 85.02 / 2.56 / 12.42 | 11.84 / 88.07 / 0.09 |
| 82.69 / 1.93 / 15.38 | 10.49 / 89.39 / 0.12 |
| 80.12 / 1.44 / 18.44 | 9.53 / 90.33 / 0.14 |
| 77.15 / 1.01 / 21.84 | 8.52 / 91.32 / 0.16 |

Two-liquid–one-solid invariant tie-line (same table): aqueous
73.14 / 0.72 / 26.14 · organic 7.53 / 92.28 / 0.19 · solid NaCl.

### 2b. Quaternary tie-triangles (Table 10B) — TWO LIQUIDS + SOLID NaCl

The exact state the migration's flagship witness must reproduce: an aqueous
phase, an organic phase, and solid NaCl, all simultaneously at equilibrium.

| aqueous W/E/B/SC | organic W/E/B/SC | solid |
|---|---|---|
| 71.80 / 1.44 / 1.26 / 25.50 | 8.84 / 6.00 / 85.10 / 0.06 | NaCl 100 |
| 70.13 / 4.92 / 1.45 / 23.50 | 13.39 / 21.93 / 64.12 / 0.56 | NaCl 100 |
| 68.71 / 7.51 / 1.98 / 21.80 | 19.06 / 32.74 / 46.80 / 1.40 | NaCl 100 |
| 62.94 / 14.32 / 3.41 / 19.33 | 26.33 / 38.10 / 31.67 / 3.90 | NaCl 100 |
| 57.99 / 18.92 / 6.20 / 16.89 | 36.56 / 36.50 / 20.19 / 6.75 | NaCl 100 |

(Table 10B carries nine rows; the four omitted here interpolate between
these five.  Transcribe the rest when the witness case is built — from the
paper, not from this file: this record locates the anchor, the case cites
the primary.)

### 2c. Which witness consumes what

* **Ternary LLE + salting-out** (2a): a two-liquid case with NaCl in the
  aqueous phase — exercises electrolyte + organic phase with NO solid; the
  model side is the mixed-solvent composite (Davies/Pitzer ionic + NRTL
  backbone).  Buildable before the migration.
* **The LLS tie-triangles** (2b): aqueous + organic + solid NaCl at once —
  the migration's flagship witness (solid candidate active while the
  organic split resolves).  Needs the migrated common closure; that is the
  point of it.
* **The eutectic** (1a/1c): ice + dihydrate both-active — needs the
  dihydrate curated first (Vítor's, non-blocking).

## 3. Status

Staged 2026-08-08.  No case in this record's §2 exists yet; no golden moved;
no standards record was touched.  The migration campaign picks anchors from
here and cites the PRIMARIES (this file is a locator, never a source).

## 4. Ott 1986 — BLOCKED on re-upload (recorded 2026-08-08)

The ethanol–water Hᴱ anchor (Ott, Stouffer, Cornett, Woodfield, Wirthlin,
Christensen & Deiters, *J. Chem. Thermodyn.* **18** (1986) 1–12 — the
reference-system excess enthalpies at 298.15 K, 0.4–15 MPa) was provided
as a PDF but the session container recycled before its data table was
transcribed.  Curated data is never reconstructed from memory: the anchor
case (an `excessEnthalpy` bench op — Hᴱ = −RT²Σxᵢ∂lnγᵢ/∂T over the
NRTL/Wilson/UNIFAC surfaces beside the measured curve, the
Gibbs–Helmholtz test) waits for the paper to be supplied again.  The op
design is scoped (`MolecularActivity` is single-point; the new op sweeps
composition with a validation dataset, FD in T announced).
