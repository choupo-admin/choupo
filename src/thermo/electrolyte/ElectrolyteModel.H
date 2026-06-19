/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  ElectrolyteModel -- the SIBLING activity base for ionic solutions, parallel to
  ActivityModel.  Selected in the thermoPackage with its own block, exactly as
  the molecular activity model is:

        electrolyteModel
        {
            model       pitzer;     // factory key (eNRTL is the next slot)
            salt        NaCl;       // the salt component in the streams
            cation      Na;         // -> electrolyte/ions.dat + pairs.dat
            anion       Cl;
            solubility  6.144;      // measured m_sat [mol/kg], 25 C (optional)
        }

  Molality+charge physics is kept OUT of the mole-fraction ActivityModel path:
  ThermoPackage builds an ElectrolyteModel ONLY when this block is present, so
  the molecular cases are byte-identical and stay green.  Unit operations read it
  via ThermoPackage::electrolyte() -- the saturation (Ksp) and the boiling-point
  elevation (a_w) come from HERE, never from a per-unit dict block.

  First model: `pitzer` -- implemented by ElectrolyteActivity, which IS-A
  ActivityModel registered under `activityModel { model pitzer; }` and ALSO
  exposes this interface.  This is a PURE INTERFACE (the molality+charge surface
  unit ops read via ThermoPackage::electrolyte()); there is NO separate factory
  -- selection happens through the one ActivityModel slot (classical, OpenFOAM-
  style: one selector surface).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo {

class ElectrolyteModel
{
public:
    virtual ~ElectrolyteModel() = default;

    // All on the molality scale [mol/kg solvent].  T [K] defaults to the 25 C
    // reference; off 25 C the models carry the proper temperature dependence
    // (eNRTL: tau(T), A_DH(T) via eps_w(T)/rho_w(T), Born at T; Pitzer: A_phi(T)).
    virtual scalar waterActivity(scalar molality, scalar T = 298.15) const = 0;  // a_w (-> BPE)
    virtual scalar gammaPM(scalar molality, scalar T = 298.15)      const = 0;   // mean ionic gamma
    virtual scalar osmotic(scalar molality, scalar T = 298.15)      const = 0;   // osmotic coeff phi

    virtual scalar solubility() const = 0;             // measured m_sat [mol/kg], 25 C datum; 0 if absent
    // Saturation ion-activity product (gamma_pm*m_sat)^nu.  Anchored at the 25 C
    // solubility datum, then shifted to T by van't Hoff with the salt's enthalpy
    // of solution (Ksp(T) = Ksp(298) exp[-dHsol/R (1/T - 1/298)]); flat in T if
    // dHsol is absent (e.g. NaCl, ~T-independent).
    virtual scalar saturationKsp(scalar T = 298.15) const = 0;

    // gamma_pm with an antisolvent present (mole fraction xAnti of a 2nd solvent,
    // with its molar mass / relative permittivity / molar volume) -- the
    // drowning-out (mixed-solvent) effect.  Default: ignore it (aqueous models
    // like Pitzer have no mixed-solvent term); eNRTL overrides it.
    virtual scalar gammaPMMixed(scalar m, scalar xAnti, scalar MwAnti,
                                scalar epsAnti, scalar vAnti, scalar T = 298.15) const
    { (void)xAnti; (void)MwAnti; (void)epsAnti; (void)vAnti; return gammaPM(m, T); }
    virtual const std::string& soluteName() const = 0; // salt component name in the streams
    virtual const std::string& modelName() const = 0;

    // Were this salt's parameters regressed against CALORIMETRY (heats of
    // dilution / apparent molar Cp)?  Only then is the apparent molar enthalpy
    // L_phi (the heat-of-dilution curve) trustworthy enough to enter an energy
    // balance.  Default FALSE: the 25 C ACTIVITY anchor says nothing about the
    // T-derivative, so until a salt is explicitly fitted its solution enthalpy
    // stays ideal-mixture and the omission is ANNOUNCED (no silent crutch).
    // Flipped per-salt only after the AAD gate passes.  Build spec:
    // docs/electrolyte-enthalpy-spec.md.
    virtual bool calorimetricFit() const { return false; }

    // Relative apparent molar enthalpy L_phi(m,T) [J/mol salt] -- the heat-of-
    // dilution curve, anchored at 0 at infinite dilution.  Concrete models build
    // it from the temperature derivative of the SAME excess-Gibbs surface that
    // gives the activity (the universal identity g^ex = nu*((1-phi)+ln gamma_pm),
    // L_phi = -R T^2 dg^ex/dT).  Default 0 (no enthalpy contribution).  It ONLY
    // enters the energy balance when calorimetricFit() is true (slice 4); until
    // then it is computed but gated off.  docs/electrolyte-enthalpy-spec.md.
    virtual scalar apparentMolarEnthalpy(scalar molality, scalar T = 298.15) const
    { (void)molality; (void)T; return 0.0; }

    // The salt's molar enthalpy on the aqueous infinite-dilution reference
    // (elements datum): h_ions_aq(T) + L_phi(m,T)  [J/mol salt].  Only
    // meaningful when calorimetricFit() AND the ions carry the slice-2 aq
    // tier; hasAqueousReference() says so.  Slice 4 wires this into
    // H_liquid_formation as the salt's per-ROLE branch (water stays
    // molecular) -- docs/electrolyte-enthalpy-spec.md sec.2-3.
    virtual bool hasAqueousReference() const { return false; }
    virtual scalar aqueousSaltEnthalpy(scalar molality, scalar T = 298.15) const
    { (void)molality; (void)T; return 0.0; }
    // Component indices of the salt + reference solvent inside the package
    // (set at configure); the enthalpy branch needs them to form molality.
    virtual std::size_t soluteIndex()  const { return 0; }
    virtual std::size_t solventIndex() const { return 0; }
    // PARTIAL molar relative enthalpy of the salt, L2_bar(m,T) = L_phi +
    // m dL_phi/dm [J/mol salt] -- the quantity in the DIFFERENTIAL heat of
    // solution at molality m (dissolving/crystallising AT m, not diluting to
    // infinity).  Default: central FD on apparentMolarEnthalpy -- again one
    // identity on the same surface.  Consumers: the crystalliser's heat of
    // crystallisation, dH_cryst(m_sat) = -(dH_soln_inf + L2_bar(m_sat)).
    virtual scalar partialMolarRelativeEnthalpy(scalar m, scalar T = 298.15) const
    {
        if (m <= 1.0e-12) return 0.0;
        const scalar h = (m > 0.01) ? 0.01 * m : 1.0e-4;
        const scalar dLdm = (apparentMolarEnthalpy(m + h, T)
                           - apparentMolarEnthalpy(m - h, T)) / (2.0 * h);
        return apparentMolarEnthalpy(m, T) + m * dLdm;
    }

    // Upper molality of the calorimetric fit's validity (the L_phi data
    // window); beyond it the consumer must ANNOUNCE extrapolation.
    virtual scalar lphiValidityMax() const { return 0.0; }
};

} // namespace Choupo
