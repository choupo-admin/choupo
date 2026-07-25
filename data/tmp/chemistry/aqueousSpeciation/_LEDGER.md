# `chemistry/aqueousSpeciation/` — LEDGER

**Phase 2 of the data-staging consolidation, 2026-07-24: arity-correct re-homing.**

Every pKa / pI / charge datum that was buried as a **comment line** in the 57
`data/tmp/components/*.candidate.dat` files has been re-emitted here. Rationale
(`../../RECORD_SPEC.md`, ARITY rule): *a dissociation constant is a real chemical
EQUILIBRIUM (arity ≥ 2), not an intrinsic component constant.* A component file
may not be the home of a reaction.

- **68 records** written: **59 `acidDissociation`** (one per dissociation STEP)
  + **9 `isoelectricPoint`** (derived, pointing at the pKa records).
- **39 of the 57 compounds** are covered by at least one dissociation record.
- Values and primary citations were **MOVED verbatim**. Nothing was invented,
  adjusted, averaged or re-rounded. The component files were **NOT edited**
  (read-only per the phase-2 brief) — de-duplicating the now-redundant comment
  lines is a follow-up act.

### Status vocabulary as applied here
| status | rule used |
|---|---|
| `candidate` | a definite value from an open / public-domain primary (journal article, HSDB, ATSDR) |
| `flagged` | consensus, class value, estimate, order-of-magnitude placeholder, approximate (`~`), or a bound (`<`) |
| `rightsPending` | the value reaches us only through a **paywalled compilation** (Merck Index, LOGKOW Databank, Pesticide Manual) or a **NonCommercial** licence (DrugBank) |

Where both risks applied, the **dominant** one sets the status; the other is
written out in a `// NOTES` line inside the record.

---

## 1. Dissociation records (59)

### Amino acids — 22 records, all `flagged`
Source: `../../aminoacids_SOURCES.md` §2, which states the values are the accepted
**consensus** set (Lehninger; CRC Handbook 84th ed.), lineage = aqueous
potentiometric titration at 25 °C (Smith & Smith 1942; King 1951; Nozaki &
Tanford 1967). Since the ledger itself says "flagged as **consensus**, not a
single paper", every amino-acid record carries `status flagged` plus a LEGAL
note (the consensus reaches us via paywalled compilations).

| compound | step | site | pKa | status |
|---|---|---|---|---|
| glycine | pKa1 | α-COOH | 2.34 | flagged |
| glycine | pKa2 | α-NH₃⁺ | 9.60 | flagged |
| alanine | pKa1 | α-COOH | 2.34 | flagged |
| alanine | pKa2 | α-NH₃⁺ | 9.69 | flagged |
| serine | pKa1 | α-COOH | 2.21 | flagged |
| serine | pKa2 | α-NH₃⁺ | 9.15 | flagged |
| serine | pKaR | β-OH (side chain) | ~13 | flagged (order-of-magnitude, source calls it "inert") |
| valine | pKa1 | α-COOH | 2.32 | flagged |
| valine | pKa2 | α-NH₃⁺ | 9.62 | flagged |
| phenylalanine | pKa1 | α-COOH | 1.83 | flagged |
| phenylalanine | pKa2 | α-NH₃⁺ | 9.13 | flagged |
| glutamicAcid | pKa1 | α-COOH | 2.19 | flagged |
| glutamicAcid | pKaR | γ-COOH (side chain) | 4.25 | flagged |
| glutamicAcid | pKa2 | α-NH₃⁺ | 9.67 | flagged |
| lysine | pKa1 | α-COOH | 2.18 | flagged |
| lysine | pKa2 | α-NH₃⁺ | 8.95 | flagged |
| lysine | pKaR | ε-NH₃⁺ (side chain) | 10.53 | flagged |
| arginine | pKa1 | α-COOH | 2.17 | flagged |
| arginine | pKa2 | α-NH₃⁺ | 9.04 | flagged |
| arginine | pKaR | guanidinium (side chain) | 12.48 | flagged |
| taurine | pKa1 | sulfonate −SO₃H | ~1.5 | flagged (**ESTIMATE** — the source ledger explicitly asks for an open potentiometric primary) |
| taurine | pKa2 | α-NH₃⁺ | ~9.06 | flagged |

Step numbering is by **ascending pKa** (order of deprotonation): for glutamic
acid the γ-COOH sits *between* pKa1 and pKa2; for lysine/arginine the side chain
comes *last*. The reaction string in each record states the stoichiometry.

### Pharmaceuticals, set 1 (`../../pharma1_SOURCES.md`) — 7 records
| compound | step | site | pKa | status | primary |
|---|---|---|---|---|---|
| ibuprofen | pKa1 | −COOH | 4.91 | rightsPending | Sangster, LOGKOW Databank (1994) via PubChem/HSDB (alt 4.45, ChEMBL) |
| diclofenac | pKa1 | −COOH | 4.15 | rightsPending | Sangster, LOGKOW Databank (1994) (alt 3.99–4.30, ChEMBL) |
| naproxen | pKa1 | −COOH | 4.15 | rightsPending | Sangster, LOGKOW Databank (1994) (alt 4.18, ChEMBL) |
| ketoprofen | pKa1 | −COOH | 4.45 | rightsPending | Sangster, LOGKOW Databank (1994) (alt 3.98, ChEMBL / Hidalgo 2023) |
| carbamazepine | pKa1 | amide N−H | 13.9 | candidate | Jones, Voulvoulis & Lester, Water Res. 36 (2002) 5013 |
| caffeine | pKa1 | conjugate acid (cation) | ~0.6 | flagged | Svorc, Int. J. Electrochem. Sci. 8 (2013) 5755 |
| caffeine | pKa2 | N−H (very weak acid) | ~14 | flagged | Sigma-Aldrich C0750 product sheet (vendor, approximate) |

