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
#include <limits>
#include <map>
#include <sstream>
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
    //  A band is judged only after it was held to its statistic's unit
    //  (DEV.md 4c C172, EvidencePartition::requireBandInUnitOf).  An op that
    //  never made the check cannot publish a verdict: the comparison below
    //  would set a number in one unit against a number in another.
    if (!part.bandUnitChecked())
        throw std::logic_error("CurationDossier::verdictOf: the acceptance"
            " band was never held to the unit of the statistic it judges --"
            " the op must call EvidencePartition::requireBandInUnitOf before"
            " its verdict (an engine defect, not a case error)");
    return (aadPct <= part.acceptanceMaxAADPct()) ? "validated" : "notValidated";
}

void CurationDossier::writeEvidenceSets(std::ostream& f, const char* role,
                                        const std::vector<EvidenceDataset>& sets,
                                        const std::string& indent)
{
    const std::string in2 = indent + "    ";
    for (const auto& d : sets)
    {
        f << indent << "{\n"
          << in2 << "role      " << role << ";\n"
          << in2 << "dataset   \"" << d.path << "\";\n";
        if (!d.doi.empty())    f << in2 << "doi       \"" << d.doi << "\";\n";
        if (!d.sha256.empty()) f << in2 << "sha256    \"" << d.sha256 << "\";\n";
        if (d.doi.empty() && d.sha256.empty())
            f << in2 << "identity  none;    // declares no DOI or hash --"
                 " it cannot take part in the cross-role identity check\n";
        //  WHAT THE NUMBERS ARE, read from the dataset itself.  A dossier that
        //  records a verdict without recording whether the evidence was
        //  MEASURED lets a structural fixture read like an experiment months
        //  later, when nobody remembers which case was which.
        if (!d.provenanceSource.empty())
            f << in2 << "provenance " << d.provenanceSource
              << ";" << (d.provenanceSource == "synthetic"
                            ? "   // GENERATED, not measured -- any verdict"
                              " here is about the machinery"
                            : "") << "\n";
        else
            f << in2 << "provenance undeclared;   // the dataset states"
                 " neither measured nor generated\n";
        //  WHERE THE EVIDENCE CAME FROM, carried across the ThermoML crossing.
        //  A verdict whose dossier cannot name the archive file, the system
        //  and the pressure is a number, not a finding.
        if (!d.archiveFile.empty())
            f << in2 << "archiveFile \"" << d.archiveFile << "\";\n";
        if (!d.system.empty())
            f << in2 << "system    \"" << d.system << "\";\n";
        if (!d.pressure.empty())
            f << in2 << "pressure  \"" << d.pressure << "\";\n";
        //  A TIE-LINE dataset says so (fitParameters kind T_bubble+LLE): the
        //  record's reader must tell the binodal evidence from the bubble
        //  points without opening the files.  Bubble-point datasets write no
        //  such line, so every record that predates the kind is unchanged.
        try
        {
            if (Dictionary::fromFile(d.path)->lookupWordOrDefault("property", "")
                == "binaryLLE.binodal")
                f << in2 << "property  binaryLLE.binodal;\n";
        }
        catch (const std::exception&) { /* an unreadable file is refused where it is loaded */ }
        f << indent << "}\n";
    }
}

