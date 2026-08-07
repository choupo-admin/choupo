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
    The solid phase.  Two modes:

        type solid;
        mode inert;            -- inert solid (filtration, separators);
                                  does NOT participate in equilibrium.
                                  STILL A STUB: fEffective() refuses, because
                                  an inert solid must be propagated as a phase
                                  of the Stream while the flash SKIPS it, and
                                  that skipping is not built.
        mode crystallizing;    -- ONE component's pure crystal, in SLE with
                                  the liquid.  IMPLEMENTED 2026-08-07.

    The crystallising mode is the whole model, and it is one expression:

        f_solid(T) = Psat(T) * exp(-dG_fus(T) / (R T))
        dG_fus(T)  = dHfus * (1 - T/Tfus)

    at the crystal's index, and ZERO at every other -- the purity claim.
    Psat comes from the SAME components_[i].vp().Psat_Pa(T) call
    LiquidPhase::fEffective uses, so the two phases cannot drift onto
    different references, and Kvec_phases already derives K from fEffective.
    Freezing-point depression therefore falls out of K = 1 as
    ln a_w = -dG_fus/(R T) with no code of its own: nothing above this class
    knows a solid is present.  That was the point -- the rest of the codebase
    was already structured around the Phase abstraction.

    Design record: docs/design/ice-as-a-solid-phase-of-the-solvent.md.
    Gate: bin/curate/check_ice_freezing.py.  What is NOT modelled: solute
    inclusion in the lattice, solid solutions (multi-component crystals), and
    the inert path above.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Phase.H"
#include "thermo/Component.H"

#include <vector>

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

    //  ---- The PURE crystal (2026-08-07) ----------------------------------
    //  A crystallising solid here is ONE component's pure crystal.  It must
    //  say which -- `component water;` -- because the fugacity of every OTHER
    //  component in it is zero, and zero is a CLAIM (they cannot enter the
    //  lattice), not a default.  Solute inclusion is real and is NOT
    //  modelled; that is exactly what makes the concentrate's balance exact.
    std::string                   crystalName_;
    std::size_t                   crystalIdx_ = 0;

    //  THE NEGLECTED HEAT-CAPACITY TERM, announced once per phase.
    //  dHfus is measured AT the melting point, so using it at T far from Tfus
    //  drops  -dCp/R * ((T-Tfus)/T + ln(Tfus/T)),  with dCp = Cp_liquid -
    //  Cp_solid.  DWSIM's NestedLoopsSLE writes that term and then sets it to
    //  zero, saying why: "ignoring heat capacity difference due to issues with
    //  DWSIM characterization" -- a DATA judgement, not a theory one, from a
    //  project with a far larger compound database.  Choupo omits it too, and
    //  the difference worth having is that Choupo SAYS SO at the point of use.
    //  No threshold is invented: the error grows smoothly with |T - Tfus| and
    //  there is no principled band, so the advisory reports the distance and
    //  lets the reader judge.  Record: docs/design/dwsim-solids-study.md §3.
    mutable bool announcedNoDeltaCp_ = false;

    //  BORROWED, and re-pointable for the same reason LiquidPhase is: a
    //  default-moved ThermoPackage leaves its phases pointing at the emptied
    //  SOURCE vector, which is a dangling read inside fEffective.
    const std::vector<Component>* components_ = nullptr;

public:
    void rebindComponents(const std::vector<Component>* comps) override
    { components_ = comps; }
};

} // namespace Choupo
