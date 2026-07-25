# Amino-acid candidate enrichment — sources & provenance

PRIVATE tier (`data/tmp/`, gitignored). Every value below is a FACT recorded
with its PRIMARY source (author/journal/year). Where the exact number sits
behind a paywall or in a 51-point profile I could not transcribe, the value is
**FLAGGED** — not fabricated. Retrieved 2026-07-24.

Compounds: glycine, alanine, serine, valine, glutamicAcid, lysine, arginine,
phenylalanine, taurine. All are aqueous ampholytes/zwitterions — NF/RO
rejection is governed by charge speciation about the isoelectric point, so
**speciation is the first-class datum** here.

Water constants used for Stokes–Einstein: η(H₂O, 25 °C) = 0.8903 mPa·s;
k_BT(298.15 K) = 4.1160×10⁻²¹ J; r_s = k_BT/(6πηD).

---

## 1. Standard thermochemistry (crystalline zwitterion, pureSolid rung)

| Compound | ΔfH°(cr) kJ/mol | S°(cr) J/mol·K | Cp(cr,298) J/mol·K | Primary source(s) |
|---|---|---|---|---|
| glycine | −527.5 | 103.51 | 95.0 (Hutchens 99.2) | ΔfH: Vasil'ev, Borodin & Kopnyshev, Russ. J. Phys. Chem. 65 (1991) 29. S°/Cp: Hutchens, Cole & Stout, J. Am. Chem. Soc. 82 (1960) 4813; Cp also Badelin et al., Thermochim. Acta 169 (1990) 81. (CODATA-consistent ΔfH ≈ −528.5.) |
| alanine | −560.0 | 129.21 | 122.26 | ΔfH: Contineanu & Marchidan, Rev. Roum. Chim. 29 (1984) 43. S°/Cp: Hutchens, Cole & Stout, J. Am. Chem. Soc. 82 (1960) 4813 (Cp from 11–305 K). |
| serine | −732.7 | 149.1 | 134.7 | ΔfH: Sabbah & Laffitte, Thermochim. Acta 23 (1978) 192. S°/Cp(298): Pokorný, Štejfa, Havlín, Fulem & Růžička, *Molecules* 28 (2023) 451 (open; S°=149.1, Cp=134.7). Earlier S° 149.16 Hutchens et al., J. Biol. Chem. 239 (1964) 4194. |
| valine | −628.9 | 178.87 | 168.5 | ΔfH: Vasil'ev, Borodin & Kopnyshev, Russ. J. Phys. Chem. 65 (1991) 29 (Iris compilation confirms −628.9). S°: Hutchens, Cole & Stout, J. Phys. Chem. 67 (1963) 1128. Cp: Spink & Wadsö, J. Chem. Thermodyn. 7 (1975) 561. |
| glutamicAcid | −1003.3 | 188.2 | 175.08 | ΔfH: Sakiyama & Seki, Bull. Chem. Soc. Jpn. 48 (1975) 2203 (Iris: −1002.6, Contineanu, Chivu & Perisanu, J. Therm. Anal. Cal. 82 (2005) 3). S°: Hutchens et al., J. Biol. Chem. 238 (1963) 2407. Cp: Sakiyama & Seki 1975. |
| lysine | −678.7 | 240.7 | 289.2 | ΔfH: Vasil'ev, Borodin & Kopnyshev, Russ. J. Phys. Chem. 65 (1991) 29 (via NIST WebBook C56871, Mask=2: −678.7±1.5, combustion −3683.2). S°/Cp(298): Pokorný, Štejfa, Havlín, Fulem & Růžička, *Molecules* 28 (2023) 451 (open). |
| arginine | −637.7 (alt −635.5) | **FLAG** | **FLAG** | ΔfH: Yang, Liu, Gao, Hou & Shi (1999), combustion calorimetry — via the open Iris compilation (Neacşu/Perişanu, "The Enthalpy of Formation of L-α-Amino Acids", ID.000515), which lists 637.7 [ref 12] and 635.5 [ref 52]; also Lukýanova, Papina et al., Moscow Univ. Chem. Bull. 66 (2011) 88. S° and Cp: Pokorný et al., Int. J. Thermophys. 42 (2021) art. 156 — PAYWALLED, transcribe at curation. |
| phenylalanine | **−467.4 (DERIVED)** | 213.64 | 203.1 | ΔfH DERIVED by Hess from ΔcH°(cr) = −4646.3±0.8 kJ/mol [Tsuzuki, Harper et al., 1958, via NIST WebBook C63912 Mask=2] with ΔfH(CO₂,g)=−393.51, ΔfH(H₂O,l)=−285.83: ΔfH = 9(−393.51)+5.5(−285.83)−(−4646.3) = −467.4. S°: Cole, Hutchens & Stout (1963). Cp: Spink & Wadsö, J. Chem. Thermodyn. 7 (1975) 561. |
| taurine | −774.5 | 154.0 | 140.54 | ΔfH: Yang, Pilcher & Macnab, J. Chem. Thermodyn. 26 (1994) 787 (via NIST WebBook C91105792 Mask=2: −774.5±0.9; combustion −1614.9). S°/Cp: Huffman & Fox, J. Am. Chem. Soc. 62 (1940) 3464 (S°=154.0, Cp=140.54 at 300 K, low-T extrapolation flagged by NIST). |

