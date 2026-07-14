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
    Choupo::CompressorSize

Description
    Sizing for a centrifugal compressor / blower.  The characteristic size is
    the shaft POWER [kW], exposed by the compressor unit-op as the `W_shaft_kW`
    KPI -- the Guthrie/Turton size driver for compressors (table A.1).  No
    geometry: a compressor is bought by power.  F_P = 1 (Turton folds the
    discharge-pressure effect into the power itself, not a separate factor).
\*---------------------------------------------------------------------------*/

#pragma once
#include "EquipmentSize.H"

namespace Choupo {

class CompressorSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }
    EquipmentSizing size(const std::string&     unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;
private:
    inline static const std::string type_ = "compressor";
};

} // namespace Choupo
