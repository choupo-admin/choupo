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
    doi:10.1002/aic.16194; reference CODE usnistgov/COSMOSAC, MIT / not subject
    to copyright in the USA -- the code, NOT the profile folders it bundles).
    Each component carries its OWN COSMO surface data in its `component.dat`
    `cosmo { <setName> { model; variant; source; licence; installed; area;
    volume; sigmaProfile ( ... ); } }` block.  ln gamma_i = ln gamma_i^comb
    (Staverman-Guggenheim from area/volume) + ln gamma_i^res (sigma-profile
    segment activities).

    WHERE THE PROFILES COME FROM, stated as the tree actually does it
    (corrected 2026-09-06 -- this header used to say "the LVPP open database"
    and "LVPP == the NIST benchmark data", both false):
      * The named set on every catalogue record is `VT2005`, the Virginia Tech
        VT-2005 sigma-profile database (Mullins et al., Ind. Eng. Chem. Res. 45
        (2006) 4389; DMol3 DFT-COSMO) as bundled in usnistgov/COSMOSAC
        profiles/VT2005.  That folder is under a LESS PERMISSIVE licence than
        the code (academic, non-commercial, by BioVia permission; NIST's own
        README), so the public tree ships NO VT-2005 value: every catalogue set
        is an EXTERNAL REFERENCE (`licence externalRestricted; installed
        false;`) and the user installs their own copy with
        `bin/choupo-import-cosmo` into data/local/cosmo/ (gitignored).  Absent,
        this model REFUSES by name with the install command.
      * The witness cosmoSAC01 runs on SYNTHETIC teaching surrogates (GPL,
        labelled so in their `source`), never on VT-2005 numbers.
      * LVPP (github.com/lvpp/sigma, MIT) is a DIFFERENT database: a different
        QM protocol and cavity, and its profiles are NOT usable under the 2002
        constants (data/tmp/COSMO_VALIDATION_STUDY.md, 2026-07-24 -- the sign
        of G^E flips on water/acetone).  A native LVPP variant is a NEW
        ActivityModel, reserved; nothing here reads LVPP data.
    Record: docs/design/the-licence-of-a-sigma-profile.md.

    Selected as `activityModel { model cosmoSAC; source <setName>; }` (the
    `source` may be omitted when a component carries a single set).
    Multicomponent; no pair parameters (the interactions come from the sigma
    profiles).  Pure-component ln gamma is 0 by construction.  A component
    lacking the `cosmo` block, or the requested set, is a LOUD error (no
    silent crutch).

    ONE variant only: a set must declare `model COSMOSAC; variant "2002";` and
    any other family REFUSES -- constants and profiles are never mixed across
    variants (never mix a profile with the wrong variant's constants).  That
    guard is the ONLY thing between a foreign profile and a silently wrong
    gamma, which is why a `variant "2002"` label on a non-VT-2005 profile is
    refused by the scrub gate (check_cosmo_scrub) before it can reach here.
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
