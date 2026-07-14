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
\*---------------------------------------------------------------------------*/

#include "Dictionary.H"

#include "Units.H"

#include <cctype>
#include <cmath>
#include <fstream>
#include <functional>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

// =========================================================================
//   Tokenizer
// =========================================================================

namespace {

enum class TokKind { Word, Number, LBrace, RBrace, LParen, RParen, Semi, End };

struct Token
{
    TokKind     kind;
    std::string text;
    scalar      number = 0.0;
    int         line   = 0;
    int         col    = 0;
};

class Tokenizer
{
public:
    Tokenizer(const std::string& src, std::string filename)
  :   src_(src), file_(std::move(filename)) {}

    Token next()
    {
        skipWhitespaceAndComments();
        Token t;
        t.line = line_;
        t.col  = col_;

        if (pos_ >= src_.size()) { t.kind = TokKind::End; return t; }

        char c = src_[pos_];
        switch (c)
        {
            case '{': advance(); t.kind = TokKind::LBrace; t.text = "{"; return t;
            case '}': advance(); t.kind = TokKind::RBrace; t.text = "}"; return t;
            case '(': advance(); t.kind = TokKind::LParen; t.text = "("; return t;
            case ')': advance(); t.kind = TokKind::RParen; t.text = ")"; return t;
            case ';': advance(); t.kind = TokKind::Semi;   t.text = ";"; return t;
        }

        // Quoted string: "..." emits a Word token whose text is the
        // content between the quotes.  Allows free-form prose values
        // such as citations / notes / fitData paths in provenance blocks.
        if (c == '"')
        {
            advance();   // skip opening quote
            std::string s;
            while (pos_ < src_.size() && src_[pos_] != '"')
            {
                if (src_[pos_] == '\\' && pos_ + 1 < src_.size())
                {
                    s += src_[pos_ + 1];
                    pos_ += 2;
                    col_ += 2;
                    continue;
                }
                s += src_[pos_];
                advance();
            }
            if (pos_ >= src_.size())
                throw std::runtime_error(loc() + ": unterminated string literal");
            advance();   // skip closing quote
            t.kind = TokKind::Word;
            t.text = std::move(s);
            return t;
        }

        if (isNumberStart())
        {
            t.text = readToken();
            std::size_t consumed = 0;
            try {
                t.number = std::stod(t.text, &consumed);
                // If std::stod did not consume the whole token (e.g. CAS
                // numbers like "71-43-2" begin with digits but are words),
                // demote to Word.
                t.kind = (consumed == t.text.size())
                       ? TokKind::Number : TokKind::Word;
            }
            catch (...) { t.kind = TokKind::Word; }
            return t;
        }

        t.kind = TokKind::Word;
        t.text = readToken();
        if (t.text.empty())
            throw std::runtime_error(loc() + ": unexpected character '"
                                     + std::string(1, c) + "'");
        return t;
    }

    std::string loc() const
    {
        std::ostringstream os;
        os << file_ << ":" << line_ << ":" << col_;
        return os.str();
    }

private:
    const std::string& src_;
    std::string        file_;
    std::size_t        pos_  = 0;
    int                line_ = 1;
    int                col_  = 1;

    void advance()
    {
        if (pos_ < src_.size())
        {
            if (src_[pos_] == '\n') { ++line_; col_ = 1; } else { ++col_; }
            ++pos_;
        }
    }

    bool isNumberStart() const
    {
        if (pos_ >= src_.size()) return false;
        char c = src_[pos_];
        if (std::isdigit(static_cast<unsigned char>(c))) return true;
        if ((c == '+' || c == '-' || c == '.') && pos_ + 1 < src_.size()
            && (std::isdigit(static_cast<unsigned char>(src_[pos_+1]))
                || src_[pos_+1] == '.'))
            return true;
        return false;
    }

