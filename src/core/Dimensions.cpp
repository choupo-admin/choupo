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
\*---------------------------------------------------------------------------*/

#include "Dimensions.H"

#include <sstream>
#include <vector>

namespace Choupo {

namespace {

// Reverse lookup table for Dimensions::toPretty.  Order matters: the
// first matching entry wins, so list the most specific (Pa) before
// any synonym (e.g. force/area).
const std::vector<std::pair<Dimensions, std::string>>& prettyNames()
{
    static const std::vector<std::pair<Dimensions, std::string>> t = {
        { Dims::dimensionless,      "-"             },
        { Dims::pressure,           "Pa"            },
        { Dims::energy,             "J"             },
        { Dims::power,              "W"             },
        { Dims::force,              "N"             },
        { Dims::molarFlow,          "kmol/s"        },
        { Dims::massFlow,           "kg/s"          },
        { Dims::volumetricFlow,     "m^3/s"         },
        { Dims::concentration,      "kmol/m^3"      },
        { Dims::molality,           "kmol/kg"       },
        { Dims::density,            "kg/m^3"        },
        { Dims::velocity,           "m/s"           },
        { Dims::acceleration,       "m/s^2"         },
        { Dims::molarMass,          "kg/kmol"       },
        { Dims::molarEnergy,        "J/kmol"        },
        { Dims::molarHeatCap,       "J/(kmol.K)"    },
        { Dims::heatCapacity,       "J/(kg.K)"      },
        { Dims::viscosity,          "Pa.s"          },
        { Dims::thermalCond,        "W/(m.K)"       },
        { Dims::diffusivity,        "m^2/s"         },
        { Dims::surfaceTension,     "N/m"           },
        { Dims::heatTransfer_h,     "W/(m^2.K)"     },
        { Dims::UA,                 "W/K"           },
        { Dims::permeabilityWater,  "m/(s.Pa)"      },
        { Dims::inverseTime,        "1/s"           },
        { Dims::area,               "m^2"           },
        { Dims::volume,             "m^3"           },
        { Dims::length,             "m"             },
        { Dims::time,               "s"             },
        { Dims::mass,               "kg"            },
        { Dims::amount,             "kmol"          },
        { Dims::temperature,        "K"             },
    };
    return t;
}

} // anonymous namespace

std::string Dimensions::toBracket() const
{
    std::ostringstream os;
    os << '[' << int(M)
       << ' ' << int(L)
       << ' ' << int(T)
       << ' ' << int(Theta)
       << ' ' << int(N) << ']';
    return os.str();
}

std::string Dimensions::toPretty() const
{
    for (const auto& [dims, label] : prettyNames())
        if (dims == *this) return label;
    return toBracket();
}

} // namespace Choupo
