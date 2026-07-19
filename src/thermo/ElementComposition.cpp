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

#include "thermo/ElementComposition.H"

#include "thermo/AtomicWeights.H"
#include "thermo/Component.H"

#include <cctype>
#include <cmath>
#include <vector>
#include <set>

namespace Choupo {

namespace {

// The real periodic table (1-118) plus the explicit isotopes D and T.
const std::set<std::string>& elementSymbols()
{
    static const std::set<std::string> k = {
        "H","D","T","He","Li","Be","B","C","N","O","F","Ne","Na","Mg","Al",
        "Si","P","S","Cl","Ar","K","Ca","Sc","Ti","V","Cr","Mn","Fe","Co",
        "Ni","Cu","Zn","Ga","Ge","As","Se","Br","Kr","Rb","Sr","Y","Zr",
        "Nb","Mo","Tc","Ru","Rh","Pd","Ag","Cd","In","Sn","Sb","Te","I",
        "Xe","Cs","Ba","La","Ce","Pr","Nd","Pm","Sm","Eu","Gd","Tb","Dy",
        "Ho","Er","Tm","Yb","Lu","Hf","Ta","W","Re","Os","Ir","Pt","Au",
        "Hg","Tl","Pb","Bi","Po","At","Rn","Fr","Ra","Ac","Th","Pa","U",
        "Np","Pu","Am","Cm","Bk","Cf","Es","Fm","Md","No","Lr","Rf",
        "Db","Sg","Bh","Hs","Mt","Ds","Rg","Cn","Nh","Fl","Mc","Lv",
        "Ts","Og" };
    return k;
}

struct Parser
{
    const std::string& s;
    std::size_t        i = 0;
    std::string        err;

    explicit Parser(const std::string& str) : s(str) {}

    bool done() const { return i >= s.size(); }
    char peek() const { return i < s.size() ? s[i] : '\0'; }

    // count := integer or decimal; absent -> 1.  A count that fails to
    // convert, is non-finite or is <= 0 poisons the parse (returns a
    // negative sentinel; the callers refuse) -- a hostile formula must
    // yield UNAVAILABLE, never abort the process.
    scalar count()
    {
        if (done() || (!std::isdigit(static_cast<unsigned char>(peek()))))
            return 1.0;
        std::size_t j = i;
        while (j < s.size() && std::isdigit(static_cast<unsigned char>(s[j])))
            ++j;
        if (j < s.size() && s[j] == '.'
            && j + 1 < s.size()
            && std::isdigit(static_cast<unsigned char>(s[j + 1])))
        {
            ++j;
            while (j < s.size()
                   && std::isdigit(static_cast<unsigned char>(s[j])))
                ++j;
        }
        scalar v;
        try { v = std::stod(s.substr(i, j - i)); }
        catch (const std::exception&)
        { err = "count '" + s.substr(i, j - i) + "' does not convert";
          return -1.0; }
        if (!std::isfinite(v) || v <= 0.0)
        { err = "count '" + s.substr(i, j - i) + "' is not a positive"
                " finite number";
          return -1.0; }
        i = j;
        return v;
    }

    // unit := element [count] | '(' unit+ ')' [count]
    bool unit(std::map<std::string, scalar>& atoms, scalar mult)
    {
        if (peek() == '(')
        {
            ++i;
            std::map<std::string, scalar> inner;
            bool any = false;
            while (!done() && peek() != ')')
            {
                if (!unit(inner, 1.0)) return false;
                any = true;
            }
            if (done())
            { err = "unbalanced '(' -- no closing parenthesis"; return false; }
            ++i;                                   // consume ')'
            if (!any) { err = "empty '()' group"; return false; }
            const scalar n = count();
            if (n < 0.0) return false;
            for (const auto& [sym, na] : inner) atoms[sym] += na * n * mult;
            return true;
        }
        if (!std::isupper(static_cast<unsigned char>(peek())))
        {
            err = std::string("unexpected character '") + peek()
                + "' at position " + std::to_string(i);
            return false;
        }
        std::string sym(1, s[i++]);
        if (!done() && std::islower(static_cast<unsigned char>(peek())))
            sym += s[i++];
        if (!elementSymbols().count(sym))
        {
            // A one-letter symbol whose lowercase tail made it unknown may
            // still be a valid single-letter element (e.g. "Cx" is not a
            // symbol but "C" is -- yet then 'x' is garbage anyway).
            err = "'" + sym + "' is not an element";
            return false;
        }
        const scalar n = count();
        if (n < 0.0) return false;
        atoms[sym] += n * mult;
        return true;
    }

