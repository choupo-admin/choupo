# Ar–NH₃ — how this Henry pair was obtained

`fit-Ar-NH3.py` reproduces `constant/parameters/Henry/Ar-NH3.dat` from
scratch. Run it with `python3 fit-Ar-NH3.py` (no dependencies); it prints
every step.

## Provenance

1. **ThermoML (NIST), local archive and online API** — `bin/choupo-thermoml
   search`. 39 binaries containing ammonia, **none** with argon solubility (the
   only Ar+NH₃ entry is binary diffusion coefficients, Kugler 2015). The
   archive covers ~2003 onwards; this literature is from 1961–1970.
2. **IUPAC-NIST Solubility Data Series Vol. 4 (Argon)**, H. L. Clever (ed.),
   1980, pp. 314–318 — the same family of compilations the `H2-NH3.dat` and
   `N2-NH3.dat` records already cite (Vol. 5/6).
   <https://srdata.nist.gov/solubility/IUPAC/SDS-4/SDS-4.pdf>
   Critical evaluation by C. L. Young (July 1978): four sets classified
   *tentative*, two rejected (Cseko; Zeininger) — the rejected ones were not
   used.

| data set | range | use |
|---|---|---|
| Kaminishi 1965 | 273.15 / 298.15 / 323.15 K · 50.8–199.9 bar | fit (anchor: covers the loop's 200 bar) |
| Matouš 1970 | 243.15–303.15 K · 27.7 and 47.1 bar | fit (the only set below 273 K) |
| Michels 1961 | 298.48–373.75 K · to 825 bar, y_Ar measured | **held out** — independent validation |

## Method

Krichevsky-Kasarnovsky line, the same treatment as the solvent's other two
pairs: `ln(f_Ar/x_Ar) = ln H(T) + v_inf (P − Ps_NH₃)/RT`, with
`f_Ar = y_Ar φ_Ar P`, `φ_Ar` from SRK and `y_Ar` from the ammonia vapour
enhancement factor calibrated on the `y_Ar` **measured** by Michels at
298.48 K. Then van't Hoff over the ten `H(T)` values.

## The inference this record carries

The Matouš values as printed in SDS-4 p. 317 are **10× larger** than
Kaminishi's at the single overlap point (273.15 K). Divided by ten, the overlap
point closes to **−1.8 %** and all seven temperatures fall within **±4 %** of
the van't Hoff line between 273 and 303 K. Undivided, the disagreement is 950 %
— and it contradicts the critical evaluation itself, which states *"good
agreement in the overlapping ranges of these three latter studies"*.

**This is a reading, not a measurement.** Confirm it against the original paper
(Matouš, Sobr & Novák, *Coll. Czech. Chem. Comm.* **35** (1970) 3757). If the
reading is wrong, the fit becomes Kaminishi-only, `Trange (273 323)`, and
`H(250 K)` rises ~22 % — the loop separator would then no longer be covered by
data.

## Result and checks

| | |
|---|---|
| H_ref (298.15 K) | 4.87 × 10⁸ Pa |
| dH_diss | +9495 J/mol |
| v_inf | 2.3 × 10⁻⁵ m³/mol (22.7 cm³/mol fitted) |
| van't Hoff rms | 6 % in ln H over 80 K |
| **Michels (held out)** | H = 4.56 × 10⁸ Pa → **−6 %** from the adopted value |
| family v_inf | 23 (N₂) · 24 (H₂) · **22.7 (Ar)** cm³/mol |
| H_Ar/H_N₂ in NH₃ | 0.57 (in water, the catalogue records give 0.46) |

## Status

**Case-local record, not promoted.** Nothing was written to `data/standards/`.
Promotion is a separate human act (`bin/choupo-curate` →
`bin/curate/promote-from-dossier`).
