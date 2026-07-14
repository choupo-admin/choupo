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
    Choupo::Dictionary

Description
    Hierarchical dictionary, parsed from a plain-text file.
    An entry value is one of: scalar (double), word (string), list of
    scalars, list of words, or a sub-dictionary.

    Grammar (subset):
        entry    := keyword (value ';' | sub_dict | scalar_list ';'
                              | word_list ';' )
        sub_dict := '{' entry* '}'
        scalar_list:= '(' scalar* ')'
        word_list:= '(' word*   ')'
        value    := scalar | word
        comments := '//' to end-of-line, or C-style block comments
\*---------------------------------------------------------------------------*/

#pragma once

#include "Dimensions.H"
#include "Types.H"

#include <map>
#include <memory>
#include <string>
#include <variant>
#include <vector>

namespace Choupo {

class Dictionary;
using DictPtr = std::shared_ptr<Dictionary>;

// A $var reference.  Stored in EntryValue when the parser
// reads `key $varName;` from a dict; resolved at lookup time against
// the root's `variables {... }` block (see Dictionary::varsDict_).
// Resolution is LIVE: setScalarAtPath("variables.X", v) on a parsed
// tree propagates to every `$X` reader on the next lookup, with no
// re-parse needed.  This is what makes the DesignSpec driver clean:
// it writes the manipulated variable into one place and every unit
// that referenced `$X` picks it up automatically.
struct Reference { std::string name; };

using EntryValue = std::variant<
    scalar,                       // scalar
    std::string,                  // word
    std::vector<scalar>,          // list of scalars
    std::vector<std::string>,     // list of words
    std::vector<DictPtr>,         // list of sub-dictionaries  (  {... } {... }  )
    DictPtr,                      // sub-dictionary
    Reference                     // $var reference, resolved via varsDict_
>;

class Dictionary
{
public:
    Dictionary() = default;
    explicit Dictionary(std::string name) : name_(std::move(name)) {}

    // ---- Construction ------------------------------------------------------
    static DictPtr fromFile(const std::string& path);
    static DictPtr fromString(const std::string& text,
                              const std::string& sourceName = "<inline>");

    // ---- Queries -----------------------------------------------------------
    bool found(const std::string& key) const;
    const std::vector<std::string>& keys() const { return order_; }

    scalar                    lookupScalar(const std::string& key) const;
    std::string               lookupWord  (const std::string& key) const;
    std::vector<scalar>       lookupList  (const std::string& key) const;
    std::vector<std::string>  lookupWordList(const std::string& key) const;
    std::vector<DictPtr>      lookupDictList(const std::string& key) const;
    // True iff `key` is present AND holds a list of sub-dicts ({...} {...}) --
    // distinguishes an INLINE `units ( {..} )` (flat case) from a WORD list
    // `units ( a b c )` (folder-based dignified units / sectors).
    bool                      hasDictList (const std::string& key) const;
    DictPtr                   subDict     (const std::string& key) const;

    scalar      lookupScalarOrDefault(const std::string& key, scalar def) const;
    std::string lookupWordOrDefault  (const std::string& key,
                                      const std::string& def) const;

    // ---- Dimension-checked scalar lookup --------------------------------
    //
    //  Like `lookupScalar(key)`, but cross-checks the value's declared
    //  dimensions against the caller's expectation.  Mismatch throws a
    //  crystal-clear error naming the parameter, the expected
    //  dimensions, and what the dict actually declared.
    //
    //  Behaviour:
    //   *  Entry has matching declared dimensions -- returns the value
    //      silently.
    //   *  Entry has DIFFERENT declared dimensions -- throws.
    //   *  Entry has NO declared dimensions (raw SI, no unit suffix in
    //      the dict) -- returns the value silently.  The caller is
    //      asserting that the value is in canonical SI for the
    //      expected dimensions; the lookup cannot tell us otherwise.
    //
    //  This means existing dicts without unit suffixes keep working;
    //  unit-tagged dicts get the extra safety net.
    scalar lookupScalar(const std::string& key,
                        const Dimensions&  expectedDims) const;
    scalar lookupScalarOrDefault(const std::string& key,
                                 scalar             def,
                                 const Dimensions&  expectedDims) const;

