/*---------------------------------------------------------------------------*\
  ThermoAnnounce -- the LOAD-phase announcement gate.

  THE CONVENTION (glass-box announcements, one rule):
    * std::cout  = pedagogical announcements -- WHAT PHYSICS IS ACTIVE
      ([builder], [henry], [eos], 'Property package:', VLE-world lines).
    * std::cerr  = warnings and advisories only.

  The controlDict `verbosity` contract (0 silent ... 4 debug) must hold for
  the LOAD phase as well as the solve phase: before this gate existed a
  verbosity-0 run still emitted the whole thermo-assembly chorus.  Every
  load-time announcement is therefore gated at thermoAnnounce() -- the SAME
  >= 2 threshold the flash uses for its seed announcement.  Hard warnings
  and refusals stay UNGATED (no silent crutch).

  Each application main sets the level right after reading controlDict; the
  default (3, the pedagogical default) keeps every other entry path loud.

  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include <set>
#include <string>

#ifndef CHOUPO_THERMO_ANNOUNCE_H
#define CHOUPO_THERMO_ANNOUNCE_H

namespace Choupo {

// The mutable level (set once per run from controlDict.verbosity).
inline int& thermoAnnounceLevel()
{
    static int level = 3;
    return level;
}

// True when a load-time pedagogical announcement should print.
inline bool thermoAnnounce(int atLeast = 2)
{
    return thermoAnnounceLevel() >= atLeast;
}

// ONCE-PER-RUN gate (round-3 fix S3): a sweep/recycle reloads components on
// every pass, and the [overlay]/[shadowed] lines repeated until they read as
// noise -- the student stops reading announcements, which defeats them.  The
// FIRST announcement of a given key prints; repeats stay silent.  The load
// remains loud exactly once, per run, per fact.
inline bool announceOnce(const std::string& key)
{
    static std::set<std::string> seen;
    return seen.insert(key).second;
}

} // namespace Choupo

#endif