NIST WebBook free view cites the primary and was used as the citing surface
(`webbook.nist.gov/cgi/cbook.cgi?ID=C<cas>&Mask=2`) for lysine, phenylalanine,
taurine. arginine's condensed-phase page routes to the paywalled TRC tables.

---

## 2. Speciation (pKa / pI) — the NF/RO-critical axis

Values are the accepted **consensus** set (Lehninger, *Principles of
Biochemistry*; CRC Handbook 84th ed.), whose lineage is aqueous potentiometric
titration at 25 °C (e.g. Smith & Smith, J. Biol. Chem. 1942; King, J. Am. Chem.
Soc. 1951; Nozaki & Tanford, 1967, for exposed side chains). Flagged as
**consensus**, not a single paper, unless noted.

| Compound | pKa1 (α-COOH) | pKa2 (α-NH₃⁺) | side-chain pKa | pI | net charge @ pH 7 |
|---|---|---|---|---|---|
| glycine | 2.34 | 9.60 | — | 5.97 | ≈ 0 (zwitterion) |
| alanine | 2.34 | 9.69 | — | 6.00 | ≈ 0 |
| serine | 2.21 | 9.15 | (β-OH, ~13, inert) | 5.68 | ≈ 0 |
| valine | 2.32 | 9.62 | — | 5.96 | ≈ 0 |
| glutamicAcid | 2.19 | 9.67 | 4.25 (γ-COOH) | 3.22 | ≈ −1 (anionic) |
| lysine | 2.18 | 8.95 | 10.53 (ε-NH₃⁺) | 9.74 | ≈ +1 (cationic) |
| arginine | 2.17 | 9.04 | 12.48 (guanidinium) | 10.76 | ≈ +1 |
| phenylalanine | 1.83 | 9.13 | — | 5.48 | ≈ 0 |
| taurine | ~1.5 (−SO₃H, strong) | ~9.06 (NH₃⁺) | — | ~5.2 | permanent −SO₃⁻; zwitterion, net ≈ 0 but a fixed anionic centre at ALL NF pH |

Taurine's sulfonate is deprotonated across the whole NF/RO operating window →
Donnan exclusion is driven by a permanent charge, unlike the α-carboxylates.

---

## 3. Membrane transport (D_aq, Stokes radius, partial molar volume)

- **D_aq(glycine) = 10.55×10⁻¹⁰ m²/s** — VERIFIED PRIMARY: Longsworth, "Diffusion
  Measurements, at 25°, of Aqueous Solutions of Amino Acids, Peptides and
  Sugars", J. Am. Chem. Soc. 75 (1953) 5705 (Gouy interferometry, infinite
  dilution). Corroborated: Lyons & Thomas 10.64, Woolf 10.59, Ma et al. 10.62
  (×10⁻¹⁰). ⇒ r_s = 0.233 nm (Choupo Stokes–Einstein).
- **D_aq(alanine) ≈ 9.10×10⁻¹⁰ m²/s** — Longsworth 1953; α-alanine also Gutter &
  Kegeles, J. Am. Chem. Soc. 75 (1953) 3893 (0.910×10⁻⁵ cm²/s). ⇒ r_s ≈ 0.270 nm.
- **Other amino acids: D_aq FLAGGED.** Primary studies exist but the exact
  infinite-dilution numbers are paywalled: Ma, Zhu, Wang et al., J. Chem. Eng.
  Data 50 (2005) 1192 (Taylor dispersion, Gly/Ala/Val/Ser/Arg…); Umecky et al.
  (Phe, Tyr); Germann, Turner & Allison, J. Phys. Chem. A 111 (2007) 1452 (NMR,
  12 amino acids incl. Arg, Glu, Lys, Phe, Ser — but in D₂O at pD 3.5, i.e. the
  cationic form, needs H₂O/charge correction). Provided instead: a Choupo
  Stokes–Einstein ESTIMATE of D and r_s from the partial molar volume (glass-box,
  labelled `Choupo estimate`), which is an own-estimate, not copied data.
