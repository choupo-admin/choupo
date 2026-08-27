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
    This file is part of Choupo.  See DictAudit.H for the full notice.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "core/DictAudit.H"

#include <set>

#include <algorithm>
#include <iostream>
#include <vector>

namespace Choupo {
namespace dictAudit {

std::size_t editDistance(const std::string& a, const std::string& b)
{
    //  Two rows, not a full matrix: the distance is all that is wanted, never
    //  the alignment.
    const std::size_t n = a.size(), m = b.size();
    if (n == 0) return m;
    if (m == 0) return n;
    std::vector<std::size_t> prev(m + 1), cur(m + 1);
    for (std::size_t j = 0; j <= m; ++j) prev[j] = j;
    for (std::size_t i = 1; i <= n; ++i)
    {
        cur[0] = i;
        for (std::size_t j = 1; j <= m; ++j)
        {
            const std::size_t sub = prev[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1);
            cur[j] = std::min({ prev[j] + 1, cur[j - 1] + 1, sub });
        }
        prev = cur;
    }
    return prev[m];
}

std::vector<Finding> audit(const Dictionary& d, const std::string& where)
{
    std::vector<Finding> out;
    const auto absent = d.askedButAbsent();

    for (const auto& key : d.unreadKeys())
    {
        Finding f;
        f.where = where;
        f.key   = key;

        //  The suggestion comes from what the CODE looked for and did not
        //  find -- never from a hand-kept list of legal names, which would be
        //  a second home for a fact the code already states by reading it.
        std::size_t best = std::string::npos;
        for (const auto& cand : absent)
        {
            const std::size_t dst = editDistance(key, cand);
            //  Close enough to be a slip, not a different word.  A 3-letter
            //  key must match exactly-but-for-one; a long one gets more room,
            //  capped at 2 so `refluxRatio` is never "suggested" for `stages`.
            const std::size_t tol =
                std::min<std::size_t>(2, std::max<std::size_t>(1, key.size() / 3));
            if (dst <= tol && (best == std::string::npos || dst < best))
            {
                best = dst;
                f.suggestion = cand;
            }
        }
        //  No near miss: the key is not a typo of anything the code wanted,
        //  so the useful answer is the list of names it DID want.  See the
        //  header for why this is the case a bare complaint fails.
        if (f.suggestion.empty()) f.lookedFor = absent;
        out.push_back(f);
    }
    return out;
}

std::vector<Finding> auditTree(const Dictionary& d, const std::string& where)
{
    std::vector<Finding> out = audit(d, where);

    //  Which of this level's keys were reported unread?  A block among them
    //  is not descended into: see the header.
    std::set<std::string> unreadHere;
    for (const auto& f : out) unreadHere.insert(f.key);

    for (const auto& child : d.childDictsUnnoted())
    {
        //  `child.first` is the dotted path from THIS dict; the leading
        //  segment (before any `[i]`) is the key at this level.
        const std::string head = child.first.substr(0, child.first.find('['));
        if (unreadHere.count(head)) continue;

        const auto sub = auditTree(*child.second,
                                   where.empty() ? child.first
                                                 : where + " " + child.first);
        out.insert(out.end(), sub.begin(), sub.end());
    }
    return out;
}

int report(const std::vector<Finding>& findings, int verbosity)
{
    if (findings.empty() || verbosity < 1) return static_cast<int>(findings.size());

    std::string menuPrinted;
    std::cerr << "[dict] " << findings.size()
              << " key(s) written and never read -- they had NO effect on this"
                 " run:\n";
    for (const auto& f : findings)
    {
        std::cerr << "[dict]   " << f.where << ": `" << f.key << "`";
        if (!f.suggestion.empty())
            std::cerr << "  -- did you mean `" << f.suggestion << "`?  (the"
                         " model looked for that one and did not find it)";
        std::cerr << "\n";

        //  Once per BLOCK, not once per key: the menu is a property of the
        //  block's reader, and repeating it per finding would be the same
        //  fact stored twice on screen.
        if (f.suggestion.empty() && !f.lookedFor.empty()
            && f.where != menuPrinted)
        {
            menuPrinted = f.where;
            std::cerr << "[dict]     this block's reader looked for and did"
                         " not find:";
            for (const auto& a : f.lookedFor) std::cerr << " " << a;
            std::cerr << "\n[dict]     -- if one of those is what you meant,"
                         " it is the name to write.\n";
        }
    }
    //  Say what it COSTS, not just that it happened.  "Unused key" reads as
    //  tidiness; "the value you declared did nothing" is the actual news.
    std::cerr << "[dict] the run CONTINUES on the defaults -- a declared value"
                 " that nothing reads is a result you did not compute.\n";
    return static_cast<int>(findings.size());
}

} // namespace dictAudit
} // namespace Choupo
