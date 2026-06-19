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

#include "DisplayUnits.H"

#include "Units.H"

#include <iomanip>
#include <iostream>
#include <sstream>

namespace Choupo {

DisplayUnits& DisplayUnits::instance()
{
    static DisplayUnits inst;
    return inst;
}

DisplayUnits::DisplayUnits()
{
    installDefaults();
    installDefaultPrecisions();
}

void DisplayUnits::installDefaults()
{
    // Chem-eng default preferences --- the values a tutorial prints
    // when no explicit `units` block is in controlDict.  These match
    // industry / textbook convention so the output is immediately
    // readable.
    //
    // The store key is the bracket form of the dimensions, so a
    // single entry covers all variables of that dimension.
    auto put = [&](const Dimensions& d, const std::string& name)
    {
        if (auto s = units::lookupUnit(name))
            table_[d.toBracket()] = Entry{ s->factor, name };
    };

    put(Dims::pressure,        "bar");
    put(Dims::molarFlow,       "kmol/h");
    put(Dims::massFlow,        "kg/h");
    put(Dims::volumetricFlow,  "m3/h");
    put(Dims::temperature,     "K");
    put(Dims::length,          "m");
    put(Dims::area,            "m2");
    put(Dims::volume,          "m3");
    put(Dims::time,            "s");
    put(Dims::mass,            "kg");
    put(Dims::amount,          "kmol");
    put(Dims::energy,          "kJ");
    put(Dims::power,           "kW");
    put(Dims::concentration,   "kmol/m3");
    put(Dims::density,         "kg/m3");
    put(Dims::velocity,        "m/s");
    put(Dims::viscosity,       "Pa.s");
    put(Dims::diffusivity,     "m2/s");
}

void DisplayUnits::installDefaultPrecisions()
{
    // Defaults preserve the look of the output exactly: F at
    // 4 decimals, T at 2, P at 3, sizes / energies / amounts at 4.
    prec_[Dims::pressure.toBracket()]       = 3;
    prec_[Dims::temperature.toBracket()]    = 2;
    prec_[Dims::molarFlow.toBracket()]      = 4;
    prec_[Dims::massFlow.toBracket()]       = 4;
    prec_[Dims::volumetricFlow.toBracket()] = 4;
    prec_[Dims::length.toBracket()]         = 4;
    prec_[Dims::area.toBracket()]           = 4;
    prec_[Dims::volume.toBracket()]         = 4;
    prec_[Dims::time.toBracket()]           = 2;
    prec_[Dims::mass.toBracket()]           = 4;
    prec_[Dims::amount.toBracket()]         = 4;
    prec_[Dims::energy.toBracket()]         = 4;
    prec_[Dims::power.toBracket()]          = 4;
    prec_[Dims::concentration.toBracket()]  = 4;
    prec_[Dims::density.toBracket()]        = 4;
    prec_[Dims::velocity.toBracket()]       = 4;
    prec_[Dims::viscosity.toBracket()]      = 4;
    prec_[Dims::diffusivity.toBracket()]    = 4;
    composition_prec_ = 4;
}

int DisplayUnits::precisionFor(const Dimensions& dims) const
{
    auto it = prec_.find(dims.toBracket());
    return (it == prec_.end()) ? 4 : it->second;
}

bool DisplayUnits::setPreferred(const Dimensions& dims,
                                const std::string& unitName)
{
    auto s = units::lookupUnit(unitName);
    if (!s) return false;
    // Affine units (°C, °F) are not usable as display units because
    // there is no single multiplicative factor to embed in the table;
    // the formatter expects `factor` semantics.  Reject those here.
    if (s->affine) return false;
    if (s->dims != dims) return false;          // unit isn't compatible
    table_[dims.toBracket()] = Entry{ s->factor, unitName };
    return true;
}


void DisplayUnits::readFrom(const DictPtr& controlDict)
{
    if (!controlDict || !controlDict->found("units")) return;
    auto sd = controlDict->subDict("units");

    // Significant figures: when set (>0), every format() prints values to
    // this many significant digits instead of fixed decimals, so the log
    // matches the GUI's significant-figure display.  The GUI splices it here
    // (case/applyPrefs.ts); a case may also author it by hand.
    if (sd->found("significantFigures"))
    {
        const int sf = static_cast<int>(sd->lookupScalar("significantFigures"));
        if (sf >= 1 && sf <= 12) sig_figs_ = sf;
    }

    // `flow` is special: the user may name either a molar OR a mass
    // flow unit there.  We sniff the unit's actual dimensions, install
    // the entry on the matching slot, and record the chosen basis for
    // stream-print sites that have both F (kmol/s) and F_mass (kg/s)
    // to choose from.
    if (sd->found("flow"))
    {
        const std::string unitName = sd->lookupWord("flow");
        auto s = units::lookupUnit(unitName);
        if (s && !s->affine && s->dims == Dims::molarFlow)
        {
            table_[Dims::molarFlow.toBracket()] =
                Entry{ s->factor, unitName };
            flowBasis_ = FlowBasis::Molar;
        }
        else if (s && !s->affine && s->dims == Dims::massFlow)
        {
            table_[Dims::massFlow.toBracket()] =
                Entry{ s->factor, unitName };
            flowBasis_ = FlowBasis::Mass;
        }
        else
        {
            std::cerr << "DisplayUnits: ignored `flow " << unitName
                      << ";` --- not a flow unit (expected kmol/h, kmol/s,"
                         " kg/h, kg/s, mol/h, mol/s, g/h or g/s)\n";
        }
    }

    // Maps the user-facing keys in the `units` block to the dimension
    // they govern.  Keep aligned with the defaults installed above.
    // Excludes `flow` (handled above with the molar/mass sniff).
    struct KeyMap { const char* key; Dimensions dims; };
    static const KeyMap keys[] = {
        { "pressure",       Dims::pressure         },
        { "molarFlow",      Dims::molarFlow        },
        { "massFlow",       Dims::massFlow         },
        { "volumetricFlow", Dims::volumetricFlow   },
        { "temperature",    Dims::temperature      },
        { "length",         Dims::length           },
        { "area",           Dims::area             },
        { "volume",         Dims::volume           },
        { "time",           Dims::time             },
        { "mass",           Dims::mass             },
        { "amount",         Dims::amount           },
        { "energy",         Dims::energy           },
        { "power",          Dims::power            },
        { "concentration",  Dims::concentration    },
        { "density",        Dims::density          },
        { "velocity",       Dims::velocity         },
        { "viscosity",      Dims::viscosity        },
        { "diffusivity",    Dims::diffusivity      },
    };

    for (const auto& km : keys)
    {
        if (!sd->found(km.key)) continue;
        const std::string unitName = sd->lookupWord(km.key);
        if (!setPreferred(km.dims, unitName))
            std::cerr << "DisplayUnits: ignored `" << km.key << " "
                      << unitName << ";` --- unit not in catalogue or"
                         " dimensions do not match " << km.dims.toPretty()
                      << "\n";
    }
}

void DisplayUnits::readPrecision(const DictPtr& controlDict)
{
    if (!controlDict || !controlDict->found("precision")) return;
    auto sd = controlDict->subDict("precision");

    struct PrecMap { const char* key; Dimensions dims; };
    static const PrecMap precKeys[] = {
        { "pressure",       Dims::pressure         },
        { "temperature",    Dims::temperature      },
        { "molarFlow",      Dims::molarFlow        },
        { "massFlow",       Dims::massFlow         },
        { "volumetricFlow", Dims::volumetricFlow   },
        { "length",         Dims::length           },
        { "area",           Dims::area             },
        { "volume",         Dims::volume           },
        { "time",           Dims::time             },
        { "mass",           Dims::mass             },
        { "amount",         Dims::amount           },
        { "energy",         Dims::energy           },
        { "power",          Dims::power            },
        { "concentration",  Dims::concentration    },
        { "density",        Dims::density          },
        { "velocity",       Dims::velocity         },
        { "viscosity",      Dims::viscosity        },
        { "diffusivity",    Dims::diffusivity      },
    };

    for (const auto& pm : precKeys)
    {
        if (!sd->found(pm.key)) continue;
        const int p = static_cast<int>(sd->lookupScalar(pm.key));
        prec_[pm.dims.toBracket()] = p;
    }
    // `flow` is shorthand: applies to both molar and mass flow at once.
    if (sd->found("flow"))
    {
        const int p = static_cast<int>(sd->lookupScalar("flow"));
        prec_[Dims::molarFlow.toBracket()] = p;
        prec_[Dims::massFlow.toBracket()]  = p;
    }
    // Composition is dimensionless --- separate slot so it doesn't
    // collide with other dimensionless quantities.
    if (sd->found("composition"))
        composition_prec_ = static_cast<int>(sd->lookupScalar("composition"));
}

std::pair<scalar, std::string>
DisplayUnits::convert(scalar v_si, const Dimensions& dims) const
{
    auto it = table_.find(dims.toBracket());
    if (it == table_.end())
        return { v_si, dims.toPretty() };
    return { v_si / it->second.factor, it->second.label };
}

std::string DisplayUnits::format(scalar v_si,
                                 const Dimensions& dims,
                                 int prec) const
{
    auto [v, label] = convert(v_si, dims);
    std::ostringstream os;
    if (sig_figs_ > 0)
        // Significant-figure mode (defaultfloat + setprecision == %g): prints
        // `sig_figs_` significant digits, magnitude-adaptive, matching the
        // GUI's formatSig().  `prec` (fixed decimals) is ignored here.
        os << std::defaultfloat << std::setprecision(sig_figs_) << v
           << " " << label;
    else
        os << std::fixed << std::setprecision(prec) << v << " " << label;
    return os.str();
}

} // namespace Choupo
