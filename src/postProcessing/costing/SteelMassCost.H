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
    Choupo::steelMassCost

Description
    A PRESSURE VESSEL PRICED BY ITS STEEL MASS (DEV.md 4c C89, Vitor's ruling
    2026-10-18).  The H2 buffer's vessels carry 200 mm walls, and the Turton
    vessel set's pressure factor -- linear in the thin-wall thickness --
    priced them at F_P ~ 32, about nine times what their steel weighs.  An
    item whose sizer marks it `costWords["costBasis"] = "steelMass"` (today:
    the gas store's vessels, `sizing/GasStoreSize`) is therefore priced as

        C_p = C_BM = steelPrice x weight             [case currency, no index]
        C_TM       = 1.18 x C_BM                     [contingency and fee]

    -- `weight` the sizer's published steel (for the gas store: the
    CYLINDRICAL SHELL only, rho pi D H t; no heads, nozzles or supports), and
    `steelPrice` the case's own DECLARED price per kg (`costInputs`), with its
    declared reason (`costWords["steelPriceReason"]`).  NO index and NO F_M,
    F_P or F_BM are applied -- the catalyst charge's declared-unit-price
    precedent -- so the declared price MUST be an INSTALLED price per kg of
    shell steel, with everything else the vessel needs folded into it.  The
    1.18 IS applied (DEV.md 4c C110, G8): it is the project's contingency and
    fee, which the FCI always charged on this C_BM; until 2026-10-20 the row
    printed C_TM = C_BM, a table that was not the arithmetic that decided.

    THE COSTING MODEL'S OWN ANSWER IS STILL COMPUTED AND PRINTED BESIDE IT, as
    a COMPARISON: the same item handed to the model without the steel-mass
    word.  It is announced as an EXTRAPOLATION with its measure (the model's
    F_P, the wall and the wall over the radius, which the thin-wall formula
    assumes small), published as `comparison_*` factors, and never enters a
    total.

    ABSENT THE PRICE OR ITS REASON, this REFUSES by name, and the costing
    pass's INCOMPLETE mechanism -- the one home the trays and the catalyst
    charge use -- names the item under the total.  A default price would be
    a number with no source, costed into a capital total as though somebody
    had chosen it.

    WHY HERE AND NOT IN THE MODEL.  The shape is not a correlation of the
    model's: it is the case's money times the sizer's mass, the same whatever
    model the case selects.  `CostingPass` routes a marked item here and
    every other item to the model, so no line of the model's own file moves
    (EduTool lessons cite it by line).
\*---------------------------------------------------------------------------*/

#pragma once

#include "CostingModel.H"
#include "core/ResultRecords.H"
#include "materials/Material.H"

namespace Choupo {
namespace steelMassCost {

//  True when the sizer marked the item to be priced by its steel mass.
bool applies(const EquipmentSizing& dim);

//  The declared-price cost, with the model's own cost of the same item as a
//  printed, announced comparison that enters no total.  Throws, by name, when
//  the price, its reason or the weight is missing.
CostBreakdown cost(const EquipmentSizing& dim,
                   const Material&        mat,
                   const CostingModel&    model);

} // namespace steelMassCost
} // namespace Choupo
