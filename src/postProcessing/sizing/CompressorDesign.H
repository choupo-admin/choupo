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
    Choupo::compressorDesign

Description
    THE DETAILED DESIGN OF A COMPRESSOR (DEV.md 4c C440, gap 4): machine
    type, stages with intercooling, per-stage head / discharge temperature /
    power, the intercoolers' duties, the driver.  Called by `CompressorSize`
    when the entry's `designRules` carries a `design {}` block; without it the
    sizer is the power-only route it always was, and no number moves.

    THE SOURCES, every one read at its page (never from memory):

      Brown, R. N., Compressors: Selection and Sizing, 3rd ed., Gulf
      Professional Publishing, 2005 --
        p.3   Fig 1-2   application ranges of the compressor types (the
                        machine selection, read from the chart);
        p.5, p.8        text ranges of the reciprocating and helical-lobe
                        machines;
        p.34-40 Eq 2.64-2.78  head, polytropic exponent, real-gas exponent
                        from the equation of state (Eq 2.76), power;
        p.47-50 Ex 2-4  intercooling to the inlet temperature, equal ratios;
        p.65    Eq 3.17 the balanced division r_stage = r_overall^(1/n);
        p.66    Fig 3-6 reciprocating compressor efficiency vs ratio;
        p.71            the 300 F (API 618) discharge limit, reciprocating;
        p.135   Fig 4-7 helical-lobe adiabatic efficiency;
        p.168           pressure ratio per impeller;
        p.195-200       the centrifugal sizing procedure: 75 % stage
                        efficiency, head per stage vs molecular weight, the
                        475 F limit, eight stages per casing, cooler
                        pressure drop 2 % (floor 2 psi), 1 % mechanical loss;
        p.278-285       the axial procedure: pressure coefficient 0.29, mean
                        blade velocity 720 ft/s, adiabatic efficiency 0.85;
        p.307           the motor at 110 % of the greatest power (API).

    THE REAL GAS comes from the case's own package, the one door the unit
    itself prices through: Z from `ThermoPackage::density`, the isentropic
    outlet temperature from the same entropy solve the compressor unit uses
    (`rotating::solveT_for_S`), and from them the compression path exponent
    by Brown's Eq 2.76.  No second property route.

    THE LIMIT, stated on the sheet: the flowsheet's compressor unit is ONE
    adiabatic pass.  This design is what the machine would be when staged
    and intercooled; its power differs from the unit's `W_shaft`, both are
    printed, and the unit's number (the costing size) is NOT replaced.  The
    intercoolers are LISTED with their duties; they are not separate
    exchanger items of the plant (that is a later slice).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/ResultRecords.H"
#include "result/SimulationResult.H"

#include <string>

namespace Choupo {
namespace compressorDesign {

//  Design `d` (the unit's compressor item, already carrying its power-only
//  values) from the `design {}` block.  Adds `values` under the keys the
//  guide lists, fills `d.compressor`, and records every defaulted input with
//  the page it was read at.  Throws, naming the unit and the remedy, when the
//  design cannot be made (no package, a liquid suction, no machine fits, a
//  required limit not declared).
void apply(EquipmentSizing&         d,
           const std::string&       unitName,
           const SimulationResult&  result,
           const DictPtr&           design);

} // namespace compressorDesign
} // namespace Choupo
