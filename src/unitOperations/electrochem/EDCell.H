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
Namespace
    Choupo::edCell

Description
    THE CELL PAIR, in ONE home -- the arithmetic that is true of an
    electrodialysis cell pair whether the stack is fed by a flowing stream
    (`electrodialysisStack`, steady) or by a pair of recirculating tanks
    (`batchElectrodialysis`, choupoBatch).

    WHY IT EXISTS.  Until 2026-09-16 every line below lived in an anonymous
    namespace inside `ElectrodialysisStack.cpp`, which was right while there
    was one caller.  The batch unit is the second, and it asks the SAME
    questions -- what is the ionic state of this channel, what does the IEM
    pair weigh, what is the limiting current at this composition -- once per
    instant instead of once per pass.  Copying them would have been two homes
    for one physics, and the two would drift the first time either moved.
    (The precedent is `unitOperations/membrane/BulkConversion.H`: a helper
    leaves an anonymous namespace the day the second caller arrives.)

    NOTHING HERE IS NEW.  Every function is the steady unit's own code,
    moved: the messages carry a caller-supplied `who` so the steady path's
    refusals read exactly as they did, and both electrodialysis units'
    goldens are unchanged by the move.

    WHAT IS **NOT** HERE, and deliberately: the Faraday transfer itself, the
    stack-record clash refusals and the operating-mode grammar.  Those differ
    between the two units -- a flowing stack reads its flow off an inlet
    stream and a batch rig declares a recirculation rate; a flowing stack may
    be given a `targetDemin` or a `targetConductivityRemoval`, a batch rig may
    be given a voltage -- and
    folding two different questions into one function is how a shared home
    becomes a switchboard.
\*---------------------------------------------------------------------------*/

#pragma once

#include "LimitingCurrent.H"

#include "core/Identifiers.H"
#include "core/Types.H"

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo {

class EDStack;
class ThermoPackage;
namespace electrolyte { class AqueousActivity; }

namespace edCell {

//- kg/mol.  The molality closure both units use (and the one IonExchanger
//  uses): a channel's molality is n_ion / (n_water * MW_WATER_KG).
constexpr scalar MW_WATER_KG = 0.0180153;

//- kg/m3.  The DILUTE-CARRIER density that turns a molality into a
//  concentration.  Announced by every consumer; it is the same constant the
//  conductivity and the limiting current are both built on.
constexpr scalar RHO_CARRIER = 1000.0;

// ---------------------------------------------------------------------------
//  One IEM (cation- or anion-exchange) membrane's read-in properties.
// ---------------------------------------------------------------------------
struct IEMSpec
{
    std::string name;
    scalar      R_area    = 0.0;   // Ohm.m2
    scalar      t_cu      = 0.0;   // counter-ion transport number
    scalar      thickness = 0.0;   // m
};

//- Read a `kind IEM` membrane-pair record from the ONE asset home: the
//  mirrored constant/assets/<name>.dat is the case-local tier, else the
//  standards catalogue -- a SEALED case reads its own mirror ONLY.
//  `who` is the calling unit's type word, so the refusal names the unit the
//  reader is looking at.
void readIEMPair(const std::string& who, const std::string& name,
                 IEMSpec& cem, IEMSpec& aem);

// ---------------------------------------------------------------------------
//  One channel's ionic state, derived from a composition.
// ---------------------------------------------------------------------------
struct ChannelState
{
    std::vector<SpeciesId>   ion;        // TYPED species ids (via the declared bridge)
    std::vector<std::size_t> compIdx;    // the component each row came from
    std::vector<scalar>      z;          // charge
    std::vector<scalar>      m;          // molality [mol/kg water]
    std::vector<scalar>      gamma;      // activity coefficient of the declared model
    scalar                   I = 0.0;    // ionic strength [mol/kg]
    scalar                   kappa = 0.0;// specific conductivity [S/m]
    scalar                   c_eq = 0.0; // equivalent concentration [mol/m3]
};

//- Build the ionic state of a channel from a MOLE-FRACTION composition,
//  freezing the activity coefficients once.  The component -> species
//  crossing goes through the DECLARED bridge, never by name identity.
ChannelState buildChannel(const std::string&   who,
                          const ThermoPackage& thermo,
                          const sVector&       z,
                          std::size_t          iWater,
                          scalar               T,
                          const electrolyte::AqueousActivity& act);

//- The GEOMETRIC MEAN activity ratio a_conc/a_dil over the ions of one sign
//  (`sign` > 0: cations).  1.0 when no ion of that sign is matched in both
//  channels -- a Nernst potential of zero, which is what "no gradient" means.
scalar meanActivityRatio(const ChannelState& chD, const ChannelState& chC,
                         scalar sign);

//- One channel's solution resistance per cell pair [Ohm]:
//      R = channelHeight / (kappa * area)
scalar solutionResistance(const ChannelState& ch, scalar h_ch, scalar area);

// ---------------------------------------------------------------------------
//  THE LIMITING CURRENT, predictive route (GeraldesAfonso2010).
// ---------------------------------------------------------------------------
struct LimitingCurrent
{
    std::vector<edLimitingCurrent::Ion> ions;
    std::vector<scalar> t_cem, t_aem;       // Eqs. (12)/(13), per ion
    scalar D_eff     = 0.0;                 // Eq. (A13)          [m2/s]
    scalar k_c_eff   = 0.0;                 // Sh D_eff / h       [m/s]
    scalar Sh = 0.0, Re = 0.0, Sc = 0.0;
    scalar i_lim     = 0.0;                 // the applicable value [A/m2]
    scalar i_lim_cem = 0.0, i_lim_aem = 0.0;// Eq. (15), signed
    scalar i_lim_eq16 = 0.0;                // Eq. (16), single salt only
    bool   haveEq16  = false;
    std::string setBy;                      // which membrane set i_lim
    //- The hydraulics the correlation was evaluated at.
    scalar u_superficial = 0.0, u_interstitial = 0.0;
    scalar sectionEmpty = 0.0, pathLength = 0.0, channelsPerPass = 0.0;
};

//- Evaluate it for a diluate channel at (T, Q).  `Q_dil` is the VOLUMETRIC
//  diluate flow through the stack [m3/s] -- an inlet stream's flow for the
//  steady unit, the declared recirculation rate for the batch rig -- and
//  `nu` / `seFactor` are the solvent kinematic viscosity at the run
//  temperature and the Stokes-Einstein correction the caller resolved from
//  the package (1.0 when the case declares no liquid-viscosity model).
LimitingCurrent predictiveLimitingCurrent(const EDStack&      stk,
                                          const ChannelState& chD,
                                          scalar              Q_dil,
                                          scalar              nu,
                                          scalar              seFactor);

} // namespace edCell
} // namespace Choupo