### Pharmaceuticals, set 2 (`../../pharma2_SOURCES.md`) — 8 records
| compound | step | site | pKa | status | primary |
|---|---|---|---|---|---|
| sulfamethoxazole | pKa1 | aniline −NH₃⁺ | 1.6 | candidate | HSDB (US NLM, public domain), CID 5329 |
| sulfamethoxazole | pKa2 | sulfonamide N−H | 5.7 | candidate | HSDB, CID 5329 |
| trimethoprim | pKa1 | pyrimidine N (conj. acid) | 7.12 **@ 20 °C** | candidate | DrugBank & HSDB, CID 5578 |
| metformin | pKa1 | weaker biguanide centre | ~2.8 | flagged | DrugBank & HSDB, CID 4091 |
| metformin | pKa2 | guanidinium | 12.4 | candidate | DrugBank & HSDB, CID 4091 |
| gemfibrozil | pKa1 | −COOH | 4.43 | candidate | Radjenović et al., Water Res. 42 (2008) 3601, Table 1 (open access) |
| primidone | pKa1 | ring N−H | 12.3 | candidate | HSDB, CID 4909 |
| atenolol | pKa1 | secondary amine (conj. acid) | 9.6 | candidate | HSDB & DrugBank, CID 2249 (alt 9.54–9.58, ChEMBL) |

### Hormones / EDCs (`../../hormones_SOURCES.md`) — 6 records
| compound | step | site | pKa | status | primary |
|---|---|---|---|---|---|
| estradiol | pKa1 | phenolic A-ring OH | 10.46 ± 0.03 | **rightsPending** | DrugBank via PubChem CID 5757 — **CC BY-NC**, see §5 |
| estrone | pKa1 | phenolic A-ring OH | ~10.3–10.8 | flagged | no primary pinned → Lewis & Archer, Steroids 34 (1979) 485 |
| ethinylestradiol | pKa1 | phenolic A-ring OH | ~10.4 | flagged | no primary pinned → Lewis & Archer 1979 |
| estriol | pKa1 | phenolic A-ring OH | ~10.4 | flagged | no primary pinned → Lewis & Archer 1979 |
| bisphenolA | pKa1 | first phenolic OH | 9.6 | candidate | HSDB via PubChem CID 6623 |
| bisphenolA | pKa2 | second phenolic OH | ~10.2 | flagged | no primary pinned → Staples et al., Chemosphere 36 (1998) 2149 |

### Pesticides (`../../pesticides_smallsolutes_SOURCES.md`) — 6 records
| compound | step | site | pKa | status | primary |
|---|---|---|---|---|---|
| atrazine | pKa1 | triazine ring N (conj. acid) | 1.60 | rightsPending | e-Pesticide Manual 15th ed. (BCPC) via PubChem/HSDB |
| simazine | pKa1 | triazine ring N (conj. acid) | 1.62 **@ 20 °C** | rightsPending | Tomlin, The Pesticide Manual 11th ed. (BCPC 1997) |
| glyphosate | pKa1 | not assigned per step | 2.0 | candidate | Caceres-Jensen et al., J. Environ. Qual. 38 (2009) 1449 |
| glyphosate | pKa2 | not assigned per step | 2.6 | candidate | idem |
| glyphosate | pKa3 | not assigned per step | 5.6 | candidate | idem |
| glyphosate | pKa4 | not assigned per step | 10.6 | candidate | idem |

Glyphosate forms are labelled `glyphosate_H4 … glyphosate_H0` **by proton count
only** — the source gives the 4-value set as spanning "phosphonate / carboxyl /
amine" but does **not** assign a group to each individual step, so none was
invented. The **alternative 3-step set** (pKa 2.34 / 5.73 / 10.2, e-Pesticide
Manual 15th ed.) does not map 1:1 onto these four steps; it is recorded as a
whole-set alternative in every glyphosate record's `// NOTES` and here, rather
than as three competing records.

### PFAS (`../../pfas_volatiles_SOURCES.md`) — 4 records
| compound | step | site | pKa | status | primary |
|---|---|---|---|---|---|
| PFOA | pKa1 | −COOH | −0.5 | candidate | Goss, ES&T 41 (2007) 3225 · alts 1.30 (Kutsuna & Hori 2008), 2.80 (Moody & Field 2000) |
| PFOS | pKa1 | −SO₃H | <1.0 (bound) | flagged | Cheng et al., J. Phys. Chem. A 113 (2009) 8152 · alt 0.14 est. (ATSDR 2021) |
| PFBA | pKa1 | −COOH | <1.6 (class bound) | flagged | ITRC/ATSDR 2021 PFCA class · alt ~0.4 est. |
| PFBS | pKa1 | −SO₃H | <1.6 (class bound) | flagged | ATSDR 2021 PFSA class · alt ~0.14 est. |

Multiple determinations of the **same** equilibrium live in one record's
`alternativeDeterminations {}` block — one equilibrium, one record.

### Sugars (`../../sugars_SOURCES.md`) — 6 records
| compound | step | site | pKa | status | primary |
|---|---|---|---|---|---|
| fructose | pKa1 | hydroxyl OH | 12.03 @ 25 °C | rightsPending | Merck Index via HSDB (paywalled compilation) |
| xylose | pKa1 | hydroxyl OH | 12.14 **@ 18 °C** | rightsPending | Merck Index; PubChem CID 135191 |
| galactose | pKa1 | hydroxyl OH | ~12.35 | flagged | no primary — order-of-magnitude placeholder |
| arabinose | pKa1 | hydroxyl OH | ~12.34 | flagged | no primary — order-of-magnitude placeholder |
| lactose | pKa1 | hydroxyl OH | ~11.98 | flagged | no primary — order-of-magnitude placeholder |
| trehalose | pKa1 | hydroxyl OH | ~12.5 | flagged | no primary — order-of-magnitude placeholder |

