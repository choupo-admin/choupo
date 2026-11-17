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
File
    src/thermo/transport/LiquidTransportDeclarations.H

Description
    WHAT A CASE DECLARES ABOUT TWO LIQUID TRANSPORT PROPERTIES BEYOND A MODEL
    WORD (DEV.md 4c C398, slice (d) and the architect's rulings on its first
    hand-back; Theory Guide sections "The liquid diffusivity a package
    returns" and "A measured liquid viscosity of a constituent set").

    (1) A STATED MIXTURE VISCOSITY (the grammar key is `measured`, as for the
        density pilot; what the value IS -- a measurement, an average, a
        representative value -- is the file's `provenance { basis }`, and the
        run prints it in those words).  In the property dictionary,

          transport { liquid { viscosity { measured
          {
              <name> { use method; reason "..."; }      // or `use check;`
          } } } }

        and the data in constant/experiments/<name>.dat:
          property liquidViscosity;  system ( a b );  solvent b;
          columns ( { name T; unit K; } { name mu; unit Pa.s; } { name w[a]; unit -; } );
          data ( ... );   box { T (lo hi); w[a] (lo hi); }
          provenance { citation "..."; }
        `mu` is required; `T` and the mass fractions `w[<c>]` are written
        when the source states them (a source that gives an average over
        its operating conditions states neither, and the file says so by
        leaving them out).  The box is the HARD extent the case stands the
        value over: T, and every constituent but the solvent.  This slice
        has no law to judge the box against the value's uncertainty, so a
        `reason` is ALWAYS required, and a value away from the stated
        point carries origin `assumed`.  A mixture datum for a constituent
        SET, on the density pilot's pattern (liquidProperty/Measured.H);
        a pure component's table of values is slice (c)'s, a law.

    (2) THE LIQUID DIFFUSIVITY THE PACKAGE RETURNS.

          transport { liquid { diffusivity
          {
              returns          effective;            // | infiniteDilution
              composition      { rule AndersonBabb; } // with `returns effective`
              infiniteDilution
              {
                  default { model WilkeChang; }
                  entries ( { solute methanol; solvent water; kind infiniteDilution;
                              experiments methanolInWater288; reason "..."; } );
              }
              thermodynamicFactor { take 1; }        // with `returns effective`
          } } }

        The old form `diffusivity { model WilkeChang; }` is refused by name with
        the line to write (DEV.md 4c C402: no legacy reader once no case uses it).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/transport/WilkeReduction.H"   // the Wilke reduction (C329 B2a), used by ThermoPackage
#include "core/Types.H"

#include <map>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class Component;

namespace liquidTransport {

// ---------------------------------------------------------------------------
//  (1) a measured mixture viscosity
// ---------------------------------------------------------------------------
struct MixtureMeasurement
{
    std::string name, use, reason, citation, where, solvent;
    std::string basis;                       // provenance.basis: what kind of value the source states
    std::string kind;                        // provenance.kind: measured | adopted | estimated ("" on a one-row record that states none)
    std::string property;                    // liquidViscosity | liquidThermalConductivity | surfaceTension
    bool   assumedValue = false;             // provenance.origin `assumed`: no primary read; the value is the case's own assumption, even at its stated point
    std::vector<std::size_t> set;            // package indices, ascending
    scalar mu = 0.0;                         // THE value of a one-row record (SI); of a table, its first row
    bool   hasT = false;
    scalar T    = 0.0;                       // K, when the source states it
    bool   hasP = false;
    scalar P    = 0.0;                       // Pa, when the source states it (not applied)
    std::map<std::string, scalar> w;         // stated mass fractions (incl. the solvent's rest), ONE-ROW record
    //  THE AUTHORISED DOMAIN (R2): what the case stands the value over.
    std::pair<scalar, scalar> boxT{0, 0};
    std::map<std::string, std::pair<scalar, scalar>> boxW;   // every constituent but the solvent
    std::string boxWord{"box"};              // the spelling the record used: `box` or `authorised`

    //  MANY ROWS (C421 slice (8), form 1).  One axis per declared column among
    //  T and w[<c>]: its distinct values ascending (the SUPPORT is their
    //  span); an axis with one value is degenerate (held, never interpolated).
    struct Axis
    {
        std::string name;                    // "T" | "w[<component>]"
        std::string component;               // "" for T
        std::vector<scalar> v;               // distinct values, ascending
        std::string interpolation;           // "" when degenerate
        bool varies() const { return v.size() > 1; }
        scalar lo() const { return v.front(); }
        scalar hi() const { return v.back(); }
    };
    std::vector<Axis> axes;                  // in the order of the file's columns
    std::vector<scalar> grid;                // over the VARYING axes, the first slowest; one value when none varies
    std::size_t rows = 1;
    //  Components the table does not describe, present up to a bound (F).
    std::vector<std::size_t> ignored;        // package indices
    scalar ignoresUpTo = 0.0;                // mass fraction of the liquid
    std::string ignoresReason;

    bool isTable() const { return rows > 1; }
};
using ViscosityMeasurement = MixtureMeasurement;

//  "box" or "authorised box": the record's own spelling, as a noun phrase.
inline std::string boxName(const MixtureMeasurement& m)
{ return m.boxWord == "box" ? std::string("box") : std::string("authorised box"); }

//  The words and the column of one property of the record's grammar.
const char* quantityWord(const std::string& property);      // "liquid viscosity" ...
const char* valueColumn(const std::string& property);       // "mu" | "lambda" | "sigma"
const char* valueUnit(const std::string& property);         // "Pa s" | "W/(m K)" | "N/m"

//  Reads `measured {}` of the flat block of `property` (`liquidViscosity`,
//  `liquidThermalConductivity` or `surfaceTension`); empty when absent.
std::vector<MixtureMeasurement>
readMeasurements(const DictPtr& block, const std::vector<Component>& comps,
                 const std::string& property);

//  Reads `measured {}` of the flat `liquidViscosity` block; empty when absent.
std::vector<ViscosityMeasurement>
readViscosityMeasurements(const DictPtr& block, const std::vector<Component>& comps);

//  The value of the record at (T, w): inside the SUPPORT the declared
//  interpolation, one axis at a time in the order of the file's columns;
//  between the support and the authorised box the nearest edge's value (the
//  one-row form's behaviour), the largest excursion announced once per run;
//  the caller has already refused outside the authorised box.
scalar valueAt(const MixtureMeasurement& m, scalar T, const std::map<std::string, scalar>& w);

//  Said once per record and run (advisory + console), and recorded for the
//  liquid-properties table's hypotheses: the liquid holds components the
//  record ignores, `share` of its mass, below the declared bound.
void announceIgnored(const MixtureMeasurement& m, const std::vector<Component>& comps, scalar share);

//  True when every declared axis coordinate of (T, w) lies inside the rows' support.
bool insideSupport(const MixtureMeasurement& m, scalar T, const std::map<std::string, scalar>& w);

//  The mass fraction of the liquid x held by the constituents the record
//  ignores (0 when none is present).
scalar ignoredShare(const std::vector<Component>& comps, const MixtureMeasurement& m,
                    const sVector& x);

//  The mass fractions of the set's constituents in x (by package index).
std::map<std::string, scalar>
massFractionsOf(const std::vector<Component>& comps, const std::vector<std::size_t>& set,
                const sVector& x);

//  "" inside the box; otherwise the words of the first limit crossed.
std::string outsideBox(const ViscosityMeasurement& m, scalar T,
                       const std::map<std::string, scalar>& w);

//  True only when T AND every mass fraction equal the source's stated point
//  (review row DG-08); a source that states no T or no composition has no
//  point, and every value it gives is the case's assumption.
bool atStatedPoint(const ViscosityMeasurement& m, scalar T,
                   const std::map<std::string, scalar>& w);

//  The source's stated value is named by what the file declares it to be
//  (review row DF-04): "stated value (<basis>)".
std::string statedWords(const ViscosityMeasurement& m);

//  WILKE-CHANG IS NOT USED WITH WATER AS THE SOLUTE (review row DF-01; Poling,
//  Prausnitz & O'Connell 5th ed., p. 11.22: "The method should not be used
//  when water is the solute").  A pair whose solute is water is refused by the
//  DEFAULT correlation; an entry may carry a value with its source, or name
//  the correlation explicitly with the reason it is accepted outside its
//  stated scope (the view marks it so).
bool isWater(const Component& c);
std::string waterSoluteRefusal(const std::string& model, const std::string& solvent);

// ---------------------------------------------------------------------------
//  (2) the liquid diffusivity
// ---------------------------------------------------------------------------
enum class Returns { infiniteDilution, effective };
enum class Rule    { none, CaldwellBabb, Vignes, LefflerCullinan, AndersonBabb, VignesKooijmanTaylor };
//  How the pair values of a mixture of three or more components are reduced to
//  ONE effective diffusivity per component (C329 slice B2a).
enum class Reduction { none, Wilke };

const char* reductionName(Reduction r);
std::string reductionEquation(Reduction r);
std::string reductionCitation(Reduction r);

const char* returnsName(Returns r);
const char* ruleName(Rule r);
//  The equation the rule applies, in the words the view and the run print,
//  and where it was read.
std::string ruleEquation(Rule r);
std::string ruleCitation(Rule r);
//  True for the two rules whose infinite-dilution values enter multiplied by
//  their solvent's viscosity and the result divided by the mixture's.
bool ruleIsViscosityCorrected(Rule r);

struct DiffusivityEntry
{
    std::size_t solute = 0, solvent = 0;
    std::string kind;                        // infiniteDilution (the only one consumed)
    scalar D = 0.0;                          // m2/s
    scalar T = 0.0;                          // K, the stated temperature
    std::pair<scalar, scalar> boxT{0, 0};    // K, where the case stands the one point
    std::string source;                      // citation (inline `source`, or the file's)
    std::string reason;
    std::string where;                       // "inline" or constant/experiments/<name>.dat
    std::string model;                       // an explicit correlation for this pair (no value)
    bool        outsideScope = false;        // the correlation applied where its source says not to
};

struct DiffusivityDeclaration
{
    bool        declared = false;            // a liquid.diffusivity block exists
    Returns     returns  = Returns::infiniteDilution;
    Rule        rule     = Rule::none;
    Reduction   reduction = Reduction::none;   // `composition { reduction Wilke; }`
    bool        gammaTakenOne = false;       // `thermodynamicFactor { take 1; }`
    std::string defaultModel;                // the infinite-dilution correlation
    std::vector<DiffusivityEntry> entries;

    const DiffusivityEntry* entryFor(std::size_t solute, std::size_t solvent) const;
};

//  Reads the flat `liquidDiffusivity` block.  Refused by name: a `reduction`
//  with a rule that has no multicomponent form, a ternary or larger package
//  with `rule VignesKooijmanTaylor` and no `reduction`, `returns
//  effective` without a rule or without `thermodynamicFactor`, a kind other
//  than infiniteDilution, a factor other than `take 1`, a duplicate or self
//  pair, an experiments file that does not describe its entry, a file of
//  more than one point (slice (c)'s tables), `model` written beside
//  `infiniteDilution`.
DiffusivityDeclaration readDiffusivity(const DictPtr& block, const std::vector<Component>& comps);

// ---------------------------------------------------------------------------
//  THE LINES THE PACKAGE DESCRIBES ITSELF BY, word for word the lines the
//  resolved view prints (gate check_view_matches_calls compares the two).
// ---------------------------------------------------------------------------
std::string describe(const ViscosityMeasurement& m, const std::vector<Component>& comps);
//  "T: logReciprocal; w[NaCl]: linear" -- the declared interpolation per varying axis.
std::string interpolationWords(const ViscosityMeasurement& m);
//  The resolved view's lines for a record: one line for a one-row record, the record,
//  kind, rows, axes with their support, the authorised box, the interpolation per axis
//  and what is ignored for a table (C421 slice (8), G).
std::vector<std::string> describeLines(const ViscosityMeasurement& m, const std::vector<Component>& comps);
std::vector<std::string> describe(const DiffusivityDeclaration& d, const std::vector<Component>& comps);

} // namespace liquidTransport
} // namespace Choupo
