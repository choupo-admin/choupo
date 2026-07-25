# PROVENANCE — data/tmp staging log

Running log of what was staged, from where, under what licence.  Read this
before curating anything out of `data/tmp/`.  Session: overnight research trawl,
2026-07-24.

## KEY FINDING (read first) — the real gap
`data/standards/components/` has **247** public components; `data/local/components/`
already has **625** (the ChemSep-derived set from the legal scrub).  Combined
unique names: **784**.  So the common industrial solvents/alcohols/amines/ketones/
alkanes I first reached for (isopropanol, glycerol, DMSO, MEA, MEK, THF, C13–C27…)
are **already present in the private `local` tier** — re-fetching them adds little.

The genuine, valuable gap = compounds absent from **BOTH** tiers, and aligned
with Choupo's differentiator (NF/RO membranes — Vítor's research) and its existing
solute cases (glucose/sucrose).  Every future batch is filtered against
`standards ∪ local` before staging (see the filter in the session).

Two distinct promotion tracks exist and must not be conflated:
- **(A) genuinely new** compounds → stage identity here, curate properties later.
- **(B) already in `local`, want it PUBLIC** → NOT a re-fetch; it is a per-value
  LICENCE decision on whether an open primary source exists to republish. Out of
  scope for a data trawl; flagged for Vítor.

## Sources used (all legally reusable)
- **PubChem PUG-REST** (`/rest/pug/compound/name/<n>/property/…/JSON`) — US NIH,
  data free of copyright (public domain).  Used for identity ONLY: formula, MW,
  SMILES/InChI/InChIKey, IUPAC name, CID.  A CAS number quoted is the bare
  registry number as listed on the public record (not the proprietary CAS
  arrangement, not CAS Common Chemistry which is CC-BY-NC = excluded).
- (Property values: NONE taken from any compilation. See README legal rule.)

## Batch 1 — common solvents (2026-07-24)  ⚠ mostly redundant
| candidate | formula | CAS | CID | in local? | note |
|---|---|---|---|---|---|
| isopropanol | C3H8O | 67-63-0 | 3776 | **YES** | redundant w/ local; low value |
| nPropanol | C3H8O | 71-23-8 | 1031 | no | genuinely new (only sub-value: local has `onePropanol`/`1Propanol` variants — check naming) |
| glycerol | C3H8O3 | 56-81-5 | 753 | **YES** | redundant |
| ethyleneGlycol | C2H6O2 | 107-21-1 | 174 | **YES** | redundant |
| acetonitrile | C2H3N | 75-05-8 | 6342 | **YES** | redundant |
Kept as worked examples of the pipeline. **Pipeline PROVEN**: a staged candidate
(identity + Joback groups) runs straight through `bin/estimate` → Choupo's own
Joback/Lee-Kesler property estimate (isopropanol: Tb 360 K, Tc 526 K, ω 0.59 —
Joback polar over-estimate, as expected).  That is the legal route to numbers.

## Batch 2 — sugars, NF/RO rejection family (2026-07-24)  ✅ all genuine gaps
Extends the shipped glucose/sucrose cases.  Non-volatile non-electrolyte solutes;
staged on the glucose.dat template (role nonvolatile, dissociation 1).  Groups
PROPOSED (review); `standardThermochemistry` FLAGGED (needs PRIMARY calorimetry —
do NOT fabricate, exactly as glucose.dat flags its solid Cp).
| candidate | formula | CAS | CID | class |
|---|---|---|---|---|
| fructose | C6H12O6 | 57-48-7 | 2723872 | keto-hexose |
| galactose | C6H12O6 | 59-23-4 | 6036 | aldo-hexose |
| xylose | C5H10O5 | 58-86-6 | 135191 | aldo-pentose |
| arabinose | C5H10O5 | 5328-37-0 | 439195 | aldo-pentose |
| lactose | C12H22O11 | 63-42-3 | 6134 | disaccharide (groups TODO) |
| trehalose | C12H22O11 | 99-20-7 | 7427 | disaccharide (groups TODO) |