    // ---- Dimensions ------------------------------------------------------
    //
    //  When a scalar entry was parsed with an explicit unit suffix
    //  (`P 1 bar;`) or an explicit bracket form (`A_w [-1 2 1 0 0] 1.5e-12;`),
    //  the dimensions are stored alongside the value.  Entries parsed
    //  without a suffix carry no dimensions (i.e. the caller is
    //  responsible for knowing they are in canonical SI).
    //
    //  `hasDimensions(key)`   --  true iff dimensions were declared in
    //                             the dict for this key.
    //  `dimensionsOf(key)`    --  returns the stored Dimensions; throws
    //                             if not declared (use hasDimensions
    //                             first or use OrDefault).
    //  `dimensionsOrDefault`  --  returns stored dimensions or `def`.
    //
    //  Step 1 of just records the dimensions; it does NOT yet
    //  cross-check them against caller expectations.  The checked
    //  `lookupScalar(key, expectedDims)` overload arrives in step 3.
    bool       hasDimensions(const std::string& key) const;
    Dimensions dimensionsOf(const std::string& key) const;
    Dimensions dimensionsOrDefault(const std::string& key,
                                   const Dimensions& def) const;

    const std::string& name()       const { return name_;   }
    const std::string& sourceName() const { return source_; }

    // Raw access to the underlying variant (needed by the Flowsheet to
    // copy a unit's user-supplied entries verbatim into an augmented dict).
    const EntryValue& entryValue(const std::string& key) const;

    // Path-based modification used by the OuterDriver layer to vary
    // parameters across simulation passes (sensitivity / optimisation /
    // parameter estimation).  Supported path syntax:
    //
    //     "topKey"                                  (top-level scalar)
    //     "units[0].operation.refluxRatio"          (list-of-dicts navigation)
    //     "reactions.myRxn.kinetics.A"              (named sub-dicts)
    //
    // Tokens are separated by '.'.  A token of the form `name[N]` refers
    // to the N-th entry of a list-of-dicts.  The target entry must
    // already exist and be (or be convertible to) a scalar.
    void setScalarAtPath(const std::string& path, scalar value);

    // ---- Parser interface --------------------------------------------------
    void insert(const std::string& key, EntryValue value);
    // Overload used by the parser when a scalar arrives with a unit
    // suffix or an explicit bracket form: stores value AND dimensions.
    void insert(const std::string& key, scalar value, Dimensions dims);
    // Remove a key if present (used to strip loader-only metadata such as
    // `overlayOf` after a partial overlay has been deep-merged).  No-op if absent.
    void erase(const std::string& key);
    void setDimensions(const std::string& key, const Dimensions& dims);
    void setSource(std::string s) { source_ = std::move(s); }
    void setName  (std::string s) { name_   = std::move(s); }

    // ---- $var reference resolution --------------------------------------
    //
    //  After parse, if the root carries a top-level `variables {... }`
    //  block, `fromString` extracts it as a DictPtr and walks the whole
    //  parsed tree calling `setVarsDict(<that ptr>)` on every node.  Each
    //  Dictionary then knows where to look up a Reference when one
    //  appears as a scalar entry.  Nodes whose tree never had a
    //  `variables {}` block keep `varsDict_ == nullptr`, and a stray
    //  `$ref` lookup throws --- catching the most common authoring
    //  mistake at the point of failure.
    void                  setVarsDict(DictPtr v) { varsDict_ = std::move(v); }

    // DEEP copy of the whole tree (forum #63-7).  `DictPtr work = other` is an
    // ALIAS -- a shared_ptr copy -- so a setScalarAtPath through it mutates the
    // ORIGINAL; a what-if evaluation or a fit working tree must never do that.
    // Sub-dicts and dict-lists are copied recursively; the variables block is
    // deep-copied ONCE at the root and re-pointed on every copied node, so a
    // manipulation of $vars in the copy stays in the copy.
    DictPtr deepCopy() const;

    // PARTIAL deep-merge (unified overlay, roadmap Phase A): merge `overlay` INTO
    // this dict IN PLACE.  For each key: if BOTH sides hold a sub-dictionary,
    // recurse; otherwise the overlay value replaces (scalars / lists / new keys).
    // So a case ships only the changed leaves (e.g. solidPhases.halite.equilibrium
    // .logK25) and every other value keeps coming from the base (standard) record.
    // Each replaced leaf's dotted path is appended to `overlaidPaths` (if non-null)
    // for minimal provenance (which values came from the overlay tier).
    void deepMerge(const DictPtr& overlay,
                   std::vector<std::string>* overlaidPaths = nullptr,
                   const std::string& prefix = "");

    DictPtr               varsDict()      const  { return varsDict_; }
    void                  propagateVarsDict(DictPtr v);

private:
    void setVarsDictRecursive_(const DictPtr& v);

    std::string name_;
    std::string source_;
    std::map<std::string, EntryValue> entries_;
    std::map<std::string, Dimensions> entryDims_;   // parallel; only for scalars with declared dims
    std::vector<std::string> order_;
    DictPtr                  varsDict_;             // see setVarsDict above
};

} // namespace Choupo