    bool isWordChar(char c) const
    {
        return std::isalnum(static_cast<unsigned char>(c))
            || c == '_' || c == '.' || c == '-' || c == '+'
            || c == ':' || c == '/'
            || c == '[' || c == ']'   // for path syntax: units[0].operation....
            || c == '$'               // for $var references (resolved via Dictionary::varsDict_)
            || c == '=';              // for UNIFAC subgroup names (CH2=CH, C=C, …); dicts use no '=' operator
    }

    std::string readToken()
    {
        std::string out;
        while (pos_ < src_.size())
        {
            char c = src_[pos_];
            if (isWordChar(c) || c == 'e' || c == 'E')
            {
                out += c;
                advance();
            }
            else break;
        }
        return out;
    }

    void skipWhitespaceAndComments()
    {
        while (pos_ < src_.size())
        {
            char c = src_[pos_];
            if (std::isspace(static_cast<unsigned char>(c))) { advance(); continue; }
            if (c == '/' && pos_ + 1 < src_.size() && src_[pos_+1] == '/')
            {
                while (pos_ < src_.size() && src_[pos_] != '\n') advance();
                continue;
            }
            if (c == '/' && pos_ + 1 < src_.size() && src_[pos_+1] == '*')
            {
                advance(); advance();
                while (pos_ + 1 < src_.size()
                       && !(src_[pos_] == '*' && src_[pos_+1] == '/'))
                    advance();
                if (pos_ + 1 < src_.size()) { advance(); advance(); }
                continue;
            }
            break;
        }
    }
};

// =========================================================================
//   Parser
// =========================================================================

class Parser
{
public:
    Parser(Tokenizer& tk) : tk_(tk) {}

    void parseInto(Dictionary& root)
    {
        cur_ = tk_.next();
        // Optional FoamFile header (compatibility).
        if (cur_.kind == TokKind::Word && cur_.text == "FoamFile")
        {
            cur_ = tk_.next();
            expect(TokKind::LBrace, "{ after FoamFile");
            skipUntilMatchingBrace();
            cur_ = tk_.next();
        }
        parseEntries(root, /*topLevel=*/true);
    }

private:
    Tokenizer& tk_;
    Token      cur_;

