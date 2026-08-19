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
    Choupo::Catalyst

Description
    A CATALYST PELLET as an ASSET -- the intrinsic identity of one purchased
    porous solid, loaded from a flat `assets/<name>.dat` record carrying
    `kind catalyst;`.

    THE HOME IS RULED, not chosen here:
    `docs/design/where-the-catalyst-pellet-lives.md` (2026-08-18).  A catalyst
    is the same KIND of thing as an adsorbent -- a purchased solid with a
    geometry, a density and a porosity -- so `Adsorbent` + `AdsorbentRegistry`
    is the pattern, and this class is deliberately its twin.

    WHAT THE RECORD CARRIES, and only this:

        kind catalyst;
        catalyst
        {
            name         <word>;
            type         "<free text>";       // optional material class
            geometry     slab|cylinder|sphere;
            radius       <length>;            // sphere / cylinder
            halfThickness<length>;            // slab (sealed edges)
            rho_particle <density>;           // apparent PELLET density
            rho_bulk     <density>;           // packed BULK density (optional)
            epsilon_p    <-> ;                // intraparticle porosity
            tau          <-> ;                // tortuosity
        }

    THE DIMENSION IS NAMED BY THE GEOMETRY, and that is not decoration: a
    single `dimension` key would let a slab record declare a radius and a
    sphere a half-thickness, and nothing could tell.  Naming it makes the
    pairing CHECKABLE, so a mismatch refuses instead of being read as
    whichever the reader assumed.

    WHAT THE RECORD MUST NOT CARRY, each refused by name:

      * `D_eff` / `effectiveDiffusivity` -- an effective diffusivity is a
        (catalyst, species) PAIR quantity.  Filed here it would be one number
        standing for every species in the mixture, and it would be false
        SILENTLY.  This is the exact line `Adsorbent::readIdentity` already
        draws against an embedded `isotherms{}` block, one field over.
      * kinetics of any spelling -- rate constants are equipment- and
        reaction-specific (property axiom 3: they live in the case's
        `constant/`).  The asset carries the SOLID, never the chemistry run
        on it.

    WHAT IS DELIBERATELY *NOT* MIRRORED FROM `Adsorbent`, and why, since the
    ruling names them: `dParticle()` and `sphericity()`.  For a sphere
    `dParticle` is 2*radius -- a STORED DERIVATIVE, which is the one thing the
    tree never keeps -- and for a slab it has no meaning at all.  A consumer
    that needs a particle diameter (Ergun, a heat-transfer correlation) should
    derive it from the geometry and say so, not read a second copy that can
    drift from the radius beside it.

    THE PELLET IS ISOTHERMAL HERE.  Nothing in this record describes a thermal
    conductivity or a heat of reaction, because the first slice models an
    isothermal pellet; the non-isothermal pellet (the Prater number, the
    multiple interior steady states) is a NAMED GAP, not an oversight --
    `docs/design/edutools-curriculum-survey.md` Sec. 6.1.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>

namespace Choupo {

//  The three geometries the first-order isothermal pellet has a CLOSED FORM
//  for.  The integer is the shape factor `s` of the pellet mass balance
//      u'' + (s/xi) u' = phi_char^2 u,
//  which is why it is stored as one: slab 0, cylinder 1, sphere 2.  There is
//  no `other` -- a geometry with no closed form has no oracle, and the whole
//  claim of this slice is that the numerical answer is checked against one.
enum class PelletGeometry { slab = 0, cylinder = 1, sphere = 2 };

//  The geometry's name, exactly as a record spells it and exactly as it is
//  published in the CSV `geometry` column.  ONE spelling, both directions.
const std::string& pelletGeometryName(PelletGeometry g);

//  Parse a record's word; throws naming the three legal words.
PelletGeometry pelletGeometryFromWord(const std::string& word,
                                      const std::string& locus);

class Catalyst
{
public:
    Catalyst() = default;

    //  Load the INTRINSIC identity from an assets/<name>.dat dictionary.
    //  REFUSES an embedded effective diffusivity or embedded kinetics, each
    //  pointing at the home the quantity actually belongs in.
    void readIdentity(const DictPtr& dict, const std::string& sourcePath);

    // ---- Identification ----------------------------------------------------
    const std::string& name()   const { return name_; }
    const std::string& type()   const { return type_; }
    const std::string& source() const { return source_; }

    //  PARSED PROVENANCE, not banner prose.  A field the engine cannot see is
    //  a comment, and 67 records once carried `PROPOSAL TIER -- UNVERIFIED` in
    //  exactly such a comment.  Both of these are read here and ANNOUNCED by
    //  the consumer, so a surrogate pellet says so beside its own answer.
    //  Empty means the record declares none, which is itself announced --
    //  silence must never be mistaken for a clean bill.
    const std::string& reviewStatus() const { return review_status_; }
    const std::string& origin()       const { return origin_; }

    PelletGeometry geometry() const { return geometry_; }

    //  The characteristic dimension [m]: the RADIUS for a sphere or a
    //  cylinder, the HALF-thickness for a slab sealed on its edges.  This is
    //  the length `phi_char` is built on.
    scalar characteristicDimension() const { return dimension_; }

    //  The volume-to-external-surface length Lambda = V_p / S_p [m] -- R/3 for
    //  a sphere, R/2 for a cylinder, L for a slab.  DERIVED here, never
    //  stored: it is a consequence of the geometry and the dimension above.
    //  It is the length the GENERALISED (Aris) modulus is built on, and the
    //  reason the three geometries nearly collapse onto one eta(phi) curve.
    scalar volumeToSurfaceLength() const;

    scalar rhoParticle() const { return rho_particle_; }   // kg/m3, 0 = unknown
    scalar rhoBulk()     const { return rho_bulk_;     }   // kg/m3, 0 = unknown

    //  Intraparticle porosity [-] and tortuosity [-].  ZERO means the record
    //  does not declare it, and a consumer must then REFUSE rather than pick
    //  a value: a tortuosity is conventionally 2-7 and the choice moves eta
    //  by a factor of three, so a default would invent the student's answer.
    scalar epsilonP() const { return epsilon_p_; }
    scalar tau()      const { return tau_;       }

    bool hasPorosityRoute() const { return epsilon_p_ > 0.0 && tau_ > 0.0; }

private:
    std::string    name_;
    std::string    type_;
    std::string    source_;
    std::string    review_status_;
    std::string    origin_;
    PelletGeometry geometry_     = PelletGeometry::sphere;
    scalar         dimension_    = 0.0;
    scalar         rho_particle_ = 0.0;
    scalar         rho_bulk_     = 0.0;
    scalar         epsilon_p_    = 0.0;
    scalar         tau_          = 0.0;
};

} // namespace Choupo
