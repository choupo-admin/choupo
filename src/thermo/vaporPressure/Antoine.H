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
    Choupo::Antoine

Description
    Three-parameter Antoine equation in the published convention

        log10(Psat [bar] ) = A - B / (T[K] + C )

    The.dat coefficients are stored exactly as published.  Internally
    Choupo works in SI (Pa) : the implementation multiplies
    the published bar value by 1e5 before returning, so callers consume
    Pa uniformly.

\*---------------------------------------------------------------------------*/

#pragma once

#include "VaporPressureModel.H"

namespace Choupo {

class Antoine : public VaporPressureModel
{
public:
    explicit Antoine(const DictPtr& dict);

    scalar Psat_Pa(scalar T_K) const override;
    std::pair<scalar, scalar> range() const override { return {Tmin_, Tmax_}; }
    const std::string& modelName() const override { return name_; }

private:
    scalar A_, B_, C_;
    scalar Tmin_, Tmax_;
    std::string name_;
};

} // namespace Choupo