    void parseEntries(Dictionary& dict, bool topLevel)
    {
        while (true)
        {
            if (cur_.kind == TokKind::End)
            {
                if (!topLevel)
                    throw std::runtime_error(tk_.loc() + ": expected '}'");
                return;
            }
            if (cur_.kind == TokKind::RBrace)
            {
                if (topLevel)
                    throw std::runtime_error(tk_.loc() + ": unmatched '}'");
                return;
            }
            if (cur_.kind != TokKind::Word)
                throw std::runtime_error(tk_.loc() +
                    ": expected keyword, got '" + cur_.text + "'");

            std::string key = cur_.text;
            cur_ = tk_.next();

            // bracket form for dimension sets:
            //     key  [M L T Θ N]  value;
            //
            // Five signed integers (the dimension exponents) followed
            // by a number (already in canonical SI for those
            // dimensions).  Useful when there is no short named unit
            // available (e.g. solution-diffusion permeability A_w in
            // m/(s·Pa)).
            //
            // The tokenizer keeps '[' and ']' as ordinary word chars
            // (they are also used in path-style entries such as
            // `units[0].operation.refluxRatio` consumed by
            // `setScalarAtPath`).  We therefore detect the bracket
            // form by inspecting the *text* of the token that follows
            // the keyword: if it begins with '[' the parser switches
            // to bracket mode and accumulates tokens until one ends
            // with ']'.
            if (cur_.kind == TokKind::Word
                && !cur_.text.empty() && cur_.text.front() == '[')
            {
                std::string buf = cur_.text;
                while (buf.empty() || buf.back() != ']')
                {
                    cur_ = tk_.next();
                    if (cur_.kind == TokKind::End
                        || cur_.kind == TokKind::Semi
                        || cur_.kind == TokKind::LBrace
                        || cur_.kind == TokKind::LParen)
                        throw std::runtime_error(tk_.loc() +
                            ": dimension set for '" + key +
                            "' is missing ']'");
                    buf += ' ';
                    buf += cur_.text;
                }
                // buf is now e.g.  "[1 -1 -2 0 0]"
                std::string inner = buf.substr(1, buf.size() - 2);
                std::istringstream iss(inner);
                int exps[5];
                for (int i = 0; i < 5; ++i)
                {
                    if (!(iss >> exps[i]))
                        throw std::runtime_error(tk_.loc() +
                            ": dimension set for '" + key +
                            "' must have exactly 5 integer exponents"
                            " [M L T Theta N]; got '" + buf + "'");
                }
                int trailing;
                if (iss >> trailing)
                    throw std::runtime_error(tk_.loc() +
                        ": dimension set for '" + key +
                        "' has more than 5 exponents (got '" + buf + "')");

                cur_ = tk_.next();
                if (cur_.kind != TokKind::Number)
                    throw std::runtime_error(tk_.loc() +
                        ": expected SI value after dimension set of '" +
                        key + "', got '" + cur_.text + "'");
                scalar v = cur_.number;
                Dimensions dims(exps[0], exps[1], exps[2], exps[3], exps[4]);
                cur_ = tk_.next();
                expect(TokKind::Semi,
                    "';' after bracket-form value of '" + key + "'");
                dict.insert(key, v, dims);
                cur_ = tk_.next();
            }
            else if (cur_.kind == TokKind::LBrace)
            {
                auto sub = std::make_shared<Dictionary>(key);
                cur_ = tk_.next();
                parseEntries(*sub, /*topLevel=*/false);
                expect(TokKind::RBrace, "'}' to close sub-dict '" + key + "'");
                dict.insert(key, sub);
                cur_ = tk_.next();
            }
            else if (cur_.kind == TokKind::LParen)
            {
                // Inspect first element to decide:
                //   list<scalar>, list<word>, or list<dict>.
                cur_ = tk_.next();
                if (cur_.kind == TokKind::LBrace)
                {
                    // List of sub-dictionaries:  (  {... } {... }  );
                    std::vector<DictPtr> dicts;
                    while (cur_.kind == TokKind::LBrace)
                    {
                        auto sub = std::make_shared<Dictionary>(key + "[" + std::to_string(dicts.size()) + "]");
                        cur_ = tk_.next();
                        parseEntries(*sub, /*topLevel=*/false);
                        expect(TokKind::RBrace,
                            "'}' to close dict in list '" + key + "'");
                        dicts.push_back(sub);
                        cur_ = tk_.next();
                    }
                    expect(TokKind::RParen,
                        "')' to close dict-list '" + key + "'");
                    cur_ = tk_.next();
                    expect(TokKind::Semi,
                        "';' after dict-list '" + key + "'");
                    dict.insert(key, dicts);
                    cur_ = tk_.next();
                    continue;
                }
                if (cur_.kind == TokKind::Number)
                {
                    std::vector<scalar> list;
                    while (cur_.kind != TokKind::RParen)
                    {
                        if (cur_.kind == TokKind::Number)
                            list.push_back(cur_.number);
                        else if (cur_.kind == TokKind::Word)
                        {
                            try { list.push_back(std::stod(cur_.text)); }
                            catch (...) {
                                throw std::runtime_error(tk_.loc() +
                                  ": expected number, got '" + cur_.text + "'");
                            }
                        }
                        else
                            throw std::runtime_error(tk_.loc() +
                                ": expected number or ')' in scalar list");
                        cur_ = tk_.next();
                    }
                    expect(TokKind::RParen, "')' to close list '" + key + "'");
                    cur_ = tk_.next();
                    expect(TokKind::Semi, "';' after list '" + key + "'");
                    dict.insert(key, list);
                }
                else if (cur_.kind == TokKind::Word)
                {
                    std::vector<std::string> list;
                    while (cur_.kind != TokKind::RParen)
                    {
                        if (cur_.kind != TokKind::Word)
                            throw std::runtime_error(tk_.loc() +
                                ": expected word or ')' in word list");
                        list.push_back(cur_.text);
                        cur_ = tk_.next();
                    }
                    expect(TokKind::RParen, "')' to close list '" + key + "'");
                    cur_ = tk_.next();
                    expect(TokKind::Semi, "';' after list '" + key + "'");
                    dict.insert(key, list);
                }
                else if (cur_.kind == TokKind::RParen)
                {
                    // Empty list — store as empty scalar list.
                    cur_ = tk_.next();
                    expect(TokKind::Semi, "';' after empty list '" + key + "'");
                    dict.insert(key, std::vector<scalar>{});
                }
                else
                    throw std::runtime_error(tk_.loc() +
                        ": unexpected token in list '" + key + "'");
                cur_ = tk_.next();
            }
            else if (cur_.kind == TokKind::Number)
            {
                scalar v = cur_.number;
                cur_ = tk_.next();

                // Optional unit suffix.  Syntax:
                //     P    55  bar;
                //     F   100  kmol/h;
                //     T    25  degC;
                //
                // If a Word appears between the number and the Semi
                // we look it up in `units::lookupUnit`: the named-unit
                // table gives us BOTH the conversion factor to SI AND
                // the physical dimensions of the quantity (e.g. `bar`
                // → factor 1e5, dims [1 -1 -2 0 0]).  Dimensions are
                // recorded alongside the value via insert(key, v, dims)
                // so step 3 of the refactor can cross-check them
                // against caller expectations.
                //
                // An unknown suffix is an error --- this keeps typos
                // from silently passing through.
                bool dimsKnown = false;
                Dimensions dims;
                if (cur_.kind == TokKind::Word)
                {
                    const std::string suffix = cur_.text;
                    auto spec = units::lookupUnit(suffix);
                    if (!spec)
                        throw std::runtime_error(tk_.loc() +
                            ": unknown unit suffix '" + suffix +
                            "' after scalar value of '" + key +
                            "'.  Known units listed in core/Units.H.");
                    if (spec->affine)
                        v = units::affineToK(v, suffix);
                    else
                        v *= spec->factor;
                    dims = spec->dims;
                    dimsKnown = true;
                    cur_ = tk_.next();
                }
                expect(TokKind::Semi, "';' after scalar value of '" + key + "'");
                if (dimsKnown) dict.insert(key, v, dims);
                else           dict.insert(key, v);
                cur_ = tk_.next();
            }
            else if (cur_.kind == TokKind::Word)
            {
                std::string v = cur_.text;

                // $var reference --- stored as Reference{name} and
                // resolved later by lookupScalar() against the root's
                // variables block.  The reference name is everything
                // after the leading '$'; it must look like an
                // identifier (no embedded '.' or '/').
                if (!v.empty() && v.front() == '$')
                {
                    const std::string ref = v.substr(1);
                    if (ref.empty())
                        throw std::runtime_error(tk_.loc() +
                            ": '$' is not a valid reference (give it a name,"
                            " e.g. `$A` referencing `variables { A 100; }`)");
                    for (char c : ref)
                    {
                        if (!(std::isalnum(static_cast<unsigned char>(c))
                              || c == '_'))
                            throw std::runtime_error(tk_.loc() +
                                ": reference name '" + ref +
                                "' for key '" + key +
                                "' must be a plain identifier"
                                " (letters / digits / underscore only)");
                    }
                    cur_ = tk_.next();
                    expect(TokKind::Semi,
                        "';' after reference value of '" + key + "'");
                    dict.insert(key, Reference{ref});
                    cur_ = tk_.next();
                    continue;
                }

                cur_ = tk_.next();
                expect(TokKind::Semi, "';' after word value of '" + key + "'");
                dict.insert(key, v);
                cur_ = tk_.next();
            }
            else
            {
                throw std::runtime_error(tk_.loc() +
                    ": unexpected token '" + cur_.text +
                    "' after keyword '" + key + "'");
            }
        }
    }

