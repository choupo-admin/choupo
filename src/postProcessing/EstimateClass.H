/*---------------------------------------------------------------------------*\
    Choupo -- an educational process simulator
    Copyright (C) 2026 Vítor Geraldes and contributors (see AUTHORS)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
\*---------------------------------------------------------------------------*/
/*
  EstimateClass -- THE ONE HOME for the cost-estimate classification.

  WHY IT EXISTS.  The classification had TWO homes in this repository and they
  disagreed without anything noticing: `docs/design-heuristics.md` carried a
  hand-written table putting -30/+50 against Class 5 and -20/+30 against
  Class 4, while `EconomicsPass` stamped Class 4 with -30/+50.  Worse, the
  engine's half was not a table at all but a TWO-BRANCH STEP whose comparison
  was INVERTED --

      acc_lo = (estimateClass <= 4) ? -30.0 : -15.0;

  -- so the CRUDEST class (5, concept screening) printed the NARROWEST band,
  and Classes 1 through 4 all printed the same one.  A definitive
  quote-based estimate and a feasibility study published the same interval of
  confidence.  No case in the corpus reaches the class-5 branch, which is why
  nobody saw it: a branch no case reaches is a branch no golden can pin.

  THE SOURCE.  AACE International Recommended Practice No. 18R-97, "Cost
  Estimate Classification System -- As Applied in Engineering, Procurement,
  and Construction for the Process Industries", Table 1 of the August 7, 2020
  revision (the February 2, 2005 revision carries the identical five accuracy
  pairs).  18R-97 is an addendum to the generic RP 17R-97.  Reading of both
  revisions, with the transcription and what moved between them:
  docs/design/how-a-process-design-is-staged.md 1.

  IT IS A RANGE OF RANGES, AND THE PHRASE IS THE STANDARD'S.  A Class 4
  estimate does NOT have "the accuracy -30/+50".  It has AN accuracy somewhere
  in [-15, -30] low and [+20, +50] high, and which point of that box it lands
  on is a property of THIS project rather than of the class -- the standard
  names the three drivers as technological complexity, the quality of
  reference information, and an appropriate contingency determination, and
  says the range "should always be determined through risk analysis of the
  specific project and should never be pre-determined".

  SO THE ENGINE DOES NOT PRE-DETERMINE ONE.  A case DECLARES its band
  (`accuracyBand ( lo hi );` in the economics dict) and nothing is announced,
  because a declared value is the author's; absent a declaration the engine
  uses the class's PESSIMISTIC CORNER and ANNOUNCES that it did, naming the
  standard's own rule -- the 2026-09-06 posture, where a default that is USED
  is announced and silence keeps meaning "nothing was assumed".  The corner is
  the honest default because understating an interval of confidence is the
  one direction in which the error is not conservative.

  THE BANDS OVERLAP ACROSS CLASSES, deliberately, and that is the standard's
  own finding rather than a defect of this table: a Class 5 estimate of a
  repeat project with good cost history may be as accurate as a Class 3
  estimate of a project involving new technology.  A reader must not infer a
  ranking of projects from a ranking of classes.

  THE CONFIDENCE BASIS IS ITSELF A REVISABLE CONVENTION.  The 2005 revision
  states the bands after contingency at a 50 % level of confidence, "typically
  ... a 90 % confidence that the actual cost will fall within the bounds";
  the 2020 revision's own column heading says "at an 80 % confidence
  interval".  The band carried here is the 2020 one, and this paragraph is why
  the number is not a guarantee.
*/

#ifndef Choupo_EstimateClass_H
#define Choupo_EstimateClass_H

#include <string>
#include <vector>

#include "core/Types.H"

namespace Choupo
{
namespace estimateClass
{

struct Row
{
    int          cls;            // 5 (least defined) .. 1 (most defined)
    scalar       maturityLo;     // % of complete project definition
    scalar       maturityHi;
    scalar       accLoNarrow;    // L range: the OPTIMISTIC end, e.g. -15
    scalar       accLoWide;      // L range: the PESSIMISTIC end, e.g. -30
    scalar       accHiNarrow;    // H range: the OPTIMISTIC end, e.g. +20
    scalar       accHiWide;      // H range: the PESSIMISTIC end, e.g. +50
    const char*  endUsage;
    const char*  methodology;
};

//  AACE 18R-97 Table 1 (rev. 2020-08-07), transcribed.  Ordered as the
//  standard prints it: least-defined first.
inline const std::vector<Row>& table()
{
    static const std::vector<Row> t = {
        {5, 0.0,   2.0,  -20.0, -50.0, +30.0, +100.0,
         "Concept screening",
         "Capacity factored, parametric models, judgment, or analogy"},
        {4, 1.0,  15.0,  -15.0, -30.0, +20.0,  +50.0,
         "Study or feasibility",
         "Equipment factored or parametric models"},
        {3, 10.0, 40.0,  -10.0, -20.0, +10.0,  +30.0,
         "Budget authorization or control",
         "Semi-detailed unit costs with assembly level line items"},
        {2, 30.0, 75.0,   -5.0, -15.0,  +5.0,  +20.0,
         "Control or bid/tender",
         "Detailed unit cost with forced detailed take-off"},
        {1, 65.0, 100.0,  -3.0, -10.0,  +3.0,  +15.0,
         "Check estimate or bid/tender",
         "Detailed unit cost with detailed take-off"},
    };
    return t;
}

//  The registered classes, for a refusal message.  A declared number the
//  engine dispatches on must refuse a number it does not know (2026-09-07):
//  the old code took `estimateClass <= 4` and so accepted 0, 9 or -3 in
//  silence, selecting a branch by arithmetic accident.
inline std::string registered()
{
    std::string s;
    for (const Row& r : table())
    {
        if (!s.empty()) s += ", ";
        s += std::to_string(r.cls);
    }
    return s;
}

inline const Row* find(int cls)
{
    for (const Row& r : table())
        if (r.cls == cls) return &r;
    return nullptr;
}

}   // namespace estimateClass
}   // namespace Choupo

#endif
