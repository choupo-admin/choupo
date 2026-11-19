/* Copyright (C) 2026 Vítor Geraldes */
/*  SPDX-License-Identifier: GPL-3.0-or-later
    Part of Choupo (GPL-3.0-or-later); see NOTICE and AUTHORS.

    PairByName -- a binary pair is FOUND BY NAME, as a component is
    (DEV.md 4c C433, Vitor 2026-11-18: "porque tens o link dos binarios e nao
    tens o link dos componentes?"; "Se houver excecao, os parametros tem de
    ficar na pasta em que isso acontece!").

    A pair's address is never written in a case.  The case names the pair --
    `<i>-<j> { }` in a binaryParameters / binaryInteractions block, or no entry
    at all under a Henry `solutes` group -- and the record is found by
    (model, i, j) through ONE cascade, nearest first:

        1. the owning node's folder       <base>/constant/parameters/<Model>/
        2. the case, and every level of it  constant/parameters/<Model>/
        3. the catalogue                  data/standards/parameters/<Model>/
        4. the private tier               data/local/parameters/<Model>/

    A STRICTLY sealed case reads levels 1-2 only (the catalogue is forbidden).
    An exception to the catalogue is a RECORD IN THE CASE'S OWN FOLDER, which
    declares itself as a component overlay does (`variationOf <name>;` with a
    `variationReason`, checked by records::checkLocalShadow), never a path
    elsewhere.

    This header holds the pure lookup (no printing, no announcing): the caller
    prints the file read and its LEVEL, and refuses with refusalText() the
    pair no level holds, naming the file it looked for in each level.
*/
#pragma once

#include "thermo/Database.H"
#include "thermo/RecordResolver.H"

#include <algorithm>
#include <filesystem>
#include <string>
#include <vector>

namespace Choupo {
namespace pairname {

namespace fs = std::filesystem;

struct Hit
{
    fs::path    file;     // the record the run reads
    std::string level;    // "case" | "catalogue" | "local"
    std::string shown;    // the path as the run prints it
};

//  The pair key `<i>-<j>` split at its FIRST dash that separates two
//  component names (component names may carry dashes only in rare cases; the
//  record's own `components` list is the authority once it is read).
inline std::string swappedKey(const std::string& key)
{
    const std::size_t d = key.find('-');
    if (d == std::string::npos) return key;
    return key.substr(d + 1) + "-" + key.substr(0, d);
}

//  The file names a pair key may have, preferred first.  The activity
//  catalogues (NRTL / UNIQUAC / Wilson) name a record alphabetically, so the
//  key spelled either way finds it; every other catalogue (Henry: solute-
//  solvent; kij) is as written first, the swapped spelling second.
inline std::vector<std::string> fileNames(const std::string& model,
                                          const std::string& key)
{
    const std::string sw = swappedKey(key);
    const bool sorted = model == "NRTL" || model == "UNIQUAC"
                        || model == "Wilson";
    if (model == "Henry") return { key + ".dat" };   // solute-solvent, ordered
    std::vector<std::string> v;
    if (sorted)
        v.push_back((key < sw ? key : sw) + ".dat");
    else
    {
        v.push_back(key + ".dat");
        if (sw != key) v.push_back(sw + ".dat");
    }
    return v;
}

//  Does the catalogue hold a records directory for this model at all?
inline bool hasCatalogue(const std::string& model)
{
    return fs::is_directory(records::standardsRecord("parameters/" + model));
}

inline std::string relTo(const fs::path& p, const fs::path& base)
{
    std::error_code ec;
    const fs::path r = fs::relative(p, base, ec);
    return (ec || r.empty()) ? p.string() : r.string();
}

//  The directories of the case's own levels for one model, nearest first.
inline std::vector<fs::path> caseDirs(const std::string& model,
                                      const std::string& nodeBase)
{
    std::vector<fs::path> dirs;
    const std::string sub = "parameters/" + model;
    if (!nodeBase.empty())
        dirs.push_back(fs::path(nodeBase) / "constant" / sub);
    for (const auto& d : records::localScanDirs(sub))
        if (std::find(dirs.begin(), dirs.end(), d) == dirs.end())
            dirs.push_back(d);
    return dirs;
}

//  Find the pair; `looked` (if given) receives one line per level, each with
//  the file name looked for there.  Returns false when no level holds it.
inline bool find(const std::string& model, const std::string& key,
                 const std::string& nodeBase, Hit& out,
                 std::vector<std::string>* looked = nullptr)
{
    const auto names = fileNames(model, key);
    const std::string sub = "parameters/" + model + "/";
    const fs::path cwd = fs::current_path();
    for (const auto& d : caseDirs(model, nodeBase))
        for (const auto& n : names)
        {
            if (looked) looked->push_back("case level: " + relTo(d / n, cwd));
            if (fs::exists(d / n))
            {
                out = { d / n, "case", relTo(d / n, cwd) };
                return true;
            }
        }
    if (looked && caseDirs(model, nodeBase).empty())
        looked->push_back("case level: constant/" + sub + names[0]
                          + " (no such folder in the case)");
    if (records::sealedStrict())
    {
        if (looked)
            looked->push_back("catalogue and local: FORBIDDEN (the case is"
                              " sealed; its own constant/" + sub
                              + " is the whole closure)");
        return false;
    }
    for (const auto& n : names)
    {
        const fs::path f = records::standardsRecord(sub + n);
        if (looked) looked->push_back("catalogue: data/standards/" + sub + n);
        if (fs::exists(f))
        {
            out = { f, "catalogue", "data/standards/" + sub + n };
            return true;
        }
    }
    const fs::path root = Database::currentRoot();
    for (const auto& n : names)
    {
        const fs::path f = root / "local" / sub / n;
        if (looked) looked->push_back("local: data/local/" + sub + n);
        if (fs::exists(f))
        {
            out = { f, "local", "data/local/" + sub + n };
            return true;
        }
    }
    return false;
}

inline std::string refusalText(const std::string& who, const std::string& model,
                               const std::string& key,
                               const std::vector<std::string>& looked)
{
    std::string s = who + ": " + model + " pair '" + key + "' is held by NO level"
        " of the cascade.  Looked for:";
    for (const auto& l : looked) s += "\n    " + l;
    const auto n = fileNames(model, key);
    s += "\n  A pair is found by name, never by a path written in the case."
         "  Put the pair's record in the case's own folder as"
         " constant/parameters/" + model + "/" + n[0] + " (recordType"
         " binaryInteractionParameters, a `parameters` block and a"
         " `provenance` block naming the source), or curate it in the"
         " catalogue.";
    return s;
}

}} // namespace Choupo::pairname