    // segment := [count] unit+
    bool segment(std::map<std::string, scalar>& atoms)
    {
        const scalar lead = count();               // hydrate multiplier
        if (lead < 0.0) return false;
        if (done() || !(std::isupper(static_cast<unsigned char>(peek()))
                        || peek() == '('))
        { err = "a segment needs at least one element or group"; return false; }
        bool any = false;
        while (!done() && (std::isupper(static_cast<unsigned char>(peek()))
                           || peek() == '('))
        {
            if (!unit(atoms_seg_, 1.0)) return false;
            any = true;
        }
        if (!any) { err = "empty segment"; return false; }
        for (const auto& [sym, na] : atoms_seg_) atoms[sym] += na * lead;
        atoms_seg_.clear();
        return true;
    }

    std::map<std::string, scalar> atoms_seg_;
};

// Trailing ionic charge -- the repository convention, deterministic:
//   monovalent: a terminal sign ALONE ("NH4+", "HCO3-", "Na+", "Cl-") --
//               strip ONLY the sign (the digit before it is STOICHIOMETRY);
//   explicit magnitude: sign BEFORE trailing digits ("Ca+2", "SO4-2",
//               "PO4-3") -- strip sign + digits.
// The 'n+'/'n-' spelling is NOT accepted: without other metadata it is
// ambiguous against stoichiometry (Fe3+ vs NH4+), so it never parses as a
// charge here.  Returns the suffix length (0 when none).
std::size_t chargeSuffixLen(const std::string& s)
{
    if (s.empty()) return 0;
    const std::size_t n = s.size();
    auto dig = [&](std::size_t k)
    { return std::isdigit(static_cast<unsigned char>(s[k])); };
    if (s[n - 1] == '+' || s[n - 1] == '-')
        return 1;                                  // terminal sign alone
    std::size_t k = n;
    while (k > 0 && dig(k - 1)) --k;               // trailing digits...
    if (k > 0 && k < n && (s[k - 1] == '+' || s[k - 1] == '-'))
        return n - k + 1;                          // ...'+n' / '-n'
    return 0;
}

} // namespace

ElementComposition parseElementalFormula(const std::string& formula)
{
    ElementComposition out;
    if (formula.empty() || formula == "N/A" || formula == "n/a"
        || formula == "-")
    {
        out.reason = "no molecular formula declared";
        return out;
    }

    // Strip a trailing ionic charge (electrons, not atoms) BEFORE parsing.
    std::string body = formula;
    const std::size_t clen = chargeSuffixLen(body);
    if (clen > 0) body.erase(body.size() - clen);
    if (body.empty())
    {
        out.reason = "formula '" + formula + "' is only a charge";
        return out;
    }

    // Segments split on ':' (ASCII) or the middle dot '·' (UTF-8 C2 B7).
    std::vector<std::string> segs;
    std::string cur;
    for (std::size_t i = 0; i < body.size(); ++i)
    {
        if (body[i] == ':')
        { segs.push_back(cur); cur.clear(); continue; }
        if (static_cast<unsigned char>(body[i]) == 0xC2 && i + 1 < body.size()
            && static_cast<unsigned char>(body[i + 1]) == 0xB7)
        { segs.push_back(cur); cur.clear(); ++i; continue; }
        cur += body[i];
    }
    segs.push_back(cur);

    for (const auto& seg : segs)
    {
        Parser p(seg);
        if (!p.segment(out.atoms) || !p.done())
        {
            out.atoms.clear();
            out.reason = "formula '" + formula + "': "
                + (!p.err.empty() ? p.err
                   : "trailing garbage at position " + std::to_string(p.i)
                     + " of segment '" + seg + "'");
            return out;
        }
    }
    out.available = true;
    return out;
}

ElementalResolution elementalCompositionOf(const Component& comp)
{
    ElementalResolution out;
    const auto ec = parseElementalFormula(comp.formula());
    const bool hasBlock = comp.hasElementalDeclaration();
    const auto& decl = comp.elementalDeclaration();

    // Project a declared block to the canonical atoms basis.
    auto blockAtoms = [&]() -> std::map<std::string, scalar>
    {
        std::map<std::string, scalar> a;
        if (decl.basis == Component::ElementalDeclaration::Basis::massFraction)
            for (const auto& [sym, w] : decl.massFractions)
                a[sym] = comp.MW() * w / atomicWeight(sym);
        else
            a = decl.atomCounts;
        return a;
    };

    if (ec.available && hasBlock)
    {
        // BOTH present: project both to mass fractions and demand
        // consistency; divergence refuses loudly.  Consistent => the
        // formula is the operational source, the block corroborates.
        std::map<std::string, scalar> wf, wb;
        for (const auto& [sym, na] : ec.atoms)
            wf[sym] = na * atomicWeight(sym) / comp.MW();
        if (decl.basis == Component::ElementalDeclaration::Basis::massFraction)
            wb = decl.massFractions;
        else
            for (const auto& [sym, na] : decl.atomCounts)
                wb[sym] = na * atomicWeight(sym) / comp.MW();
        std::set<std::string> syms;
        for (const auto& [k, v] : wf) { (void) v; syms.insert(k); }
        for (const auto& [k, v] : wb) { (void) v; syms.insert(k); }
        for (const auto& sym : syms)
        {
            const scalar a = wf.count(sym) ? wf.at(sym) : 0.0;
            const scalar b = wb.count(sym) ? wb.at(sym) : 0.0;
            if (std::abs(a - b) > kTolMassFraction)
            {
                out.completeness = ElementalResolution::Completeness::unavailable;
                out.reason = "component '" + comp.name() + "': formula '"
                    + comp.formula() + "' and elementalComposition{}"
                    " DISAGREE on " + sym + " (w_formula = "
                    + std::to_string(a) + ", w_declared = "
                    + std::to_string(b) + ", tolerance "
                    + std::to_string(kTolMassFraction) + " kg/kg abs)";
                return out;
            }
        }
        if (decl.unaccountedMassFraction > kTolMassFraction)
        {
            out.completeness = ElementalResolution::Completeness::unavailable;
            out.reason = "component '" + comp.name() + "': a parseable"
                " formula cannot coexist with unaccountedMassFraction = "
                + std::to_string(decl.unaccountedMassFraction)
                + " (the formula claims the whole molecule)";
            return out;
        }
        out.source = ElementalResolution::Source::formula;
        out.completeness = ElementalResolution::Completeness::full;
        out.atoms = ec.atoms;
        return out;
    }
    if (ec.available)
    {
        out.source = ElementalResolution::Source::formula;
        out.completeness = ElementalResolution::Completeness::full;
        out.atoms = ec.atoms;
        return out;
    }
    if (hasBlock)
    {
        out.atoms = blockAtoms();
        if (decl.basis == Component::ElementalDeclaration::Basis::massFraction)
        {
            out.source = ElementalResolution::Source::declaredMassFraction;
            out.unaccountedMassFraction = decl.unaccountedMassFraction;
            if (decl.unaccountedMassFraction > 0.0)
            {
                out.completeness =
                    ElementalResolution::Completeness::partial;
                out.reason = "PARTIAL -- unaccounted "
                    + std::to_string(decl.unaccountedMassFraction)
                    + " kg/kg declared (the known elements are usable; no"
                    " complete elemental closure may be stamped)";
            }
            else
                out.completeness = ElementalResolution::Completeness::full;
        }
        else
        {
            out.source = ElementalResolution::Source::declaredFormulaUnit;
            out.completeness = ElementalResolution::Completeness::full;
        }
        return out;
    }
    out.reason = "component '" + comp.name() + "': " + ec.reason
        + " and no elementalComposition{} declared";
    return out;
}

} // namespace Choupo
