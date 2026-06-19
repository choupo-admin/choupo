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
    Choupo::ConstantDrop

Description
    A fixed total pressure drop spread linearly along the channel:
    dP/dz = dP_total / L  (the `dP_feed_total` behaviour, as a model).
\*---------------------------------------------------------------------------*/

#pragma once

#include "PressureDropModel.H"
#include "core/Dimensions.H"

namespace Choupo {

class ConstantDrop : public PressureDropModel
{
public:
    const std::string& type() const override { return type_; }

    void readParameters(const DictPtr& d) override
    {
        dP_total_ = d->lookupScalarOrDefault("dP_total", 0.0, Dims::pressure);
    }

    scalar dPdz(const PressureDropContext& c) const override
    {
        return (c.L > 0.0) ? dP_total_ / c.L : 0.0;
    }

private:
    inline static const std::string type_ = "constant";
    scalar dP_total_ = 0.0;
};

} // namespace Choupo
