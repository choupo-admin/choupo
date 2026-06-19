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
  ElectrolyteActivity -- the electrolyte (ionic) activity model, registered in
  the SAME ActivityModel factory as ideal/NRTL/Wilson and selected the SAME way:

        activityModel { model pitzer; }      // (eNRTL is the next option)

  This is the classical, OpenFOAM-style organization: ONE liquid-activity slot,
  one named model, no parallel `electrolyteModel{}` block.  The salt's ions and
  solubility are NOT re-typed in the case -- they are read from the salt
  component's `electrolyte{}` block (intrinsic data, declared once, called by
  name; see Component / data/standards/components/NaCl.dat).

  It IS-A ActivityModel (so the package/factory/VLE path see a normal activity
  model: gamma(T,x) returns 1 for the nonvolatile salt and a_w/x_w for the
  solvent) AND exposes the ElectrolyteModel interface (the molality+charge
  surface -- waterActivity, gammaPM, osmotic, solubility, saturationKsp -- that
  unit operations read via ThermoPackage::electrolyte()).  The molality+charge
  math lives behind this adapter; the molecular gamma(T,x) hot path is untouched.

  Configured AFTER construction by ThermoPackage (the dynamic_cast<Wilson*> +
  setMolarVolumes precedent): the factory has only names, so the salt's
  electrolyte{} block + solvent MW are wired in `configure(components)`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "ActivityModel.H"
#include "core/Constants.H"
#include "thermo/electrolyte/ElectrolyteModel.H"
#include "thermo/electrolyte/PitzerSingleSalt.H"
#include "thermo/electrolyte/ENRTLSingleSalt.H"

#include <cmath>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class Component;

class ElectrolyteActivity : public ActivityModel, public ElectrolyteModel
{
public:
    ElectrolyteActivity(const std::vector<std::string>& names, std::string model)
        : n_(names.size()), names_(names),
          model_(std::move(model)), isENRTL_(model_ == "eNRTL") {}

    // Wire the salt's electrolyte{} block + solvent MW (ThermoPackage calls this
    // right after construction, exactly like Wilson::setMolarVolumes).
    void configure(const std::vector<Component>& comps);

    // ---- ActivityModel interface ----------------------------------------
    std::size_t n() const override { return n_; }
    sVector gamma(scalar T_K, const sVector& x) const override;
    const std::string& modelName() const override { return model_; }
    // The molecular-frame excess enthalpy is ILL-POSED for an electrolyte
    // (no ideal-molecular-mixture reference exists); the asymmetric path is
    // aqueousSaltEnthalpy/apparentMolarEnthalpy.  Return 0 explicitly.
    scalar excessEnthalpy(scalar, const sVector&) const override { return 0.0; }

    // ---- ElectrolyteModel interface (molality scale) -- routed pitzer|eNRTL --
    scalar waterActivity(scalar m, scalar T = 298.15) const override
    { return isENRTL_ ? enrtl_.waterActivity(m, T) : salt_.waterActivity(m, T); }
    scalar gammaPM(scalar m, scalar T = 298.15) const override
    { return isENRTL_ ? enrtl_.gammaPM(m, T) : salt_.gammaPM(m, T); }
    scalar osmotic(scalar m, scalar T = 298.15) const override
    { return isENRTL_ ? enrtl_.osmoticCoefficient(m, T) : salt_.osmoticCoefficient(m, T); }
    scalar gammaPMMixed(scalar m, scalar xAnti, scalar MwAnti,
                        scalar epsAnti, scalar vAnti, scalar T = 298.15) const override
    { return isENRTL_ ? enrtl_.gammaPMMixed(m, xAnti, MwAnti, epsAnti, vAnti, T) : gammaPM(m, T); }
    scalar solubility()                const override { return solubility_; }
    bool calorimetricFit()             const override { return calorimetricFit_; }
    bool hasAqueousReference()         const override { return hasAqRef_; }
    std::size_t soluteIndex()          const override { return soluteIdx_; }
    std::size_t solventIndex()         const override { return solventIdx_; }
    scalar lphiValidityMax()           const override { return lphiValidityMax_; }

    // h_ions_aq(T) + L_phi(m,T) [J/mol salt] -- the salt's enthalpy on the
    // aqueous infinite-dilution reference (elements datum; the H+(aq)=0
    // convention cancels for a neutral salt).  Slice 4 consumer:
    // ThermoPackage::H_liquid_formation's per-ROLE branch.
    scalar aqueousSaltEnthalpy(scalar m, scalar T = 298.15) const override
    {
        return hfAqSum_ + cpAqSum_ * (T - 298.15) + apparentMolarEnthalpy(m, T);
    }
    scalar saturationKsp(scalar T = 298.15) const override;
    const std::string& soluteName()    const override { return soluteName_; }

    // L_phi(m,T): relative apparent molar enthalpy [J/mol salt] -- the heat-of-
    // dilution curve.  Universal identity g^ex = nu*((1-phi)+ln gamma_pm), so
    // L_phi = -R T^2 d g^ex/dT, by CENTRAL FINITE DIFFERENCE on this model's own
    // (validated) osmotic()/gammaPM() -- glass-box, sign-safe (the kernel is
    // reused verbatim).  -> 0 at infinite dilution.  SLICE 1: with the anchored
    // tau(T)/A_phi(T) this is Gibbs-Helmholtz-CONSISTENT but calorimetrically
    // UNCALIBRATED, so it stays gated off the energy balance by calorimetricFit()
    // until the T-dependence is refit (slice 2-3).  docs/electrolyte-enthalpy-spec.md.
    scalar apparentMolarEnthalpy(scalar m, scalar T = 298.15) const override
    {
        if (m <= 1.0e-12) return 0.0;                      // infinite-dilution anchor
        const scalar nu = isENRTL_ ? (enrtl_.nu_c + enrtl_.nu_a)
                                   : (salt_.nu_c + salt_.nu_a);
        const scalar dT = 0.05;                            // K, central difference
        auto gex = [&](scalar TT)
        { return nu * ((1.0 - osmotic(m, TT)) + std::log(gammaPM(m, TT))); };
        const scalar dgex_dT = (gex(T + dT) - gex(T - dT)) / (2.0 * dT);
        return -constant::R * T * T * dgex_dT;             // J/mol salt
    }

private:
    std::size_t n_;
    std::vector<std::string> names_;
    std::string      model_;           // "pitzer" or "eNRTL"
    bool             isENRTL_ = false;
    PitzerSingleSalt salt_;            // used when !isENRTL_
    ENRTLSingleSalt  enrtl_;           // used when  isENRTL_
    std::size_t soluteIdx_ = 0, solventIdx_ = 0;
    scalar      solventMW_ = 18.015;   // g/mol
    scalar      solubility_ = 0.0;     // m_sat [mol/kg], 25 C datum
    bool        calorimetricFit_ = false;  // pairs.dat per-row flag (slice 3)
    bool        hasAqRef_ = false;          // ions carry the slice-2 aq tier
    scalar      hfAqSum_ = 0.0;             // Sum nu*hfAq   [J/mol salt]
    scalar      cpAqSum_ = 0.0;             // Sum nu*cpAq   [J/(mol K) salt]
    scalar      lphiValidityMax_ = 0.0;     // fitted-data window [mol/kg]
    scalar      dHsolution_ = 0.0;     // enthalpy of solution [J/mol]; 0 -> Ksp flat in T
    std::string soluteName_;
    bool        configured_ = false;
};

} // namespace Choupo
