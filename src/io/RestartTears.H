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
    Choupo::restartTears

Description
    THE EXACT RESTART RECORD OF THE RECYCLE LOOP (opt-in: `choupoSolve
    --restart-tears <case>`).

    WHAT IS STORED.  The tear values x_k the recycle solver ENTERED its last
    pass with -- NOT the tear streams of `converged/`, which hold G(x_k), the
    sweep's OUTPUT, written to ten digits in kmol/h.  Each double is written
    in C99 hexadecimal floating point (`%a`), so the value read back is the
    bit pattern written: the identity of the stored value is exact.

    WHERE.  `<case>/converged.restart`, a file BESIDE `converged/` (which the
    writer deletes and rewrites on every run, and whose text this record
    never touches).

    WHEN IT IS TRUSTED.  The record names (1) the build that wrote it (the
    bytes of the executable and of every shared library next to it), (2) the
    inputs the solve read (every file of the case except its outputs and
    `system/layoutDict`, `system/postDict`, which act after the solve, plus
    the `system/` and `constant/` of up to six parent folders, the cascade),
    and (3) the identity of the thermophysical package the run assembled
    (which covers the catalogue records the assembly resolved).  A record
    whose three do not equal the present run's is REFUSED BY NAME and the run
    solves in full, announced: the flag is a speed aid and never a way to fail
    a case that the plain command solves.

    WHAT IT DOES NOT PROMISE.  The tears are the loop's only coordinate, but a
    unit may seed an inner iteration from an outlet a previous sweep left; the
    restarted final pass starts those cold.  The result is then exact only
    where no unit does so.  That is MEASURED by the caller (the layout gates
    compare a restarted run with the full one, file by file) and never assumed.

    Hash: two FNV-1a 64-bit lanes (not cryptographic; it guards against an
    accidental edit, not an adversary).

SourceFiles
    RestartTears.cpp

\*---------------------------------------------------------------------------*/

#ifndef Choupo_RestartTears_H
#define Choupo_RestartTears_H

#include "core/Types.H"
#include "streams/ProcessStream.H"

#include <filesystem>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo
{
namespace restartTears
{

/// The state a recycle loop restarts from.
struct Record
{
    std::string binaryHash;        ///< the build that wrote it
    std::string inputHash;         ///< what the solve read
    std::string packageIdentity;   ///< the assembled thermophysical package
    std::string solver;            ///< the solver that converged
    bool        converged = false;
    scalar      residual  = 0.0;
    int         iteration = 0;
    /// per tear: F, T, P, vf, z, s -- the values ENTERING the final pass
    std::map<std::string, ProcessStream> tears;
};

/// The conventional file next to `converged/`.
std::filesystem::path recordPath(const std::filesystem::path& caseDir);

/// Hash of the inputs the solve reads (see the class comment).
std::string hashInputs(const std::filesystem::path& caseDir);

/// Hash of the running executable and of the shared libraries beside it;
/// empty if the platform does not let the process read them (no restart).
std::string hashBinary();

/// Write `r` to `path` (hexfloat).  False if the file cannot be written.
bool write(const std::filesystem::path& path, const Record& r);

/// Read `path`.  False with `why` if absent or malformed.
bool read(const std::filesystem::path& path, Record& r, std::string& why);

/// Seed `streams` (the flowsheet's tear streams, named in `tears`) from `r`,
/// bit for bit.  Returns the reason the record does not fit, or "" when it was
/// applied.  `instantsWritten`: the run writes iteration instants, which a
/// restart would not produce, so it is refused.
std::string seed(const Record& r, const std::vector<std::string>& tears,
                 std::map<std::string, ProcessStream>& streams,
                 bool instantsWritten);

/// One run's use of the flag.  Inactive (a no-op) when `caseDir` is empty.
/// Active: hashes the inputs and the build, reads the record next to the case
/// and TRUSTS it only if build, inputs and package identity all equal this
/// run's -- any difference is named on stdout (`[restart] ...`) and the run
/// solves in full.  After a converged full solve `finish` writes the record
/// the solver handed to `hook()`.
class Session
{
public:
    Session(const std::filesystem::path& caseDir,
            const std::string& packageIdentity, bool eligible);
    /// the trusted record, or null
    std::shared_ptr<const Record> record() const { return record_; }
    /// what the solver calls once at its final pass (empty when inactive)
    std::function<void(Record&)> hook();
    /// write the kept record (a converged FULL solve only)
    void finish(bool converged);

private:
    std::filesystem::path         dir_;
    std::string                   package_, inputHash_, binaryHash_;
    std::shared_ptr<const Record> record_;
    Record                        kept_;
    bool                          haveKept_ = false;
};

} // namespace restartTears
} // namespace Choupo

#endif
