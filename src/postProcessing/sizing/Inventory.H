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
    Choupo::inventory

Description
    WHAT A PIECE OF EQUIPMENT HOLDS WHILE THE PLANT RUNS (2026-10-07, DEV.md
    4c C44 slice 3).  Vitor: "quero ficar com a quantidade de materias primas
    e produtos retidas em cada equipamento, porque isso vai fazer parte do
    capital circulante".  A sized vessel is full of material for as long as
    the plant operates, and that material is money tied up -- the in-process
    inventory of the working capital.

    A unit entry in the postDict's `sizing { units ( ... ) }` may declare

        inventory
        {
            held
            (
                { stream RawLiquid;     fraction 0.25; }   // the liquid level
                { stream UnreactedGas;  fraction 0.75; }   // the vapour space
            );
            volume  <m3>;     // ONLY for an item whose sizer publishes no V_R
        }

    and the item then holds, per declared phase,

        m_i = V x fraction x rho(stream state) x w_i(stream)

    V is the item's OWN sized volume (`V_R`); an item whose sizer publishes
    none (a compressor, an exchanger) may DECLARE the holdup volume instead,
    and declaring one beside a sized `V_R` is refused -- two homes for one
    volume.  The PHASE is not declared: it is READ off the named stream's
    vapour fraction (`phaseDensity::of`), which refuses a two-phase stream by
    name -- a drum's own vapour and liquid outlets each carry one phase, and
    are the streams to name.  The fractions must not exceed 1; what they
    leave is said to be internals, catalyst or empty space, and counts no
    mass.

    A STORAGE TANK HOLDS ITS OWN WORKING LEVEL, and declares nothing more:
    its inventory is its stored stream's liquid at `fillFraction` of the
    tank -- which is, by construction, `storageTime` of production.

    An item with NO `inventory {}` holds NOTHING THE RUN KNOWS OF, and every
    surface says "not declared" rather than printing zero kilograms.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/ResultRecords.H"
#include "result/SimulationResult.H"

#include <string>

namespace Choupo {
namespace inventory {

//  The inventory a unit item declares.  `who` names the item in every
//  refusal and announcement.
ItemInventory declared(const EquipmentSizing& item,
                       const DictPtr&         inventoryDict,
                       const SimulationResult& result,
                       const std::string&     who);

//  A storage tank's own working level (see the header).
ItemInventory ofTank(const EquipmentSizing&  tank,
                     const SimulationResult& result,
                     const std::string&      who);

} // namespace inventory
} // namespace Choupo
