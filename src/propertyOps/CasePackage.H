/*---------------------------------------------------------------------------*\
  CasePackage -- shared resolution of the case's AQUEOUS-SPECIATION surface
  for the speciation-family ops (speciate / scalingScan / exchange).  The
  surface is read NATIVELY from the authored v2 grammar (aqueousProperties {
  activityCoefficients { model ... } solvent ...; }) -- migration wave F,
  2026-07-18: no translated intermediate, one typed reader shared by every
  consumer (the duplicate walkers are gone).
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/
#pragma once

#include "core/Dictionary.H"
#include <filesystem>
#include <stdexcept>
#include <string>

namespace Choupo { namespace propertyOps {

// The case's aqueous-speciation SURFACE, typed: which gamma model the ops run
// (in the op-key form: davies | pitzerHMW) and the declared solvent.  present
// is false when the case declares no aqueousProperties block.
struct AqueousSurface
{
    bool        present = false;
    std::string model;      // op-key form: "davies" | "pitzerHMW"
    std::string solvent;    // authored solvent word ("" when undeclared)
};

// Read the surface from the AUTHORED v2 system, walking UP the fractal
// cascade from the cwd (the T8 grammar):
//   aqueousProperties { activityCoefficients { model Davies|PitzerHMW;
//                       [referenceBasis aqueousMolality;] } [solvent water;] }
// The refusals the scaffold applied live HERE now -- unknown model and any
// non-molality basis refuse loudly (declared+verified, never decorative).
inline AqueousSurface caseAqueousSurface()
{
    namespace fs = std::filesystem;
    AqueousSurface out;
    fs::path p = fs::current_path();
    for (int up = 0; up < 6; ++up)
    {
        const fs::path v2 = p / "constant" / "thermoPhysPropDict";
        if (fs::exists(v2))
        {
            auto d = Dictionary::fromFile(v2.string());
            if (d->lookupWordOrDefault("recordType", "")
                    != "thermophysicalPropertySystem"
                || !d->found("aqueousProperties"))
                return out;                    // a case, but not a speciation one
            auto aq = d->subDict("aqueousProperties");
            auto ac = aq->subDict("activityCoefficients");
            const std::string m = ac->lookupWord("model");
            if      (m == "Davies")    out.model = "davies";
            else if (m == "PitzerHMW") out.model = "pitzerHMW";
            else throw std::runtime_error("thermophysicalPropertySystem: "
                    "aqueousProperties.activityCoefficients.model '" + m
                    + "' -- implemented: Davies | PitzerHMW.");
            if (ac->found("referenceBasis")
                && ac->lookupWord("referenceBasis") != "aqueousMolality")
                throw std::runtime_error("thermophysicalPropertySystem: the"
                    " aqueous activity surface is molality-based"
                    " (referenceBasis aqueousMolality) -- any other basis is"
                    " a named gap.");
            out.solvent = aq->lookupWordOrDefault("solvent", "");
            out.present = true;
            return out;
        }
        if (fs::exists(p / "constant" / "propertyDict"))
            throw std::runtime_error(
                "the v1 `constant/propertyDict` grammar is RETIRED (the"
                " 2026-07-18 consolidation): this case still carries one."
                "  Migrate it -- bin/curate/migrate_thermoPhysProp.py"
                " (mechanical, golden-safe) -- then re-run.");
        if (!p.has_parent_path()) break;
        p = p.parent_path();
    }
    return out;
}

// The aqueous-activity model for a speciate/scalingScan/exchange op:
//  - the op's own `activityModel` if present (an explicit override -- the
//    model-CONTRAST mechanism: davies vs pitzerHMW on ONE feed), ELSE
//  - the case surface's model (aqueousProperties.activityCoefficients), ELSE
//  - davies (the S1 default).
inline std::string resolveAqueousActivity(const DictPtr& opDict)
{
    if (opDict->found("activityModel"))
        return opDict->lookupWord("activityModel");
    const AqueousSurface s = caseAqueousSurface();
    return s.present ? s.model : "davies";
}

}} // namespace Choupo::propertyOps