    void expect(TokKind k, const std::string& what)
    {
        if (cur_.kind != k)
            throw std::runtime_error(tk_.loc() + ": expected " + what
                + ", got '" + cur_.text + "'");
    }

    void skipUntilMatchingBrace()
    {
        int depth = 1;
        while (depth > 0)
        {
            cur_ = tk_.next();
            if (cur_.kind == TokKind::End)
                throw std::runtime_error(tk_.loc() +
                    ": EOF inside FoamFile header");
            if (cur_.kind == TokKind::LBrace) ++depth;
            if (cur_.kind == TokKind::RBrace) --depth;
        }
    }
};

} // anonymous namespace

// =========================================================================
//   Dictionary implementation
// =========================================================================

void Dictionary::insert(const std::string& key, EntryValue value)
{
    auto it = entries_.find(key);
    if (it == entries_.end()) order_.push_back(key);
    entries_[key] = std::move(value);
    // NOTE: we deliberately do NOT clear entryDims_[key] here.
    // setScalarAtPath uses this overload to update values during
    // sweep/optim passes; the dimensions established at parse time
    // remain valid across those updates.
}

void Dictionary::insert(const std::string& key, scalar value, Dimensions dims)
{
    insert(key, EntryValue{value});
    entryDims_[key] = dims;
}

