/*---------------------------------------------------------------------------*\
  CasePackage -- the case's AQUEOUS-SPECIATION surface, typed, for the
  speciation-family ops (speciate / scalingScan / exchange).  The surface is
  read from the RESOLVED authored system (the entry point resolves the
  `inherits` chain ONCE and hands the object to every op) -- one reader,
  no filesystem walking here.
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/
#pragma once

#include "core/Dictionary.H"
#include <stdexcept>
#include <string>

namespace Choupo { namespace propertyOps {

// The aqueous-speciation SURFACE: which gamma model the ops run (op-key
// form: davies | pitzerHMW) and the declared solvent.  present is false when
// the system declares no aqueousProperties block.
struct AqueousSurface
{
    bool        present = false;
    std::string model;      // op-key form: "davies" | "pitzerHMW"
    std::string solvent;    // authored solvent word ("" when undeclared)
};

// Read the surface from the RESOLVED authored system:
//   aqueousProperties { activityCoefficients { model Davies|PitzerHMW;
//                       [referenceBasis aqueousMolality;] } [solvent water;] }
// Unknown model and any non-molality basis refuse loudly
// (declared+verified, never decorative).
inline AqueousSurface aqueousSurfaceOf(const DictPtr& authored)
{
    AqueousSurface out;
    if (!authored || !authored->found("aqueousProperties")) return out;
    auto aq = authored->subDict("aqueousProperties");
    auto ac = aq->subDict("activityCoefficients");
    const std::string m = ac->lookupWord("model");
    if      (m == "Davies")    out.model = "davies";
    else if (m == "PitzerHMW") out.model = "pitzerHMW";
    else throw std::runtime_error("thermophysicalPropertySystem: "
            "aqueousProperties.activityCoefficients.model '" + m
            + "' -- implemented: Davies | PitzerHMW.");
    if (ac->found("referenceBasis")
        && ac->lookupWord("referenceBasis") != "aqueousMolality")
        throw std::runtime_error("thermophysicalPropertySystem: the aqueous"
            " activity surface is molality-based (referenceBasis"
            " aqueousMolality) -- any other basis is a named gap.");
    out.solvent = aq->lookupWordOrDefault("solvent", "");
    out.present = true;
    return out;
}

// The aqueous-activity model for a speciate/scalingScan/exchange op:
//  - the op's own `activityModel` if present (an explicit override -- the
//    model-CONTRAST mechanism: davies vs pitzerHMW on ONE feed), ELSE
//  - the system surface's model (aqueousProperties.activityCoefficients), ELSE
//  - davies (the dilute default).
inline std::string resolveAqueousActivity(const DictPtr& opDict,
                                          const DictPtr& authored)
{
    if (opDict->found("activityModel"))
        return opDict->lookupWord("activityModel");
    const AqueousSurface s = aqueousSurfaceOf(authored);
    return s.present ? s.model : "davies";
}

}} // namespace Choupo::propertyOps
