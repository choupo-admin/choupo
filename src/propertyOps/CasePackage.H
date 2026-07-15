/*---------------------------------------------------------------------------*\
  CasePackage -- shared resolution of the case's OFFICIAL dictionary
  (constant/propertyDict = the inline electrolyte propertyPackage) for the
  speciation-family ops (speciate / scalingScan / exchange).  Roadmap Phase B:
  the activity method lives in the package, not per-op.
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/
#pragma once

#include "core/Dictionary.H"
#include <filesystem>
#include <string>

namespace Choupo { namespace propertyOps {

// The case's OFFICIAL dictionary (constant/propertyDict), walking UP the fractal
// cascade from the cwd.  Null if none up the tree.
inline DictPtr caseDictionary()
{
    namespace fs = std::filesystem;
    fs::path p = fs::current_path();
    for (int up = 0; up < 6; ++up)
    {
        fs::path cand = p / "constant" / "propertyDict";
        if (fs::exists(cand)) return Dictionary::fromFile(cand.string());
        if (!p.has_parent_path()) break;
        p = p.parent_path();
    }
    return nullptr;
}

// The aqueous-activity model for a speciate/scalingScan/exchange op:
//  - the op's own `activityModel` if present (an explicit override, e.g. a legacy
//    or model-contrast case), ELSE
//  - the case package's propertyMethods.aqueousActivity (strip the "electrolyte."
//    prefix -> pitzerHMW / davies / ...), ELSE
//  - davies (the S1 default).
inline std::string resolveAqueousActivity(const DictPtr& opDict)
{
    if (opDict->found("activityModel"))
        return opDict->lookupWord("activityModel");
    auto pkg = caseDictionary();
    if (pkg && pkg->found("propertyMethods")
        && pkg->subDict("propertyMethods")->found("aqueousActivity"))
    {
        std::string m = pkg->subDict("propertyMethods")->lookupWord("aqueousActivity");
        const auto dot = m.rfind('.');
        return (dot == std::string::npos) ? m : m.substr(dot + 1);
    }
    return "davies";
}

}} // namespace Choupo::propertyOps
