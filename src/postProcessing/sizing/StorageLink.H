/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::storageLink

Description
    A STORE A FLOWSHEET UNIT HOLDS IS LINKED, AND ITS HOLD TIME HAS ONE HOME
    (DEV.md 4c C87, Vitor: "um so sitio"; extended to the pressure stores by
    C92).  A postDict store -- an atmospheric tank (`storage`), a gas buffer
    (`gasStorage`) or a pressurised liquid store (`liquefiedGasStorage`) --
    may name the flowsheet `storageTank` UNIT that holds its stream:

        { unit T201;  material carbonSteel;  ... }

    and is then sized on the unit's PUBLISHED `residenceTime_s` and
    `fillFraction` KPIs and on the unit's own inlet stream; its items are the
    unit's (`T201/vessel1`, ...).  Every key the unit owns -- the hold time,
    the fill fraction where the store uses one, the stream, a second name --
    declared beside `unit` REFUSES by name with the remedy, and an UNLINKED
    entry carrying a storageTank unit's name is refused naming the link (a
    name match is a link nobody declared).

    ONE HOME FOR THE LINK.  It was written inside `StorageTankSize` (C87);
    the day the two pressure stores needed the same rule it moved here,
    with the tank's sentences unchanged, rather than being written twice.
    What differs between the three stores is only WHICH keys the unit owns
    and how each store words its noun, and both are the caller's arguments.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "result/SimulationResult.H"

#include <string>
#include <vector>

namespace Choupo {
namespace storageLink {

//  A key the linked unit owns, and the remedy that names where it lives.
struct Owned
{
    const char* key;
    std::string remedy;
};

//  What a linked entry reads off its unit.
struct Link
{
    std::string unit;                   // the storageTank unit's name
    std::string stream;                 // its inlet
    scalar      residenceTime_s = 0.0;  // its published hold time   [s]
    scalar      fillFraction    = 0.0;  // its published fill fraction [-]
    scalar      vesselVolume    = 0.0;  // its own vesselVolume_m3 KPI [m3]
};

//  The storageTank unit `entry` names with `unit <name>;`.  `who` names the
//  asking store in every refusal; `noun` is that store's word for itself
//  ("tank", "store"); `ownForm` is how a store no unit holds is declared on
//  its own (e.g. "(stream; storageTime; fillFraction)").  Each of `owned`
//  found in the entry refuses by name.  Throws when the unit does not
//  exist, is not a storageTank, has no inlet, or published no hold time.
Link resolve(const DictPtr&                 entry,
             const SimulationResult&        result,
             const std::string&             who,
             const std::string&             noun,
             const std::string&             ownForm,
             const std::vector<Owned>&      owned);

//  An UNLINKED entry `name` that carries the name of a flowsheet
//  storageTank unit is refused, naming the explicit link.  `drop` lists the
//  keys the link makes redundant ("`stream`, `storageTime` and
//  `fillFraction`"); `readsWhat` says what the linked store is then sized
//  on ("the tank is then sized on the unit's own inlet, residence time and
//  fill fraction").
void refuseUnlinkedNamesake(const std::string&      name,
                            const SimulationResult& result,
                            const std::string&      who,
                            const std::string&      drop,
                            const std::string&      readsWhat);

} // namespace storageLink
} // namespace Choupo
