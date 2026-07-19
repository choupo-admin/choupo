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
-------------------------------------------------------------------------------
File
    src/unitOperations/dynamic/BalanceSnapshot.H

Description
    The read-only balance contract of a dynamic unit at one instant --- what
    the choupoCtrl balance LEDGER integrates.  Availability is a claim per
    rung with a named reason when withheld: material and elements can close
    physically while the energy claim honestly refuses (the current
    dynamicCSTR's Cp/convective ODE is not the exact derivative of a
    canonical stored U(n,T) or H(n,T), so a physical first law is not
    representable until the model is reformulated).  Defaults refuse; a unit
    that says nothing claims nothing.

    Faces carry a STABLE identity, a direction and a role
    (boundaryIn / boundaryOut / internal): the plant total sums external
    boundaries only, so internal connections are never counted twice when
    Ctrl grows beyond the single vessel.  Vectors always ride with the
    component names --- never N anonymous numbers.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

struct BalanceFace
{
    // Two ORTHOGONAL axes: every face has a direction; its role decides
    // whether the plant-boundary ledger counts it.  An internal connection
    // still has an in side and an out side -- representable without ever
    // changing this API.
    enum class Direction { in, out };
    enum class Role      { boundary, internal_ };

    std::string          id;               // stable, e.g. "reactor.feed"
    Direction            direction = Direction::in;
    Role                 role = Role::internal_;
    std::vector<scalar>  molarFlows;       // kmol/s, aligned with the
                                           // snapshot's componentNames
};

struct BalanceSnapshot
{
    // ---- material -------------------------------------------------------
    bool                      materialAvailable = false;
    std::string               materialReason =
        "the unit does not expose a balance snapshot";
    std::vector<std::string>  componentNames;   // identity of every vector row
    std::vector<scalar>       inventory;        // kmol per component
    std::vector<BalanceFace>  faces;

    // ---- energy ---------------------------------------------------------
    //  The functional NAMES what the stored energy state would be; `none`
    //  plus a reason is the honest state of a model whose ODE is not the
    //  exact derivative of a canonical U or H.
    enum class EnergyFunctional { none, U, H };
    EnergyFunctional          functional = EnergyFunctional::none;
    bool                      physicalEnergyAvailable = false;
    std::string               energyReason = "no energy functional declared";
};

} // namespace Choupo