The four placeholders are `sugars_SOURCES.md` worklist item 8 ("confirm a primary
before promotion") — they are carried so the datum is not lost in a comment, and
each record says in its notes: *do NOT use numerically*.

---

## 2. Temperature and ionic strength

- **`ionicStrength not stated`** in **all 68 records**. Not one source in the
  eight family ledgers reports the ionic strength / medium of the titration.
  For a thermodynamic pKa this is a real gap, and it is now visible in every
  record instead of invisible in a comment.
- **T stated by the source** (25 °C unless noted): the 22 amino-acid records
  (ledger: "aqueous potentiometric titration at 25 °C") and the 6 sugar records.
  Three records carry a **non-25 °C** temperature that the source states
  explicitly and that a downstream reader would otherwise miss:
  **xylose 18 °C**, **simazine 20 °C**, **trimethoprim 20 °C**.
- **T NOT stated by the source** — 29 records (pharma1 acids, carbamazepine,
  caffeine ×2, sulfamethoxazole ×2, metformin ×2, gemfibrozil, primidone,
  atenolol, all 6 hormone/BPA, atrazine, all 4 glyphosate, all 4 PFAS). These
  carry `temperature 298.15 K;` with an inline `// CONVENTIONAL 25 C — the
  source does NOT state a temperature (FLAG)` marker. The 298.15 K is an
  assumption of this re-homing, not a datum.

---

## 3. Isoelectric points (9 records) — DERIVED, never stored as a constant

`recordType isoelectricPoint`, `origin derived`, `derivedFrom ( <recordId>
<recordId> )`, and a `derived {}` block stating the equation, the inputs and an
arithmetic check against the number the source quoted. All 9 are `flagged`,
inheriting the consensus status of the pKa they derive from.

| compound | pI quoted | derivedFrom | check |
|---|---|---|---|
| glycine | 5.97 | pKa1, pKa2 | (2.34+9.60)/2 = 5.970 ✔ |
| alanine | 6.00 | pKa1, pKa2 | (2.34+9.69)/2 = 6.015 ≈ 6.00 |
| serine | 5.68 | pKa1, pKa2 | (2.21+9.15)/2 = 5.680 ✔ |
| valine | 5.96 | pKa1, pKa2 | (2.32+9.62)/2 = 5.970 ≈ 5.96 |
| phenylalanine | 5.48 | pKa1, pKa2 | (1.83+9.13)/2 = 5.480 ✔ |
| glutamicAcid | 3.22 | pKa1, **pKaR** | (2.19+4.25)/2 = 3.220 ✔ (acidic side chain) |
| lysine | 9.74 | **pKa2, pKaR** | (8.95+10.53)/2 = 9.740 ✔ (basic side chain) |
| arginine | 10.76 | **pKa2, pKaR** | (9.04+12.48)/2 = 10.760 ✔ (basic side chain) |
| taurine | ~5.2 | pKa1, pKa2 | (1.5+9.06)/2 = 5.280 ≈ ~5.2 (both inputs approximate) |

Every quoted pI reproduces from its own pKa pair to within rounding — which is
itself the evidence that pI is **not** an independent datum. Consumers must
recompute it; these records exist only because the sources quoted a definite
number, and they point back at the equilibria.

### pI DROPPED (loose quotation, no number)
- **glyphosate** — the component file says *"pI: zwitterionic, no single pI
  (polyprotic); isoelectric window ~pH 2.6–5.6 region"*. That is prose about the
  span between pKa2 and pKa3, not a value. **Dropped**; the four pKa records
  carry the information.

---

## 4. `chargeAtPH7` — DROPPED EVERYWHERE (33 assertions)

A net charge at pH 7 is a **result** of the equilibria plus a pH — never a stored
constant. Every one of the following was deleted rather than re-homed. All are
recomputable from the records in this directory (given a pH and the pKa set), so
nothing is lost.

| family | compounds whose `chargeAtPH7` / `charge(pH7)` / "net charge @ pH 7" was dropped | value asserted |
|---|---|---|
| amino acids (9) | glycine, alanine, serine, valine, phenylalanine | ≈ 0 (zwitterion) |
| | glutamicAcid | ≈ −1 |
| | lysine, arginine | ≈ +1 |
| | taurine | ≈ 0 net, "permanent −SO₃⁻ across all NF pH" |
| pharma1 (6) | ibuprofen, diclofenac, naproxen, ketoprofen | −1 |
| | caffeine, carbamazepine | 0 |
| pharma2 (7) | sulfamethoxazole, gemfibrozil | −1 |
| | metformin, atenolol | +1 |
| | trimethoprim | ~ +0.6 (half-protonated — a *pH-dependent fraction*, the clearest proof this is a result, not a constant) |
| | primidone, iopromide | 0 |
| pesticides / small (7) | atrazine, simazine, diuron, urea, NDMA, acrylamide | 0 |
| | glyphosate | ~ −2 (net) |
| PFAS (4) | PFOA, PFBA, PFBS, PFOS | −1 |

**Total: 33 dropped assertions.**

Prose-only charge statements (no stored field) were also *not* carried over:
bisphenolA ("neutral below ~pH 9; mono-/di-anionic above"), testosterone and
progesterone ("neutral across environmental pH"). These are consequences of the
records above (or, for the steroids, of having no ionizable group at all).

---

## 5. Legal findings surfaced by the re-homing

1. **estradiol pKa 10.46 ± 0.03 is sourced ONLY to DrugBank**, which is
   **CC BY-NC 4.0**. `CLAUDE.md` excludes **NonCommercial** data from the public
   tier *regardless of copyleft* (same class as CAS Common Chemistry). Marked
   `rightsPending`; re-source from Lewis & Archer, *Steroids* 34 (1979) 485 (the
   estrogen phenolic-OH primary the hormones ledger already names) before any
   promotion. It is the only estrogen pKa in the set carrying an uncertainty, so
   it is worth re-sourcing rather than dropping.
   *(atenolol, metformin, trimethoprim also cite DrugBank but carry HSDB — US
   NLM, public domain — as a co-source, so they stay `candidate`.)*
2. **8 records are `rightsPending` on paywalled compilations**: 4 NSAID/fibrate
   carboxylic acids via the **LOGKOW Databank** (Sangster 1994), atrazine +
   simazine via the **Pesticide Manual** (BCPC), fructose + xylose via the
   **Merck Index**. Each is a single re-cited fact, but the compilation is the
   only route we have — EU sui generis database right applies to systematic
   extraction. Not promotable as-is.
3. Everything here stays in the **private, gitignored** `data/tmp/` tier.

---

## 6. Compounds with NO dissociation record

### (a) Confirmed non-ionizable — a source states it (7)
No record emitted; the assertion is recorded here with the source that makes it.

| compound | what the source says | source |
|---|---|---|
| diuron | "pKa none in ambient range … phenylurea, non-ionizable near pH 7" | no PubChem dissociation-constant record (`pesticides_smallsolutes_SOURCES.md`) |
| testosterone | "pKa none (non-ionizable) — 3-keto-Δ4 / 17-OH; NO phenol; neutral across environmental pH" | DrugBank via PubChem CID 6013: no acidic pKa; strongest-basic far outside the 0–14 window |
| progesterone | "pKa none (non-ionizable) — 3,20-diketone Δ4; NO phenol" | DrugBank via PubChem CID 5994: strongest-basic 18.92 (enol), no acidic pKa in 0–14 |
| iopromide | "pKa none in 2–12 range — amide + hydroxyl functions, no ionization at drinking-water pH" | `pharma2_SOURCES.md` (PubChem PUG-View) |
| urea | "no ionizable group near neutral pH (di-amide carbonyl)" | `pesticides_smallsolutes_SOURCES.md` |
| NDMA | "N-nitrosamine, no ionization near neutral pH" | idem |
| acrylamide | "primary amide, no ionization near neutral pH" | idem |

Note the honest limit of (a): PubChem/DrugBank reporting *no pKa in the 0–14
window* is weaker evidence than a measurement. Testosterone and progesterone are
the best-supported (an explicit "no acidic pKa" statement); the others rest on
the absence of a record.

### (b) No pKa datum was ever staged — a GAP, not a claim of non-ionizability (11)
Nothing in the component file or the family ledger records a pKa for these. They
are listed so the gap is visible; **do not read this as "non-ionizable"**.

| compound | family | note |
|---|---|---|
| sorbitol, mannitol, xylitol, erythritol | polyols | sugar alcohols are very weak acids (the analogous sugars sit at pKa ≈ 12); **no value staged** — a genuine gap if a high-pH case is ever built |
| **levulinicAcid** | volatiles | **a carboxylic acid** — it certainly has a pKa in the ambient window, and none was gathered. The most consequential gap in this list |
| nPropanol, furfurylAlcohol | volatiles | alcohols; no ionizable group in the ambient window, but no datum staged either |
| HMF, gammaValerolactone | volatiles | no datum staged |
| limonene, alphaPinene | volatiles | hydrocarbons/terpenes; no ionizable group |

Coverage check: **39** (records) + **7** (confirmed non-ionizable) + **11**
(no datum staged) = **57** — every candidate component accounted for.

---

## 7. Contradictions and clashes found while re-homing

1. **alanine — a component file that contradicts itself.** Its header `NEEDS:`
   line says *"pKa1~2.35, pKa2~9.87, pI~6.11"*, while the SPECIATION block
   further down the **same file** says *"pKa1 = 2.34 ; pKa2 = 9.69 ; pI = 6.00"*.
   `aminoacids_SOURCES.md` §2 agrees with the SPECIATION block (2.34 / 9.69 /
   6.00), so the records carry those; the header line is stale and should be
   corrected in `components/alanine.candidate.dat` (not edited here — read-only
   phase). The pKa2 discrepancy is **0.18 units**, well beyond rounding.
2. **caffeine — the component file is missing a whole dissociation step.**
   It records only the weak-acid pKa ~14; `pharma1_SOURCES.md` additionally
   carries the cation pKa **~0.6** (Svorc 2013). Both are now records; the
   datum would have been lost had only the component file been consulted.
3. **metformin — the source's labels invert the step order.** The component file
   calls **12.4** "the pKa" and **~2.8** "the second, weaker pKa". By order of
   deprotonation, ~2.8 is step 1 and 12.4 is step 2. Records are numbered by
   **ascending pKa**; both files state the clash in their notes.
4. **glyphosate — two mutually inconsistent pKa SETS** (component file *and*
   family ledger agree that both exist): 4 steps 2.0 / 2.6 / 5.6 / 10.6
   (Caceres-Jensen 2009) vs 3 steps 2.34 / 5.73 / 10.2 (e-Pesticide Manual).
   Not resolvable without going to the primaries; the 4-step set is recorded and
   the 3-step set noted as a whole-set alternative.
5. **PFOA — a >3-unit spread on one equilibrium**: −0.5 (Goss 2007), 1.30
   (Kutsuna & Hori 2008), 2.80 (Moody & Field 2000). Component and ledger agree
   that all three exist. Kept in one record; the spread is a real, unresolved
   literature disagreement, not a transcription error.
6. **xylose is the only sugar pKa not at 25 °C** (12.14 @ **18 °C**). The
   component file states the temperature; `sugars_SOURCES.md` does not. Do not
   compare it digit-for-digit against the 25 °C sugar values.
7. **Brief-vs-data clash (deliberate deviation, flagged for review).** The
   phase-2 brief listed **carbamazepine** and **primidone** among the
   "neutral species … no pKa". Both in fact carry a real, primary-cited pKa
   (13.9, Jones et al. 2002; 12.3, HSDB) — they are neutral *at pH 7*, which is
   a consequence of the equilibrium, not the absence of one. Records were
   emitted for both (a pKa outside the working window is still an equilibrium,
   and `RECORD_SPEC.md` forbids leaving usable science in a comment). The same
   logic keeps caffeine (~0.6 / ~14), metformin (~2.8 / 12.4) and the four sugar
   placeholders. Only compounds with **no pKa datum at all** were skipped.

No contradiction was found between a component file and its family ledger on any
*value* except item 1 (which is internal to one component file) and item 2 (an
omission, not a conflict).

---

## 8. Follow-ups for the curator

1. Delete the now-redundant pKa/pI/charge comment blocks from the 39 component
   files and leave a pointer to `chemistry/aqueousSpeciation/` (phase 2 was
   read-only on `components/`).
2. Fix the stale `NEEDS:` header line in `components/alanine.candidate.dat`.
3. Re-source the 9 `rightsPending` records (8 paywalled compilations + estradiol
   via DrugBank/CC-BY-NC) before any promotion out of the private tier.
4. Pin primaries for the 4 sugar placeholders, the 3 estrogen phenol pKa,
   bisphenolA pKa2, taurine's sulfonate pKa1 and serine's β-OH.
5. Record the ionic strength / medium for every record (currently *not stated*
   in all 68) — without it these are conditional, not thermodynamic, constants.
6. Curate a pKa for **levulinicAcid** (a carboxylic acid with no staged datum).

---

# PHASE 6 (2026-07-24) — closing coverage gaps, clearing `flagged`

Scope: this directory only. Two jobs — **(A)** fill real coverage gaps, **(B)** work
through `flagged` records to find determinations that state **T and ionic strength**.

Working rule, applied without exception: **a value is `measured` only if the curator
opened the primary and saw it there.** Where that could not be done, nothing was
written — the gap was *sharpened* instead, so the next curator inherits a named target
rather than a blank.

## 6.1 Records CREATED (2) — the polyol gap, half closed

Phase 2 §6(b) listed sorbitol / mannitol / xylitol / erythritol under *"no pKa datum
was ever staged — a GAP"*. Two of the four are now closed **from a primary read in
full**: a scanned PDF from the Acta Chemica Scandinavica open archive.

| record | pKa | T | ionic strength | status |
|---|---|---|---|---|
| `mannitol-pKa1` | **13.50** (spread 13.35–13.55, 9 runs) | **18 °C**, stated | **0.015–0.05 mol/L**, stated | candidate |
| `sorbitol-pKa1` | **13.57** (spread 13.47–13.62, 6 runs) | **18 °C**, stated | **0.02–0.05 mol/L**, stated | candidate |

Primary: **Thamsen, J., *Acta Chem. Scand.* 6 (1952) 270–284**, doi
`10.3891/acta.chem.scand.06-0270` — hydrogen electrode **and** glass electrode, the two
agreeing; NaOH medium, no swamping electrolyte. Read page by page (title, method p.271,
Tables 5–8, summary pp.283–284). Each record also carries the paper's **0 °C** series
(mannitol 14.09, sorbitol 14.14) as a temperature alternative, and Michaelis & Rona
(1913) as a historical alternative — explicitly marked *not read directly*.

**These are the first two records in this directory to carry a real ionic strength.**
Phase 2 §2 reported `ionicStrength not stated` in **all 68**. It is now 2 of 70.

The constant is the paper's own **pK′** — a *stoichiometric / mixed* constant (activity
of H⁺, concentrations of RO⁻ and ROH, γ(ROH) fixed at 1), **not** the thermodynamic
I = 0 value. Each record says so in a `definition {}` block. Recording it as if it were
thermodynamic would have been the easy lie.