void Dictionary::setDimensions(const std::string& key, const Dimensions& dims)
{
    entryDims_[key] = dims;
}

bool Dictionary::hasDimensions(const std::string& key) const
{
    return entryDims_.find(key) != entryDims_.end();
}

Dimensions Dictionary::dimensionsOf(const std::string& key) const
{
    auto it = entryDims_.find(key);
    if (it == entryDims_.end())
        throw std::runtime_error("Dictionary '" + name_ +
            "': no dimensions declared for entry '" + key +
            "' (caller required them but the dict did not tag the value)");
    return it->second;
}

Dimensions Dictionary::dimensionsOrDefault(const std::string& key,
                                           const Dimensions& def) const
{
    auto it = entryDims_.find(key);
    return (it == entryDims_.end()) ? def : it->second;
}

bool Dictionary::found(const std::string& key) const
{
    return entries_.find(key) != entries_.end();
}

const EntryValue& Dictionary::entryValue(const std::string& key) const
{
    auto it = entries_.find(key);
    if (it == entries_.end())
        throw std::runtime_error("Dictionary '" + name_ +
            "': missing entry '" + key + "'");
    return it->second;
}

scalar Dictionary::lookupScalar(const std::string& key) const
{
    auto it = entries_.find(key);
    if (it == entries_.end())
        throw std::runtime_error("Dictionary '" + name_ +
            "' (" + source_ + "): missing scalar entry '" + key + "'");

    if (std::holds_alternative<scalar>(it->second))
        return std::get<scalar>(it->second);
    if (std::holds_alternative<Reference>(it->second))
    {
        const std::string& ref = std::get<Reference>(it->second).name;
        if (!varsDict_)
            throw std::runtime_error("Dictionary '" + name_ + "' (" + source_ +
                "): entry '" + key + "' references $" + ref +
                " but the case file has no top-level `variables {... }`"
                " block to resolve it against");
        if (!varsDict_->found(ref))
            throw std::runtime_error("Dictionary '" + name_ + "' (" + source_ +
                "): entry '" + key + "' references undeclared variable $" +
                ref + " (add `" + ref + " <value>;` to the case's"
                " `variables {... }` block)");
        return varsDict_->lookupScalar(ref);
    }
    if (std::holds_alternative<std::string>(it->second))
    {
        try { return std::stod(std::get<std::string>(it->second)); }
        catch (...) {}
    }
    throw std::runtime_error("Dictionary '" + name_ +
        "': entry '" + key + "' is not a scalar");
}

