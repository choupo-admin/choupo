# `data/standards/henrysLaw/` — Henry's-law constants (gas in water)

Each `*-water.dat` file gives the Henry's-law constant for one solute in
liquid water, in the **pressure / mole-fraction form**

```
H_xp = p_i / x_i        [Pa]
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
  Sander tabulates a two-parameter van't Hoff fit `ln H_xp[Pa] = A + B/T`;
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