**xylitol and erythritol remain genuine gaps** — this paper does not cover them.

## 6.2 Records REWRITTEN — provenance defects found and corrected

### PFOA — the phase-2 record was wrong in three ways (brief item)

The brief asked for a modern authoritative determination. Looking for one exposed that
the *existing* record was not what it claimed:

| | phase 2 | phase 6 |
|---|---|---|
| origin | `measured` | **`estimated` — Goss estimates "based on analogy considerations and molecular modeling"** |
| citation | "Goss, *ES&T* **41 (2007) 3225**" | **wrong volume, wrong year, wrong pages — it is *ES&T* 42(2) (2008) 456–458, doi 10.1021/es702192c** |
| value | −0.5, as *the* datum | **Goss published an Addition/Correction moving his own estimate to "close to 0". Phase 2 carried the withdrawn figure.** |
| status | `candidate` | **`flagged`** |

Datum re-pointed to **Vierke, Berger & Cousins, *ES&T* 47 (2013) 11032–11039**
(doi 10.1021/es402691z): **pKa 0.5**, derived by fitting a volatilization model to
measured water-to-air transfer at ~1 µg/L — deliberately *below* the self-association
threshold, i.e. the regime a water-treatment case actually runs in. Abstract read; the
value, method, concentration and pH range (0.3–6.9) are all stated there.

