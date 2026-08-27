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

Description
    The P-T phase envelope of a MIXTURE at fixed feed composition: the bubble
    curve (V/F -> 0) and the dew curve (V/F -> 1) traced in the (T, P) plane,
    emitted as a long-form CSV

        P_Pa,T_K,curve

    with `curve` in { bubble, dew }.

    WHAT THIS IS FOR, AND WHY THE HARD PART IS THE POINT.  An envelope is
    drawn to find two features: the CRICONDENTHERM (the highest temperature at
    which any liquid can exist -- what a pipeline is designed against) and the
    retrograde region between it and the critical point, where a gas
    CONDENSES on being depressurised.  Both live at the nose, and both are
    exactly where a naive trace fails.

    THE GEOMETRY, stated plainly because it decides the method.  Marching P
    and solving for T works on the bubble branch: T_bubble(P) is single-valued
    up to the critical point.  It does NOT work on the dew branch.  Above the
    cricondenbar there is no dew point at all, and below it there are TWO dew
    temperatures at one pressure -- the retrograde pair.  Marching T and
    solving for P has the mirror problem at the cricondentherm.  Either way a
    single-specification march dies at a turning point, and at the critical
    point the two branches merge and the Jacobian degenerates.

    SO THIS OP DOES NOT PRETEND TO CLOSE THE NOSE.  It traces each branch as
    far as its specification remains single-valued, DETECTS where the march
    stops, and says so naming the PHYSICS rather than the solver: a branch
    that ends at a turning point is not a tolerance that needs loosening.
    The last converged point on each branch is reported as exactly that -- a
    stopping point, never a cricondentherm, because the true extremum is past
    where this method can look.

    The closure is Michelsen's arc-length continuation with a switching
    specification variable (Michelsen, Fluid Phase Equilib. 4 (1980) 1), in
    which the marched quantity becomes ln K_i or ln P as the curve turns.
    It is NOT implemented here and is the named next step; building it is a
    real algorithm, not a tuning pass, and saying so is cheaper than a nose
    drawn by extrapolation.

    Dictionary form:

        {
            name        envelope;
            type        phaseEnvelope;
            composition { methane 0.85; ethane 0.10; nPropane 0.05; }
            pressure    { from 1 bar;  to 60 bar;  n 60; }
            output      { file envelope.csv; }
        }

    The bubble solve is `BubblePoint::compute`, the dew solve
    `DewPoint::compute` -- the SAME routines the `bubbleT` and `dewT` units
    call.  Neither residual is written a second time here.
\*---------------------------------------------------------------------------*/

#ifndef Choupo_PhaseEnvelope_H
#define Choupo_PhaseEnvelope_H

#include "propertyOps/PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class PhaseEnvelope : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    //  DERIVED FROM WHAT THIS RUN PUBLISHED, never a fixed list.  The two
    //  `*_stopped_bar` keys exist only when a branch actually stopped, and a
    //  headline naming a key the run did not produce is a claim about a path
    //  that was not taken.  (The engine refuses that outright, and refused
    //  the first version of this class -- correctly.)
    std::vector<std::string> headline() const override
    {
        std::vector<std::string> h;
        for (const char* k : { "bubble_points", "dew_points",
                               "bubble_stopped_bar", "dew_stopped_bar" })
            if (diag_.count(k)) h.push_back(k);
        return h;
    }

private:
    std::string type_ = "phaseEnvelope";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo

#endif
