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

#include "EvidencePartition.H"
#include "core/Units.H"

#include <algorithm>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  Unit conversion for a dataset column.  A local copy rather than a shared
//  utility ON PURPOSE for now: the same six lines already sit in four ops
//  (VleConsistency, Kinetics1D and -- until this slice -- the two fit ops),
//  and hoisting them is a separate cleanup with its own blast radius.  This
//  file removes two of the four; the remaining duplication is recorded, not
//  pretended away.
scalar convUnit(scalar v, const std::string& unit, const std::string& where)
{
    //  THE PASS-THROUGH LIST IS THE UNION OF THE TWO IMPLEMENTATIONS THIS
    //  REPLACES, and taking the union was not optional: the copy in
    //  VaporPressureFit passed only dimensionless spellings, while the copy in
    //  HeatCapacityFit also passed the molar-heat-capacity spellings (Choupo
    //  is numerically in J/(mol.K), so those are already canonical).  Folding
    //  the two into one reader is what revealed they had silently diverged --
    //  which is the argument for the fold, and the warning that a fold must
    //  take the union rather than pick a side.
    if (unit == "frac" || unit == "-" || unit == "[-]" || unit == "dimensionless")
        return v;
    if (unit == "J/(mol·K)" || unit == "J/mol/K" || unit == "J/molK"
        || unit == "J/(mol.K)")
        return v;
    auto spec = units::lookupUnit(unit);
    if (!spec)
        throw std::runtime_error(where + ": unknown unit '" + unit + "'");
    return spec->affine ? units::affineToK(v, unit) : v * spec->factor;
}

//  FNV-1a, 64-bit.  Drift detection for the declaration, not cryptography --
//  the same posture (and the same disclaimer) as the stream reader's
//  equilibrium fingerprint.  Written locally because the subject is different
//  and `propertyOps` must not reach into `streams` to borrow six lines.
std::string fnv1a(const std::string& s)
{
    std::uint64_t h = 1469598103934665603ULL;
    for (unsigned char c : s) { h ^= c; h *= 1099511628211ULL; }
    std::ostringstream os;
    os << std::hex << std::setw(16) << std::setfill('0') << h;
    return os.str();
}

std::string identityOf(const EvidenceDataset& d)
{
    return d.role + "|" + d.path + "|" + d.series + "|" + d.doi + "|" + d.sha256;
}

} // namespace

const char* EvidencePartition::refusalR1()
{
    return "VALIDATION REFUSED:\n"
           "No independent experimental evidence remains after fitting.";
}

