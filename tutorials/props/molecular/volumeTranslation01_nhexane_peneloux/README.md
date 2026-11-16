# volumeTranslation01_nhexane_peneloux — what a volume translation does

`runCase tutorials/props/molecular/volumeTranslation01_nhexane_peneloux`

## The question

A cubic equation of state fitted to critical constants and vapour pressures
gets a liquid's *volume* wrong, by several per cent, and the error grows with
the carbon number. Péneloux, Rauzy and Fréze (1982) showed that the volume axis
of a cubic can be *translated* without moving a single equilibrium condition,
so the volume can be corrected for free. This case measures that, in three
states, against evaluated liquid densities.

## What it does

Seven `propertyPoint` operations at 298.15 K and 1.01325 bar, on n-hexane,
n-decane and their equimolar mixture, with the system's plain SRK (kij = 0)
and with the variants that declare `volumeTranslation Peneloux` on the same
cubic (`thermo peneloux;`, `thermo penelouxSpencer;`). Two `propertyScan1D`
operations scan the bubble temperature of hexane + decane under plain SRK and
under SRK + Péneloux.

The shift is the paper's Eq. 8 (p. 10):

    c = 0.40768 (R Tc / Pc) (0.29441 - Z_RA)

and the catalogue's records carry no Rackett Z_RA, so the case **declares it,
with where it was read**: Table 1, p. 10 of the paper. A component with no
Z_RA and no declared shift is refused by name; the Yamada–Gunn estimate is only
taken on an explicit `missingZRA YamadaGunn;`.

## The measured density

Perry's Chemical Engineers' Handbook, 9th ed., Table 2-32 "Densities of
Inorganic and Organic Liquids" (DIPPR equation 105,
ρ = C1 / C2^(1 + (1 − T/C3)^C4), in mol/dm3; evaluated from measurements, not a
measurement of these states):

| liquid | page | C1 | C2 | C3 / K | C4 | ρ(298.15 K) | v |
|---|---|---|---|---|---|---|---|
| n-hexane | 2-96 | 0.70824 | 0.26411 | 507.6 | 0.27537 | 7.6125 mol/dm3 (656.0 kg/m3) | 131.362 cm3/mol |
| n-decane | 2-94 | 0.41084 | 0.25175 | 617.7 | 0.28571 | 5.1158 mol/dm3 (727.9 kg/m3) | 195.472 cm3/mol |

Cross-check: the CRC Handbook (82nd ed., p. 15-16) prints 0.6548 g/cm3 for
hexane at 25 °C, 0.2 % below Perry's value. For the mixture there is no measured
volume in the held literature, so the reference is the ideal mixing of the two
Perry molar volumes, 163.417 cm3/mol (the excess volume of alkane mixtures is a
fraction of a per cent; this is a reference, not a measurement).

## The result (liquid molar volume, cm3/mol)

| state | Perry | SRK | error | SRK + Péneloux | error |
|---|---|---|---|---|---|
| n-hexane | 131.362 | 146.918 | **+11.8 %** | 129.394 (Z_RA 0.2636, Table 1) | **−1.5 %** |
| n-decane, Z_RA = 0.2578 (adjusted, RKSc1) | 195.472 | 238.181 | **+21.9 %** | 201.703 | **+3.2 %** |
| n-decane, Z_RA = 0.2507 (Spencer–Adler) | 195.472 | 238.181 | +21.9 % | 194.628 | **−0.4 %** |
| 50/50 mixture | 163.417 (ideal mixing) | 192.611 | +17.9 % | 165.609 | +1.3 % |

Two readings. (1) The shift is a constant per component, so for hexane it is
17.524 cm3/mol and for decane 36.478 cm3/mol (Z_RA 0.2578); the mixture's volume
drops by 27.002 cm3/mol, which is exactly 0.5 × 17.524 + 0.5 × 36.478. That is
`c = Σ x_i c_i` (Eq. 6). (2) The decane error depends on *which* Z_RA is used:
the paper's own "adjusted" value for decane (0.2578, Table 1) is the odd one
out of its column; the Spencer–Adler value (same table) lands within half a
per cent. The choice of Z_RA is a modelling decision the case makes visible.

## What did NOT move

* **Equilibrium.** The two bubble-temperature scans are byte-identical:

      cmp txy_SRK.csv txy_SRK_Peneloux.csv && echo identical

  A pseudo-volume leaves φ̃ᵢ = φᵢ exp(cᵢP/RT), the same factor in both phases,
  so every K-value cancels it (paper, Eq. 2–4, pp. 8–9).
* **S_R**, to the last digit. **H_R** moves by exactly −P·c: for hexane
  −406.738 → −408.514 J/mol, a difference of −1.776 J/mol = −101325 Pa ×
  17.524 cm3/mol. (The paper prints no enthalpy equation; −P·c is derived from
  its fugacity relation, h = u + P·v with u unchanged. Section "Volume
  translation" of the Theory Guide.)

`bin/curate/check_volume_translation.py` recomputes all of this from the run's
own output on every full `bin/runTests`.

## Limits, said plainly

* The correction is fitted to saturated liquids at T_r = 0.7. It does nothing
  near the critical point (the paper's Fig. 1) and the Z_RA of a polar or
  associating liquid is a worse fit (alcohols 3.8 % against 1.5 % for alkanes,
  Table 2).
* The Peng–Robinson constant is not in the held literature, so PR accepts only
  a declared `cShift` and refuses a Z_RA by name.
* The liquid density other units read through `ThermoPackage::density` is the
  Rackett route and does not use this shift; the translated volume is the
  equation of state's (`v_molar`, `v_molar_liq`, `Z`).
* Two anchor rows in `expected` (authored, never re-recorded) hold the
  translated volumes of hexane and decane (Spencer–Adler Z_RA) to within 2 % of
  Perry's.
