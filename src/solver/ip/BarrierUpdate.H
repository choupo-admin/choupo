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
    BarrierUpdate.H

Description
    The rule that lowers the barrier parameter mu (docs/design/interior-point.md
    sec. 2.8; Theory Guide sec:ip-barrier-update).  Slice A2 has the MONOTONE
    rule of L1 eq. (7) only:

        mu_new = max( tol/10, min( kappa_mu mu, mu^theta_mu ) )

    applied when the error of the barrier problem E_mu has fallen to
    kappa_eps mu: linear decrease (0.2 per update) far from zero, superlinear
    (the power 1.5) near it, never below tol/10.  The adaptive rule of
    Nocedal, Wachter & Waltz (2009) is slice A3; the abstract base class below
    exists so that it can be selected beside this one without touching the
    caller, and has no factory yet because nothing selects a barrier rule by
    name before stage B (CLAUDE.md section 5: registerType / New /
    registerBuiltins arrive with the first selector, called explicitly).
\*---------------------------------------------------------------------------*/

#pragma once

#include "solver/ip/IPParameters.H"

#include <string>

namespace Choupo::solver
{

class BarrierUpdate
{
public:
    virtual ~BarrierUpdate() = default;
    virtual std::string name() const = 0;
    //- The new barrier parameter given the current one.
    virtual scalar next(scalar mu) const = 0;
    //- The lowest mu the run reaches.
    virtual scalar floor() const = 0;
};

//- L1 eq. (7).
class MonotoneBarrierUpdate : public BarrierUpdate
{
public:
    explicit MonotoneBarrierUpdate(const IPParameters& p) : p_(p) {}
    std::string name() const override { return "monotone"; }
    scalar next(scalar mu) const override;
    scalar floor() const override { return p_.tol / 10.0; }

private:
    const IPParameters& p_;
};

} // namespace Choupo::solver
