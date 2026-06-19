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
    Choupo::SizingPass

Description
    PostProcessor that walks the user-specified `sizing { units (...) }`
    block, instantiates an EquipmentSize for each entry, sizes the unit
    against the SimulationResult, and stores the resulting EquipmentSizing
    record in result.sizings[unitName].
\*---------------------------------------------------------------------------*/

#pragma once

#include "PostProcessor.H"

namespace Choupo {

class SizingPass : public PostProcessor
{
public:
    explicit SizingPass(const DictPtr& sizingDict);

    const std::string& type() const override { return type_; }
    int                run(SimulationResult& result) override;

private:
    inline static const std::string type_ = "sizing";
    DictPtr sizingDict_;
};

} // namespace Choupo
