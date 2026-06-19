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
    Choupo::Splitter

Description
    One inlet, N outlets, same composition and same T/P on every outlet
    (no separation, no heat or pressure drop -- the trivial "tee" element).

       F_k_out  =  fraction_k · F_in        Σ fraction_k = 1
       z_k_out  =  z_in
       T_k_out  =  T_in
       P_k_out  =  P_in

    Dictionary form:

        operation { fractions ( 0.7  0.3 ); }   // must match `outputs (...)`
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <string>

namespace Choupo {

class Splitter : public UnitOperation
{
public:
    Splitter() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

private:
    inline static const std::string type_ = "splitter";
    std::vector<ProcessStream> produced_;
};

} // namespace Choupo
