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
    Choupo::DisplayUnits

Description
    Output formatter for SI-canonical scalars.  Translates internal
    values (Pa, K, kmol/s, m, m²,...) into the unit the student
    asked for in `controlDict.units`.  Defaults match chem-eng
    convention so a tutorial with no `units` block prints sensible
    industrial labels (bar, kmol/h, °C-like,...).

    Example block in a case's controlDict:

        units
        {
            pressure       bar;        // default
            flow           kmol/h;     // default
            temperature    K;          // default
            length         m;
            area           m^2;
            volume         m^3;
            energy         kJ;
            power          kW;
            mass           kg;
        }

    Lookup goes by dimensions, not by name --- so registering
    `pressure bar` makes any quantity with dims [1 -1 -2 0 0] print
    in bar, no matter what the variable is called.  This is the
    point of carrying dimensions on every scalar: the formatter
    decides the unit, not the call site.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Dictionary.H"
#include "Dimensions.H"
#include "Types.H"

#include <map>
#include <string>

namespace Choupo {

// Whether the user picked a mass-basis flow unit (kg/s, kg/h,...)
// or a molar one (kmol/s, kmol/h,...).  Print sites that have a
// stream in front of them (with both F and F_mass available) use
// this to decide which value to format.
enum class FlowBasis { Molar, Mass };

class DisplayUnits
{
public:
    // Process-wide default instance.  Built with chem-eng defaults
    // at first access; `readFrom(controlDict)` updates it from a
    // `units {... }` sub-dict if present.
    static DisplayUnits& instance();

    // What basis the student picked for stream flow display.
    // Defaults to Molar (kmol/h); switches to Mass when the
    // user puts `flow kg/h;` (or any other mass-flow alias) in
    // controlDict.units.
    FlowBasis flowBasis() const { return flowBasis_; }

    // Number of decimal digits to show for a value of the given
    // dimensions.  Defaults match the chem-eng convention each
    // category was hardcoded with up to:
    //     pressure 3, temperature 2, flow 4, length 4, area 4,
    //     volume 4, energy 4, power 4, mass 4, amount 4, time 2,
    //     everything else 4.
    // controlDict.precision {... } overrides individual entries.
    int precisionFor(const Dimensions& dims) const;

    // Decimal digits for composition (mole or mass fractions).  Not
    // a `Dims::` value because the fraction is dimensionless and we
    // don't want it tangled with other dimensionless quantities.
    int compositionPrecision() const { return composition_prec_; }

    // Override defaults from a controlDict's optional `units` sub-dict.
    void readFrom(const DictPtr& controlDict);

    // Override precision defaults from a controlDict's optional
    // `precision {... }` sub-dict.  Accepted keys: pressure,
    // temperature, flow (shorthand for both molar + mass flow),
    // molarFlow, massFlow, volumetricFlow, length, area, volume,
    // time, mass, amount, energy, power, concentration, density,
    // velocity, viscosity, diffusivity, composition.  Unknown keys
    // are silently ignored.
    void readPrecision(const DictPtr& controlDict);

    // Format an SI value as "<value> <unit>" using the preferred unit
    // for those dimensions.  Falls back to canonical SI if no mapping
    // is registered (e.g. unusual dimensions encountered for the first
    // time).  Precision is fixed to `prec` decimal digits.
    std::string format(scalar v_si,
                       const Dimensions& dims,
                       int prec = 4) const;

    // Same, but returns only the value (numeric) and the unit string
    // separately --- useful when you need to embed in a wider table
    // with custom column widths.
    std::pair<scalar, std::string>
    convert(scalar v_si, const Dimensions& dims) const;

    // Set a preferred unit programmatically (used internally + by tests).
    // Returns true if the unit name was recognised in the Units catalogue.
    bool setPreferred(const Dimensions& dims, const std::string& unitName);

private:
    DisplayUnits();
    void installDefaults();

    struct Entry { scalar factor; std::string label; };
    std::map<std::string /*bracket*/, Entry> table_;
    std::map<std::string /*bracket*/, int>   prec_;
    int                                       composition_prec_ = 4;
    // 0 = fixed-decimal (per-dimension prec_); >0 = print this many
    // significant figures everywhere (set via controlDict.units.significantFigures).
    int                                       sig_figs_ = 0;
    FlowBasis                                 flowBasis_ = FlowBasis::Molar;

    void installDefaultPrecisions();
};

} // namespace Choupo