## Batch 3 — small RO solutes / ampholytes (2026-07-24)  ✅ all genuine gaps
Non-volatile aqueous solutes; staged as identity + `role nonvolatile` + honest
NEEDS.  Joback often DOESN'T apply (missing amide/sulfonic/urea groups, or the
species is a zwitterion, not a VLE component) — flagged, no meaningless volatility
estimate proposed.  These are characterized as SOLUTES (MW, pKa/charge, rejection).
| candidate | formula | CAS | CID | role note |
|---|---|---|---|---|
| urea | CH4N2O | 57-13-6 | 1176 | classic low-rejection RO benchmark |
| glycine | C2H5NO2 | 56-40-6 | 750 | amino-acid zwitterion (pI~6.0) |
| alanine | C3H7NO2 | 56-41-7 | 5950 | amino-acid zwitterion (pI~6.1) |
| taurine | C2H7NO3S | 107-35-7 | 1123 | sulfonate ampholyte (permanent charge) |
| acrylamide | C3H5NO | 79-06-1 | 6579 | neutral micropollutant, slightly volatile |

## Batch 4 — NF/RO micropollutant benchmarks (2026-07-24)  ✅ all genuine gaps
The differentiator family (Vítor's research).  Non-volatile trace organics; staged
as identity + `role nonvolatile` + membrane-rejection NEEDS.  NO Joback (complex
polycyclics/amides/triazines — volatility meaningless); characterized by MW, logKow,
pKa/charge, size.  Rejection descriptors are LEADS to verify vs an open primary.
| candidate | formula | CAS | CID | rejection note |
|---|---|---|---|---|
| caffeine | C8H10N4O2 | 58-08-2 | 2519 | neutral tracer, moderate NF rejection |
| bisphenolA | C15H16O2 | 80-05-7 | 6623 | endocrine disruptor, hydrophobic |
| atrazine | C8H14ClN5 | 1912-24-9 | 2256 | neutral herbicide benchmark |
| carbamazepine | C15H12N2O | 298-46-4 | 2554 | most-used pharma NF/RO benchmark |
| ibuprofen | C13H18O2 | 15687-27-1 | 3672 | anionic NSAID (pKa~4.9) |
| diclofenac | C14H11Cl2NO2 | 15307-86-5 | 3033 | anionic NSAID, well rejected |

## Batch 5 — sugar alcohols + steroid EDCs (2026-07-24)  ✅ all genuine gaps
Polyols (sorbitol, mannitol, xylitol, erythritol): non-volatile solutes with a
CLEAN Joback group decomposition (CH2/CH/OH) — the group block IS valid and feeds
UNIFAC activity for the dissolved solute.  BUT the Joback *VLE* extrapolation is
PHYSICALLY MEANINGLESS for these OH-heavy nonvolatiles (sorbitol → Tc 1093 K,
ω 2.64 — nonsense); the real datum is the SOLID formation datum (flagged, primary).
Honest lesson: valid groups ≠ trustworthy volatility for a nonvolatile.
Steroid EDCs (estradiol, estrone): fused-ring, solute-characterized (logKow, pKa).
| candidate | formula | CAS | CID | kind |
|---|---|---|---|---|
| sorbitol | C6H14O6 | 50-70-4 | 5780 | hexitol (clean groups) |
| mannitol | C6H14O6 | 69-65-8 | 6251 | hexitol (clean groups) |
| xylitol | C5H12O5 | 87-99-0 | 6912 | pentitol (clean groups) |
| erythritol | C4H10O4 | 149-32-6 | 222285 | tetritol (clean groups) |
| estradiol | C18H24O2 | 50-28-2 | 5757 | estrogenic EDC benchmark |
| estrone | C18H22O2 | 53-16-7 | 5870 | estrogenic EDC benchmark |

## Batch 6 — amino-acid ampholyte series (2026-07-24)  ✅ all genuine gaps
Extends glycine/alanine with CONTRASTING isoelectric points, the teaching set for
pH-dependent NF rejection: acidic (glutamate pI~3.2) → neutral (serine/valine/
phenylalanine pI~5.5-6.0) → basic (lysine pI~9.7, arginine pI~10.8).  Zwitterions;
solute characterization (pI/pKa are leads to verify), not VLE.
| candidate | formula | CAS | CID | pI (verify) |
|---|---|---|---|---|
| serine | C3H7NO3 | 56-45-1 | 5951 | ~5.68 |
| valine | C5H11NO2 | 72-18-4 | 6287 | ~5.96 |
| glutamicAcid | C5H9NO4 | 56-86-0 | 33032 | ~3.22 (acidic) |
| lysine | C6H14N2O2 | 56-87-1 | 5962 | ~9.74 (basic) |
| arginine | C6H14N4O2 | 74-79-3 | 6322 | ~10.76 (basic) |
| phenylalanine | C9H11NO2 | 63-91-2 | 6140 | ~5.48 |

## Batch 7 — PFAS emerging contaminants (2026-07-24)  ✅ all genuine gaps
"Forever chemicals" — perfluorinated acids, anionic at neutral pH; NF/RO rejection
by permanent charge + chain length.  Teaching contrast: C8 (PFOA/PFOS, well
rejected, being phased out) vs C4 (PFBA/PFBS short-chain replacements, small anion,
HARD to reject).  Solute characterization (no Joback perfluoro parameters).
| candidate | formula | CAS | CID | chain |
|---|---|---|---|---|
| PFOA | C8HF15O2 | 335-67-1 | 9554 | C8 carboxylate |
| PFOS | C8HF17O3S | 1763-23-1 | 74483 | C8 sulfonate |
| PFBA | C4HF7O2 | 375-22-4 | 9777 | C4 carboxylate |
| PFBS | C4HF9O3S | 375-73-5 | 67815 | C4 sulfonate |

## VALUE REFLECTION (mid-trawl)
Batches 2-7 are non-volatile SOLUTES — high research value, but every one needs
heavy curation (thermochemistry flagged, no VLE).  The next batches pivot to
GENUINELY-NEW VOLATILE molecules that ESTIMATE CLEANLY via Joback → directly
promotable with Choupo's OWN numbers (like the solvent/polyol pipeline proof):
- Terpenes (limonene, alpha/beta-pinene, camphene) — bio-based green solvents.
- Biorefinery platform molecules (5-HMF, levulinic acid, furfuryl alcohol,
  gamma-valerolactone) — absent from petrochemical ChemSep, cleanly estimable.

## Batch 8 — terpenes + biorefinery platform molecules (2026-07-24)  ✅ all gaps
Genuinely-new VOLATILE molecules (green/bio solvents + platform chemicals).
| candidate | formula | CAS | CID | Joback estimability |
|---|---|---|---|---|
| levulinicAcid | C5H8O3 | 123-76-2 | 11579 | CLEAN (linear keto-acid) — groups given |
| limonene | C10H16 | 5989-27-5 | 440917 | imperfect (ring-ene) — groups flagged |
| alphaPinene | C10H16 | 80-56-8 | 6654 | poor (bridged bicyclic) — flagged |
| HMF | C6H6O3 | 67-47-0 | 237332 | imperfect (furan heteroaromatic) — flagged |
| furfurylAlcohol | C5H6O2 | 98-00-0 | 7361 | imperfect (furan) — flagged |
| gammaValerolactone | C5H8O2 | 108-29-2 | 7921 | imperfect (ring lactone) — flagged |

## ⚠ HONEST CORRECTION to the earlier "pipeline PROVEN end-to-end" claim (batch 1)
The isopropanol/sorbitol `bin/estimate` runs succeeded only because those names
ALREADY EXIST in `data/local` WITH a full vaporPressure/Antoine block — my
candidate merely overlaid its `groups{}`.  For a GENUINELY-NEW bare-groups
candidate (levulinicAcid, present nowhere), `bin/estimate` FAILS at package build:
  "Component 'levulinicAcid': no 'vaporPressure' block. ... Joback gives no
   Antoine ... fit it or supply a corresponding-states model."
i.e. the generated gammaPhi(+idealGas) package needs Psat, which bare Joback
groups don't provide; the estimate op's Ambrose-Walton Psat lives in the PROPOSAL
it writes, which must be PROMOTED to close the loop.  So the honest pipeline is:
  stage identity+groups → bin/estimate WRITES a proposal (Joback + Ambrose-Walton
  Psat + Rackett Vliq) → REVIEW+PROMOTE the proposal → THEN it runs.
Not a blocker for staging (these are for curation), but bin/estimate does NOT
bootstrap a brand-new component in one shot — a possible dev papercut to note.
Also learned: "volatile" ≠ "clean Joback" — rings/heteroaromatics/bicyclics break
first-order group contribution; only linear molecules estimate cleanly.

## Wikidata CC0 numbers probe (2026-07-24) — NEGATIVE finding, documented
Probed the Wikidata SPARQL endpoint (data is CC0, fully redistributable) by
InChIKey for property values on staged candidates:
- levulinic acid (Q903322): only melting point (~29), no bp/density.
- (+)-limonene (Q27888324): only melting point (~-74), no bp/density.
Coverage is THIN (scattered mp only, no Tc/Pc/Antoine/Cp/ω a component needs),
units often implicit, and — decisive for Choupo's doctrine — values rarely carry
a PRIMARY citation (they cite an aggregator database).  CONCLUSION: the "CC0
numbers via Wikidata" path does NOT substitute for Choupo's own estimator or
curated primary literature.  NO Wikidata numbers were staged.  The two legal
number-paths remain: (1) Choupo's Joback/Lee-Kesler estimate (linear molecules),
(2) a curated PRIMARY value with its citation (as glucose.dat does).

## Batch 9 — the RO-passing benchmark (2026-07-24)
| candidate | formula | CAS | CID | role |
|---|---|---|---|---|
| NDMA | C2H6N2O | 62-75-9 | 6124 | carcinogen that PASSES RO — low-rejection benchmark (pairs with urea) |

## SATURATION NOTE (mid-trawl, ~03:20)
Both legal paths are now characterized; the ChemSep `data/local` tier (625) already
covers common industrial VOLATILES, so genuine gaps are dominated by NON-VOLATILE
research solutes (sugars/drugs/PFAS/amino acids) — all needing curated primary
thermochemistry.  Further batches add marginal breadth; cadence slowed.  The
high-value deliverable is this ORGANIZED, provenance-clean candidate set for
Vítor's curation, not raw count.

## Batch 10 — glyphosate + CONSOLIDATION (2026-07-24)
- glyphosate (C3H8NO5P, CAS 1071-83-6, CID 3496): world's most-used herbicide;
  multiprotic zwitterion — charge-dominated NF/RO rejection, heavily studied.
- CONSOLIDATION: `INDEX.md` generated (single decision surface, 42 genuine).
  Duplicate check vs standards∪local run: the 4 batch-1 solvents (acetonitrile,
  ethyleneGlycol, glycerol, isopropanol) collide → MOVED to
  `data/tmp/redundant-in-local/` as pipeline examples; `components/` now holds
  ONLY genuine gaps.  (Note: nPropanol stays, but local has 1Propanol/onePropanol
  naming variants — a naming reconciliation for Vítor, not a new compound.)

## Batch 11 — pharma / pesticide / hormone micropollutants (2026-07-24)  ✅ gaps
| candidate | formula | CAS | CID | note |
|---|---|---|---|---|
| sulfamethoxazole | C10H11N3O3S | 723-46-6 | 5329 | sulfonamide antibiotic (anionic pH7) |
| trimethoprim | C14H18N4O3 | 738-70-5 | 5578 | antibiotic (weak base) |
| metformin | C4H11N5 | 657-24-9 | 4091 | small hydrophilic cation — hard to reject |
| simazine | C7H12ClN5 | 122-34-9 | 5216 | triazine herbicide |
| diuron | C9H10Cl2N2O | 330-54-1 | 3120 | phenylurea herbicide |
| ethinylestradiol | C20H24O2 | 57-63-6 | 5991 | potent synthetic estrogen EDC |

## Batch 12 — NF/RO rejection tracers (2026-07-24)  ✅ gaps
Spanning the rejection spectrum for a teaching series: from iopromide (large
neutral, WELL rejected) to primidone (small neutral, POORLY rejected).
| candidate | formula | CAS | CID | note |
|---|---|---|---|---|
| iopromide | C18H24I3N3O8 | 73334-07-3 | 3736 | MW 791 neutral — well-rejected extreme |
| atenolol | C14H22N2O3 | 29122-68-7 | 2249 | beta-blocker cation (pKa~9.6) |
| gemfibrozil | C15H22O3 | 25812-30-0 | 3463 | fibrate acid (anionic pH7) |
| primidone | C12H14N2O2 | 125-33-7 | 4909 | small neutral — poorly-rejected extreme |
| naproxen | C14H14O3 | 22204-53-1 | 156391 | NSAID acid |
| ketoprofen | C16H14O3 | 22071-15-4 | 3825 | NSAID acid |

## Batch 13 — steroid EDC completion (2026-07-24)  ✅ gaps
Completes the studied steroid endocrine-disruptor set for NF/RO.
| candidate | formula | CAS | CID | note |
|---|---|---|---|---|
| estriol | C18H24O3 | 50-27-1 | 5756 | most hydrophilic estrogen |
| testosterone | C19H28O2 | 58-22-0 | 6013 | androgen, neutral |
| progesterone | C21H30O2 | 57-83-0 | 5994 | progestogen, hydrophobic |
Steroid EDC family now complete: estradiol, estrone, ethinylestradiol, estriol,
testosterone, progesterone.

## Deliverable state: 57 genuine candidates + INDEX.md + README.md + PROVENANCE.md
(6 sugars + 5 small solutes + 18 micropollutants + 9 EDC steroids/polyols
 + 6 amino acids + 4 PFAS + 6 terpenes/platform + 1 NDMA + 1 glyphosate + nPropanol)
A coherent NF/RO SOLUTE LIBRARY (Choupo's differentiator) is the night's main
yield — sugars, polyols, amino-acid ampholytes, PFAS, and 18 trace-organic
micropollutants spanning the rejection spectrum.  All identity-verified,
GPL-3-clean, property-numbers flagged for curation.

## QA pass (2026-07-24, ~05:38) — CLEAN
- 54/54 files well-formed (name/formula/CAS/MW present; name field == filename).
- 0 duplicate CAS; INDEX.md line count == file count (54). ✓
- 2 shared InChIKey CONNECTIVITY blocks are legitimate DIASTEREOMER pairs
  (arabinose/xylose C5H10O5; mannitol/sorbitol C6H14O6) — full InChIKeys differ,
  distinct compounds, intentional.  NOT accidental duplicates.
Deliverable is internally consistent and ready for Vítor's curation.  The
high-value family space is SATURATED (ChemSep local covers common volatiles;
both legal number-paths characterized) — further trawling yields marginal breadth.
All GPL-3-clean (public-domain identity; numbers TODO via Choupo estimator or
curated primary).  Both legal number-paths characterized; Wikidata CC0 too thin.
Remaining breadth for Vítor's NF/RO domain (future ticks, slow cadence):
pharma (sulfamethoxazole, trimethoprim, metformin, tetracycline), pesticides
(simazine, diuron), hormones (ethinylestradiol, testosterone, progesterone).

---

# PHASE B — REAL-DATA ENRICHMENT (2026-07-24, after Vítor's "these are empty" call)
The Phase-A files were identity shells (juiceless).  Correct.  Phase B fills REAL,
PRIMARY-CITED property VALUES.  Legal basis: individual property values are FACTS
(not the copyrightable compilation/arrangement); they go into the PRIVATE gitignored
`data/tmp` (Vítor's tier, like data/local), each re-cited to its PRIMARY — so no
public-repo redistribution line is crossed.  Sources mined: NIST WebBook FREE view
(condensed-phase ΔfH°/S°/Cp with the primary paper it cites — many Russian/Soviet
calorimetry primaries, per Vítor) + PubChem PUG-View experimental properties.
Subscription-only values (NIST TRC pro, paywalled J. Chem. Thermodyn.) stay FLAGGED,
never fabricated.

## Real thermochemistry now IN the files (primary-cited):
Sugars/polyols (crystalline ΔfH° unless noted):
  fructose   -1265.6 kJ/mol [Clarke & Stegeman, JACS 61 (1939) 1726]
  sorbitol   -1353.7 kJ/mol [Gerasimov et al., Izv.Vyssh.Uchebn.Zaved.Khim. 28 (1985) 54 — RU]
  mannitol   -1337.5 kJ/mol [McClaine, PhD Stanford (1947)]
  erythritol  -885.2 kJ/mol [Parks et al., JACS 68 (1946) 2524]
  xylitol    -1118.6 kJ/mol (LIQUID datum) [Oberemok-Yakubova & Balandin, Bull.Acad.Sci.USSR (1963) 2038 — RU]
  galactose  S°=205.4, Cp~216 [NIST condensed-phase]
  xylose     S°=143.5 [Miller, Iowa State Coll. J. Sci. 10 (1935) 91]
  lactose    Cp=417.6 [Kawaizumi et al. (1981)]
Amino acids (crystalline ΔfH° / S° / Cp, all primary-cited):
  glycine      -527.5 / 103.51 / 95    [Vasil'ev 1991 RU; Hutchens 1960; Badelin 1990]
  alanine      -560.0 / 129.21 / 122.3 [Contineanu 1984; Hutchens 1960]
  serine       -732.7 / 149.16 / 138.9 [Sabbah & Laffitte 1978; Hutchens 1964]
  glutamicAcid -1003.3 / 188.20 / 175.1 [Sakiyama & Seki 1975; Hutchens 1963]
  valine       -628.9 / 178.87 / 168.5 [Vasil'ev 1991 RU; Hutchens 1963; Spink & Wadso 1975]
  phenylalanine  (dHf flag) / 213.64 / 203.1 [Cole-Hutchens-Stout 1963; Spink & Wadso 1975]

## Status: 16 files carry REAL thermochemistry; 9 have a numeric ΔfH°_298.
The RICH free-data zone is the well-studied crystalline solutes (sugars, polyols,
amino acids).  Drugs/PFAS/hormones have sparse free thermochemistry — those will
stay physical-facts + flags until an open primary is found.