Alternatives retained in the one record: **Burns et al., *ES&T* 42 (2008) 9283–9288**
(3.8 ± 0.1, potentiometric in water–methanol; abstract read — the same paper reports the
apparent pKa falling to ~2.3 at higher concentration *because perfluorooctanoate
aggregates*, which is the crux of the whole dispute, and a published Comment/Response
exchange contests it), Goss's estimate, Kutsuna & Hori (1.30), Moody & Field (2.80).

A `dispute {}` block states the verdict: **UNRESOLVED**. The demotion `candidate →
flagged` is not a regression — the previous confidence was unearned.

### PFBA / PFBS / PFOS — class bounds traced to the study that produced them

Phase 2 sourced these to the ITRC / ATSDR 2021 regulatory tables. Those tables are
restating **Vierke 2013**, whose abstract says verbatim: *"our results suggest that the
pKas of C4-11 PFCAs are <1.6"* and *"Perfluoroalkane sulfonic acids were not volatilized,
suggesting that their pKas are below the investigated pH range (pKa <0.3)"*.

| record | phase 2 | phase 6 | note |
|---|---|---|---|
| PFBA | `<1.6`, ITRC/ATSDR class value, `origin estimated` | `<1.6`, **Vierke 2013**, `origin derived` | same number, real primary |
| PFBS | `<1.6`, ATSDR class | **`<0.3`**, Vierke 2013 | **tightened** — PFBS is a *sulfonic* acid, bounded separately and far harder |
| PFOS | `<1.0`, Cheng 2009, mislabelled `origin measured` | **`<0.3`**, Vierke 2013 | Cheng kept as an alternative, with its unevidenced `measured` label called out |

All three stay `flagged`: a **bound over a homologue class** is not a compound
determination, and the sulfonate bounds rest on a *non-observation* (nothing volatilized)
— the weakest kind of experimental evidence. Honest labelling, not false promotion.

### Temperature: four fabricated 298.15 K removed

Phase 2 §2 recorded 29 records carrying a **conventional** 298.15 K the source never
gave. In the four PFAS records rewritten here that assumption is now written as the
absence it is: `temperature not stated;`. **The other 25 remain** — they were not
touched, and removing them is a mechanical follow-up (see 6.6).

## 6.3 Brief items worked, with outcomes