std::string Dictionary::lookupWord(const std::string& key) const
{
    auto it = entries_.find(key);
    if (it == entries_.end())
        throw std::runtime_error("Dictionary '" + name_ +
            "': missing word entry '" + key + "'");
    if (std::holds_alternative<std::string>(it->second))
        return std::get<std::string>(it->second);
    throw std::runtime_error("Dictionary '" + name_ +
        "': entry '" + key + "' is not a word");
}

std::vector<scalar> Dictionary::lookupList(const std::string& key) const
{
    auto it = entries_.find(key);
    if (it == entries_.end())
        throw std::runtime_error("Dictionary '" + name_ +
            "': missing list entry '" + key + "'");
    if (std::holds_alternative<std::vector<scalar>>(it->second))
        return std::get<std::vector<scalar>>(it->second);
    throw std::runtime_error("Dictionary '" + name_ +
        "': entry '" + key + "' is not a list of scalars");
}

std::vector<std::string> Dictionary::lookupWordList(const std::string& key) const
{
    auto it = entries_.find(key);
    if (it == entries_.end())
        throw std::runtime_error("Dictionary '" + name_ +
            "': missing word-list entry '" + key + "'");
    if (std::holds_alternative<std::vector<std::string>>(it->second))
        return std::get<std::vector<std::string>>(it->second);
    // An empty `( );` list parses ambiguously as an empty scalar list —
    // accept it here as an empty word list (and vice-versa in lookupList).
    if (std::holds_alternative<std::vector<scalar>>(it->second)
        && std::get<std::vector<scalar>>(it->second).empty())
        return {};
    throw std::runtime_error("Dictionary '" + name_ +
        "': entry '" + key + "' is not a list of words");
}

std::vector<DictPtr> Dictionary::lookupDictList(const std::string& key) const
{
    auto it = entries_.find(key);
    if (it == entries_.end())
        throw std::runtime_error("Dictionary '" + name_ +
            "': missing dict-list entry '" + key + "'");
    if (std::holds_alternative<std::vector<DictPtr>>(it->second))
        return std::get<std::vector<DictPtr>>(it->second);
    throw std::runtime_error("Dictionary '" + name_ +
        "': entry '" + key + "' is not a list of dictionaries");
}

bool Dictionary::hasDictList(const std::string& key) const
{
    auto it = entries_.find(key);
    return it != entries_.end()
        && std::holds_alternative<std::vector<DictPtr>>(it->second);
}

DictPtr Dictionary::subDict(const std::string& key) const
{
    auto it = entries_.find(key);
    if (it == entries_.end())
        throw std::runtime_error("Dictionary '" + name_ +
            "': missing sub-dictionary '" + key + "'");
    if (std::holds_alternative<DictPtr>(it->second))
        return std::get<DictPtr>(it->second);
    throw std::runtime_error("Dictionary '" + name_ +
        "': entry '" + key + "' is not a sub-dictionary");
}

scalar Dictionary::lookupScalarOrDefault(const std::string& key, scalar def) const
{
    return found(key) ? lookupScalar(key) : def;
}

