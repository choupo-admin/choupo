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
File
    src/thermo/RecordLaws.H

Description
    SEVERAL NAMED LAWS INSIDE A RECORD'S PROPERTY BLOCK (DEV.md 4c C398,
    RULED, point 4; slice (b)).  One reader of the seven pure-component
    property blocks of a component record -- vaporPressure,
    idealGasHeatCapacity, liquidHeatCapacity, solidHeatCapacity,
    liquidViscosity, liquidThermalConductivity, surfaceTension -- so the
    grammar of "which laws does this record hold" has ONE home.

    The shapes, all read here:

      one law      a block with a `model` word (vapour pressure, heat
                   capacities): today's shape, read unchanged; the law has
                   no name and is preferred by construction.
      bare         a surfaceTension block of coefficients (A B Tc n Tmin
                   Tmax): today's shape, one law of type `tauPower`.
      named laws   sub-blocks, one per law, the sub-block's NAME being the
                   law's stable identifier; `preferred <name>;` marks the
                   record's one value of the property when there are two
                   or more.  A law's TYPE is its `model` word, else its name
                   when the name is a registered type of the family (this is
                   today's liquidViscosity / liquidThermalConductivity shape:
                   `andrade { A; B; }`, `chemsepEq101 { ... }`).

    Every law keeps its type's own SOFT window keys (`Trange`, `Tmin`/`Tmax`,
    `Tlow`/`Thigh`: announced extrapolation, never refused) and may declare a
    HARD window, `domain (lo hi);` in K: outside it the law throws a typed
    PropertyDomainError whose remedy names the record's other laws that cover
    the state.  It never switches law: a law is chosen ONCE per constituent at
    package assembly (the case's pin, else the record's preferred), printed in
    the resolved view, and kept for the run.

    U3 (C398, third addendum): the FORM of a law type -- its equation, the
    units of its coefficients and its logarithm base -- belongs to the TYPE,
    declared once where the type is registered (declareForm, called from each
    family's registerBuiltins) and printed by the resolved view.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <string>
#include <vector>

namespace Choupo {
namespace recordLaws {

//  ---- U3: the form of a law type, one place per type --------------------
//  `family` is the family of types a record block's laws belong to
//  ("vaporPressure", "heatCapacity", "liquidViscosity",
//  "liquidThermalConductivity", "surfaceTension"); `form` states the
//  equation with its units and logarithm base.
void declareForm(const std::string& family, const std::string& type,
                 const std::string& form);
std::string formOf(const std::string& family, const std::string& type);

//  THE TYPE'S BUILT-IN WINDOW (review row CV-03), declared beside its form: a
//  type whose formula has a window of its own (RowlinsonBondi's Tr 0.25-0.85,
//  the saturation line's end at Tc) states it here, once, and the view and
//  the law's self-description print it with the record's own windows.
void declareBuiltInWindow(const std::string& family, const std::string& type,
                          const std::string& window);
std::string builtInWindowOf(const std::string& family, const std::string& type);

//  WHERE A CASE PIN OF `property` IS WRITTEN, in the nested spelling the
//  property dictionary accepts (review rows CV-06, CV-15).
std::string pinPlace(const std::string& property);

//  THE SELF-DESCRIPTION OF A LAW THAT IS CALLED (review row CV-07).  A law
//  object, at its first evaluation, describes itself in the same fields the
//  resolved view prints for it; with the environment variable
//  CHOUPO_LAW_TRACE set, the line goes to stderr as `[law-call] ...`, and the
//  gate check_view_matches_calls compares it with the view.  Off, nothing is
//  printed and nothing is computed.
bool traceOn();
//  `value` is what the object evaluates at the law's probe temperature
//  (probeT): computed FROM THE OBJECT by the law's self-description and from
//  a fresh object built from the record's labelled law by the view, so an
//  object that drifted from its label fails the gate (review CV-07).
std::string selfLine(const std::string& component, const std::string& property,
                     const std::string& lawToken, const std::string& type,
                     const std::string& by, const std::string& window,
                     const std::string& source, const std::string& value,
                     const std::string& home);
//  `tag` is the identity of the package that made the call: the fingerprint
//  of its resolved definition, the one its resolved view prints (review
//  CV-20: each call is compared with its own package's view).
void traceCall(const std::string& tag, const std::string& line);
//  The package being assembled on this thread (ThermoPackageBuilder), read
//  by every component loaded and every model built during the assembly.
const std::string& currentPackageTag();
struct PackageTagScope
{
    explicit PackageTagScope(std::string tag);
    ~PackageTagScope();
    PackageTagScope(const PackageTagScope&) = delete;
    PackageTagScope& operator=(const PackageTagScope&) = delete;
    std::string saved;
};
//  The temperature a law is probed at for its value: the middle of its hard
//  window, else of its soft window, else a fraction of Tc for a type defined
//  in reduced temperature, else 300 K.
struct Law;
double probeT(const Law& law, double Tc);
//  A MODEL a package holds (an activity model, a vapour transport model, a
//  mixing rule, a pure-fluid formulation), in the law line's fields.
std::string modelLine(const std::string& who, const std::string& key, const std::string& model,
                      const std::string& by, const std::string& window, const std::string& source);
//  "<value> at <T> K", or "n/a" when the object refused.
std::string valueText(double value, double T);

//  The family a record block's laws belong to (the three heat-capacity
//  blocks share one family of types).
std::string familyOf(const std::string& property);

struct Law
{
    std::string name;            // "" = the one unnamed law of the one-law shape
    std::string type;            // the registered type word
    DictPtr     body;            // the law's own dictionary
    bool   hasSoft   = false;    // the type's soft window, read generically for the view
    scalar softLo    = 0.0, softHi = 0.0;
    bool   hasDomain = false;    // the hard window `domain (lo hi);`
    scalar domainLo  = 0.0, domainHi = 0.0;

    //  How the law is named in a message: `vogel`, or "its one law".
    std::string label() const { return name.empty() ? std::string("its one law") : "`" + name + "`"; }
    //  "soft 273-373 K (announced outside); hard 250-473 K (refused outside)",
    //  or "no window declared".
    std::string windowText() const;
    //  The same, with the type's built-in window of `family` (CV-03).
    std::string windowText(const std::string& family) const;
    //  `name`, or "its one law" (the token the view and the trace both print).
    std::string token() const { return label(); }
};

struct Block
{
    enum class Shape { oneLaw, bare, namedLaws };

    std::string      property;   // the record key, e.g. "liquidViscosity"
    std::string      owner;      // the component's name
    Shape            shape = Shape::oneLaw;
    std::vector<Law> laws;
    int              preferred = -1;   // index into laws; -1 = none marked (two or more laws)

    const Law*  find(const std::string& name) const;
    int         indexOf(const std::string& name) const;
    std::string names() const;         // "andrade, vogel"

    //  The remedy for a state outside law `except`'s hard window: the other
    //  laws of the record whose window (hard, else soft) holds T.
    std::string coveringRemedy(scalar T, std::size_t except) const;
};

//  Read one property block.  `isType(word)` answers whether `word` is a
//  registered type of the block's family.  Throws, naming the record and the
//  block, on a law that names no type, a `preferred` that names no law, a
//  malformed `domain`, or a block that declares no law.
Block parse(const DictPtr& block, const std::string& property,
            const std::string& owner,
            const std::function<bool(const std::string&)>& isType);

//  A PropertyDomainError for T outside a law's hard window, with the remedy.
[[noreturn]] void throwOutsideDomain(const Block& b, std::size_t lawIndex,
                                     scalar T, const std::string& what);

} // namespace recordLaws
} // namespace Choupo