| item | outcome |
|---|---|
| **metformin** step numbering | **Verified correct.** Steps are already by ascending pKa (~2.8 → 12.4). Phase 2 stated the source's inverted labelling only in `pKa1`; the clash is now stated in **`pKa2` as well**, so a reader landing on either file alone sees it. No numbers changed. |
| **glyphosate** 4-step vs 3-step | **No settling determination found. Not merged.** Both sets stand. Reasoning recorded in all four records: glyphosate has four ionisable protons, so a 3-step set is necessarily a merged pair or a truncated window — but no source seen says *which*, and guessing would manufacture chemistry. Sharpened action: a full potentiometric speciation resolving all four constants **with site assignment**, at stated T and I. |
| **PFOA** spread | See 6.2 — datum re-pointed, spread documented as genuinely unresolved rather than papered over. |
| **taurine** pKa1 / pI | **No open primary found; both stay `flagged`, values unchanged.** The search is recorded so it is not repeated: PubChem CID 1123 gives exactly one pKa (1.5) attributed to **Dawson et al., *Data for Biochemical Research*, 3rd ed. (1986)** — an OUP compilation, same excluded class as Merck/CRC/Lange. Its other entries point at the *IUPAC Digitized pKa Dataset*, unusable **twice over** (a digitisation of Serjeant & Dempsey / Perrin — a compilation of a compilation — under **CC BY-NC 4.0**, which `CLAUDE.md` excludes outright). |
| **4 NSAID pKa** (deleted in phase 4) | **Best-candidate primary identified, not obtainable. Records unchanged, still `rightsPending`.** See 6.4. |
| **levulinicAcid** pKa | **No record created.** See 6.5. |

## 6.4 The NSAID replacement — identified, blocked, documented

The right target was found: **Meloun, Bordovská & Galla, *J. Pharm. Biomed. Anal.* 45
(2007) 552–564**, doi `10.1016/j.jpba.2007.07.029`. Its abstract (read) states it
determines mixed dissociation constants **at I = 0.003–0.155**, at **25 °C and 37 °C**,
then estimates the **thermodynamic pKa by regression of the (pKa, I) data** — precisely
the missing metadata this whole directory is short of, and a determination rather than a
compilation, so the rights problem disappears.

**Blocker:** the abstract prints no numbers and the full text is paywalled. A value may
not be transcribed from a paper nobody has read. Nothing was changed.

**Coverage warning now written into each record:** Meloun's four drugs are ibuprofen,
diclofenac, **flurbiprofen** and ketoprofen. **Naproxen is not among them** and needs a
separate primary — it is the hardest of the four, and it is also the compound whose
*partition* record was downgraded in the same phase (see the partition ledger), so
**both of naproxen's legs are currently unusable**.

Routes rejected, recorded so they are not retried: the CC BY-NC IUPAC digitisation
(above); and **Hidalgo et al., *Membranes* 13 (2023) 868** — open access CC BY, and its
Table 3 does print ketoprofen pKa 3.98 / carbamazepine 13.9, but phase 6 read the paper
and the table is **compiled from its own refs [25]–[27]**, not measured. *An open-access
re-quote of a closed compilation launders nothing.*

## 6.5 levulinicAcid — the gap phase 2 called "the most consequential", sharpened not filled

**No record created.** A carboxylic acid with a pKa squarely in the working window and
still no datum — but the only routes found are compilations:

- **PubChem CID 11579**: `pKa 4.64 (at 18 °C)`, attributed to **"KORTUM, G ET AL (1961)"**
  — Kortüm, Vogel & Andrussow, the IUPAC critical compilation of organic-acid
  dissociation constants. Functionally identical to Merck / CRC / Serjeant & Dempsey: a
  **locator**, not a source of record.
- PubChem's other entry is the **CC BY-NC** IUPAC digitisation — excluded.
- The commonly-quoted **4.59 at 25 °C** traces to a review citing an unnumbered reference.

Worth noting for whoever picks this up: **4.64 @ 18 °C and 4.59 @ 25 °C are two different
numbers at two different temperatures**, which is consistent (a carboxylic acid weakens
slightly as T rises through this range) but must not be conflated into one value.

**Sharpened action:** obtain the Kortüm/Vogel/Andrussow entry, trace the experimental
report it cites, read that report, confirm 4.64 @ 18 °C and its ionic strength. Only then
emit the record.

## 6.6 Sugar placeholders — anchored, still not promotable

The four unpinned placeholders (galactose ~12.35, arabinose ~12.34, lactose ~11.98,
trehalose ~12.5) plus the two `rightsPending` Merck-Index values (fructose, xylose) now
each carry the **Thamsen anchor**: the same paper measures **glucose at pK′ 12.43 @ 18 °C**
(12.92 @ 0 °C), confirming the order of magnitude and the rung (alcoholate formation).

**This does not promote any of them.** Thamsen's own mannitol/sorbitol pair differ by
0.07 — more than some placeholders differ from each other — so "close enough" reasoning
across different sugars is not available. A different sugar is a different measurement.

A second target is named in each: **Christensen, Rytting & Izatt, *J. Chem. Soc. B* (1970)
1646**, calorimetric titration of several monosaccharides at 10 and 40 °C reporting pK
**with ΔH° and ΔS°** — i.e. the temperature dependence this directory lacks everywhere.
Paywalled; not read.

## 6.7 Coverage after phase 6

| | phase 2 | phase 6 |
|---|---|---|
| records | 68 | **70** |
| compounds with ≥1 dissociation record | 39 | **41** (+ sorbitol, mannitol) |
| records stating an ionic strength | **0** | **2** |
| records with a fabricated conventional 298.15 K | 29 | **25** (4 removed) |
| compounds with no record | 18 | **16** |
| `status candidate` | — | 16 |
| `status flagged` | — | 54 |
| `status rightsPending` | — | 0 — *see 6.10, rights live in the `licence` field here* |

Legitimately **non-ionizable** (unchanged, 7): diuron, testosterone, progesterone,
iopromide, urea, NDMA, acrylamide. Phase 2's honesty caveat stands — for five of these
the evidence is *absence of a PubChem/DrugBank record*, which is weaker than a
measurement; only testosterone and progesterone carry an explicit "no acidic pKa".

