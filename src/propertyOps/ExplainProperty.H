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
    Choupo::ExplainProperty

Description
    Publish the DERIVATION LEDGER of one mixture property at one state:
    every term, the record field or model it came from, and the identity
    that re-adds the terms to the number the engine reports.

    The op computes NO thermodynamics of its own.  Every number is an
    engine call (`Component::s_pure_ig`, `ThermoPackage::S_ig`,
    `EquationOfState::S_residual`, ...) or a DIFFERENCE of two engine
    calls (the ∫cp/T term is s_pure_ig(T) − s_298 — the record's own
    datum subtracted from the engine's own integral, never a private
    quadrature).  The two closed-form lines the assembly adds (mixing
    −RΣy·ln y, pressure −R·ln(P/P°)) are re-stated here ONLY so the
    identity can be checked: the re-added total must equal the engine's
    assembled value to round-off, and a gap beyond round-off REFUSES —
    it would mean this explanation and the engine disagree, and a wrong
    explanation delivered confidently is worse than none.

    Dictionary form:

        {
            name        explain_s;
            type        explainProperty;
            property    S_real;         // S_real | S_ig | H_real | H_ig
            state
            {
                T            400 K;
                P            2 bar;
                composition  { N2 0.79;  O2 0.21; }
            }
        }

    Refusals, each by name: an unknown `property`; a component whose
    datum sits off the ideal-gas rung (raised by `s_pure_ig` itself and
    passed through); and a state the package routes through a
    `pureFluids {}` fundamental-equation override, whose entropy is the
    release's own Gibbs-equation surface — a datum-plus-integral ledger
    would mislabel it.

SourceFiles
    ExplainProperty.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class ExplainProperty : public PropertyOperation
{
public:
    ExplainProperty() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    {
        return diag_;
    }

private:
    inline static const std::string type_ = "explainProperty";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