EvidencePartition EvidencePartition::read(const DictPtr& opDict,
                                          const std::string& opLabel)
{
    EvidencePartition p;

    const bool hasEvidence = opDict->found("evidence");
    const bool hasLegacy   = opDict->found("dataset");

    //  Two authorities on one question.  No precedence rule was ever declared,
    //  so this is refused rather than resolved by inventing one.
    if (hasEvidence && hasLegacy)
        throw std::runtime_error(opLabel + ": AMBIGUOUS evidence specification"
            " -- an `evidence ( ... )` block is declared AND a bare `dataset`"
            " entry sits beside it.  Exactly ONE form is authoritative per"
            " operation: `evidence` engages the fit/held-out contract, the bare"
            " `dataset` is the legacy single-set form that claims no"
            " validation.  Move the legacy path into the evidence list with an"
            " explicit `role`, or delete the block.");

    if (!hasEvidence)
    {
        if (!hasLegacy)
            throw std::runtime_error(opLabel + ": no experimental evidence"
                " declared.  Give either `evidence ( { dataset \"...\"; role"
                " fit; } ... )` -- which engages the fit/held-out validation"
                " contract -- or the legacy single `dataset \"...\";`, which"
                " fits everything and claims no validation.");

        EvidenceDataset only;
        only.path   = opDict->lookupWord("dataset");
        only.series = opDict->lookupWordOrDefault("series", "");
        only.role   = "fit";
        p.fit_.push_back(only);
        p.engaged_ = false;
        p.fingerprint_ = fnv1a(identityOf(only));
        return p;
    }

    p.engaged_ = true;

    //  The acceptance band, if the author declared one.  Read BEFORE the
    //  datasets so it is unambiguously part of the pre-fit declaration.
    if (opDict->found("acceptance"))
    {
        auto acc = opDict->subDict("acceptance");
        if (!acc->found("maxAAD"))
            throw std::runtime_error(opLabel + ": `acceptance {}` is declared"
                " but carries no `maxAAD`.  A band with no number decides"
                " nothing; either state `maxAAD <x> percent;` or delete the"
                " block and let the run report the held-out residuals without"
                " claiming a verdict.");
        //  WHERE THE CRITERION CAME FROM (Vitor, 2026-08-11).  A band with no
        //  stated provenance is indistinguishable from a band chosen AFTER
        //  seeing the held-out residuals -- which is exactly the tuning the
        //  partition exists to prevent, arriving through the one number the
        //  partition does not fix.  So `origin` is MANDATORY whenever a band
        //  is declared, and it has no default: experimental uncertainty, a
        //  literature tolerance and a case-declared engineering criterion are
        //  different claims, and only the author knows which was meant.
        if (!acc->found("origin"))
            throw std::runtime_error(opLabel + ": `acceptance {}` declares a"
                " band but no `origin`.  A limit with no stated provenance"
                " cannot be told apart from one chosen after seeing the"
                " residuals -- state where it came from, e.g.\n"
                "          origin \"experimental uncertainty of the held-out"
                " set (Smith 1987, +/- 0.5 %)\";\n"
                "          origin \"engineering criterion declared by this"
                " case\";");
        p.acceptanceOrigin_ = acc->lookupWord("origin");
        if (p.acceptanceOrigin_.empty())
            throw std::runtime_error(opLabel + ": `acceptance.origin` is"
                " empty.  An empty provenance is not a provenance.");
        p.hasAcceptance_ = true;
        p.maxAADPct_ = acc->lookupScalar("maxAAD") * 100.0;   // fraction -> %
        if (p.maxAADPct_ <= 0.0)
            throw std::runtime_error(opLabel + ": `acceptance.maxAAD` must be"
                " positive; a band of zero or less can never be met and would"
                " make every validation fail for a reason that is not the"
                " model's.");
    }

    auto entries = opDict->lookupDictList("evidence");
    if (entries.empty())
        throw std::runtime_error(opLabel + ": `evidence ( )` is declared and"
            " empty.  An engaged contract with no evidence is not a fit with"
            " nothing held out -- it is no fit at all.");

    for (const auto& e : entries)
    {
        EvidenceDataset d;
        d.path   = e->lookupWord("dataset");
        d.series = e->lookupWordOrDefault("series", "");
        if (e->found("identity"))
        {
            auto id  = e->subDict("identity");
            d.doi    = id->lookupWordOrDefault("doi", "");
            d.sha256 = id->lookupWordOrDefault("sha256", "");
        }

        //  R2 -- `role` has NO default.  A defaulted role would make every
        //  dataset a fitting dataset, silently, and the in-sample problem
        //  would come back invisible.
        if (!e->found("role"))
            throw std::runtime_error(opLabel + ": evidence dataset '" + d.path
                + "' declares no `role`.  There is NO default: write `role"
                  " fit;` (the model is regressed against it) or `role"
                  " validation;` (it is held out and the fitter never sees"
                  " it).  A defaulted role would make every dataset a fitting"
                  " dataset and re-create an in-sample error reported as"
                  " validation.");
        //  The dataset's OWN provenance, read from the dataset file rather
        //  than re-declared in the case: the file is where a curator writes
        //  what the numbers are, and a second declaration beside the role
        //  would be a second home for the same fact.
        try
        {
            auto dsDict = Dictionary::fromFile(d.path);
            if (dsDict->found("provenance"))
            {
                auto pv = dsDict->subDict("provenance");
                d.provenanceSource = pv->lookupWordOrDefault("source", "");
                d.archiveFile      = pv->lookupWordOrDefault("archiveFile", "");

                //  The dataset's own DOI / hash FILL IN where the case
                //  declared none.  If BOTH declare and they DISAGREE, that is
                //  an identity conflict and is refused rather than resolved by
                //  an undeclared precedence -- the same posture R3 takes for a
                //  cross-role collision.  Silently preferring one would make
                //  the dossier cite a publication the evidence may not be from.
                const std::string dsDoi = pv->lookupWordOrDefault("doi", "");
                const std::string dsSha = pv->lookupWordOrDefault("sha256", "");
                if (!dsDoi.empty() && dsDoi != "none-declared")
                {
                    if (d.doi.empty()) d.doi = dsDoi;
                    else if (d.doi != dsDoi)
                        throw std::runtime_error(opLabel + ": evidence dataset '"
                            + d.path + "' declares doi '" + dsDoi + "' but the"
                            " case declares '" + d.doi + "'.  Two identities"
                            " for one dataset -- correct whichever is wrong"
                            " rather than letting the dossier cite a"
                            " publication the numbers may not come from.");
                }
                if (!dsSha.empty())
                {
                    if (d.sha256.empty()) d.sha256 = dsSha;
                    else if (d.sha256 != dsSha)
                        throw std::runtime_error(opLabel + ": evidence dataset '"
                            + d.path + "' declares a sha256 that differs from"
                            " the one the case declares.  A checksum conflict"
                            " is not a preference.");
                }
            }
            if (dsDict->found("system"))
            {
                const auto sys = dsDict->lookupWordList("system");
                for (std::size_t k = 0; k < sys.size(); ++k)
                    d.system += (k ? " + " : "") + sys[k];
            }
            if (dsDict->found("pressure"))
                d.pressure = std::to_string(dsDict->lookupScalar("pressure"))
                           + " Pa";
        }
        catch (const std::exception&)
        {
            //  Unreadable here is not fatal HERE: loadColumns opens the same
            //  file and refuses with the message that names the column
            //  problem.  Failing twice, differently, about one file would tell
            //  the author less, not more.
        }

        d.role = e->lookupWord("role");
        if (d.role != "fit" && d.role != "validation")
            throw std::runtime_error(opLabel + ": evidence dataset '" + d.path
                + "' declares `role " + d.role + ";` -- the only roles are"
                  " `fit` and `validation`.");

        (d.role == "fit" ? p.fit_ : p.validation_).push_back(std::move(d));
    }

    if (p.fit_.empty())
        throw std::runtime_error(opLabel + ": every declared dataset is held"
            " out -- there is nothing to fit.  At least one entry must carry"
            " `role fit;`.");

    //  R3 -- an identity collision across roles.  This is the ONE independence
    //  question a machine may settle, because it is a fact rather than a
    //  judgement: the same evidence cannot both train a model and test it.
    for (const auto& f : p.fit_)
        for (const auto& v : p.validation_)
        {
            const char* what = nullptr;
            std::string which;
            if (f.path == v.path)                          { what = "dataset path"; which = f.path; }
            else if (!f.sha256.empty() && f.sha256 == v.sha256) { what = "sha256";  which = f.sha256; }
            else if (!f.doi.empty()    && f.doi    == v.doi)    { what = "doi";     which = f.doi; }
            if (what)
                throw std::runtime_error(opLabel + ": the same evidence is"
                    " declared in BOTH roles -- identical " + std::string(what)
                    + " '" + which + "' appears as `role fit` ('" + f.path
                    + "') and as `role validation` ('" + v.path + "').  Data"
                      " used to fit a model cannot also test it; that is an"
                      " in-sample error wearing the name of a validation.");
        }

    //  Canonical, order-independent fingerprint of the declaration.
    std::vector<std::string> ids;
    for (const auto& d : p.fit_)        ids.push_back(identityOf(d));
    for (const auto& d : p.validation_) ids.push_back(identityOf(d));
    std::sort(ids.begin(), ids.end());
    std::string canon;
    for (const auto& s : ids) canon += s + "\n";
    //  The acceptance band is part of the frozen declaration: a fingerprint
    //  blind to it would let the band move after the residuals were seen.
    if (p.hasAcceptance_)
        canon += "acceptance|maxAAD=" + std::to_string(p.maxAADPct_) + "\n";
    p.fingerprint_ = fnv1a(canon);

    return p;
}