- **Partial molar volume V°₂ (cm³/mol, 25 °C):** primary = Millero, Lo Surdo &
  Shin, "The apparent molal volumes and adiabatic compressibilities of aqueous
  amino acids at 25 °C", J. Phys. Chem. 82 (1978) 784. Well-established values:
  glycine 43.2, alanine 60.4, serine 60.6, valine 90.8, glutamicAcid 85.9,
  phenylalanine 121.5. lysine (~108.5), arginine (~127.3), taurine (~93) are
  **FLAGGED** — transcribe digit-exact from Millero 1978 / Mishra & Ahluwalia,
  J. Phys. Chem. 88 (1984) 86 before use.

Stokes–Einstein own-estimates (from V° → r → D), all labelled as estimates in
the .dat files: serine r≈0.288 nm D≈8.5e-10; valine r≈0.330 nm D≈7.4e-10;
glutamicAcid r≈0.324 nm D≈7.6e-10; lysine r≈0.351 nm D≈7.0e-10; arginine
r≈0.369 nm D≈6.6e-10; phenylalanine r≈0.364 nm D≈6.7e-10.

---

## 4. COSMO-SAC σ-profile — FLAGGED for ALL nine (not fabricated)

A COSMO-SAC (2002 variant) σ-profile is a 51-point vector (−0.025..0.025 e/Å²,
step 0.001) plus cavity area/volume, keyed by InChIKey. I did **not** transcribe
any profile — fabricating 51 numbers is forbidden and I could not verify the
files against the source here. Curation route per compound:

- Pull the profile for the **NEUTRAL (non-zwitterion) tautomer** — VT-2005/LVPP
  compute the gas-phase COSMO surface of the neutral molecule, NOT the aqueous
  zwitterion. This is the physically correct tautomer note the case must carry.
- Sources by InChIKey: **VT-2005** (Mullins et al., IECR 45 (2006) 4389; DFT-COSMO;
  US-gov PD via the usnistgov/COSMOSAC bundle) — glycine and several amino acids
  are present; **LVPP** (github lvpp/sigma, MIT, ~2500 compounds); **CHAOS**
  (CC-BY, ~53000). Match InChIKey, set `variant "2002"`, label `source`.

InChIKeys (from the candidate headers, PubChem): glycine DHMQDGOQFOQNFH,
alanine QNAYBMKLOCPYGJ, serine MTCFGRXMJLQNBG, valine KZSNJWFQEVHDMF,
glutamicAcid WHUUTDBJXJRKMK, lysine KDXKERNSBIXSRK, arginine ODKSFYDXXFIFQN,
phenylalanine COLNVLDHVKWLRT, taurine XOAAWQZATWQOTB. (First block only — verify
full 27-char keys at curation.)

---

## 5. PC-SAFT / ePC-SAFT — FLAGGED for ALL nine (paywalled numbers)

The 5 pure-component parameters (segment number m, σ, ε/k, plus association
N_assoc / ε_assoc/k / κ_assoc) are behind paywalls; not fabricated. Primaries:

- **Cameretti & Sadowski**, "Modeling of aqueous amino acid and polypeptide
  solutions with PC-SAFT", Chem. Eng. Process. 47 (2008) 1018 — glycine, alanine,
  **serine, valine**, proline (neutral zwitterion, 2-site association), fitted to
  densities + solubilities.
- **Held, Cameretti & Sadowski**, Fluid Phase Equilib. (2011) and follow-ups —
  ePC-SAFT for the **charged/ionic** amino-acid form (adds ion terms), the right
  route for NF/RO speciation.
- Do, Wisniewski et al. (ref 28 in arXiv 2509.06271) — ePC-SAFT predictions for
  the acidic/basic amino acids (Glu, Asp, Lys, His, Arg, Phe, Tyr) where fits are
  scarce.

Transcribe the parameter row per amino acid at curation; do NOT invent m/σ/ε.

---

## FLAGGED-value roll-up (must be resolved before any case relies on them)

- arginine: S°(cr), Cp(cr) — Pokorný et al., Int. J. Thermophys. 42 (2021) 156 (paywalled).
- V° for lysine, arginine, taurine (paywalled; Millero 1978 / Mishra & Ahluwalia 1984).
- D_aq for serine, valine, glutamicAcid, lysine, arginine, phenylalanine, taurine
  (paywalled Ma 2005 / Umecky / Germann 2007) — only Stokes–Einstein own-estimates supplied.
- COSMO-SAC 51-pt σ-profiles — ALL nine (neutral tautomer; VT-2005/LVPP/CHAOS by InChIKey).
- PC-SAFT / ePC-SAFT parameter rows — ALL nine (Cameretti & Sadowski 2008; Held 2011; Do).
- taurine pI/pKa1 (sulfonate) — consensus estimate; pin an open potentiometric primary.
