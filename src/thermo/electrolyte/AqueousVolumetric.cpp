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

#include "AqueousVolumetric.H"
#include "SaltFromCatalogue.H"      // findAqueousSpecies (overlay-honouring)
#include "SolventProperties.H"      // rhoWaterKell

#include <map>
#include <memory>      // std::make_unique -- g++ lends it, emscripten does not
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace electrolyte {

// ---- factory (explicit registration, the house pattern) --------------------

namespace {
std::map<std::string, AqueousVolumetricModel::Factory>& registry()
{
    static std::map<std::string, AqueousVolumetricModel::Factory> r;
    return r;
}
}

void AqueousVolumetricModel::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<AqueousVolumetricModel>
AqueousVolumetricModel::New(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::ostringstream os;
        os << "aqueous volumetric model '" << name << "' is not registered."
              "  Registered methods:";
        for (const auto& [k, f] : registry()) { (void)f; os << " " << k; }
        os << ".  (rung 2+ formulations -- ionic-strength-corrected, Pitzer"
              " volumetrics -- are named future slots, not typos.)";
        throw std::runtime_error(os.str());
    }
    return it->second();
}

std::vector<std::string> AqueousVolumetricModel::availableTypes()
{
    std::vector<std::string> v;
    for (const auto& [k, f] : registry()) { (void)f; v.push_back(k); }
    return v;
}

// ---- rung 0: diluteVolume --------------------------------------------------
//
//  Solutes add MASS and no volume.  The weakest honest closure -- kept as a
//  first-class formulation (a case may DECLARE it, and the missing-data
//  fallback of standardStateVolumes may fall back to it only by declaration,
//  announced).  Its solute-mass basis is the COMPONENT partition, unchanged
//  from the closure this formulation formalises.

namespace {

class DiluteVolume : public AqueousVolumetricModel
{
public:
    std::string method() const override { return "diluteVolume"; }

    Result solve(scalar T_K,
                 const std::map<std::string, scalar>& mastersPerL,
                 scalar componentSoluteMassPerM3,
                 const std::string& streamName) const override
    {
        (void)mastersPerL; (void)streamName;
        Result r;
        r.rhoWater   = SolventProperties::rhoWaterKell(T_K - 273.15);
        r.soluteMass = componentSoluteMassPerM3;
        r.rho        = r.rhoWater + r.soluteMass;
        return r;
    }
};

// ---- rung 1: standardStateVolumes ------------------------------------------
//
//  Ideal volumetric mixing on the infinite-dilution standard state (V_E = 0):
//  every reconciled master contributes its cited V0.  Direct and algebraic;
//  see the header for the formula and the convention-invariance theorem.

class StandardStateVolumes : public AqueousVolumetricModel
{
public:
    std::string method() const override { return "standardStateVolumes"; }

    Result solve(scalar T_K,
                 const std::map<std::string, scalar>& mastersPerL,
                 scalar componentSoluteMassPerM3,
                 const std::string& streamName) const override
    {
        (void)componentSoluteMassPerM3;    // masters partition, not components
        Result r;
        r.rhoWater = SolventProperties::rhoWaterKell(T_K - 273.15);

        std::string convention;
        for (const auto& [master, nPerL] : mastersPerL)
        {
            auto rec = findAqueousSpecies(master);
            if (!rec)
                throw std::runtime_error("stream state '" + streamName
                    + "': standardStateVolumes needs the species record of"
                      " master '" + master + "' and none resolves"
                      " (case constant/species/, ions.dat overlay, or"
                      " standards species/<name>.dat).");
            //  THE REFUSAL THE DWSIM COMPARISON PAID FOR: a species without
            //  volumetric data must never silently contribute zero volume
            //  (mass counted, volume dropped is rung 0 wearing rung 1's
            //  name).  Refuse with both remedies.
            if (!rec->found("V0"))
                throw std::runtime_error("stream state '" + streamName
                    + "': master '" + master + "' has no `volumetric {}`"
                      " block in its species record, so standardStateVolumes"
                      " cannot price its volume.  Either add `volumetric {"
                      " V0 <v> cm3/mol; convention <profile>; source ...; }`"
                      " to species/" + master + ".dat (a curation act), or"
                      " declare `method diluteVolume;` -- the zero-solute-"
                      "volume closure, by name, never silently.");
            //  Flat keys off the bridged record (bridgeTrueIon carries the
            //  volumetric block through -- the reduced-identity rule).
            Term t;
            t.master     = master;
            t.molPerL    = nPerL;
            t.V0_cm3mol  = rec->lookupScalar("V0");
            t.convention = rec->lookupWordOrDefault("volConvention", "");
            if (t.convention.empty())
                throw std::runtime_error("stream state '" + streamName
                    + "': the `volumetric {}` block of species '" + master
                    + "' declares no `convention`.  A single-ion V0 is a"
                      " CONVENTIONAL quantity (only electroneutral sums are"
                      " physical) and must name the profile it is stated on"
                      " (e.g. MilleroConventional-v1).");
            if (convention.empty()) convention = t.convention;
            else if (convention != t.convention)
                throw std::runtime_error("stream state '" + streamName
                    + "': mixed single-ion volume conventions ('"
                    + convention + "' vs '" + t.convention + "' on '"
                    + master + "').  Conventional quantities cancel only"
                      " within ONE profile; a mixed sum is neither"
                      " convention's number.");
            if (!rec->found("MW"))
                throw std::runtime_error("stream state '" + streamName
                    + "': species '" + master + "' has no MW in its record"
                      " -- the masters partition prices solute mass from the"
                      " species records, one home.");
            t.MW_gmol = rec->lookupScalar("MW");
            t.z       = rec->lookupScalarOrDefault("z", 0.0);

            //  n [mol/L] * V0 [cm3/mol] * 1e-3 [L/cm3... per L of solution]
            r.soluteVolumeFrac += t.molPerL * t.V0_cm3mol * 1.0e-3;
            //  n [mol/L] * MW [g/mol] = g/L = kg/m3
            r.soluteMass       += t.molPerL * t.MW_gmol;
            r.terms.push_back(std::move(t));
        }

        //  phi >= 1 means the cited solute volumes claim more space than the
        //  solution has -- outside any domain this rung can describe.
        if (r.soluteVolumeFrac >= 1.0)
            throw std::runtime_error("stream state '" + streamName
                + "': standardStateVolumes computes a solute volume fraction"
                  " of " + std::to_string(r.soluteVolumeFrac)
                + " (>= 1): the cited standard-state volumes claim more"
                  " space than the solution has.  This is far outside the"
                  " dilute-reference domain (V_E = 0 holds to roughly"
                  " 1 mol/kg); measure the density instead.");

        //  m_w = rhoWater * (1 - phi): the water fills what the solutes,
        //  at their standard-state volumes, do not.
        const scalar m_w = r.rhoWater * (1.0 - r.soluteVolumeFrac);
        r.rho = m_w + r.soluteMass;
        return r;
    }
};

} // anonymous namespace

void AqueousVolumetricModel::registerBuiltins()
{
    registerType("diluteVolume",
                 [] { return std::make_unique<DiluteVolume>(); });
    registerType("standardStateVolumes",
                 [] { return std::make_unique<StandardStateVolumes>(); });
}

} // namespace electrolyte
} // namespace Choupo