void EvidencePartition::requireNonEmptyValidation(std::size_t nSurviving,
                                                  const std::string& opLabel) const
{
    if (!engaged_ || validation_.empty()) return;   // R1 covers that case
    if (nSurviving > 0) return;

    //  R4.  A comparison against nothing is not a pass; it is a check that
    //  could not run, and a check that cannot run must not pass.
    throw std::runtime_error(opLabel + ": the held-out validation set is EMPTY"
        " after this operation's own domain filtering -- every declared"
        " validation point was rejected before it could be compared.  An empty"
        " comparison must never be reported as agreement.  Widen the validation"
        " evidence, or check that its units and column names are what this"
        " operation reads.");
}

const char* EvidencePartition::comparisonCaveat()
{
    //  Deliberately says what is NOT established.  A caveat that only praises
    //  the comparison teaches the student nothing about the boundary.
    return "  [comparison] agreement with measured data.  This does NOT"
           " establish that these data were independent of the fit that"
           " produced the parameters -- that is held-out validation, and it"
           " requires a declared FIT / HELD-OUT partition on the fit itself.";
}

void EvidencePartition::refuseOnNonFittingOp(const DictPtr& opDict,
                                             const std::string& opLabel,
                                             const std::string& whatItCompares)
{
    if (!opDict->found("evidence")) return;

    //  R5.  The op did not fit anything, so nothing was withheld FROM a fit,
    //  so the partition's central claim is unavailable to it -- not merely
    //  unproven.  Refuse the DECLARATION rather than silently ignoring it: a
    //  parsed-and-dropped block is the worst outcome, because the case then
    //  reads as though a held-out validation had been performed.
    throw std::runtime_error(opLabel + ": `evidence ( )` declares a FIT /"
        " HELD-OUT partition, but this operation performs no fit -- it "
        + whatItCompares + ".  Nothing here was withheld from a fit, so the"
        " partition has nothing to be a partition OF.\n"
        "        Comparison asks whether a model AGREES with data; held-out"
        " validation additionally establishes that those data were EXCLUDED"
        " from the fit being assessed.  This operation can make the first"
        " claim and not the second.\n"
        "        Remedy: use `validation { dataset \"...\"; }`, which is the"
        " comparison this operation already supports and which claims exactly"
        " what it does.  To make a held-out claim, the fit itself must carry"
        " the partition.");
}

