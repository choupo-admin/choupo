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
    Choupo::materialLimits

Description
    THE ONE HOME for comparing a sized item's service conditions with the two
    limits a `kind constructionMaterial` record declares: `maxP` (bar) and
    `maxT` (K).  Both comparisons ANNOUNCE -- a `[rating] WARNING` line on the
    console AND an `AdvisoryLog` entry, so the end-of-run caveat block replays
    it -- and NEITHER refuses: a sizing pass is a design draft, and a wall that
    is too thick or a metal that is too hot is exactly what the draft exists
    to show the engineer.

    WHAT THE LIMITS ARE, AND WHAT THEY ARE NOT.  They are the RECORD's own
    service envelope, and the four shipped records say in their headers that
    their numbers are teaching assertions, not sourced code values.  They are
    NOT a code allowable stress at temperature: a record holds ONE `sigma_y`,
    and `vesselMechanics::wall` sizes a 700 K shell on the same allowable as a
    300 K one.  The announcement says so, because a reader who sees "maxT
    exceeded" would otherwise assume the wall had been de-rated for heat.

    WHY ONE HOME (DEV.md 4c C85, 2026-10-17).  The maxP comparison was written
    out FOUR times -- `VesselSize`, `StirredTank`, `CatalystBedSize`,
    `ConverterShellSize`, one of them with a remedy the other three lacked --
    and maxT was READ by `MaterialRegistry` and compared by nothing, so
    aluminium (record maxT 500 K) sat on a 700 K converter in silence.  Both
    comparisons now live here; the sizers call `pressure()` where they hold
    their `pressureDesign`, and `SizingPass` calls `temperature()` once per
    item, because it is the pass, not the sizer, that has every item's ports.

    EVERY PUBLISHED DESIGN PRESSURE IS COMPARED (DEV.md 4c C86).  C85 left
    the column's shell and reflux drum, every shell-and-tube record (the
    column's condenser and reboiler among them), the multitubular bed and the
    pass-through sizers (evaporator, crystalliser, spray dryer, cyclone,
    compressor) publishing a `pressureDesign` that met no rating.  Each now
    calls `pressure()` beside the `set("pressureDesign", ...)` that publishes
    it, and `check_design_sheet` arm (t) counts the two per sizer.

    WHICH TEMPERATURE.  Choupo has NO design temperature: no `designRules`
    key declares one and no sizer computes one.  The temperature compared is
    the hottest STATE the item's ports carry (`hottestPort`): the unit's
    inlet and outlet streams, a storage tank's stored stream, or -- for an
    item a SECTOR realises (a converter shell, the relief valve on it) -- the
    ports of every unit in that sector.  It is a LOWER bound on what the metal
    sees: a hot spot inside a catalyst bed, the utility side of an exchanger
    and a fire case are not in it, and the announcement names the stream it
    used so a reader can tell.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "core/ResultRecords.H"
#include "materials/Material.H"
#include "result/SimulationResult.H"

#include <string>

namespace Choupo {
namespace materialLimits {

//  `who` is the item as the line names it, e.g. "vessel 'separator'".
//  Announces when `pressureDesign_bar` (gauge, as declared) exceeds the
//  record's `maxP`.  A record with no `maxP` (0) is compared as before: the
//  loader defaults it to 0, so ANY positive design pressure announces.
void pressure(const std::string& who,
              const Material&    material,
              scalar             pressureDesign_bar);

//  Announces when `T_K` exceeds the record's `maxT`.  A record that declares
//  no `maxT` (the loader's 0) is NOT compared -- a missing limit is not a
//  limit of zero kelvin -- and a non-positive `T_K` (no state found) is not
//  compared either.  `where` says which state `T_K` is, in words.
void temperature(const std::string& who,
                 const Material&    material,
                 scalar             T_K,
                 const std::string& where);

//  The hottest state among the item's ports (see the header).  `T` is 0 and
//  `stream` empty when no port carries a solved state.
struct HottestPort
{
    scalar      T = 0.0;     // [K]
    std::string stream;      // the stream that carries it
};
HottestPort hottestPort(const EquipmentSizing&  item,
                        const SimulationResult& result);

} // namespace materialLimits
} // namespace Choupo

// ************************************************************************* //
