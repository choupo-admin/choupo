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
    Choupo::SolidPhase

Description
    Stub for the solid phase.  Two modes are anticipated:

        type solid;
        mode inert;            -- inert solid (filtration, separators);
                                  does NOT participate in equilibrium.
        mode crystallizing;    -- solid in SLE with a liquid (e.g. salt
                                  precipitation, sugar crystallisation);
                                  participates in equilibrium via a pure-
                                  component reference fugacity f_i^{0,S}(T). only declares the interface and parses the dictionary; both
    modes throw at run-time.  Concrete implementations land 
    (inert solids: filter, dryer, cyclone) and (crystallisation:
    PSD-aware crystallizer).  The point is that the rest of the codebase
    is already structured around the Phase abstraction, so no further
    refactor will be needed when the time comes.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Phase.H"

namespace Choupo {

class SolidPhase : public Phase
{
public:
    SolidPhase(const DictPtr& dict,
               const std::vector<std::string>& componentNames,
               const std::vector<Component>& components);

    const std::string& name()     const override { return name_; }
    const std::string& typeName() const override { return typeName_; }

    sVector fEffective(scalar T_K, scalar P_Pa,
                       const sVector& x) const override;

    sVector activityCoefficients(scalar, const sVector& x) const override
    {
        // Inert solid: γ undefined (no chemical-potential equilibrium).
        // Crystallizing: γ_S = 1 for pure crystals; multi-component
        // solid solutions arrive with SLE.
        return sVector(x.size(), 1.0);
    }

    bool isEquilibriumActive() const override
    {
        return mode_ == Mode::Crystallizing;
    }

    enum class Mode { Inert, Crystallizing };
    Mode mode() const { return mode_; }

private:
    std::string name_;
    inline static const std::string typeName_ = "solid";
    Mode        mode_ = Mode::Inert;
};

} // namespace Choupo