namespace {

//  THE DIGITS A NUMBER IS WRITTEN WITH (C483).  A dossier is a tracked record
//  that every run regenerates, and an iterative fit stops at its own
//  tolerance, so the converged value differs between platforms and builds in
//  the 7th-8th significant digit.  Printing 12 digits wrote that difference
//  into the tree on every run.  Each number now carries only what is known:
//
//    * a fitted parameter, to TWO significant digits of its own standard
//      error (the convention for quoting a value with its uncertainty), and
//      the error itself beside it -- the fit computes it (FitParameters:
//      sigma^2 (J^T J)^-1), the dossier used to throw it away;
//    * a parameter whose operation reports no error, and a metric (none of
//      them has one), to kSigDigits significant digits.  Measured on
//      curate08: the 7th-8th digit moves, so 5 digits sit four orders of
//      magnitude above the noise, and one more than the 4 the run's own
//      console prints.
constexpr int kSigDigits = 5;

std::string sigString(scalar v, int digits)
{
    std::ostringstream o;
    o << std::setprecision(digits) << v;
    return o.str();
}

//  A value and its error, both on the decimal place of the error's second
//  digit ("182.9" and "2.9"; "185.6" and "3.0", never "3").
std::string fixedAtErrorDigit(scalar x, scalar se)
{
    const int dec = 1 - static_cast<int>(std::floor(std::log10(se)));
    const scalar unit = std::pow(10.0, -dec);
    const scalar r = std::round(x / unit) * unit + 0.0;   // + 0.0: no "-0"
    std::ostringstream o;
    o << std::fixed << std::setprecision(dec > 0 ? dec : 0) << r;
    return o.str();
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
          << "reviewStatus   unreviewed;\n\n"
          << "properties\n(\n";

        for (const auto* r : recs)
        {
            //  THE PROPERTY BLOCK IS PLAIN DICT GRAMMAR (2026-09-03).
            //
            //  It used to be written `property <name>\n{ ... }` -- a
            //  keyword-prefixed named block, which is NOT a form any dict
            //  parser in this project accepts.  Measured: the GUI's shared
            //  parser refuses the file outright ("expected ';' after word
            //  value of 'property'"), and `bin/curate/promote-from-dossier`
            //  hand-rolls a regex under a comment saying that "a parser here
            //  would be a second implementation of one Choupo already has" --
            //  the principle stated and, of necessity, not followed.  So the
            //  dossier was a work record NOTHING could read back, which is why
            //  the Explorer's inspector said "no dossier is attached" about
            //  components that have three.
            //
            //  A LIST, NOT A KEYED BLOCK, and curate01 is why.  It curates
            //  `vapourPressure` TWICE -- once validated, once
            //  validationRefused -- and that contrast is the whole point of
            //  the witness.  Written as `<name> { ... }` the property name is
            //  a dict KEY, so the second entry silently replaces the first and
            //  the half a reader most needs to see is the half that
            //  disappears.  A list keeps both, and each entry names its own
            //  property.  The entries sit at column 0 so the indentation
            //  INSIDE them is unchanged -- two other gates check for
            //  exact-spacing substrings, and shifting every line would break
            //  them for no gain.
            f << "{\n"
              << "    property       " << r->property << ";\n";
            f << "    operation      " << r->opName
              << ";   // type " << r->opType << "\n";
            f << "    model          \"" << r->model << "\";\n";
            f << "    verdict        " << r->verdict << ";\n";
            if (!r->refusal.empty())
                f << "    refusal        \"" << r->refusal << "\";\n";

            f << "\n    fittedParameters\n    {\n";
            for (std::size_t i = 0; i < r->parameters.size(); ++i)
            {
                const auto& [k, v] = r->parameters[i];
                const scalar se = i < r->parameterStdErr.size()
                                      ? r->parameterStdErr[i]
                                      : std::numeric_limits<scalar>::quiet_NaN();
                if (std::isfinite(se) && se > 0.0 && std::isfinite(v))
                    f << "        " << k << "  " << fixedAtErrorDigit(v, se)
                      << ";   // +/- " << fixedAtErrorDigit(se, se) << " (1 sigma, from the fit)\n";
                else
                    f << "        " << k << "  "
                      << (r->parameterStdErr.empty() ? sigString(v, 12)
                                                     : sigString(v, kSigDigits + 1))
                      << ";\n";
            }
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
            writeEvidenceSets(f, "fit", r->fitSets, "        ");
            writeEvidenceSets(f, "validation", r->validationSets, "        ");
            f << "        );\n";
            //  THE COORDINATE IS DECLARED, NOT WORN AS A UNIT SUFFIX.
            //  This used to write `min 0.05 x1;`, putting the domain's
            //  variable NAME where the grammar expects a unit -- so the
            //  parser refused the file with "unknown unit suffix 'x1'".
            //  `x1` is a mole fraction: dimensionless, and a label for WHICH
            //  coordinate the interval is on.  It gets its own key, which is
            //  also the more honest statement.
            f << "\n        domain\n        {\n"
              << "            coordinate  " << r->domainUnit << ";\n"
              << "            fit         { min " << r->fitMin
              << "; max " << r->fitMax << "; n "
              << r->nFit << "; }\n";
            if (r->nValidation > 0)
                f << "            validation  { min " << r->valMin
                  << "; max " << r->valMax << "; n "
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
                f << "        rmsHeldOut        " << sigString(r->rmsHeldOut, kSigDigits)
                  << ";   // " << r->rmsUnit << ", on evidence the fit never saw\n";
                f << "        aadHeldOutPct     " << sigString(r->aadHeldOutPct, kSigDigits) << ";\n";
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
        f << ");\n";
        written.push_back(path);
    }
    return written;
}

} // namespace Choupo
