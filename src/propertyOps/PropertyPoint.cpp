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

#include "PropertyPoint.H"
#include "core/Constants.H"
#include "PropertyEvaluator.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <set>
#include <stdexcept>
#include "thermo/equationOfState/EquationOfState.H"

namespace Choupo {

namespace {

//  One line per omitted diagnostic key and reason, per run (C398 slice (b)).
void announceOmitted(const std::string& key, const std::string& property,
                     const std::string& remedy, const std::string& why)
{
    static std::set<std::string> said;
    std::string first = why.substr(0, why.find('\n'));
    if (!said.insert(key + "|" + first).second) return;
    std::cout << "[propertyPoint] key `" << key << "` omitted: the " << property
              << " is not available here (" << first << ").  Remedy: " << remedy << ".\n";
}

} // namespace

int PropertyPoint::run(const DictPtr& dict,
                       const ThermoPackage& globalThermo,
                       int verbosity)
{
    // Per-op thermo override (the `thermo {}` block on the operation,
    // when present, REPLACES the matching model sub-dicts).  Used for
    // side-by-side audit points across models (e.g. SRK vs PR Z).
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    auto stateDict = dict->subDict("state");
    auto compDict  = stateDict->subDict("composition");

    const scalar T    = stateDict->lookupScalar("T", Dims::temperature);
    const scalar P_Pa = stateDict->lookupScalar("P", Dims::pressure);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    for (auto& v : z) v /= zsum;

    // Compute everything --- cheap.
    const scalar H_ig   = thermo.H_ig(T, z);
    const scalar S_ig   = thermo.S_ig(T, P_Pa, z);
    const scalar Cp_ig  = thermo.Cp_ig(T, z);
    const scalar gamma  = Cp_ig / (Cp_ig - constant::R);

    const scalar Zval   = thermo.eos().Z(T, P_Pa, z);
    const scalar vmol   = thermo.eos().molarVolume(T, P_Pa, z);
    //  The residual is the vapour MODEL's: the EoS departure plus, on an
    //  ideal-gas vapour carrying a curated association, the dimer's
    //  (ThermoPackage::associationResidualTotal, exactly 0 otherwise -- DEV.md
    //  4c C201 item 1), so H_real here is the package's H_real.
    const scalar H_R    = thermo.eos().H_residual(T, P_Pa, z)
                        + thermo.associationResidualTotal(T, P_Pa, z, true);
    const scalar S_R    = thermo.eos().S_residual(T, P_Pa, z)
                        + thermo.associationResidualTotal(T, P_Pa, z, false);
    const scalar H_real = H_ig + H_R;
    const scalar S_real = S_ig + S_R;

    // LIQUID root, when the EoS resolves one at this state (cubics, SAFT):
    // explicitly labelled -- the block above is ALL vapour-root (the EoS
    // family contract), never a silent mix of roots.
    bool   hasLiq = false;
    scalar vLiq = 0.0, ZLiq = 0.0;
    if (thermo.eos().hasLiquidRoot())
    {
        try
        {
            vLiq = thermo.eos().molarVolumeLiquid(T, P_Pa, z);
            ZLiq = P_Pa * vLiq / (constant::R * T);
            // publish only a GENUINELY distinct liquid root -- at a single-root
            // state both branches collapse to the same density, and labelling
            // that "liquid" would invent a phase that is not there.
            hasLiq = std::isfinite(vLiq) && vLiq > 0.0 && vLiq < 0.98 * vmol;
        }
        catch (const std::exception& e)                        // no liquid root here
        {
            hasLiq = false;
            announceOmitted("Z_liquid, v_molar_liq", "liquid root of the equation of state",
                            "none needed when the state has no liquid root", e.what());
        }
    }

    if (verbosity >= 2)
    {
        std::cout << "\n==========================  PropertyPoint  ==========================\n"
                  << "  State:           T = " << std::fixed << std::setprecision(2) << T
                  << " K   ( " << (T - 273.15) << " degC )\n"
                  << "                   P = " << std::fixed << std::setprecision(2)
                  << (P_Pa / 1.0e5) << " bar   ( " << P_Pa << " Pa )\n"
                  << "  Composition (mole frac):\n";
        for (std::size_t i = 0; i < n; ++i)
            if (z[i] > 1.0e-12)
                std::cout << "    " << std::setw(16) << std::left
                          << thermo.comp(i).name() << "  "
                          << std::fixed << std::setprecision(6) << z[i] << "\n";

        std::cout << "\n  Ideal-gas MIXTURE:\n"
                  << "    H_ig         = " << std::scientific << std::setprecision(6)
                  << H_ig << "  J/mol\n"
                  << "    S_ig         = " << std::fixed << std::setprecision(4)
                  << S_ig << "  J/(mol*K)\n"
                  << "    Cp_ig        = " << std::fixed << std::setprecision(4)
                  << Cp_ig << "  J/(mol*K)\n"
                  << "    gamma=Cp/Cv  = " << std::fixed << std::setprecision(4)
                  << gamma << "\n"
                  << "\n  EoS = " << thermo.eos().modelName()
                  << "  (vapour root):\n"
                  << "    Z            = " << std::fixed << std::setprecision(6)
                  << Zval << "\n"
                  << "    v_molar      = " << std::scientific << std::setprecision(5)
                  << vmol << "  m3/mol\n"
                  << "    H_residual   = " << std::scientific << std::setprecision(5)
                  << H_R << "  J/mol\n"
                  << "    S_residual   = " << std::fixed << std::setprecision(4)
                  << S_R << "  J/(mol*K)\n"
                  << "    H_real       = " << std::scientific << std::setprecision(6)
                  << H_real << "  J/mol\n"
                  << "    S_real       = " << std::fixed << std::setprecision(4)
                  << S_real << "  J/(mol*K)\n";
        if (hasLiq)
            std::cout << "\n  EoS = " << thermo.eos().modelName()
                      << "  (LIQUID root at the same state, labelled):\n"
                      << "    Z_liquid     = " << std::fixed << std::setprecision(6)
                      << ZLiq << "\n"
                      << "    v_molar_liq  = " << std::scientific << std::setprecision(5)
                      << vLiq << "  m3/mol\n";
        std::cout << "=====================================================================\n\n";
    }

    diag_.clear();
    diag_["T"]       = T;
    diag_["P"]       = P_Pa;
    diag_["H_ig"]    = H_ig;
    diag_["S_ig"]    = S_ig;
    diag_["Cp_ig"]   = Cp_ig;
    diag_["gamma"]   = gamma;
    diag_["Z"]       = Zval;
    diag_["v_molar"] = vmol;
    diag_["H_R"]     = H_R;
    diag_["S_R"]     = S_R;
    diag_["H_real"]  = H_real;
    diag_["S_real"]  = S_real;
    if (hasLiq)
    {
        diag_["Z_liquid"]     = ZLiq;
        diag_["v_molar_liq"]  = vLiq;
    }

    // Transport properties: added to the diagnostics ONLY when the package
    // can supply them (a pure-fluid IAPWS route, or a generic transport
    // block).  Each is guarded -- a package without a model simply omits the
    // key, so existing propertyPoint cases are unaffected (additive).
    //  A KEY OMITTED IS SAID (C398 slice (b)): a property the package cannot
    //  supply leaves its key out of the diagnostics -- additive, so no golden
    //  moves -- and the run says so ONCE per key and reason, naming the key,
    //  the property and the remedy.  A key dropped in silence was the crutch
    //  that hid a gas viscosity nobody declared (the Chung default, SL-04).
    auto attempt = [&](const char* key, const char* property, const char* remedy, auto&& f)
    {
        try { diag_[key] = f(); }
        catch (const std::exception& e) { announceOmitted(key, property, remedy, e.what()); }
        catch (...) { announceOmitted(key, property, remedy, "not a std::exception"); }
    };
    attempt("viscosity", "vapour viscosity",
            "declare `transport { vapour { viscosity { model Chung; } } }` in the property dictionary",
            [&] { return thermo.viscosityGas(T, z); });
    attempt("thermal_conductivity", "vapour thermal conductivity",
            "declare `transport { vapour { thermalConductivity { model Eucken; } viscosity { model Chung; } } }`",
            [&] { return thermo.thermalConductivityGas(T, z); });
    attempt("surface_tension", "surface tension",
            "declare `transport { interface { surfaceTension { } } }` (the records' laws) or name a model",
            [&] { return thermo.surfaceTension(T, z); });

    //  ---- the DECLARED `properties ( ... )` list, which was parsed by nobody
    //
    //  Found 2026-08-12 by acetone01_ipa_water_azeotrope, which asked for
    //  `properties ( T_bubble )` and got silence.  The list had NEVER been
    //  read: the base set above is emitted unconditionally, the three
    //  transport keys are attempted unconditionally and guarded, and the
    //  coincidence that every existing case's declared names happened to be
    //  among those is why nobody noticed for as long as the operation has
    //  existed.  Meanwhile the class header offers "properties (all); // or
    //  pick a subset" and the published JSON schema names `T_bubble` among
    //  the accepted keywords.  A field the engine cannot see is a comment --
    //  this one was worse, because two documents promised it worked.
    //
    //  It is honoured ADDITIVELY, and that is deliberate: the declared names
    //  are RESOLVED and added, the base set is not filtered out.  Filtering
    //  would silently shrink every existing golden, which is a corpus-wide
    //  change to make an operation obey a list nobody could rely on.  What
    //  the author gains is that a name they declare is either computed or
    //  REFUSED BY NAME -- never dropped.
    headline_.clear();
    if (dict->found("properties"))
    {
        for (const auto& key : dict->lookupWordList("properties"))
        {
            if (key == "all") continue;          // the documented "everything"
            bool seen = false;          // the headline names each key once
            for (const auto& h : headline_) seen = seen || h == key;
            if (!seen) headline_.push_back(key);
            if (diag_.count(key)) continue;      // already emitted above
            try
            {
                diag_[key] = propertyOps::evaluateProperty(key, thermo, T, P_Pa, z);
            }
            catch (const std::exception& e)
            {
                throw std::runtime_error("propertyPoint '"
                    + dict->lookupWordOrDefault("name", "?")
                    + "': the case declares property '" + key + "', which this"
                      " operation cannot produce here -- " + e.what() + "\n"
                      "        A declared property is computed or refused by"
                      " name; it is never silently dropped.  Remove it, fix"
                      " the spelling, or use an operation that computes it.");
            }
        }
    }

    return 0;
}

std::string PropertyPoint::diagnosticUnit(const std::string& key) const
{
    if (key == "Z_liquid")    return "-";
    if (key == "v_molar_liq") return "m3/mol";
    return propertyOps::propertyUnit(key);
}

} // namespace Choupo
