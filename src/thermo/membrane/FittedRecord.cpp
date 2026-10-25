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

#include "FittedRecord.H"

#include "core/Advisory.H"
#include "core/DictCanonical.H"
#include "core/Dictionary.H"
#include "core/Sha256.H"

#include <filesystem>
#include <iostream>
#include <stdexcept>

namespace Choupo {
namespace membraneFit {

namespace fs = std::filesystem;

std::string fitBlockSha256(const std::string& propsDictPath,
                           const std::string& opName,
                           const std::string& who)
{
    if (!fs::exists(propsDictPath))
        throw std::runtime_error(who + ": '" + propsDictPath + "' does not exist, so the"
            " operation '" + opName + "' that fitted this record cannot be read back --"
            " a fitted record is checked against the fit block that wrote it.");
    auto d = Dictionary::fromFile(propsDictPath);
    if (!d->hasDictList("operations"))
        throw std::runtime_error(who + ": '" + propsDictPath + "' declares no"
            " `operations ( ... )` -- the operation '" + opName + "' is not there.");
    for (const auto& op : d->lookupDictList("operations"))
        if (op->lookupWordOrDefault("name", "") == opName)
            return sha256::hex(canonical::dump(*op));
    throw std::runtime_error(who + ": '" + propsDictPath + "' holds no operation named '"
        + opName + "' -- the fit that wrote this record is no longer in the case.");
}

std::string fileSha256(const std::string& path, const std::string& who)
{
    if (!fs::exists(path))
        throw std::runtime_error(who + ": '" + path + "' does not exist.");
    return canonical::sha256OfFile(path);
}

std::string recordValuesSha256(const DictPtr& record)
{
    DictPtr d = record->deepCopy();
    d->erase("fit");
    return sha256::hex(canonical::dump(*d));
}

std::string caseRootOf(const std::string& recordPath)
{
    //  <root>/constant/assets/<name>.dat -> <root>
    const fs::path p = fs::absolute(recordPath);
    return p.parent_path().parent_path().parent_path().string();
}

void verifyFresh(const Membrane& m, const std::string& recordPath,
                 const std::string& baseRecordPath)
{
    const auto& f = m.fit();
    if (!f.present) return;
    const std::string who = "membrane record '" + m.name() + "' (" + recordPath + ")";
    const fs::path root = caseRootOf(recordPath);
    const std::string remedy =
        "\n  Process mode does not use a stale fit in silence.  Remedy: run the case in"
        " Properties mode -- `runCase " + root.string() + " props` -- which re-runs"
        " operation '" + f.operation + "', re-fits the parameters to the data the case"
        " holds NOW and rewrites the record; then run Process mode again.";
    auto stale = [&](const std::string& what, const std::string& path,
                     const std::string& was, const std::string& now)
    {
        throw std::runtime_error(who + " is a STALE FIT: it was fitted by Properties-mode"
            " operation '" + f.operation + "' of case '" + f.fittedInCase + "', and "
            + what + " '" + path + "' has changed since --\n    recorded sha256 " + was
            + "\n    current  sha256 " + now + remedy);
    };

    //  The record's own values: a hand edit of a fitted number is not the fit.
    {
        const std::string now = recordValuesSha256(Dictionary::fromFile(recordPath));
        if (now != f.recordSha256)
            throw std::runtime_error(who + " is NOT THE FIT ITS fit {} BLOCK DESCRIBES: its"
                " values were edited after operation '" + f.operation + "' wrote them --\n"
                "    recorded sha256 " + f.recordSha256 + "\n    current  sha256 " + now
                + "\n  A fitted value is the fit's, not a hand's.  Remedy: run the case in"
                  " Properties mode -- `runCase " + root.string() + " props` -- which rewrites"
                  " the record from the fit; to try a value of your own, write a separate"
                  " record (no fit {} block) and point the unit at it.");
    }
    //  The datasets, every role: a held-out set that moved changes the verdict.
    for (const auto& ds : f.datasets)
    {
        const fs::path p = root / ds.path;
        if (!fs::exists(p))
            throw std::runtime_error(who + " is a STALE FIT: its " + ds.role + " dataset '"
                + ds.path + "' is no longer in the case." + remedy);
        const std::string now = canonical::sha256OfFile(p.string());
        if (now != ds.sha256) stale("its " + ds.role + " dataset", ds.path, ds.sha256, now);
    }
    //  The fit block itself: a changed free parameter, band, partition or law.
    {
        const fs::path p = root / f.propsDict;
        if (!fs::exists(p))
            throw std::runtime_error(who + " was fitted by operation '" + f.operation
                + "' of " + f.propsDict + ", and this case carries no " + f.propsDict
                + " -- the fit that wrote it cannot be checked." + remedy);
        const std::string now = fitBlockSha256(p.string(), f.operation, who);
        if (now != f.fitBlockSha256)
            stale("the fit block of operation '" + f.operation + "' in", f.propsDict,
                  f.fitBlockSha256, now);
    }
    //  The base record whose values the fit held fixed.
    {
        if (baseRecordPath.empty())
            throw std::runtime_error(who + " holds the values of base record '" + f.baseRecord
                + "' fixed, and no membrane record of that name is loaded -- the fit"
                  " cannot be checked." + remedy);
        const std::string now = canonical::sha256OfFile(baseRecordPath);
        if (now != f.baseRecordSha256)
            stale("its base record " + f.baseRecord + ",", baseRecordPath,
                  f.baseRecordSha256, now);
    }

    //  FRESH: say which fit the run is using -- the link from the unit that
    //  reads the record to the Properties-mode operation that wrote it.
    const std::string line = "membrane '" + m.name() + "' is a FITTED record: operation '"
        + f.operation + "' of case '" + f.fittedInCase + "' (Properties mode) wrote it"
        + (f.verdict.empty() ? std::string() : ", held-out verdict " + f.verdict)
        + "; its fingerprints match -- " + std::to_string(f.datasets.size())
        + " dataset(s), the fit block, the base record " + f.baseRecord
        + " and the record's own values";
    if (AdvisoryLog::instance().addAnnouncedOnce("fittedRecord:" + m.name(), "provenance",
                                                 "info", "membrane '" + m.name() + "'", line))
        std::cout << "  [fitted] " << line << "\n";
}

} // namespace membraneFit
} // namespace Choupo