scalar Dictionary::lookupScalar(const std::string& key,
                                const Dimensions&  expectedDims) const
{
    const scalar v = lookupScalar(key);

    // For a $reference entry, the declared dimensions live on the
    // variable in the root's variables block, not on the local key.
    auto eit = entries_.find(key);
    if (eit != entries_.end()
        && std::holds_alternative<Reference>(eit->second)
        && varsDict_)
    {
        const std::string& ref = std::get<Reference>(eit->second).name;
        if (varsDict_->hasDimensions(ref)
            && varsDict_->dimensionsOf(ref) != expectedDims)
        {
            std::ostringstream msg;
            const Dimensions actual = varsDict_->dimensionsOf(ref);
            msg << "Dictionary '" << name_ << "' (" << source_
                << "):\n  parameter '" << key << "' (= $" << ref << ")"
                << " expected dimensions " << expectedDims.toBracket()
                << " (" << expectedDims.toPretty() << ")"
                << "\n  but $" << ref << " was declared with "
                << actual.toBracket() << " (" << actual.toPretty()
                << ") in the variables block.";
            throw std::runtime_error(msg.str());
        }
        return v;
    }

    auto it = entryDims_.find(key);
    if (it != entryDims_.end() && it->second != expectedDims)
    {
        std::ostringstream msg;
        msg << "Dictionary '" << name_ << "' (" << source_
            << "):\n  parameter '" << key << "'"
            << " expected dimensions " << expectedDims.toBracket()
            << " (" << expectedDims.toPretty() << ")"
            << "\n  but the dict declared " << it->second.toBracket()
            << " (" << it->second.toPretty() << ").  Check the unit"
               " suffix on this entry.";
        throw std::runtime_error(msg.str());
    }

    // A BARE pressure below 100 Pa is almost always a forgotten `bar`.  Writing
    // `P 1.01325;` means 1.01 pascal -- a hard vacuum -- and the K-values then
    // explode by five orders of magnitude while the run reports success.  This
    // exact typo shipped in a tutorial and went unnoticed.  A raw number is
    // still legal (Choupo's canonical unit is SI, and a real vacuum column
    // belongs at 50 Pa), so this WARNS rather than refuses -- and it stays
    // silent when the author declared a unit, because then they meant it.
    if (it == entryDims_.end() && expectedDims == Dims::pressure
        && v > 0.0 && v < 100.0)
    {
        std::cout << "  WARNING: '" << key << " " << v << ";' in dictionary '"
                  << name_ << "' (" << source_ << ") carries NO unit, so it is "
                  << v << " Pa -- a hard vacuum.  Did you mean `" << key << " "
                  << v << " bar;`?  Declare the unit and this warning goes away.\n";
    }
    return v;
}

scalar Dictionary::lookupScalarOrDefault(const std::string& key,
                                         scalar             def,
                                         const Dimensions&  expectedDims) const
{
    return found(key) ? lookupScalar(key, expectedDims) : def;
}

std::string Dictionary::lookupWordOrDefault(const std::string& key,
                                            const std::string& def) const
{
    return found(key) ? lookupWord(key) : def;
}

// Path-based scalar modification.  See header for syntax.
void Dictionary::setScalarAtPath(const std::string& path, scalar value)
{
    if (path.empty())
        throw std::runtime_error("setScalarAtPath: empty path");

    // Tokenize on '.'.
    std::vector<std::string> tokens;
    {
        std::string cur;
        for (char c : path)
        {
            if (c == '.') { if (!cur.empty()) tokens.push_back(cur); cur.clear(); }
            else cur += c;
        }
        if (!cur.empty()) tokens.push_back(cur);
    }
    if (tokens.empty())
        throw std::runtime_error("setScalarAtPath: invalid path '" + path + "'");

    // Navigate to the parent of the leaf key.
    Dictionary* node = this;
    for (std::size_t k = 0; k + 1 < tokens.size(); ++k)
    {
        const std::string& t = tokens[k];
        auto open = t.find('[');
        if (open != std::string::npos)
        {
            // name[N]  →  list-of-dicts navigation
            auto close = t.find(']');
            if (close == std::string::npos || close < open)
                throw std::runtime_error("setScalarAtPath: malformed '" + t + "'");
            const std::string listKey = t.substr(0, open);
            const std::size_t idx = std::stoul(t.substr(open + 1, close - open - 1));
            auto dicts = node->lookupDictList(listKey);
            if (idx >= dicts.size())
                throw std::runtime_error("setScalarAtPath: index " +
                    std::to_string(idx) + " out of range for '" + listKey + "'");
            node = dicts[idx].get();
        }
        else
        {
            auto sub = node->subDict(t);
            node = sub.get();
        }
    }

    node->insert(tokens.back(), value);
}

DictPtr Dictionary::fromFile(const std::string& path)
{
    std::ifstream f(path);
    if (!f)
        throw std::runtime_error("Cannot open dictionary file: " + path);
    std::ostringstream ss; ss << f.rdbuf();
    return fromString(ss.str(), path);
}

