# `data/standards/parameters/Henry/` — Henry's-law constants (gas in water)

Each `*-water.dat` file gives the Henry's-law constant for one solute in
liquid water, in the **pressure / mole-fraction form**: the volatility
`p_i / x_i` in Pa, which Sander (2015) writes `K_H^px`.  The records and the
convention profile `Sander-Hxp-v1` call it `H_xp`, but Sander's own `H^xp` is
the inverse, the solubility `x_i / p_i`.

```
K_H^px = p_i / x_i        [Pa]    (stored as H_ref; named H_xp in the records)
```

with a van't Hoff temperature dependence (the form the solver reads):

```
H(T) = H_ref * exp[ +enthalpy/R * (1/T - 1/T_ref) ]
```

`H_ref` is the value at `T_ref = 298.15 K`; `enthalpy` is the molar enthalpy
of dissolution `dH_diss` (negative = exothermic, so H rises with T as the gas
becomes less soluble).

## Provenance & licence

* **8 hand-curated entries** — `CH4, CO2, Cl2, H2S, HCl, NH3, O2, SO2`.
  Reference values with reactive/electrolyte caveats spelled out in-file.

* **The remaining entries** were ingested from **Sander, R. (2015),
  "Compilation of Henry's law constants (version 4.0) for water as solvent,"
  Atmos. Chem. Phys. 15, 4399-4981, doi:10.5194/acp-15-4399-2015** — licensed
  **CC-BY 3.0** — as redistributed in the MIT-licensed `thermo` library.
  Sander's Table 6 tabulates, per row, the solubility `H^cp` in mol/(m3 Pa)
  at 298.15 K and `d ln H^cp / d(1/T)` in K, not a fit `ln(p/x) = A + B/T`;
  Choupo stores the equivalent `H_ref = exp(A + B/T_ref)` and
  `enthalpy = R * B`.  Each file's header records `A`, `B`, the CAS, and this
  conversion (the "change" indicated per CC-BY).  Validation: the ingested CO2
  and O2 values reproduce the hand-curated entries to within 1 %.

## Caveats

* All Sander values are **infinite-dilution** coefficients — correct for
  sparingly-soluble solutes.  For water-**miscible** species (alcohols,
  ketones, amines, acids) the Henry constant is only the dilute limit; use an
  activity-coefficient model for the full composition range.
* Validity ~273-373 K near 1 atm (linear Henry form).  For strong electrolytes
  or high loading switch to a Pitzer / eNRTL model.

## Editing

Like all of `data/standards/`, these files are **read-only** (`chmod -w`).
To change one, follow the ceremony in [`../README.md`](../README.md).
