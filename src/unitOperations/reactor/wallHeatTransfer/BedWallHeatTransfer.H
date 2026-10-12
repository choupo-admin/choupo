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
    Choupo::BedWallHeatTransfer

Description
    THE BED-SIDE WALL COEFFICIENT OF A PACKED, WALL-COOLED TUBE, AS A
    CORRELATION OBJECT (DEV.md 4c C69, 2026-10-12).

    A one-dimensional plug-flow bed (the `pfr`) has one temperature per cross-
    section, so the whole radial resistance between the bed's mixing-cup
    temperature and the tube wall is lumped into ONE coefficient, the
    overall bed-side coefficient U_w of the 1-D model.  It is NOT an empty-
    tube film: the packing renews the wall layer, and the correlations
    written for it are functions of the PARTICLE Reynolds number and of the
    particle-to-tube diameter ratio, which an empty-tube correlation
    (Dittus-Boelter, Gnielinski) cannot see.  That is why this family is
    separate from `HeatTransferCorrelation`: its context carries a particle
    and a tube, and a member of that family evaluated here would be a
    correlation applied to a geometry it was never fitted on.

    Each member states, as the transport and friction correlations of this
    tree do (CLAUDE.md "A CORRELATION IS AN OBJECT"):

        validityWindow()  the ranges its source states, read where they are
                          printed -- evaluate() flags a point outside them
                          (extrapolated, never clamped);
        citation()        the paper, AND the document it was read in when
                          that is not the paper;
        verify()          an anchor, and WHAT KIND of anchor it is: an
                          ARITHMETIC anchor proves a transcription, never a
                          physics (the transport rule, 2026-09-05).

    Explicit factory (registerType / New / registerBuiltins), called from
    the binaries that can construct a `pfr`: choupoSolve and the
    time-integrated driver (a quasi-steady adapter may wrap one).

    The coefficient is referred to the tube's INSIDE surface, the surface a
    bed of inner diameter d_t exchanges through; the reactor puts the wall
    and the coolant film in series with it, on the same area.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class BedWallHeatTransfer
{
public:
    //  The bed and its gas at one cross-section, every property evaluated
    //  by the CALLER (the reactor states which model priced each one).
    struct Context
    {
        scalar G      = 0.0;   // superficial MASS flux [kg/(m2 s)]
        scalar dp     = 0.0;   // particle diameter, 6 V_p / A_p [m]
        scalar dt     = 0.0;   // tube inner diameter [m]
        scalar mu     = 0.0;   // gas viscosity [Pa s]
        scalar lambda = 0.0;   // gas thermal conductivity [W/(m K)]
        scalar cp     = 0.0;   // gas MASS heat capacity [J/(kg K)]
    };

    struct Result
    {
        scalar Re = 0.0;       // particle Reynolds number d_p G / mu
        scalar Pr = 0.0;
        scalar Nu = 0.0;       // U_w d_t / lambda
        scalar U  = 0.0;       // [W/(m2 K)], on the inside surface
        bool   inValidity = true;
        std::string validityNote;   // empty inside the window
    };

    struct VerifyResult
    {
        scalar      dev = 0.0;           // |Nu_choupo - Nu_anchor| / Nu_anchor
        scalar      Nu_choupo = 0.0;
        scalar      Nu_anchor = 0.0;
        std::string kind;                // "arithmetic" | "measured" | "theory"
        std::string anchor;              // the point and where the number is from
    };

    using Factory = std::function<std::unique_ptr<BedWallHeatTransfer>()>;

    virtual ~BedWallHeatTransfer() = default;

    virtual const std::string& type() const = 0;
    virtual std::string validityWindow() const = 0;
    virtual std::string citation() const = 0;

    //  The model's own keys, read from the CATALYST block (the particle's
    //  one home): a member that needs the particle shape reads `shape`
    //  there and refuses its absence by name.  `who` names the caller.
    virtual void readParticle(const DictPtr& catalyst, const std::string& who) = 0;

    virtual Result       evaluate(const Context& c) const = 0;
    virtual VerifyResult verify() const = 0;

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<BedWallHeatTransfer> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