Still **no datum staged** (9): xylitol, erythritol, **levulinicAcid**, nPropanol,
furfurylAlcohol, HMF, gammaValerolactone, limonene, alphaPinene. Of these only
levulinicAcid and the two remaining polyols are chemically consequential; the terpenes
and hydrocarbons have no ionizable group and the alcohols none in the ambient window.

## 6.8 Genuinely unfillable from open sources (as of phase 6)

1. **The 22 amino-acid consensus records.** Every one still `flagged`, still without an
   ionic strength. The lineage the source names (Smith & Smith 1942; King 1951;
   Nozaki & Tanford 1967) is the right target and would supply both T and I, but none
   was obtainable in this phase.
2. **4 NSAID pKa** — primary identified (Meloun 2007), paywalled; naproxen not even
   covered by it.
3. **levulinicAcid** — compilation-only.
4. **taurine** pKa1 (and therefore its pI) — compilation-only.
5. **glyphosate** — needs a site-assigning 4-constant speciation study.
6. **4 sugar placeholders + fructose/xylose** — anchored, not measured.
7. **atrazine / simazine** (BCPC Pesticide Manual) and **fructose / xylose** (Merck
   Index) — untouched by phase 6; the phase-4 rights actions stand.

**Correction to phase 2 §5.1, noticed while auditing:** estradiol is **no longer**
DrugBank-sourced. Phase 4 already executed the re-sourcing that phase 2 asked for — the
datum is now **Lewis & Archer, *Steroids* 34 (1979) 485–499** (PMID 516114, abstract read,
value stated verbatim), with the CC BY-NC DrugBank figure demoted to an excluded
`crossCheck {}` that may never be promoted. It legitimately sits at `candidate`. The
phase-2 §5 text implying it is still pending is stale; do not act on it.

## 6.10 Status-vocabulary divergence between the two directories (reported, not changed)

Worth knowing before anyone compares the two ledgers, because the same words are used
differently:

- **`chemistry/aqueousSpeciation/`** (this directory) carries the rights position in the
  **`licence` field** (`licence "rightsPending -- ..."`) while `status` reports only
  *evidential* quality. Consequently **no record here has `status rightsPending`**, even
  though 8 records are rights-blocked (the 4 NSAIDs, atrazine, simazine, fructose, xylose).
  A reader scanning `status` alone will not see the rights block.
- **`parameters/partition/`** carries the rights position in **`status`**, per the phase-6
  advisor ruling, and now has 19 `status rightsPending`.

Phase 6 did **not** unify them. Both conventions are internally coherent, all 8 blocked
speciation records already sit at `flagged` (so none is resting on an unearned clean
status, which is what the ruling actually guards against), and rewriting a convention that
phase 4 established across a whole directory is a curator's decision, not an agent's.

**Follow-up for the curator:** pick one convention and apply it to both directories. The
partition convention is the safer of the two — a rights problem that is invisible in the
field everyone reads is a rights problem waiting to be missed.

## 6.9 Follow-ups (revising phase 2 §8)

1. Strip the remaining **25 fabricated `298.15 K`** entries to `not stated`, as done for
   the four PFAS records. Mechanical, no research needed, and it removes 25 invented data
   points from the tier.
2. Obtain **Meloun 2007** (unblocks 3 of 4 NSAIDs) and a naproxen primary.
3. Obtain the **Kortüm 1961** entry for levulinicAcid and trace its primary.
4. Chase the amino-acid primaries — the single largest block of `flagged` records (22)
   and the largest ionic-strength hole.
5. Items 1–6 of phase 2 §8 that phase 6 did not reach remain open, unchanged.

---

# PHASE 7 (2026-07-25) — the amino-acid pKa block (the largest unverified hole)

Scope: the **22 amino-acid dissociation records** (glycine ×2, alanine ×2, serine ×3,
valine ×2, glutamicAcid ×3, lysine ×3, arginine ×3, phenylalanine ×2, taurine ×2).
All 22 entered this phase resting on the CRC/Lehninger **consensus** lineage, with a
**fabricated 298.15 K** and **`ionicStrength not stated`** — a pKa without T and I is not
a usable thermodynamic constant.

Working rule (unchanged from phase 6): **a value is promotable only if the curator
opened the primary and saw the pKa reported WITH its temperature and ionic strength.**

## 7.1 Outcome in one line

**Zero amino-acid records reached `candidate` with T + I stated.** No primary reporting
an amino-acid pKa *with its conditions* could be **obtained and read** this phase, so —
per the anti-fabrication rule — **nothing was promoted, and no temperature or ionic
strength was invented.** What was done instead: every record was made **honest and
sharpened** (see 7.3).

The directory-wide count of **records stating an ionic strength stays 2** (mannitol,
sorbitol — the Thamsen 1952 polyol pair from phase 6). No amino-acid record joined them.

## 7.2 Retrieval attempts (recorded so they are not blindly repeated)

| route | result |
|---|---|
| **Web search** | **Unavailable** — the session's 200-call web-search budget was already exhausted upstream (phases 2/6). Without it the specific primary URLs could not be located. |
| **J. Res. NBS (public domain)** | **Pipeline CONFIRMED working**: `doi.org/10.6028/jres.043.*` resolves to `nvlpubs.nist.gov/nistpubs/jres/43/jresv43n6p###_A1b.pdf`, and these scans render page-by-page via the PDF reader (verified on RP2043, Bates & Pinching, *J. Res. NBS* 43 (1949) 519). **But vol 43 is Bates's tris/weak-base electrochemistry, not amino acids** — probed DOIs .045/.046/.047/.048 hit a metallurgy gage, more base/buffer papers, none an amino acid. No amino-acid determination was located in the reachable NBS range. |
| **JBC open archive** (the natural home of the named lineage: Smith & Smith 1942, Nims & Smith 1936, Nozaki & Tanford 1967) | **403 Forbidden** to automated fetch (`jbc.org/content/122/1/109.full.pdf` etc.) after the ASBMB→Elsevier migration. Readable by a human via an institutional/open mirror, but not fetchable here. |

