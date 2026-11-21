# batch04_reversible_wgs -- the water-gas shift in a closed GAS vessel

CO + H2O <-> CO2 + H2, equimolar charge, 600 K, 10 bar (4.989 litres: V = n R T / P for 1 mol), isothermal,
reversible Arrhenius kinetics (k_rev = k_fwd / K_eq from the species' ideal-gas
Gibbs functions).  The conversion relaxes onto the thermodynamic ceiling
X_eq ~ 0.84 (n_CO 5e-4 -> 7.93e-5 kmol) and stays there.

## The vessel is a gas

At 600 K and 10 bar all four species are vapours (water's saturation pressure
at 600 K is above 10 bar; CO, CO2 and H2 are far above their critical
temperatures).  The vessel therefore declares `energy gasConstantV;`, which
puts its heat of reaction, its jacket-duty record, its campaign vessel
enthalpies and its impulse pricing on the **ideal-gas** enthalpy surface.
Before C448 the case ran without it, and the campaign heat ledger was priced
on liquid surfaces for gases (a "liquid" CO or H2 at 600 K), giving
-0.299 kJ and then +0.001 kJ for an extent of 0.42 mol of a reaction whose
heat is tens of kJ/mol: non-physical both times.

## The hand value the ledger is held to

dH_rxn(T) = dH_rxn(298.15 K) + integral from 298.15 K to T of dCp dT, from the
catalogue's own records (`data/standards/components`):

* formation enthalpies (J/mol): CO -110530, H2O(g) -241826, CO2 -393520,
  H2 0, so dH_rxn(298.15 K) = -393520 - (-110530 - 241826) = -41164 J/mol.
* ideal-gas Cp polynomials a + bT + cT^2 + dT^3 (J/mol/K); dCp = Cp(CO2) +
  Cp(H2) - Cp(CO) - Cp(H2O) has a = -16.173, b = 0.09364, c = -1.08275e-4,
  d = 4.1111e-8.
* integrating to 600 K: dH_rxn(600 K) = -38941.07 J/mol.
* extent = n_CO(0) - n_CO(end) = 0.5 mol - 0.0792842 mol = 0.4207158 mol
  (from the trajectory below).

Q = extent x dH_rxn(600 K) = 0.4207158 x (-38.94107) = **-16.38312 kJ**
(heat removed by the jacket; the reaction is exothermic).

The engine's campaign ledger (`energy_Q_ledger_kJ`, `E_reaction_total_kJ`)
prints -16.3831222515 kJ: the hand value to the digits above.

## Run

    runCase tutorials/batch/reactor/batch04_reversible_wgs