void EvidencePartition::announce(const std::string& opLabel, int verbosity) const
{
    if (verbosity < 2) return;

    if (!engaged_)
    {
        std::cout << "  [evidence] " << opLabel << ": legacy single-dataset"
                     " form -- ALL points are fitted and NO validation is"
                     " claimed.\n";
        return;
    }

    std::cout << "  [evidence] " << opLabel << ": partition declared before"
                 " fitting (fingerprint " << fingerprint_ << ")\n";
    auto line = [](const char* role, const EvidenceDataset& d) {
        std::cout << "      " << role << " " << d.path
                  << (d.doi.empty() ? "" : "   doi " + d.doi)
                  << (d.provenanceSource.empty()
                        ? ""
                        : "   provenance " + d.provenanceSource) << "\n";
    };
    for (const auto& d : fit_)        line("FIT        ", d);
    for (const auto& d : validation_) line("HELD-OUT   ", d);

    //  A GENERATED DATASET SAYS SO IN THE RUN, not only in its header prose.
    //  curate01's two halves were synthetic from the day they were written and
    //  said so ONLY in a comment the parser discards -- which is the shape the
    //  2026-08-05 honesty slice named: a field the engine cannot see is a
    //  comment.  A reader must not have to open the file to learn that the
    //  evidence was never measured.
    std::size_t nSynthetic = 0;
    for (const auto& d : fit_)        if (d.provenanceSource == "synthetic") ++nSynthetic;
    for (const auto& d : validation_) if (d.provenanceSource == "synthetic") ++nSynthetic;
    if (nSynthetic > 0)
        std::cout << "      [provenance] " << nSynthetic << " dataset(s)"
                     " declare `source synthetic` -- GENERATED, not measured."
                     "  Any verdict below is a statement about the machinery,"
                     " never about physics.\n";

    //  The identity-level independence facts.  ANNOUNCED, never adjudicated:
    //  whether two studies are scientifically independent is a human
    //  judgement, and the engine states what it can observe and stops there.
    std::size_t unidentified = 0;
    for (const auto& d : fit_)        if (d.doi.empty()) ++unidentified;
    for (const auto& d : validation_) if (d.doi.empty()) ++unidentified;
    if (unidentified > 0)
        std::cout << "      [independence] " << unidentified << " dataset(s)"
                     " declare no DOI -- they cannot take part in the"
                     " cross-role identity check.\n";

    //  A shared publication WITHIN a role is not a collision (R3 already
    //  refused the across-role case), but it is worth the reviewer's eye:
    //  two datasets from one paper are one source.
    auto sharedWithin = [](const std::vector<EvidenceDataset>& s) {
        for (std::size_t i = 0; i < s.size(); ++i)
            for (std::size_t j = i + 1; j < s.size(); ++j)
                if (!s[i].doi.empty() && s[i].doi == s[j].doi) return true;
        return false;
    };
    if (sharedWithin(fit_) || sharedWithin(validation_))
        std::cout << "      [independence] two datasets in one role share a"
                     " DOI -- one publication, counted twice.  A finding for"
                     " the reviewer, not an error.\n";
}