The NBS-PDF-via-DOI pipeline is a genuine asset for the **next** phase (it is public-domain
and machine-readable); it simply does not hold the amino-acid papers in the volume reached.

## 7.3 What changed in every record (envelope preserved; no value touched)

1. **`ionicStrength` → `notStated`** (explicit, was `not stated`) with an inline
   `// NOT invented` marker — the hole is now unmistakable, not incidental.
2. **`temperature 298.15 K`** kept but re-labelled `// NOMINAL 25 C of the consensus
   lineage; NOT read from a primary` — it is an assumption, and now says so. (No amino-acid
   T was deleted, because the consensus lineage does nominally sit at 25 °C; but it is no
   longer presented as a read datum. taurine-pKa1 already carried an honest T comment.)
3. **A `PHASE 7 … SHARPENED ACTION` block** naming, per record, the **specific paper +
   technique** to chase and the exact promotion steps (set T + I, add a `definition {}`
   block, re-point provenance). The generic "re-pin an open potentiometric primary" is
   replaced by a named target:
   - **glycine** → Owen, *J. Am. Chem. Soc.* 56 (1934) [pK1] + King, *J. Am. Chem. Soc.*
     73 (1951) [pK2 + explicit NaCl I-dependence]; both ACS-CLOSED. PREFERRED OPEN:
     Smith, Taylor & Smith, *J. Biol. Chem.* 122 (1937) / the Smith series.
   - **alanine** → Nims & Smith, *J. Biol. Chem.* (1936) + the Smith series [OPEN].
   - **serine / valine / phenylalanine (α-groups)** → the Smith *J. Biol. Chem.*
     amino-acid thermodynamics series [OPEN]; phenylalanine also Nozaki & Tanford 1967.
   - **glutamicAcid** → full potentiometric speciation (α-COOH, γ-COOH 4.25, α-NH3+);
     γ-COOH is the most tractable side chain (titrates near pH 4). Smith series /
     Nozaki & Tanford 1967 [OPEN].
   - **lysine (ε-NH3+) & arginine (guanidinium)** → **Nozaki & Tanford, *J. Biol. Chem.*
     242 (1967) 4731** [OPEN] reports these exposed side-chain intrinsic pK **at a stated
     ionic strength** — the single most promising open target for the side-chain records;
     arginine's guanidinium (12.48) additionally needs a high-pH/spectrophotometric route.
   - **technique note** in each: EMF of cells without liquid junction (H2 | AgCl,Ag) with
     Debye–Hückel extrapolation to I→0 gives the **thermodynamic** constant; a titration in
     a swamping electrolyte gives a **stoichiometric pK′ at stated I** — the record must say
     which, in a `definition {}` block, when promoted.

### Special cases

- **serine-pKaR (β-OH, ~13)** — marked a **permanent non-promotion**: an aliphatic alcohol
  alkoxide above the aqueous titration window, called "inert" by the source; no reliable
  potentiometric primary exists. Kept as an order-of-magnitude estimate.
- **taurine-pKa1 (sulfonate, ~1.5)** — **kept as an ESTIMATE**, per the explicit instruction
  ("do not dress an estimate as a determination"). Value, `origin estimated`, and
  `status rightsPending` all UNCHANGED; phase-7 note re-states the excluded routes
  (Dawson OUP compilation; CC-BY-NC IUPAC digitisation) and sharpens the chase to a
  conductometric/spectrophotometric primary. The derived **taurine-pI** inherits this and
  is likewise not promotable.
- **taurine-pKa2 (~9.06)** — approximate; sharpened to the α-NH3+ open route, value unchanged.

## 7.4 Values deleted on rights grounds

**None this phase.** The amino-acid values rest on the consensus lineage carried in the
`licence` field as `facts, primary-cited`; the rights concern is that the lineage reaches
us via paywalled compilations (CRC/Lehninger), which is why they are `flagged`, not
promoted — but each is a single re-cited fact with a named (open, once obtained) primary
lineage, not a systematic table extraction, so none was deleted. taurine-pKa1 remains
`rightsPending` (unchanged). Nothing was routed through an excluded source (no CRC value
was newly transcribed; the excluded IUPAC CC-BY-NC digitisation and Dawson OUP compilation
were explicitly NOT used).

## 7.5 Counts after phase 7

| | phase 6 | phase 7 |
|---|---|---|
| amino-acid dissociation records | 22 | 22 (unchanged) |
| amino-acid records at `candidate` **with T + I stated** | 0 | **0** |
| amino-acid records `flagged` with a **sharpened, named** action | 0 (generic) | **21** |
| amino-acid records `rightsPending` (taurine-pKa1) | 1 | 1 |
| directory-wide records stating an ionic strength | 2 | **2** (mannitol, sorbitol — unchanged) |
| amino-acid values deleted on rights grounds | — | **0** |

**Records in the whole directory that reached `candidate` with a stated ionic strength
(count = 2, unchanged from phase 6):** `mannitol-pKa1`, `sorbitol-pKa1` (Thamsen,
*Acta Chem. Scand.* 6 (1952) 270, pK′ at I = 0.015–0.05 mol/L NaOH). **No amino-acid
record is on this list.**

## 7.6 Follow-ups (the single most valuable next move)

1. **Obtain Nozaki & Tanford, *J. Biol. Chem.* 242 (1967) 4731** via an open/institutional
   mirror and read it: it is open-access AND reports lysine-ε, arginine-guanidinium (and
   aromatic-residue) intrinsic pK **at a stated ionic strength** — it can promote the
   lysine-pKaR and arginine-pKaR records in one read, and anchor several others.
2. **Obtain the Smith/Nims *J. Biol. Chem.* amino-acid thermodynamics series (1936–1942)** —
   the open, EMF, I→0 source for the α-COOH / α-NH3+ constants of glycine, alanine, serine,
   valine, phenylalanine, glutamicAcid.
3. When web search is available again, locate the exact JBC/NBS URLs; the NBS-PDF-via-DOI
   pipeline (7.2) is confirmed readable for anything in that public-domain archive.
4. Phase 6 §6.9 follow-ups 2–5 remain open, unchanged.
