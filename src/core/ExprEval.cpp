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

#include "ExprEval.H"

#include <cctype>
#include <cstdlib>
#include <stdexcept>

namespace Choupo {

namespace {

struct Parser
{
    const std::string& s;
    const std::function<scalar(const std::string&)>& resolve;
    std::size_t pos = 0;

    Parser(const std::string& src,
           const std::function<scalar(const std::string&)>& r)
      : s(src), resolve(r) {}

    void skip() { while (pos < s.size() && std::isspace((unsigned char)s[pos])) ++pos; }

    [[noreturn]] void fail(const std::string& msg) const
    {
        throw std::runtime_error("expression \"" + s + "\": " + msg);
    }

    bool isIdentChar(char c) const
    {
        return std::isalnum((unsigned char)c) || c == '_' || c == '.'
            || c == '[' || c == ']';
    }

    scalar parseExpr()
    {
        scalar v = parseTerm();
        for (;;)
        {
            skip();
            if (pos >= s.size()) break;
            const char c = s[pos];
            if (c == '+')      { ++pos; v += parseTerm(); }
            else if (c == '-') { ++pos; v -= parseTerm(); }
            else break;
        }
        return v;
    }

    scalar parseTerm()
    {
        scalar v = parseFactor();
        for (;;)
        {
            skip();
            if (pos >= s.size()) break;
            const char c = s[pos];
            if (c == '*')      { ++pos; v *= parseFactor(); }
            else if (c == '/')
            {
                ++pos;
                const scalar d = parseFactor();
                if (d == 0.0) fail("division by zero");
                v /= d;
            }
            else break;
        }
        return v;
    }

    scalar parseFactor()
    {
        skip();
        if (pos >= s.size()) fail("unexpected end of expression");
        const char c = s[pos];

        if (c == '+') { ++pos; return  parseFactor(); }
        if (c == '-') { ++pos; return -parseFactor(); }

        if (c == '(')
        {
            ++pos;
            scalar v = parseExpr();
            skip();
            if (pos >= s.size() || s[pos] != ')') fail("missing ')'");
            ++pos;
            return v;
        }

        // Number: starts with a digit or a leading '.'
        if (std::isdigit((unsigned char)c) || c == '.')
        {
            const char* start = s.c_str() + pos;
            char* end = nullptr;
            const scalar v = std::strtod(start, &end);
            if (end == start) fail("malformed number");
            pos += static_cast<std::size_t>(end - start);
            return v;
        }

        // Identifier (possibly dotted/bracketed) -> resolve callback.
        if (std::isalpha((unsigned char)c) || c == '_')
        {
            const std::size_t start = pos;
            while (pos < s.size() && isIdentChar(s[pos])) ++pos;
            return resolve(s.substr(start, pos - start));
        }

        fail(std::string("unexpected character '") + c + "'");
    }
};

} // namespace

scalar evalExpr(const std::string& expr,
                const std::function<scalar(const std::string&)>& resolve)
{
    Parser p(expr, resolve);
    const scalar v = p.parseExpr();
    p.skip();
    if (p.pos != expr.size())
        throw std::runtime_error("expression \"" + expr
            + "\": trailing characters after position "
            + std::to_string(p.pos));
    return v;
}

} // namespace Choupo