// Recursively walk through every sub-dict and list-of-dicts entry,
// setting varsDict_ on each node so $references on the way down resolve
// to the same variables block held at the root.
void Dictionary::propagateVarsDict(DictPtr v)
{
    setVarsDict(v);
    for (const auto& key : order_)
    {
        const auto& ev = entries_[key];
        if (std::holds_alternative<DictPtr>(ev))
        {
            auto sub = std::get<DictPtr>(ev);
            if (sub) sub->propagateVarsDict(v);
        }
        else if (std::holds_alternative<std::vector<DictPtr>>(ev))
        {
            for (auto& d : std::get<std::vector<DictPtr>>(ev))
                if (d) d->propagateVarsDict(v);
        }
    }
}

DictPtr Dictionary::fromString(const std::string& text,
                               const std::string& sourceName)
{
    auto root = std::make_shared<Dictionary>("<root>");
    root->setSource(sourceName);
    Tokenizer tk(text, sourceName);
    Parser p(tk);
    p.parseInto(*root);

    // If the case declared a top-level `variables {... }`, hand it to
    // every node so $references resolve against it.  Nodes without a
    // variables block keep varsDict_ == nullptr and throw on a stray
    // $ref --- friendliest possible failure mode.
    if (root->found("variables")
        && std::holds_alternative<DictPtr>(root->entryValue("variables")))
    {
        root->propagateVarsDict(root->subDict("variables"));
    }
    return root;
}

DictPtr Dictionary::deepCopy() const
{
    // Copy this node, then recurse; re-point varsDict on the copy's whole tree.
    std::function<DictPtr(const Dictionary&, const DictPtr&)> rec =
        [&](const Dictionary& src, const DictPtr& vars) -> DictPtr
    {
        auto out = std::make_shared<Dictionary>(src.name_);
        out->source_    = src.source_;
        out->entryDims_ = src.entryDims_;
        out->order_     = src.order_;
        for (const auto& [k, v] : src.entries_)
        {
            if (std::holds_alternative<DictPtr>(v))
                out->entries_[k] = rec(*std::get<DictPtr>(v), vars);
            else if (std::holds_alternative<std::vector<DictPtr>>(v))
            {
                std::vector<DictPtr> lst;
                lst.reserve(std::get<std::vector<DictPtr>>(v).size());
                for (const auto& d : std::get<std::vector<DictPtr>>(v))
                    lst.push_back(rec(*d, vars));
                out->entries_[k] = std::move(lst);
            }
            else
                out->entries_[k] = v;      // scalar / word / lists / Reference: value types
        }
        out->varsDict_ = vars;
        return out;
    };

    // The variables block itself is part of the tree when this node owns it
    // (root case): deep-copy it FIRST so every node of the copy resolves $refs
    // against the COPY, never the original.
    DictPtr varsCopy;
    if (varsDict_)
        varsCopy = rec(*varsDict_, nullptr);
    auto out = rec(*this, varsCopy);
    // If the root carried its variables as an entry, point varsDict at the
    // copied ENTRY (one tree, one truth) rather than the detached pre-copy.
    if (varsCopy && out->entries_.count("variables")
        && std::holds_alternative<DictPtr>(out->entries_.at("variables")))
        out->setVarsDictRecursive_(std::get<DictPtr>(out->entries_.at("variables")));
    return out;
}

void Dictionary::setVarsDictRecursive_(const DictPtr& v)
{
    varsDict_ = v;
    for (auto& [k, val] : entries_)
    {
        (void) k;
        if (std::holds_alternative<DictPtr>(val))
            std::get<DictPtr>(val)->setVarsDictRecursive_(v);
        else if (std::holds_alternative<std::vector<DictPtr>>(val))
            for (auto& d : std::get<std::vector<DictPtr>>(val))
                d->setVarsDictRecursive_(v);
    }
}


} // namespace Choupo
