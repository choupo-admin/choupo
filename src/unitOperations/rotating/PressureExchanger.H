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
    Choupo::PressureExchanger

Description
    The rotary pressure exchanger of seawater reverse osmosis (DEV.md 4c
    C192): a ceramic rotor of longitudinal ducts, each duct filled in turn by
    the high-pressure brine -- which pushes out, at nearly the same pressure,
    the seawater the duct held -- and by low-pressure seawater, which pushes
    the depressurised brine to drain.  Liquid-to-liquid contact, no piston,
    no seals.  The seawater it returns at high pressure needs only a small
    BOOSTER pump to rejoin the high-pressure pump's discharge, which is how
    the device takes the brine's pressure energy back instead of throttling
    it away.

    FOUR PORTS, in the order the case wires them:
        inputs  ( highPressureIn  lowPressureIn  );   the brine, the seawater
        outputs ( highPressureOut lowPressureOut );   the pressurised seawater,
                                                      the spent brine

    THREE DECLARED PARAMETERS, every one a maker's or a published number --
    there is NO default for any of them, an absent one refuses by name:

        efficiency   eta     in (0, 1]   the pressure-transfer (energy)
                                         efficiency, Stover's definition
        mixing       m       in [0, 1)   the VOLUMETRIC share of the
                                         high-pressure outlet that is brine
        leakage      lambda  in [0, 1)   the share of the high-pressure inlet
                                         volume that crosses the rotor-stator
                                         gap to the low-pressure outlet (the
                                         lubrication flow)
        P_LPout              Pa          the drain (low-pressure outlet)
                                         pressure, declared: the device sets
                                         it by nothing of its own
        source               "..."       where the three numbers come from
        targetPressure       Pa          OPTIONAL: the pressure the booster
                                         must lift the high-pressure outlet to;
                                         absent, the brine inlet pressure is
                                         read in its place and ANNOUNCED

    Stover, Desalination 203 (2007) 168-175, gives the ERI PX class as
    eta 95-98 %, mixing 3-6 %, leakage 1-2 %, with 1-2 bar lost on the
    high-pressure side.  Those ranges are the case author's to cite; this
    unit reads what the case declares.

    THE THREE BALANCES.  Everything below is algebra on the two inlets; the
    device has no state, no time constant and no kinetics (no new physics,
    C192).  Q is a VOLUMETRIC flow, Q = F v with v the stream's liquid molar
    volume under the dilute-solution reading the pump uses (a dissolved ion
    or an aqueous-bridged salt carries no Vliq and contributes no volume;
    announced), and volumes are taken ADDITIVE across the two solutions.

    (1) VOLUME, per side, less the leakage:
            Q_HPout = (1 - lambda) Q_HPin
            Q_LPout = Q_LPin + lambda Q_HPin
        so Q_HPin + Q_LPin = Q_HPout + Q_LPout.  The duct volume the brine
        displaces is what the high-pressure outlet carries; the leak joins
        the drain.

    (2) COMPOSITION, by the mixing on a volumetric basis.  Of the volume
        Q_HPout leaving at high pressure, the share m is brine (left in the
        duct) and 1 - m is the seawater that filled it:
            n_i,HPout = m Q_HPout (F_b z_b,i / Q_b)
                      + (1 - m) Q_HPout (F_s z_s,i / Q_s)
        with b the brine inlet and s the seawater inlet, F_b z_b,i / Q_b the
        brine's molar density of component i.  The low-pressure outlet is the
        REMAINDER, component by component:
            n_i,LPout = F_b z_b,i + F_s z_s,i - n_i,HPout
        so matter closes exactly, by construction.  The seawater volume the
        duct needs, (1 - m) Q_HPout, must not exceed the seawater fed,
        Q_LPin: a feed that cannot fill the duct REFUSES by name.
        The salinity the feed gains is published as a KPI: it is the hidden
        penalty of the device -- the osmotic pressure the membrane must beat
        rises with it.

    (3) PRESSURE, by the efficiency.  Stover's definition,
            eta = (Q_HPout P_HPout + Q_LPout P_LPout)
                / (Q_HPin  P_HPin  + Q_LPin  P_LPin ),
        with every Q from (1), P_HPin and P_LPin the inlets' own, and P_LPout
        the DECLARED drain pressure, has ONE unknown, the high-pressure outlet
        pressure, solved in closed form:
            P_HPout = [ eta (Q_HPin P_HPin + Q_LPin P_LPin)
                        - Q_LPout P_LPout ] / Q_HPout.
        The pressures are the ABSOLUTE pressures the streams carry -- every
        pressure in Choupo is -- and the definition is applied to them as
        they stand.  The literature does not always say which reference it
        uses; the equation is not invariant to it (the outlet volumes equal
        the inlet volumes, but the ratio still moves), so a reader comparing
        with a gauge-based figure must note the difference, which is of the
        order of (1 - eta) x P_atm / P_HPin.  An outlet pressure at or below
        the seawater inlet's REFUSES (the device recovered nothing: the
        efficiency is too low for these flows); one above the brine inlet's
        is ANNOUNCED (at eta -> 1 with a leak the definition credits the
        leaked volume's energy to the outlet).

    TEMPERATURE: unchanged.  Each outlet leaves at the temperature of the
    stream that makes up most of it -- the high-pressure outlet at the
    seawater's, the drain at the brine's.  The model is isothermal, so two
    inlets at different temperatures are REFUSED beyond a small tolerance
    (0.5 K, announced inside it): a device that mixes two solutions of
    different temperature would need an enthalpy balance on the mixing share,
    and nothing here models one.

    ENERGY: the device does no work on the fluid beyond the exchange of
    pressure, and publishes Q_kW = 0.  On the engine's liquid enthalpy
    surface h(T), with T unchanged, each outlet's enthalpy is its parts',
    so the unit's own first law closes exactly.  What it DISSIPATES,
        W_lost = (Q_HPin P_HPin + Q_LPin P_LPin)
               - (Q_HPout P_HPout + Q_LPout P_LPout)  = (1 - eta) x (input),
    is published (`dissipation_kW`, `specificEnergy_kWh_m3` per m3 of
    pressurised seawater) and is NOT put on any stream, exactly as the pump's
    useful work v dP is not (Pump.cpp states why: the surface carries no
    pressure term).  The booster duty the device leaves to be paid,
        boosterDuty_kW = Q_HPout (P_target - P_HPout) / 1000,
    is the HYDRAULIC duty (eta_pump = 1); the booster unit in the flowsheet
    publishes its own shaft power with its own efficiency.

    NOT MODELLED, said plainly: the rotor's hydraulics (speed, duct count,
    the HP and LP pressure drops as a function of flow -- they are what the
    efficiency summarises), the duct-by-duct unsteadiness, any dependence of
    the mixing on flow imbalance or salinity, and the ceramic's wear.  A
    flow imbalance between the two inlets is published and announced, never
    corrected.

    Dictionary form:

        {
            name        PX;
            type        pressureExchanger;
            inputs      ( brine  seawaterToPX );
            outputs     ( pxHPout  spentBrine );
            operation
            {
                efficiency      0.96;
                mixing          0.05;
                leakage         0.015;
                P_LPout         1.2 bar;
                targetPressure  60 bar;       // optional
                source          "Stover, Desalination 203 (2007) 168-175, Table 1";
            }
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class PressureExchanger : public UnitOperation
{
public:
    PressureExchanger() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::map<std::string, scalar> kpis() const override
    {
        return kpis_;
    }

    //  A LIQUID, aqueous, every component modelled (DEV.md 4c C188 item 5;
    //  the C192 commission).  PressureExchanger.cpp.
    UnitAcceptance acceptance() const override;

private:
    inline static const std::string type_ = "pressureExchanger";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
