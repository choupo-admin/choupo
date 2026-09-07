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
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::vesselMechanics

Description
    THE ONE HOME for the mechanical design of a cylindrical pressure shell:
    the wall thickness a design pressure demands, and the weight of steel that
    wall implies.

        t_wall = P_g D / (2 sigma_allow E - 1.2 P_g) + corrosion allowance
        weight = rho_steel . pi . D . H . t_wall

    the ASME §VIII Div. 1 thin-wall circumferential-stress formula (Turton et
    al., App. A), with the joint efficiency E and the corrosion allowance as
    the author's declared inputs.

    WHY IT IS HERE AND NOT IN EACH SIZER.  These two lines were written out
    IDENTICALLY in `StirredTank.cpp` and `VesselSize.cpp`, and the 2026-09-07
    column sizer needed them twice more -- for the tower shell and for the
    reflux drum.  Four homes for one formula is how a project ends up with two
    wall thicknesses for one question, which is exactly the defect
    `DesignDefaults.H` was built to stop one level up (it holds the CONSTANTS
    those two sizers disagreed about; this holds the ARITHMETIC they agreed
    about, and agreement is not a reason to keep four copies -- it is a reason
    the copies had not been noticed).

    NO NUMBER MOVED when the two existing sizers were converted: the same
    expression, in the same order, on the same inputs.

    THE DEFAULTS ARE NOT HERE.  `jointEfficiency` and `corrosionAllow` are
    resolved by the CALLER through `designDefault::valueOr`, because that call
    is what announces an assumed value and marks it on the sizing record, and
    the equipment WORD it announces under ("vessel", "stirredTank",
    "distillationColumn") is the caller's own.  Handing this function a dict
    would move that announcement here and give every caller the same word.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "materials/Material.H"

namespace Choupo {
namespace vesselMechanics {

//  The wall a cylindrical shell of diameter `D_m` needs at `pressureDesign_bar`
//  (GAUGE, as every `designRules { pressureDesign ...; }` in the corpus
//  declares it), and the weight of the resulting shell of height `H_m`.
struct Wall
{
    scalar t_wall = 0.0;    // m
    scalar weight = 0.0;    // kg
};

//  The material must carry a yield strength; a caller that cannot guarantee
//  that refuses BEFORE calling, naming the material, because it knows the
//  unit's name and this does not.
Wall wall(scalar          D_m,
          scalar          H_m,
          scalar          pressureDesign_bar,
          const Material& material,
          scalar          jointEfficiency,
          scalar          corrosionAllow_m);

} // namespace vesselMechanics
} // namespace Choupo

// ************************************************************************* //
