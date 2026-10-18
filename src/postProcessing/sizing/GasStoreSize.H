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
    IS the design pressure), rated by `materialLimits::pressure`, costed on
    the EXISTING Turton process-vessel set (equipment word `vessel`, whose
    coefficients are the VERTICAL set -- which is why the vessels stand), and
    a volume outside that set's range is announced by the costing pass as
    for every vessel.  Each vessel's inventory is its full charge at
    maxPressure, so the working capital counts the gas a full buffer ties
    up; the cushion (rho(Pmin) x V) never leaves and is published beside it.

    WHAT IT IS NOT, said on every run: the CHARGING COMPRESSOR that takes the
    gas from the stream's pressure up to maxPressure is not in the flowsheet,
    so neither it nor its power is sized or priced; and the autonomy is a
    DESIGN ASSUMPTION, not derived from any renewable-power profile.  Both
    are announced (console + AdvisoryLog, so the caveat block replays them).

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
    //  The SIZER's word.  Each vessel it returns is sized and costed AS a
    //  `vessel` (its `equipmentType`), the word the Turton set, the plot
    //  plan's separation table and the 3D drawing already know.
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

} // namespace Choupo
