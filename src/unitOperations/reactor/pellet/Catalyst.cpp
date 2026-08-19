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
\*---------------------------------------------------------------------------*/

#include "Catalyst.H"

#include <stdexcept>

namespace Choupo {

namespace {

const std::string kSlab     = "slab";
const std::string kCylinder = "cylinder";
const std::string kSphere   = "sphere";

} // anonymous namespace

const std::string& pelletGeometryName(PelletGeometry g)
{
    switch (g)
    {
        case PelletGeometry::slab:     return kSlab;
        case PelletGeometry::cylinder: return kCylinder;
        case PelletGeometry::sphere:   return kSphere;
    }
    return kSphere;   // unreachable; the enum has exactly three values
}

PelletGeometry pelletGeometryFromWord(const std::string& word,
                                      const std::string& locus)
{
    if (word == kSlab)     return PelletGeometry::slab;
    if (word == kCylinder) return PelletGeometry::cylinder;
    if (word == kSphere)   return PelletGeometry::sphere;
    throw std::runtime_error(locus + ": unknown pellet geometry '" + word
        + "'.  The first-order isothermal pellet is solved for exactly three"
          " geometries, because those are the three that carry a CLOSED FORM"
          " to verify the numerical answer against: `slab` (sealed edges,"
          " characteristic dimension = half-thickness), `cylinder` (radial"
          " only) and `sphere`.  Declare one of the three.");
}

scalar Catalyst::volumeToSurfaceLength() const
{
    switch (geometry_)
    {
        case PelletGeometry::slab:     return dimension_;          // L
        case PelletGeometry::cylinder: return dimension_ / 2.0;    // R/2
        case PelletGeometry::sphere:   return dimension_ / 3.0;    // R/3
    }
    return dimension_ / 3.0;
}

void Catalyst::readIdentity(const DictPtr& d, const std::string& sourcePath)
{
    source_ = sourcePath;

    //  The pair-data refusals come FIRST, before anything is read, so a record
    //  carrying a second home for a pair quantity is refused whole rather than
    //  half-read.  This mirrors Adsorbent::readIdentity's isotherms{} refusal.
    //
    //  BOTH LEVELS ARE SCANNED, and that is not belt-and-braces: an author who
    //  reaches for the wrong home will write the key wherever the neighbouring
    //  keys are, which is INSIDE `catalyst {}`.  A refusal that watches only
    //  the outer level would let the commonest spelling of the mistake
    //  through, which is the shape of every "guard armed on one of two routes"
    //  this project has paid for.
    const DictPtr inner = d->found("catalyst") ? d->subDict("catalyst")
                                               : DictPtr();
    auto declares = [&](const char* key)
    {
        return d->found(key) || (inner && inner->found(key));
    };

    for (const char* key : { "D_eff", "effectiveDiffusivity", "diffusivity" })
    {
        if (declares(key))
            throw std::runtime_error(std::string("Catalyst: ") + sourcePath
                + " declares `" + key + "` on the catalyst record.  An"
                " EFFECTIVE DIFFUSIVITY is a (catalyst, species) PAIR quantity"
                " -- stored here it would be ONE number standing for every"
                " species in the mixture, which is false for all but one of"
                " them and false SILENTLY.  Two homes exist and neither is"
                " this file: a MEASURED value belongs in"
                " parameters/diffusion/effective/<catalyst>/<species>.dat, and"
                " in the ordinary case NOTHING is stored at all -- D_eff ="
                " (epsilon_p/tau)*D_molecular is DERIVED where it is used and"
                " announced with the rule that produced it.  Declare"
                " `epsilon_p` and `tau` here instead."
                "  (docs/design/where-the-catalyst-pellet-lives.md Sec. 2-3)");
    }
    for (const char* key : { "kinetics", "reactions", "rateConstant",
                             "activationEnergy" })
    {
        if (declares(key))
            throw std::runtime_error(std::string("Catalyst: ") + sourcePath
                + " declares `" + key + "` on the catalyst record.  A rate"
                " constant is equipment- and reaction-specific (property axiom"
                " 3) and lives in the CASE's constant/ or in the operation that"
                " runs the chemistry; the asset carries the SOLID, never the"
                " chemistry run on it.  Two reactors loaded with the same"
                " catalyst would otherwise carry two copies of the same"
                " kinetics and drift apart.");
    }

    //  PARSED provenance -- read here so the consumer can announce it.  Both
    //  are absence-tolerant: an empty string means the record declares none,
    //  and the consumer says THAT rather than treating silence as approval.
    review_status_ = d->lookupWordOrDefault("reviewStatus", "");
    if (d->found("provenance"))
    {
        auto p = d->subDict("provenance");
        if (p->found("identity"))
            origin_ = p->subDict("identity")->lookupWordOrDefault("origin", "");
    }

    if (!inner)
        throw std::runtime_error("Catalyst: " + sourcePath + " carries no"
            " `catalyst {}` block.  A `kind catalyst;` record declares its"
            " identity there: name, geometry, the characteristic dimension,"
            " densities, epsilon_p and tau.");
    const DictPtr& c = inner;

    name_ = c->lookupWord("name");
    if (name_.empty())
        throw std::runtime_error("Catalyst: " + sourcePath
            + " has no `name` entry");
    type_ = c->lookupWordOrDefault("type", "");

    const std::string locus = "Catalyst '" + name_ + "' (" + sourcePath + ")";

    if (!c->found("geometry"))
        throw std::runtime_error(locus + ": no `geometry` declared.  The"
            " pellet mass balance is u'' + (s/xi) u' = phi^2 u and `s` IS the"
            " geometry (slab 0, cylinder 1, sphere 2) -- there is no shape to"
            " assume.  Declare `geometry slab;`, `geometry cylinder;` or"
            " `geometry sphere;`.");
    geometry_ = pelletGeometryFromWord(c->lookupWord("geometry"), locus);

    //  THE DIMENSION IS NAMED BY THE GEOMETRY.  A slab declares its
    //  half-thickness, a sphere or cylinder its radius; declaring the other
    //  one refuses rather than being silently reinterpreted.
    const bool wantsRadius = (geometry_ != PelletGeometry::slab);
    const char* wanted = wantsRadius ? "radius"       : "halfThickness";
    const char* other  = wantsRadius ? "halfThickness": "radius";

    if (c->found(other))
        throw std::runtime_error(locus + ": geometry `"
            + pelletGeometryName(geometry_) + "` is measured by `" + wanted
            + "`, but the record declares `" + other + "`.  The characteristic"
              " dimension is named by the geometry precisely so this cannot be"
              " read as whichever the reader assumed -- rename the key, or"
              " change the geometry if that is what was meant.");
    if (!c->found(wanted))
        throw std::runtime_error(locus + ": geometry `"
            + pelletGeometryName(geometry_) + "` declares no `" + wanted
            + "`.  The Thiele modulus is built on that length; without it"
              " there is no modulus, and guessing a pellet size would invent"
              " the answer.  Declare e.g. `" + wanted + " 1.5 mm;`.");

    dimension_ = c->lookupScalar(wanted, Dims::length);
    if (!(dimension_ > 0.0))
        throw std::runtime_error(locus + ": `" + wanted + "` must be a"
            " strictly positive length.");

    rho_particle_ = c->found("rho_particle")
                  ? c->lookupScalar("rho_particle", Dims::density) : 0.0;
    rho_bulk_     = c->found("rho_bulk")
                  ? c->lookupScalar("rho_bulk", Dims::density) : 0.0;
    if (rho_particle_ < 0.0 || rho_bulk_ < 0.0)
        throw std::runtime_error(locus + ": a negative density is refused;"
            " omit an unknown value rather than declaring a wrong one.");

    epsilon_p_ = c->lookupScalarOrDefault("epsilon_p", 0.0);
    tau_       = c->lookupScalarOrDefault("tau", 0.0);

    //  0.0 is the ABSENT marker (the key was not declared) and passes here; a
    //  declared value outside (0,1) is a broken record, not an unknown.
    if (epsilon_p_ < 0.0 || epsilon_p_ >= 1.0)
        throw std::runtime_error(locus + ": `epsilon_p` is an intraparticle"
            " POROSITY and must lie in (0,1); the record declares "
            + std::to_string(epsilon_p_) + ".  Omit the key to state that the"
            " porosity is unknown -- that refuses later, by name, which is"
            " what an unknown should do.");
    if (tau_ < 0.0)
        throw std::runtime_error(locus + ": `tau` (tortuosity) must be"
            " positive; omit the key if it is unknown.");
    if (tau_ > 0.0 && tau_ < 1.0)
        throw std::runtime_error(locus + ": `tau` = "
            + std::to_string(tau_) + " is BELOW 1.  A tortuosity is the ratio"
              " of a diffusion path length to the straight-line distance, so it"
              " cannot be less than 1 -- a value below 1 says the molecule"
              " arrived before it left.  (Values below 1 are sometimes"
              " published for a LUMPED `tau/constriction` factor; that is a"
              " different quantity and must not be declared here.)");

    //  A record that declares one of the pair and not the other is the
    //  half-route, and it is worth refusing HERE rather than at the point of
    //  use: the author plainly meant to supply the derivation route.
    if ((epsilon_p_ > 0.0) != (tau_ > 0.0))
        throw std::runtime_error(locus + ": declares `"
            + std::string(epsilon_p_ > 0.0 ? "epsilon_p" : "tau")
            + "` but not `" + std::string(epsilon_p_ > 0.0 ? "tau" : "epsilon_p")
            + "`.  The derived route is D_eff = (epsilon_p/tau)*D_molecular and"
              " it needs BOTH; half of it is not a route.  Declare the other"
              " key with its provenance, or remove both and cite a measured"
              " D_eff record instead.");
}

} // namespace Choupo
