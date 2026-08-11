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

#include "CurationDossier.H"

#include <cmath>

#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iterator>
#include <map>
#include <stdexcept>

namespace fs = std::filesystem;

namespace Choupo {

CurationDossier& CurationDossier::instance()
{
    static CurationDossier inst;
    return inst;
}

void CurationDossier::add(const std::string& component, PropertyRecord r)
{
    records_.emplace_back(component, std::move(r));
}

std::string CurationDossier::verdictOf(const EvidencePartition& part,
                                       bool heldOut, scalar aadPct)
{
    //  ONE home for the rule, so two ops cannot drift into two readings of it.
    if (!part.engaged())          return "notClaimed";
    if (part.validationRefused()) return "validationRefused";
    if (!heldOut)                 return "validationRefused";
    if (!part.hasAcceptance())    return "heldOutPerformed";
    return (aadPct <= part.acceptanceMaxAADPct()) ? "validated" : "notValidated";
}

namespace {

void writeSets(std::ofstream& f, const char* role,
               const std::vector<EvidenceDataset>& sets)
{
    for (const auto& d : sets)
    {
        f << "        {\n"
          << "            role      " << role << ";\n"
          << "            dataset   \"" << d.path << "\";\n";
        if (!d.doi.empty())    f << "            doi       \"" << d.doi << "\";\n";
        if (!d.sha256.empty()) f << "            sha256    \"" << d.sha256 << "\";\n";
        if (d.doi.empty() && d.sha256.empty())
            f << "            identity  none;    // declares no DOI or hash --"
                 " it cannot take part in the cross-role identity check\n";
        f << "        }\n";
    }
}

} // namespace

std::vector<std::string> CurationDossier::write() const
{
    std::vector<std::string> written;
    if (records_.empty()) return written;

    //  Group by component -- one dossier per component, its properties inside.
    std::map<std::string, std::vector<const PropertyRecord*>> byComponent;
    for (const auto& [comp, rec] : records_)
        byComponent[comp.empty() ? "unnamed" : comp].push_back(&rec);

    //  A DOSSIER IS THE PRODUCT OF A CURATION ACT, so a component whose
    //  properties were ALL fitted through the legacy single-dataset form gets
    //  none: that form claims nothing, announces on stdout that it claims
    //  nothing, and a file repeating `verdict notClaimed` would add a record
    //  of a decision nobody took.  Every teaching case that merely
    //  demonstrates a fitting algorithm would otherwise sprout a curation
    //  directory saying so.
    for (auto it = byComponent.begin(); it != byComponent.end(); )
    {
        bool anyEngaged = false;
        for (const auto* r : it->second) anyEngaged |= r->engaged;
        it = anyEngaged ? std::next(it) : byComponent.erase(it);
    }
    if (byComponent.empty()) return written;

    fs::create_directories("curation");

    for (const auto& [comp, recs] : byComponent)
    {
        const std::string path = "curation/" + comp + ".dossier";
        std::ofstream f(path);
        if (!f) throw std::runtime_error("CurationDossier: cannot write " + path);
        f << std::setprecision(12);

        f << "/*--------------------------------*- Choupo -*-------------------"
             "-------------*\\\n"
             "  CURATION DOSSIER -- a scientific work record, NOT runtime"
             " property data.\n"
             "\n"
             "  NOTHING IN THIS FILE IS VISIBLE TO THE SOLVER.  Record"
             " resolution looks only\n"
             "  in <case>/constant/, data/standards/ and data/local/, so a file"
             " here is out\n"
             "  of its reach BY CONSTRUCTION -- not by convention.\n"
             "\n"
             "  Nothing here has been promoted.  Curation state belongs to the"
             " evidence\n"
             "  process; runtime trust belongs to the numerical record actually"
             " admitted\n"
             "  to data/standards/, and only an explicit human promotion moves"
             " one there\n"
             "  (bin/curate/promote-from-dossier).\n"
             "\n"
             "  MATURITY IS PER PROPERTY, not per component: the properties"
             " below may hold\n"
             "  different verdicts, and any whole-component summary is DERIVED"
             " from them\n"
             "  rather than stored beside them.\n"
             "\n"
             "  Regenerated on every run.  Hand edits are lost.\n"
             "\\*-------------------------------------------------------------"
             "----------------*/\n\n";

        f << "component      " << comp << ";\n"
          << "reviewStatus   unreviewed;\n\n";

        for (const auto* r : recs)
        {
            f << "property " << r->property << "\n{\n";
            f << "    operation      " << r->opName
              << ";   // type " << r->opType << "\n";
            f << "    model          \"" << r->model << "\";\n";
            f << "    verdict        " << r->verdict << ";\n";
            if (!r->refusal.empty())
                f << "    refusal        \"" << r->refusal << "\";\n";

            f << "\n    fittedParameters\n    {\n";
            for (const auto& [k, v] : r->parameters)
                f << "        " << k << "  " << v << ";\n";
            f << "    }\n";

            f << "\n    evidence\n    {\n";
            if (!r->engaged)
                f << "        //  LEGACY single-dataset form: every point was"
                     " fitted and no\n"
                     "        //  validation was ever claimed.\n";
            else
                f << "        partitionFingerprint  \"" << r->fingerprint
                  << "\";   // frozen before the fit\n";
            f << "\n        datasets\n        (\n";
            writeSets(f, "fit", r->fitSets);
            writeSets(f, "validation", r->validationSets);
            f << "        );\n";
            f << "\n        domain\n        {\n"
              << "            fit         { min " << r->fitMin << " " << r->domainUnit
              << "; max " << r->fitMax << " " << r->domainUnit << "; n "
              << r->nFit << "; }\n";
            if (r->nValidation > 0)
                f << "            validation  { min " << r->valMin << " " << r->domainUnit
                  << "; max " << r->valMax << " " << r->domainUnit << "; n "
                  << r->nValidation << "; }\n";
            f << "        }\n    }\n";

            //  THE FOUR METRICS, KEPT APART BY FIELD NAME.  A reader must be
            //  able to tell "reproduces what it was given" from "survives what
            //  it never saw" without reading prose.
            f << "\n    metrics\n    {\n";
            if (std::isnan(r->r2InSample))
                f << "        //  r2InSample: not computed by this operation"
                     " (it reports chi-square).\n";
            else
            f << "        r2InSample        " << r->r2InSample
              << ";   // the model reproducing the points it was FITTED to\n";
            if (r->heldOut)
            {
                if (std::isnan(r->rmsHeldOut))
                    f << "        //  rmsHeldOut: not computed by this"
                         " operation (see aadHeldOutPct).\n";
                else
                f << "        rmsHeldOut        " << r->rmsHeldOut
                  << ";   // " << r->rmsUnit << ", on evidence the fit never saw\n";
                f << "        aadHeldOutPct     " << r->aadHeldOutPct << ";\n";
                if (r->hasAcceptance)
                {
                    f << "        acceptanceMaxAADPct " << r->acceptMaxAADPct
                      << ";   // DECLARED BEFORE the fit; part of the fingerprint\n";
                    f << "        acceptanceOrigin  \"" << r->acceptOrigin
                      << "\";\n";
                }
                else
                    f << "        //  No acceptance band was declared, so the"
                         " residuals above are\n"
                         "        //  reported and NO verdict is claimed on"
                         " them.  Whether they are\n"
                         "        //  small enough is a judgement, and the"
                         " engine does not make it.\n";
            }
            else
            {
                f << "        //  NO HELD-OUT METRIC EXISTS.  r2InSample above"
                     " is exactly that --\n"
                     "        //  in-sample -- and must not be read as an"
                     " external check.\n";
            }
            f << "    }\n}\n\n";
        }
        written.push_back(path);
    }
    return written;
}

} // namespace Choupo
