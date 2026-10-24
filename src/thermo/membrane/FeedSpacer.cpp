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

#include "FeedSpacer.H"

#include "core/Origin.H"
#include "core/RegistryRefusal.H"
#include "core/Units.H"

#include <cmath>
#include <map>
#include <stdexcept>
#include <variant>

namespace Choupo {

scalar FeedSpacer::hydraulicDiameterEq17(scalar h, scalar eps, scalar Sv)
{
    //  Schock & Miquel (1987) Eq. (17), p. 341:
    //      d_h = 4 eps / ( 2/h + (1 - eps) S_V,SP ).
    //  eps -> 1 gives the empty flat channel, 2h (their Eq. 10).
    return 4.0 * eps / (2.0 / h + (1.0 - eps) * Sv);
}

scalar FeedSpacer::porosityFromMesh(scalar h, scalar dF, scalar lM)
{
    //  Schock & Miquel (1987) Eqs. (20)-(22), pp. 342-343: two crossed
    //  cylindrical filaments of diameter d_F per square mesh cell of side
    //  l_M, so V_SP = 0.5 pi d_F^2 l_M against V_Tot = l_M^2 h_SP.
    const scalar pi  = std::acos(-1.0);
    const scalar Vsp = 0.5 * pi * dF * dF * lM;
    const scalar Vt  = lM * lM * h;
    return 1.0 - Vsp / Vt;
}

namespace {

//  The model word is checked against its factory where the correlation is
//  BUILT (SpiralWoundModule): a thermo/ record may not include a unit
//  operation's factory (check_layering), and the factory refuses an unknown
//  word by name through the same registryRefusal sentence.
SpacerCorrelation readCorrelation(const DictPtr& d, const char* block,
                                  const std::string& locus)
{
    SpacerCorrelation c;
    if (!d->found(block)) return c;
    auto b = d->subDict(block);
    c.declared = true;
    c.dict     = b;
    c.model    = b->lookupWordOrDefault("model", "");
    if (c.model.empty())
        throw std::runtime_error(locus + " " + block + ": names no `model` --"
            " a correlation carried as data says which one it is.");
    if (b->found("validity"))
    {
        auto v = b->subDict("validity");
        if (v->found("Re"))
        {
            auto band = v->lookupList("Re");
            if (band.size() != 2 || band[0] >= band[1] || band[0] <= 0.0)
                throw std::runtime_error(locus + " " + block + ": `validity"
                    " { Re ( lo hi ); }` needs two positive numbers with"
                    " lo < hi -- an impossible interval has nothing to"
                    " extrapolate from.");
            c.hasReBand = true;
            c.Re_lo = band[0];
            c.Re_hi = band[1];
        }
    }
    return c;
}

std::map<std::string, FeedSpacer>& registry()
{
    static std::map<std::string, FeedSpacer> r;
    return r;
}

} // anonymous namespace

void FeedSpacer::readFromDict(const DictPtr& d, const std::string& sourcePath)
{
    sourcePath_   = sourcePath;
    name_         = d->lookupWordOrDefault("name", "");
    manufacturer_ = d->lookupWordOrDefault("manufacturer", "");
    if (name_.empty())
        throw std::runtime_error("FeedSpacer: " + sourcePath
            + " has no `name` entry");
    const std::string locus = "FeedSpacer '" + name_ + "' (" + sourcePath + ")";

    // ---- geometry: the measured quantities, each with ONE home ---------------
    thickness_ = d->lookupScalar("thickness", Dims::length);
    if (thickness_ <= 0.0)
        throw std::runtime_error(locus + ": thickness must be > 0");
    if (d->found("channelHeight"))
        throw std::runtime_error(locus + ": `channelHeight` is not a spacer"
            " key -- the channel height IS the spacer thickness (Schock &"
            " Miquel 1987, p. 341), declared once as `thickness`.");

    const bool hasF   = d->found("filamentDiameter");
    const bool hasM   = d->found("meshLength");
    const bool hasEps = d->found("porosity");
    const bool hasDh  = d->found("hydraulicDiameter");
    if (hasF) filament_ = d->lookupScalar("filamentDiameter", Dims::length);
    if (hasM) mesh_     = d->lookupScalar("meshLength",       Dims::length);
    if ((hasF && filament_ <= 0.0) || (hasM && mesh_ <= 0.0))
        throw std::runtime_error(locus + ": filamentDiameter and meshLength"
            " must be > 0");

    if (hasM && !hasF)
        throw std::runtime_error(locus + ": `meshLength` without"
            " `filamentDiameter` -- the porosity of a mesh (Schock & Miquel"
            " Eqs. 20-22) needs both.");
    if (hasEps && hasF && hasM)
        throw std::runtime_error(locus + ": declares `porosity` AND the mesh"
            " (`filamentDiameter` + `meshLength`) it is computed from (Schock &"
            " Miquel Eqs. 20-22) -- one home.  Keep the porosity only where it"
            " was WEIGHED (Eq. 19) and the mesh is not known; otherwise drop"
            " it and let the engine derive it.");
    if (hasEps)
    {
        porosity_ = d->lookupScalar("porosity");
    }
    else if (hasF && hasM)
    {
        porosity_        = porosityFromMesh(thickness_, filament_, mesh_);
        porosityDerived_ = true;
    }
    else
        throw std::runtime_error(locus + ": no porosity -- declare either"
            " `porosity` (weighed: eps = 1 - m/(rho b l h), Schock & Miquel"
            " Eq. 19) or `filamentDiameter` + `meshLength` (Eqs. 20-22).");
    if (!(porosity_ > 0.0 && porosity_ < 1.0))
        throw std::runtime_error(locus + ": porosity must lie in (0, 1) -- got "
            + std::to_string(porosity_));

    if (hasF && hasDh)
        throw std::runtime_error(locus + ": declares `hydraulicDiameter` AND"
            " the `filamentDiameter` it is derived from (Schock & Miquel"
            " Eq. 17, S_V,SP = 4/d_F by Eq. 23) -- one home.  Store d_h only"
            " where a source publishes it and not the filament.");
    if (hasF)
        dh_ = hydraulicDiameterEq17(thickness_, porosity_, 4.0 / filament_);
    else if (hasDh)
    {
        dh_ = d->lookupScalar("hydraulicDiameter", Dims::length);
        if (dh_ <= 0.0)
            throw std::runtime_error(locus + ": hydraulicDiameter must be > 0");
    }
    else
        throw std::runtime_error(locus + ": no route to the hydraulic"
            " diameter -- declare `filamentDiameter` (d_h derived by Schock &"
            " Miquel Eq. 17) or, where a source publishes only d_h,"
            " `hydraulicDiameter`.");

    // ---- correlations, as data -------------------------------------------
    mt_ = readCorrelation(d, "massTransfer", locus);
    pd_ = readCorrelation(d, "pressureDrop", locus);

    // ---- provenance: the citation and the per-value estimates ------------
    if (!d->found("provenance"))
        throw std::runtime_error(locus + ": no `provenance {}` block -- a"
            " spacer record cites its source (`source \"...\";`) and marks each"
            " value the source does not state `{ origin estimated;"
            " reviewStatus unverified; notes \"how to verify it\"; }`.");
    auto p = d->subDict("provenance");
    source_ = p->lookupWordOrDefault("source", "");
    if (source_.empty())
        throw std::runtime_error(locus + ": provenance{} names no `source`.");
    for (const auto& k : p->keys())
    {
        const auto& ev = p->entryValue(k);
        if (!std::holds_alternative<DictPtr>(ev)) continue;
        if (!d->found(k))
            throw std::runtime_error(locus + ": provenance{} carries a block"
                " for `" + k + "`, which the record does not declare.");
        auto sub = std::get<DictPtr>(ev);
        const std::string word = sub->lookupWordOrDefault("origin", "unattributed");
        if (originFromWord(word) != Origin::estimated) continue;
        ModuleEstimate e;
        e.key          = k;
        const auto& val = d->entryValue(k);
        e.value        = std::holds_alternative<DictPtr>(val) ? 0.0 : d->lookupScalar(k);
        e.reviewStatus = sub->lookupWordOrDefault("reviewStatus", "");
        e.notes        = sub->lookupWordOrDefault("notes", "");
        if (e.reviewStatus.empty() || e.notes.empty())
            throw std::runtime_error(locus + ": `" + k + "` is declared an"
                " ESTIMATE without " + (e.reviewStatus.empty() ? "a reviewStatus" : "notes")
                + " -- an educated value must say that it is one AND how it is"
                  " to be verified.");
        estimates_.push_back(std::move(e));
    }
}

void FeedSpacerRegistry::clear() { registry().clear(); }

void FeedSpacerRegistry::add(FeedSpacer s)
{
    const std::string n = s.name();
    registry()[n] = std::move(s);
}

const FeedSpacer& FeedSpacerRegistry::byName(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
        throw std::runtime_error("FeedSpacerRegistry: "
            + registryRefusal::message("feed spacer", name,
                                       registryRefusal::keysOf(registry())));
    return it->second;
}

std::vector<std::string> FeedSpacerRegistry::availableNames()
{
    return registryRefusal::keysOf(registry());
}

} // namespace Choupo
