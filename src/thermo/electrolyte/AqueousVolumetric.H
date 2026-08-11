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
    Choupo::electrolyte::AqueousVolumetricModel

Description
    The VOLUMETRIC-MODEL SLOT for an aqueous solution's density (rung 1 of
    the volumetric ladder, ruled 2026-08-11): an extensible family of
    formulations that turn a reconciled aqueous inventory into a solution
    density, so that the ideal first rung is one legitimate formulation
    inside a selectable slot -- never a shortcut hard-wired into the
    aqueousAnalysis reader.

    Registered formulations (explicit factory, the house pattern):

      diluteVolume          rung 0 -- solutes add MASS and no volume:
                            rho = rhoWaterKell(T) + soluteMass.  The
                            weakest honest closure; error grows with
                            concentration (~ +1.8 % at 1 molal NaCl).

      standardStateVolumes  rung 1 -- ideal volumetric mixing on the
                            infinite-dilution standard state, V_E = 0:
                            each master contributes its cited
                            STANDARD-STATE (infinite-dilution) partial
                            molar volume V0 from its species record.
                            Per litre of solution:
                                phi   = Sum n_i V0_i     (solute volume)
                                m_w   = rhoWater(T) (1 - phi)
                                rho   = m_w + Sum n_i MW_i
                            Direct and algebraic -- V0 are constants, so
                            NOTHING iterates (the constant-map "iteration"
                            of the rejected slice-B build must never come
                            back).  Named standardStateVolumes and NOT
                            "ideal molar volume" because for ions these
                            are conventional standard-state quantities,
                            not pure-liquid volumes (there is no pure
                            liquid Na+ at 25 C).

    THE CONVENTION, and the theorem that disarms it.  Single-ion V0 are
    conventional (V0(H+) = 0 -- conventions/MilleroConventional-v1); only
    electroneutral sums are physical.  A convention shift adds lambda*z_i
    to every V0_i, so over a CHARGE-CLOSED inventory the sum shifts by
    lambda * Sum n_i z_i = 0: the computed density is convention-invariant
    exactly because the reconciliation closes charge first.  The result
    carries each term's z so a reader (and the gate) can verify the
    premise and the identity numerically.

    RUNG 2+ (composition-dependent V_i(T, I), excess volume, Pitzer
    volumetrics) are NAMED non-goals of this slot's first rung; they
    arrive as further registered formulations without touching the
    aqueousAnalysis contract.  Until one exists, the genuinely iterative
    density closure of aqueousAnalysis slice B stays BLOCKED.

\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {
namespace electrolyte {

class AqueousVolumetricModel
{
public:
    //  One master's contribution, kept term by term so the written record
    //  and the gate can re-derive the sum by hand (glass-box).
    struct Term
    {
        std::string master;
        scalar      molPerL   = 0.0;   // reconciled inventory [mol/L solution]
        scalar      V0_cm3mol = 0.0;   // standard-state volume  [cm3/mol]
        scalar      MW_gmol   = 0.0;   // species MW             [g/mol]
        scalar      z         = 0.0;   // charge (for the invariance premise)
        std::string convention;        // the profile the V0 is stated on
    };

    struct Result
    {
        scalar rhoWater        = 0.0;  // rhoWaterKell(T)        [kg/m3]
        scalar soluteVolumeFrac= 0.0;  // phi = Sum n V0 per L   [-]
        scalar soluteMass      = 0.0;  // Sum of solute mass     [kg/m3]
        scalar rho             = 0.0;  // the answer             [kg/m3]
        std::vector<Term> terms;       // empty for diluteVolume
    };

    using Factory = std::function<std::unique_ptr<AqueousVolumetricModel>()>;
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<AqueousVolumetricModel> New(const std::string& name);
    static void registerBuiltins();
    static std::vector<std::string> availableTypes();

    virtual ~AqueousVolumetricModel() = default;

    virtual std::string method() const = 0;

    //  T_K              stream/sample temperature (caller has validated the
    //                   Kell 0-100 degC domain -- ONE refusal site, in the
    //                   reader, so both formulations share it);
    //  mastersPerL      the RECONCILED (charge-closed) master inventory,
    //                   mol per litre of solution -- consumed by
    //                   standardStateVolumes;
    //  componentSoluteMassPerM3
    //                   the component-basis solute mass [kg/m3] -- consumed
    //                   by diluteVolume (its historical scheme; the two
    //                   formulations partition "solvent" differently and
    //                   each documents its own basis);
    //  streamName       for refusal messages.
    virtual Result solve(scalar T_K,
                         const std::map<std::string, scalar>& mastersPerL,
                         scalar componentSoluteMassPerM3,
                         const std::string& streamName) const = 0;
};

} // namespace electrolyte
} // namespace Choupo
