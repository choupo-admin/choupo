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
    This file is part of Choupo.  GPL-3.0-or-later; see TypicalTrain.H.
\*---------------------------------------------------------------------------*/
/* SPDX-License-Identifier: GPL-3.0-or-later */

#include "postProcessing/layout/TypicalTrain.H"
#include "core/Dimensions.H"

#include <set>
#include <stdexcept>

namespace Choupo
{
namespace plantLayout
{
namespace typical
{

namespace
{

[[noreturn]] void refuse(const std::string& what)
{
    throw std::runtime_error("layoutDict typicals: " + what);
}

std::string text(const Dictionary& d, const std::string& key,
                 const std::string& where)
{
    if (!d.found(key))
        refuse(where + ": `" + key + "` is not declared (`" + key
               + " \"...\";`)");
    const std::string s = d.lookupWord(key);
    if (s.empty()) refuse(where + ": `" + key + "` is empty");
    return s;
}

} // namespace

std::vector<Group> read(const Dictionary& d)
{
    std::vector<Group> out;
    if (!d.found("typicals")) return out;
    if (!d.hasDictList("typicals"))
        refuse("`typicals` is a list of `{ typical \"<name>\"; index \"<word>\";"
               " count <n>; pitch { x <m>; y <m>; } members ( ... ); source"
               " \"...\"; reason \"...\"; }`");
    std::set<std::string> names, claimed;
    std::size_t n = 0;
    for (const auto& e : d.lookupDictList("typicals"))
    {
        ++n;
        Group g;
        const std::string w0 = "typicals entry " + std::to_string(n);
        g.name = text(*e, "typical", w0);
        const std::string w = "typical `" + g.name + "`";
        if (!names.insert(g.name).second) refuse(w + " is declared twice");
        g.index = text(*e, "index", w);
        if (!e->found("count"))
            refuse(w + ": `count` is not declared (the number of trains)");
        const scalar c = e->lookupScalar("count");
        if (c < 2 || c != static_cast<scalar>(static_cast<int>(c)))
            refuse(w + ": `count` is a whole number of trains, at least 2"
                   " (train 1 is the typical; one train is no repeat)");
        g.count = static_cast<int>(c);
        if (!e->found("pitch"))
            refuse(w + ": `pitch { x <m>; y <m>; }` is not declared (the step"
                   " from train k to train k + 1)");
        const auto p = e->subDict("pitch");
        for (const char* k : { "x", "y" })
            if (!p->found(k))
                refuse(w + ": `pitch` has no `" + k + "` (a length; `0 m` if"
                       " the trains do not step that way)");
        g.px = p->lookupScalar("x", Dims::length);
        g.py = p->lookupScalar("y", Dims::length);
        if (g.px == 0.0 && g.py == 0.0)
            refuse(w + ": the pitch is zero -- the trains would stand on one"
                   " another");
        if (!e->found("members"))
            refuse(w + ": `members ( ... );` is not declared (train 1's sized"
                   " items)");
        g.members = e->lookupWordList("members");
        if (g.members.empty()) refuse(w + ": `members` is empty");
        const std::string tail = g.index + "1";
        for (const auto& m : g.members)
        {
            if (m.size() <= tail.size()
                || m.compare(m.size() - tail.size(), tail.size(), tail) != 0)
                refuse(w + ": member `" + m + "` is not train 1's item -- its"
                       " id must end with `" + tail + "` (the `index` word and"
                       " the train number 1), so train k's id is the same with"
                       " `" + g.index + std::to_string(2) + "`...");
            if (!claimed.insert(m).second)
                refuse(w + ": member `" + m + "` is already a member of"
                       " another typical");
        }
        g.source = text(*e, "source", w);
        g.reason = text(*e, "reason", w);
        out.push_back(g);
    }
    return out;
}

std::string idOf(const Group& g, const std::string& member, int k)
{
    const std::size_t cut = member.size() - g.index.size() - 1;
    return member.substr(0, cut) + g.index + std::to_string(k);
}

std::vector<std::string> copiesOf(const Dictionary& layoutDict,
                                  const std::string& id)
{
    std::vector<std::string> out;
    for (const auto& g : read(layoutDict))
        for (const auto& m : g.members)
            if (m == id)
                for (int k = 2; k <= g.count; ++k) out.push_back(idOf(g, m, k));
    return out;
}

std::vector<std::string> withCopies(const Dictionary& layoutDict,
                                    const std::vector<std::string>& ids)
{
    std::vector<std::string> out;
    for (const auto& id : ids)
    {
        out.push_back(id);
        for (const auto& c : copiesOf(layoutDict, id)) out.push_back(c);
    }
    return out;
}

} // namespace typical
} // namespace plantLayout
} // namespace Choupo
