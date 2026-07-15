/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS ; Required legal notices: see NOTICE
-------------------------------------------------------------------------------
Class
    Choupo::CosmoSac

Description
    COSMO-SAC activity-coefficient model, the 2002 (Lin & Sandler) variant as
    implemented in the NIST benchmark (Bell et al., AIChE J. 65 (2019) e16194,
    doi:10.1002/aic.16194; reference code usnistgov/COSMOSAC, US-gov public
    domain).  Each component carries its OWN COSMO surface data in its
    `component.dat` `cosmo { area; volume; sigmaProfile ( ... ); }` block
    (sigma profiles from the LVPP open database, github.com/lvpp/sigma, MIT +
    citation).  ln gamma_i = ln gamma_i^comb (Staverman-Guggenheim from
    area/volume) + ln gamma_i^res (sigma-profile segment activities).

    Selected as `activityModel { model cosmoSAC; }`.  Multicomponent; no pair
    parameters (the interactions come from the sigma profiles).  Pure-component
    ln gamma is 0 by construction.  A component lacking the `cosmo` block is a
    LOUD error (no silent crutch).

    ONE variant only, ONE parameter source (LVPP == the NIST benchmark data):
    constants and profiles are never mixed across sources.
\*---------------------------------------------------------------------------*/

#pragma once

#include "ActivityModel.H"
#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

class Component;

class CosmoSac : public ActivityModel
{
public:
    // The global sigma grid: 51 points, -0.025 .. +0.025 e/A^2, step 0.001
    // (the NIST benchmark grid).  Every component's sigmaProfile MUST be 51 long.
    static constexpr int NGRID = 51;

    CosmoSac(const DictPtr& dict, const std::vector<Component>& comps);

    std::size_t n() const override { return n_; }
    sVector gamma(scalar T_K, const sVector& x) const override;
    const std::string& modelName() const override { return name_; }

private:
    // Self-consistent segment activity coefficients Gamma(sigma_m) for a profile
    // given as a PROBABILITY (sums to 1) at temperature T.  Returns ln Gamma.
    std::vector<scalar> lnSegmentGamma(scalar T_K,
                                       const std::vector<scalar>& pProb) const;

    std::size_t n_;
    std::string name_ = "cosmoSAC";

    std::vector<scalar>              area_;   // A_i  [A^2]
    std::vector<scalar>              vol_;    // V_i  [A^3]
    std::vector<std::vector<scalar>> pArea_;  // p_i(sigma) area per bin [A^2], n_ x NGRID

    scalar sigma_[NGRID];            // grid nodes [e/A^2]
    scalar dW_[NGRID][NGRID];        // exchange energy DELTAW(m,n) [kcal/mol]
};

} // namespace Choupo
