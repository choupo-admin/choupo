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
Class
    Choupo::Kinetics1D

Description
    Evaluate a CLOSED-FORM batch rate law c(t) over a time sweep, for the
    "see, then decide" kinetics comparison: overlay raw (t, c) lab data against
    the prediction of competing rate models (zero / first / second order) so
    the student SEES which order fits.

    This is a PROPERTY evaluation, NOT a reactor simulation -- it stays in the
    props layer by using the analytic integrated rate law (no ODE engine; that
    lives in choupoBatch).  k may be given directly, or via Arrhenius
    (k0, Ea, T).

    Dictionary form:

        {
            name    rate_order2;
            type    kinetics1D;
            time    { from 0;  to 1800;  n 61; }     // seconds
            rate    { order 2;  k 2.0e-3;  c0 1.0; } // or { order 2; k0 ..; Ea ..; T ..; c0 ..; }
            component AcOH;                           // optional, labels the column
            output  { file rate_order2.csv; }
        }

    Integrated rate laws (A -> products):
        order 0:  c = max(c0 - k t, 0)
        order 1:  c = c0 exp(-k t)
        order 2:  c = c0 / (1 + k c0 t)
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class Kinetics1D : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::vector<std::string> headline() const override
    { return { "Ea_kJ_per_mol", "chi2" }; }

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    inline static const std::string type_ = "kinetics1D";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
