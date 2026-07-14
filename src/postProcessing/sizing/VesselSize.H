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
    Choupo::VesselSize

Description
    Sizing for a process VESSEL whose unit-op emits no volume of its own -- a
    catalytic (equilibrium) reactor, a flash/knock-out drum, a separator.  The
    volume is a DESIGN choice, computed here from the unit's throughput (a
    simulation result) and ONE design basis in designRules:
        spaceVelocity  [1/h]  -> V = Q_gas / SV        (catalytic reactor)
        residenceTime  [s]    -> V = Q_gas * tau       (drum / separator)
        volume         [m^3]  -> V direct              (author-set)
    Q_gas [m^3/s] is built from a molar-flow KPI (designRules.flowKey, default
    N_out_mol_s) at the unit's (T,P) via the ideal-gas law.  The pressure vessel
    is then sized ASME thin-wall exactly like StirredTank (D, L, wall, weight)
    and costed with the Guthrie vessel coefficients.
\*---------------------------------------------------------------------------*/

#pragma once
#include "EquipmentSize.H"

namespace Choupo {

class VesselSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }
    EquipmentSizing size(const std::string&     unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;
private:
    inline static const std::string type_ = "vessel";
};

} // namespace Choupo
