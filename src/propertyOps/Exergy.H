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
    Choupo::Exergy

Description
    PHYSICAL (thermo-mechanical) flow exergy of a mixture state against a
    DECLARED dead state:

        b_ph = (h - h0) - T0 * (s - s0)      [J/mol]

    with h and s the engine's own H_real / S_real at the stream state and
    h0, s0 the SAME calls at (T0, P0) with the SAME composition.  Every
    number is an engine call; the op's only arithmetic is the two
    differences and one product, and both legs (dh and T0*ds) are
    published so the total re-adds on the reader's desk.  Because only
    DIFFERENCES at fixed composition enter, the enthalpy datum, the s_298
    anchors, the mixing term and the reference pressure all cancel --
    which is why this op works unchanged on a pureFluids{} IF97 route
    (both states price on the same surface).

    THE DEAD STATE IS THE PROBLEM'S DECLARATION, NEVER A DEFAULT.  An
    exergy is a statement about a state AND an environment; an engine
    that silently assumed 25 degC / 1 atm would hand a plant in Kuwait
    the wrong number with nothing to see.  A missing `deadState {}`
    refuses naming the remedy.

    Dictionary form:

        {
            name        b_feed;
            type        exergy;
            state
            {
                T            400 K;
                P            2 bar;
                composition  { N2 0.79;  O2 0.21; }
            }
            deadState   { T0 298.15 K;  P0 1 bar; }
        }

    DELIBERATELY NOT HERE, each refusing or absent by name: CHEMICAL
    exergy (needs a standard-environment model -- Szargut's or another --
    a curated, primary-cited data decision reserved to the owner; a
    `chemical true;` request refuses saying so), mixture states the
    package cannot price, and any exergy BALANCE over a flowsheet
    (streams carry no entropy; that is a recorded absence in
    docs/design/entropy-glass-box-trace.md).

SourceFiles
    Exergy.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class Exergy : public PropertyOperation
{
public:
    Exergy() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    {
        return diag_;
    }

private:
    inline static const std::string type_ = "exergy";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