std::vector<EvidencePoint>
EvidencePartition::loadColumns(const EvidenceDataset& ds,
                               const std::vector<std::string>& xNames,
                               const std::vector<std::string>& yNames,
                               const std::string& opLabel)
{
    const std::string where = opLabel + " dataset '" + ds.path + "'";
    auto d    = Dictionary::fromFile(ds.path);
    auto cols = d->lookupDictList("columns");
    auto grid = d->lookupList("data");
    const std::size_t nc = cols.size();
    if (nc < 2 || grid.empty() || grid.size() % nc != 0)
        throw std::runtime_error(where + ": need >= 2 columns and a data grid"
            " whose length is a multiple of the column count.");

    int cx = -1, cy = -1;
    std::vector<std::string> unit(nc);
    for (std::size_t j = 0; j < nc; ++j)
    {
        const std::string name = cols[j]->lookupWord("name");
        unit[j] = cols[j]->lookupWord("unit");
        if (cx < 0 && std::find(xNames.begin(), xNames.end(), name) != xNames.end())
            cx = static_cast<int>(j);
        if (cy < 0 && std::find(yNames.begin(), yNames.end(), name) != yNames.end())
            cy = static_cast<int>(j);
    }
    auto join = [](const std::vector<std::string>& v) {
        std::string s; for (const auto& e : v) s += (s.empty() ? "" : " | ") + e; return s;
    };
    if (cx < 0 || cy < 0)
        throw std::runtime_error(where + ": needs a column named one of ["
            + join(xNames) + "] and one of [" + join(yNames) + "].");

    const std::size_t N = grid.size() / nc;
    std::vector<EvidencePoint> out;
    out.reserve(N);
    for (std::size_t r = 0; r < N; ++r)
        out.push_back({ convUnit(grid[r * nc + cx], unit[cx], where),
                        convUnit(grid[r * nc + cy], unit[cy], where) });
    return out;
}

std::vector<EvidencePoint>
EvidencePartition::loadAll(const std::vector<EvidenceDataset>& sets,
                           const std::vector<std::string>& xNames,
                           const std::vector<std::string>& yNames,
                           const std::string& opLabel)
{
    std::vector<EvidencePoint> all;
    for (const auto& s : sets)
    {
        auto pts = loadColumns(s, xNames, yNames, opLabel);
        all.insert(all.end(), pts.begin(), pts.end());
    }
    return all;
}

} // namespace Choupo
