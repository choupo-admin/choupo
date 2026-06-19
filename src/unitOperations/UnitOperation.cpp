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

#include "UnitOperation.H"

// All built-in unit operations are listed here.  To add a new one:
//   1. #include its header below.
//   2. Add a one-line registerType() entry inside registerBuiltins().
#include "distillation/DistillationColumn.H"
#include "distillation/ShortcutColumn.H"
#include "flash/AdiabaticFlash.H"
#include "flash/IsothermalFlash.H"
#include "crystallisation/Crystalliser.H"
#include "heatTransfer/Evaporator.H"
#include "heatTransfer/HeatExchanger.H"
#include "heatTransfer/Heater.H"
#include "heatTransfer/MultiStreamHX.H"
#include "heatTransfer/PhaseChanger.H"
#include "heatTransfer/SolidDryer.H"
#include "heatTransfer/SprayDryer.H"
#include "rotating/Compressor.H"
#include "rotating/ElectricLoad.H"
#include "rotating/Pump.H"
#include "rotating/Turbine.H"
#include "hydraulics/Pipe.H"
#include "membrane/SpiralWoundModule.H"
#include "membrane/massTransfer/MassTransferModel.H"
#include "membrane/osmotic/OsmoticModel.H"
#include "membrane/pressureDrop/PressureDropModel.H"
#include "mixer/Mixer.H"
#include "mixer/Splitter.H"
#include "reactor/CSTR.H"
#include "reactor/ConversionReactor.H"
#include "reactor/GibbsReactor.H"
#include "reactor/PFR.H"
#include "reactor/YieldReactor.H"
#include "saturation/BubblePoint.H"
#include "saturation/DewPoint.H"
#include "separation/Absorber.H"
#include "separation/Stripper.H"
#include "separation/Cyclone.H"
#include "separation/BagFilter.H"
#include "separation/GasSolidSplitter.H"
#include "separation/IonExchanger.H"
#include "separation/Extractor.H"
#include "electrochem/ElectrodialysisStack.H"
#include "valve/Valve.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, UnitOperation::Factory>& UnitOperation::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void UnitOperation::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<UnitOperation> UnitOperation::New(const std::string& type)
{
    auto it = registry().find(type);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("UnitOperation::New: unknown type '"
            + type + "'.  Available:" + avail);
    }
    return it->second();
}

std::unique_ptr<UnitOperation> UnitOperation::New(const DictPtr& dict)
{
    return New(dict->lookupWord("type"));
}

std::vector<std::string> UnitOperation::availableTypes()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

void UnitOperation::registerBuiltins()
{
    auto reg = [](const std::string& name, auto&& maker)
    {
        registerType(name, std::forward<decltype(maker)>(maker));
    };

    reg("cstr",               []{ return std::make_unique<CSTR>();               });
    reg("conversionReactor",  []{ return std::make_unique<ConversionReactor>();  });
    reg("pfr",                []{ return std::make_unique<PFR>();                });
    reg("gibbsReactor",       []{ return std::make_unique<GibbsReactor>();       });
    reg("yieldReactor",       []{ return std::make_unique<YieldReactor>();       });
    reg("isothermalFlash",    []{ return std::make_unique<IsothermalFlash>();    });
    reg("flash",              []{ return std::make_unique<IsothermalFlash>();    });   // alias
    reg("adiabaticFlash",     []{ return std::make_unique<AdiabaticFlash>();     });
    reg("bubbleT",            []{ return std::make_unique<BubblePoint>();        });
    reg("dewT",               []{ return std::make_unique<DewPoint>();           });
    reg("heater",             []{ return std::make_unique<Heater>();             });
    reg("heatExchanger",      []{ return std::make_unique<HeatExchanger>();      });
    reg("multiStreamHX",      []{ return std::make_unique<MultiStreamHX>();      });
    reg("MHeatX",             []{ return std::make_unique<MultiStreamHX>();      });   // alias
    reg("evaporator",         []{ return std::make_unique<Evaporator>();         });
    reg("phaseChanger",       []{ return std::make_unique<PhaseChanger>();       });
    reg("boiler",             []{ return std::make_unique<PhaseChanger>();       });   // alias
    reg("condenser",          []{ return std::make_unique<PhaseChanger>();       });   // alias
    reg("sprayDryer",         []{ return std::make_unique<SprayDryer>();         });
    reg("solidDryer",         []{ return std::make_unique<SolidDryer>();         });
    reg("crystalliser",       []{ return std::make_unique<Crystalliser>();       });
    reg("compressor",         []{ return std::make_unique<Compressor>();         });
    reg("turbine",            []{ return std::make_unique<Turbine>();            });
    reg("pump",               []{ return std::make_unique<Pump>();               });
    reg("electricLoad",       []{ return std::make_unique<ElectricLoad>();       });
    reg("mixer",              []{ return std::make_unique<Mixer>();              });
    reg("splitter",           []{ return std::make_unique<Splitter>();           });
    reg("valve",              []{ return std::make_unique<Valve>();              });
    reg("pipe",               []{ return std::make_unique<Pipe>();               });
    reg("distillationColumn", []{ return std::make_unique<DistillationColumn>(); });
    reg("column",             []{ return std::make_unique<DistillationColumn>(); });   // alias
    reg("absorber",           []{ return std::make_unique<Absorber>();           });
    reg("stripper",           []{ return std::make_unique<Stripper>();           });
    reg("cyclone",            []{ return std::make_unique<Cyclone>();            });
    reg("bagFilter",          []{ return std::make_unique<BagFilter>();          });
    reg("gasSolidSplitter",   []{ return std::make_unique<GasSolidSplitter>();   });
    reg("ionExchanger",       []{ return std::make_unique<IonExchanger>();       });
    reg("extractor",          []{ return std::make_unique<Extractor>();          });
    reg("extract",            []{ return std::make_unique<Extractor>();          });   // alias
    reg("electrodialysisStack",[]{ return std::make_unique<ElectrodialysisStack>(); });
    reg("shortcutColumn",     []{ return std::make_unique<ShortcutColumn>();     });
    reg("FUG",                []{ return std::make_unique<ShortcutColumn>();     });   // alias
    reg("spiralWoundModule",  []{ return std::make_unique<SpiralWoundModule>();  });
    reg("membraneSW",         []{ return std::make_unique<SpiralWoundModule>();  });   // alias

    // Membrane sub-model registries (feed-channel mass-transfer, pressure
    // drop, osmotic pressure) --- selectable via the unit's `operation`
    // sub-blocks `massTransfer { model …; }`, `pressureDrop { model …; }`,
    // `osmotic { model …; }`.
    MassTransferModel::registerBuiltins();
    PressureDropModel::registerBuiltins();
    OsmoticModel    ::registerBuiltins();
}

} // namespace Choupo
