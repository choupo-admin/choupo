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
Class
    Choupo::GasStoreSize

Description
    A GAS BUFFER IN PRESSURE VESSELS, attached to a boundary stream (2026-10-18,
    DEV.md 4c C89).  GREEN ammonia's electrolysers follow an intermittent
    renewable supply while the synthesis loop wants a steady feed, so the
    hydrogen is buffered.  An atmospheric tank cannot hold a gas
    (`StorageTankSize` refuses one by name); a gas is stored COMPRESSED, and
    what a vessel can give back is the difference between what it holds full
    and what it must keep to deliver at the pressure downstream needs.

    THE POSTDICT ITEM, the C44 shape (an item attached to a STREAM, not a
    flowsheet unit), in its OWN list because it is a different design
    argument from a liquid tank -- two pressures and a temperature instead of
    a fill fraction -- and a list keeps every key of each kind required:

        sizing
        {
            gasStorage
            (
                { name            H2Buffer;
                  stream          H2Feed;        // the gas it buffers
                  material        carbonSteel;   // a construction-material record
                  autonomy        2 h;           // REQUIRED, with its unit
                  reason          "...";         // why that many hours
                  maxPressure     100 bar;       // ABSOLUTE: full, and the design pressure
                  minPressure     32 bar;        // ABSOLUTE: what downstream needs
                  temperature     313.15 K;      // of the gas in the vessels
                  maxVesselVolume 200;           // m3, one vessel at most
                  //  optional, each ANNOUNCED when the engine supplies it
                  //  (`DesignDefaults`, the vessel's own constants):
                  L_over_D 3;  corrosionAllow 0.003;  jointEfficiency 1.0;
                  //  the COST (required by the costing pass, see below):
                  steelPrice 8;                  // EUR per kg of shell steel, INSTALLED
                  steelPriceReason "...";
                }
            );
        }

    THE SIZE, from declarations, the stream's own mass flow and the CASE'S
    OWN PACKAGE, nothing else:

        m_work   = autonomy x mdot                          [kg]
        dRho     = rho(Pmax, T) - rho(Pmin, T)              [kg/m3]
        V_total  = m_work / dRho                            [m3 of vessel]
        N        = ceil(V_total / maxVesselVolume)
        V_R      = V_total / N                              [m3, each]

    rho is `ThermoPackage::density` in its VAPOUR route at the stream's own
    composition -- the case's equation of state, whatever it is.  On the
    green-ammonia case that is SRK, and hydrogen above its critical
    temperature is a gas at every pressure; the compressibility Z of both
    ends is published so a reader sees how far from ideal the buffer is.  A
    case that DECLARES an ideal gas gets an ideal-gas buffer, and the run
    says that it did.  A density that is not finite and positive REFUSES by
    name -- never a silent fallback to the ideal gas (DEV.md records a NaN
    the package returns silently on another route).

    REFUSED BY NAME: any key absent (none has a default: each is a design
    basis somebody chooses); `autonomy`, `maxPressure`, `minPressure` or
    `temperature` without a unit; maxPressure <= minPressure (no working
    gas); minPressure BELOW the stream's own pressure -- the store gives the
    gas back to the line it buffers, and gas drawn down below that line's
    pressure cannot flow back into it without a second compressor that is
    not modelled; a stream that is not a single vapour (a liquid belongs in
    a `storage` tank).

    THE VESSELS.  N equal STANDING vessels, each a cylinder of L/D, wall by
    the ONE home (`vesselMechanics::wall`) at maxPressure read as GAUGE
    (maxPressure - 1 atm; no margin is added above it: the declared ceiling
    IS the design pressure), rated by `materialLimits::pressure`.  They
    stand because the Turton process-vessel set (equipment word `vessel`)
    is the VERTICAL one, and that set is the COMPARISON below.

    THE COST, BY STEEL MASS (Vitor's ruling on C89, 2026-10-18).  Priced on
    the Turton set, a 200 mm wall gave F_P ~ 32, about nine times the steel.
    So each vessel is marked `costWords["costBasis"] = "steelMass"` and the
    costing pass prices it in `costing/SteelMassCost`: its published
    `weight` -- the CYLINDRICAL SHELL steel, rho pi D H t; no heads, nozzles,
    supports or internals -- times the DECLARED `steelPrice`, with no index
    and no module factor, so the price must be an INSTALLED price per kg of
    shell steel, everything else folded into it (C_TM = 1.18 C_BM, the
    contingency and fee, since DEV.md 4c C110).  The Turton cost is
    printed beside it as an EXTRAPOLATED comparison (its F_P and the wall
    over the radius) and enters no total.  Absent `steelPrice` or
    `steelPriceReason`, the vessels stay SIZED and their COST refuses by
    name: the total reads INCOMPLETE (the catalyst charge's rule).  Each
    vessel's inventory is its full charge at
    maxPressure, so the working capital counts the gas a full buffer ties
    up; the cushion (rho(Pmin) x V) never leaves and is published beside it.

    WHAT IT IS NOT, said on every run: the CHARGING COMPRESSOR that takes the
    gas from the stream's pressure up to maxPressure is not in the flowsheet,
    so neither it nor its power is sized or priced; and the autonomy is a
    DESIGN ASSUMPTION, not derived from any renewable-power profile.  Both
    are announced (console + AdvisoryLog, so the caveat block replays them).

    A STORE A FLOWSHEET UNIT HOLDS IS LINKED (DEV.md 4c C92, the C87 rule:
    one home for the hold time).  `unit <name>;` names the flowsheet
    `storageTank` unit that holds the stream, and the store reads the
    unit's published `residenceTime_s` as its autonomy and the unit's inlet
    as its stream; `autonomy`, `stream` or `name` beside `unit` REFUSE by
    name, as does an unlinked entry carrying a storageTank unit's name
    (`StorageLink.H`, the one home of the link).  `reason` is then optional:
    the hold time's reason lives with the unit.  The unit's own
    `vesselVolume_m3` is printed beside the store's -- it holds the gas AT
    THE LINE STATE, which a vessel kept at the line's pressure cannot give
    back, and the difference is the lesson.

    A PRESSURISED LIQUID STORE (`LiquefiedGasStoreSize`, DEV.md 4c C92):
    `liquefiedGasStorage ( ... )`, a liquid that must be held ABOVE its
    bubble pressure -- ammonia, LPG -- in pressure vessels (bullets):

        liquefiedGasStorage
        (
            { unit            T201;          // or: name; stream; storageTime; fillFraction;
              material        carbonSteel;
              designPressure  22 bar;        // ABSOLUTE, >= the bubble pressure
              temperature     250 K;         // the storage temperature
              reason          "...";         // why that pressure and temperature
              maxVesselVolume 700;           // m3, one vessel at most
              L_over_D 6;  corrosionAllow 0.003;  jointEfficiency 1.0;
              steelPrice 8;  steelPriceReason "...";
            }
        );

        V_stored = storageTime x mdot / rho_liquid(T)       [m3 of liquid]
        V_total  = V_stored / fillFraction                  [m3 of vessel]
        N, V_R, D, L, the wall at designPressure as gauge, the steel-mass
        cost -- the SAME vessel bank as the gas store (one home in the .cpp)

    rho is the stream's own liquid reading at its own temperature (the
    selection `phaseDensity::of` makes: a dissolved supercritical gas left
    out of the density, announced, and counted in the mass); at a different
    declared temperature it is asked of the package at that temperature,
    the gap between the two ANNOUNCED (what warms or cools the liquid is not
    in the flowsheet), and a value that is not finite and positive REFUSES
    by name.  THE BUBBLE PRESSURE of the stored liquid at that temperature
    -- every dissolved component counted, on the case's own K-values
    (`BubblePoint::pressure`) -- is printed beside the main component's own
    vapour pressure, and a designPressure below it REFUSES: the liquid would
    boil in the vessel.  The vessels' orientation is the plot plan's (a
    bullet lies); the sizer publishes D and the length as `H`.  NOT
    included, said on every run: boil-off, vapour return and relief.
    Inventory: the liquid at its working level, V_R x fill x rho.

    NOT REGISTERED in the unit-type registry, for the reason `StorageTankSize`
    gives: it is reached from its own list and reads a STREAM.
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

#include <string>
#include <vector>

namespace Choupo {

class GasStoreSize : public EquipmentSize
{
public:
    //  The SIZER's word.  Each vessel it returns is sized AS a `vessel` (its
    //  `equipmentType`), the word the plot plan's separation table and the
    //  3D drawing already know; it is COSTED by its steel mass.
    const std::string& type() const override { return type_; }

    //  `unitName` is the store's NAME (it is not a flowsheet unit);
    //  `designRules` is the whole `gasStorage ( { ... } )` entry.
    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

private:
    inline static const std::string type_ = "gasStore";
};

//  A PRESSURISED LIQUID STORE (`liquefiedGasStorage ( ... )`, DEV.md 4c
//  C92): the same vessel bank and steel-mass cost, sized on a hold time and
//  a fill fraction instead of a pressure swing (see the header above).
class LiquefiedGasStoreSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }

    //  `unitName` is the store's NAME, or the linked storageTank unit's;
    //  `designRules` is the whole `liquefiedGasStorage ( { ... } )` entry.
    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

private:
    inline static const std::string type_ = "liquefiedGasStore";
};

} // namespace Choupo
