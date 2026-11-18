/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::sampleBehaviour

Description
    A SAMPLE'S BEHAVIOUR HAS ONE HOME (docs/design/measured-facts-materials-
    and-flow-curves.md, rule R6; Wakeman & Tarleton, Solid/Liquid Separation:
    Principles of Industrial Filtration, Elsevier 2005, chapter 4).

    What a filter cake does is not a property of a phase state: it is a
    property of a SYSTEM under a test (the suspension, with its pH,
    flocculant and age, and the medium it was filtered on).  So it does not go
    through the liquid-property door.  A unit names the dataset
    (`sample <name>;` in its `operation`) and asks THIS ONE SERVICE for the
    quantities its model needs, at the state it works at; the answer carries
    the values, the METHOD that produced them and the SUPPORT STATUS, and the
    numbers never live in the unit's dictionary (two filters on one slurry
    name one file).

    THE RECORD is `constant/experiments/<name>.dat` of the case (the grammar
    of the experiments reader, extended; design section 2):

        provenance { citation "<source, table, page>";
                     kind measured|adopted|estimated;            (R3, required)
                     basis "<what the source says the value is>"; }
        property   filtrationTest;
        subject    { suspension "..."; medium "..."; }           (what it is OF)
        conditions { <anything the test held fixed: pH, flocculant, age,
                      solids concentration, temperature ...>; }  (R4: printed
                                                                  beside every
                                                                  number taken)
        tests ( { pressureDrop; area; solidsMassFraction; wetToDryRatio;
                  filtrateViscosity; filtrateDensity;
                  linearRegion { fromRow; toRow; reason; }
                  columns ( {name t; unit s;} {name V; unit m3;} );
                  data ( ... raw rows, as measured ... ); } ... );   (measured)
     OR stated { specificResistance | (alpha0 compressibility);
                 mediumResistance; wetToDryRatio; }        (adopted/estimated)
        authorised { pressureDrop (lo hi); rule nearest; reason "..."; }  (R2)

    METHOD, MEASURED.  Per test, the line t/V = (K/2) V + B through the rows
    of the declared linear region (V > 0), by least squares:
        c     = rho_f s / (1 - m s)                      (W&T Ex 4.1, p. 122)
        alpha = 2 A^2 dp slope / (c mu)                  (W&T Ex 4.1, p. 122)
        R     = A dp intercept / mu                      (W&T Ex 4.1, p. 123)
    alpha is an AVERAGE at that pressure and R is the medium's at it; both are
    DERIVED from the stored rows (R1) and never stored.  Between tested
    pressures alpha follows the power law through the two neighbouring tests,
    R and m are linear in the pressure drop; the power law alpha = a dp^n
    through all tests is printed as a DERIVED VIEW with its residuals (two
    fits of one dataset are two views of one fact, W&T Example 4.2) and is
    not what the answer uses.  The support is the pressures tested; the
    authorised domain, when wider, is stood on the nearest test's values and
    ANNOUNCED as a constant-property approximation; outside the authorised
    domain the service REFUSES.  A stated record has no rows, so it has no
    support: its `authorised` domain is required, and its law is evaluated
    inside it.

    OTHER KINDS (not built): the service is keyed by the record's `property`
    word; each kind is one function over the same Answer shape (values by
    name, method, support, the printed account).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {
namespace sampleBehaviour {

//- The shape every kind answers in: the values by name (SI), the rule that
//  produced them, where the state sits against the record's domains, the
//  printed account (one line each) and the announcements a unit should put on
//  the advisory log.
struct Answer
{
    std::string                    sample;          // the record's name
    std::string                    property;        // "filtrationTest"
    std::string                    kind;            // measured | adopted | estimated
    std::string                    citation;
    std::string                    basis;
    std::string                    method;          // how the values were obtained
    std::string                    supportStatus;   // inSupport | extended | noRows
    std::map<std::string, scalar>  values;
    std::vector<std::string>       account;
    std::vector<std::string>       announcements;
    scalar value(const std::string& key) const;     // throws naming the key
    bool   has(const std::string& key) const { return values.count(key) > 0; }
};

//- Ask the filtration-test record `sample` for the cake and medium resistance
//  and the wet-to-dry ratio at the pressure difference `dp` [Pa].  `who`
//  names the asking unit in a refusal.  Values: specificResistance [m/kg],
//  mediumResistance [1/m], wetToDryRatio [-], and, when the record states a
//  power law, alpha0 [m/kg/Pa^s] and compressibility [-].
Answer filtrationAt(const std::string& sample, scalar dp, const std::string& who);

//- A unit that asks this service must not carry the numbers in its own
//  `operation`: refuse, by name and with the line to write, any of the
//  sample's words in `operation` or any block inside it.
void refuseTypedSampleNumbers(const DictPtr& operDict, const std::string& who,
                              const std::string& unitKind);

} // namespace sampleBehaviour
} // namespace Choupo
