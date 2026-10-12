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

#include "Formula.H"

#include "core/DictAudit.H"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  The closest known name, by the same edit-distance rule the registry
//  refusals use (one notion of "close enough" in the whole tree).
std::string closestHint(const std::string& asked, const std::vector<std::string>& known)
{
    std::string best;
    std::size_t bestD = std::string::npos;
    for (const auto& k : known)
    {
        const std::size_t d = dictAudit::editDistance(asked, k);
        if (d < bestD) { bestD = d; best = k; }
    }
    if (best.empty()) return "";
    const std::size_t tol = std::max<std::size_t>(1, asked.size() / 3);
    if (bestD > tol) return "";
    return "  Did you mean `" + best + "`?";
}

std::string dimsText(const Dimensions& d)
{
    if (d.isDimensionless()) return "dimensionless";
    return d.toPretty() + " " + d.toBracket();
}

bool nearInteger(scalar v, int& out)
{
    const scalar r = std::round(v);
    if (std::abs(v - r) > 1.0e-9) return false;
    out = static_cast<int>(r);
    return true;
}

} // namespace

// ---------------------------------------------------------------------------
//  The compiler: a recursive-descent parser that builds the node vector and
//  assigns dimensions as it goes, so every refusal can name the sub-formula
//  it is about.
// ---------------------------------------------------------------------------
class FormulaCompiler
{
public:
    FormulaCompiler(const std::string& t, const Formula::Resolver& r,
                    const Formula::TableResolver& tb, const std::string& w,
                    const std::vector<std::string>& k)
  : s_(t), resolve_(r), tables_(tb), where_(w), known_(k) {}

    Formula run()
    {
        skip();
        if (pos_ >= s_.size()) fail("the formula is empty");
        const int root = expr();
        skip();
        if (pos_ < s_.size())
            fail(std::string("unexpected '") + s_[pos_] + "' -- the formula"
                 " should have ended here");
        f_.root_ = root;
        std::sort(f_.slots_.begin(), f_.slots_.end());
        f_.slots_.erase(std::unique(f_.slots_.begin(), f_.slots_.end()), f_.slots_.end());
        return std::move(f_);
    }

private:
    using Op   = Formula::Op;
    using Node = Formula::Node;

    const std::string&              s_;
    const Formula::Resolver&        resolve_;
    const Formula::TableResolver&   tables_;
    const std::string&              where_;
    const std::vector<std::string>& known_;
    std::size_t pos_ = 0;
    Formula     f_;

    [[noreturn]] void fail(const std::string& why) const
    {
        std::ostringstream os;
        os << where_ << ": " << why << "\n    in   \"" << s_ << "\"\n"
           << "    at   " << std::string(std::min(pos_, s_.size()) + 6, ' ').substr(6)
           << "^ (column " << (pos_ + 1) << ")";
        throw std::runtime_error(os.str());
    }

    [[noreturn]] void failDims(const std::string& what, const Node& a,
                               const Node* b = nullptr) const
    {
        std::ostringstream os;
        os << what << " -- `" << f_.print(index(a), 0) << "` is " << dimsText(a.dims);
        if (b) os << " and `" << f_.print(index(*b), 0) << "` is " << dimsText(b->dims);
        fail(os.str());
    }

    int index(const Node& n) const
    {
        return static_cast<int>(&n - f_.nodes_.data());
    }

    void skip()
    {
        while (pos_ < s_.size() && std::isspace(static_cast<unsigned char>(s_[pos_]))) ++pos_;
    }

    int push(Node n)
    {
        f_.nodes_.push_back(std::move(n));
        return static_cast<int>(f_.nodes_.size()) - 1;
    }

    Node& at(int i) { return f_.nodes_[i]; }

    int binary(Op op, int a, int b)
    {
        Node n; n.op = op; n.a = a; n.b = b;
        const Node& A = at(a);
        const Node& B = at(b);
        switch (op)
        {
            case Op::Add: case Op::Sub: case Op::Min: case Op::Max:
                if (A.dims != B.dims)
                    failDims(std::string(op == Op::Add ? "`+` adds" : op == Op::Sub
                             ? "`-` subtracts" : op == Op::Min ? "`min` compares"
                             : "`max` compares") + " quantities of different dimensions", A, &B);
                n.dims = A.dims;
                break;
            case Op::Mul: n.dims = A.dims * B.dims; break;
            case Op::Div: n.dims = A.dims / B.dims; break;
            case Op::Pow:
            {
                if (!B.dims.isDimensionless())
                    failDims("an exponent must be dimensionless", B);
                if (A.dims.isDimensionless()) { n.dims = A.dims; break; }
                if (!B.isConst)
                    failDims("a dimensional quantity may only be raised to a"
                             " CONSTANT power (its dimensions would otherwise"
                             " change with the state); normalise it by a"
                             " reference first, e.g. `T / Kelvin` with"
                             " `Kelvin 1 K;`", A);
                const scalar p = B.constValue;
                int m, l, t, th, nn;
                if (!nearInteger(A.dims.M * p, m) || !nearInteger(A.dims.L * p, l)
                    || !nearInteger(A.dims.T * p, t) || !nearInteger(A.dims.Theta * p, th)
                    || !nearInteger(A.dims.N * p, nn))
                    failDims("raising this quantity to that power leaves"
                             " fractional dimensions, which this engine does"
                             " not represent; normalise it by a reference"
                             " quantity first (e.g. `P / atmosphere` with"
                             " `atmosphere 1 atm;`)", A);
                n.dims = Dimensions(m, l, t, th, nn);
                break;
            }
            default: break;
        }
        n.isConst = A.isConst && B.isConst;
        if (n.isConst)
        {
            const scalar x = A.constValue, y = B.constValue;
            switch (op)
            {
                case Op::Add: n.constValue = x + y; break;
                case Op::Sub: n.constValue = x - y; break;
                case Op::Mul: n.constValue = x * y; break;
                case Op::Div: n.constValue = x / y; break;
                case Op::Pow: n.constValue = std::pow(x, y); break;
                case Op::Min: n.constValue = std::min(x, y); break;
                case Op::Max: n.constValue = std::max(x, y); break;
                default: break;
            }
        }
        return push(std::move(n));
    }

    int expr()
    {
        int a = term();
        for (;;)
        {
            skip();
            if (pos_ < s_.size() && (s_[pos_] == '+' || s_[pos_] == '-'))
            {
                const char c = s_[pos_++];
                const int b = term();
                a = binary(c == '+' ? Op::Add : Op::Sub, a, b);
            }
            else return a;
        }
    }

    int term()
    {
        int a = unary();
        for (;;)
        {
            skip();
            if (pos_ < s_.size() && (s_[pos_] == '*' || s_[pos_] == '/'))
            {
                const char c = s_[pos_++];
                const int b = unary();
                a = binary(c == '*' ? Op::Mul : Op::Div, a, b);
            }
            else return a;
        }
    }

    int unary()
    {
        skip();
        if (pos_ < s_.size() && (s_[pos_] == '+' || s_[pos_] == '-'))
        {
            const char c = s_[pos_++];
            const int a = unary();
            if (c == '+') return a;
            Node n; n.op = Op::Neg; n.a = a;
            n.dims = at(a).dims;
            n.isConst = at(a).isConst;
            n.constValue = -at(a).constValue;
            return push(std::move(n));
        }
        return power();
    }

    int power()
    {
        const int a = primary();
        skip();
        if (pos_ < s_.size() && s_[pos_] == '^')
        {
            ++pos_;
            const int b = unary();
            return binary(Op::Pow, a, b);
        }
        return a;
    }

    int number()
    {
        const char* start = s_.c_str() + pos_;
        char* end = nullptr;
        const scalar v = std::strtod(start, &end);
        if (end == start) fail("expected a number");
        Node n; n.op = Op::Num; n.value = v;
        n.text = std::string(start, static_cast<std::size_t>(end - start));
        if (n.text.find_first_of("xXpP") != std::string::npos)
            fail("a hexadecimal number is not a number this grammar reads"
                 " -- write it in decimal");
        n.isConst = true; n.constValue = v;
        pos_ += static_cast<std::size_t>(end - start);
        return push(std::move(n));
    }

    std::string name()
    {
        std::string id;
        while (pos_ < s_.size()
               && (std::isalnum(static_cast<unsigned char>(s_[pos_])) || s_[pos_] == '_'))
            id += s_[pos_++];
        if (pos_ < s_.size() && s_[pos_] == '[')
        {
            const std::size_t close = s_.find(']', pos_);
            if (close == std::string::npos) fail("a `[` with no closing `]`");
            id += s_.substr(pos_, close - pos_ + 1);
            pos_ = close + 1;
        }
        return id;
    }

    int primary()
    {
        skip();
        if (pos_ >= s_.size()) fail("the formula ends where a value was expected");
        const char c = s_[pos_];
        if (c == '(')
        {
            ++pos_;
            const int a = expr();
            skip();
            if (pos_ >= s_.size() || s_[pos_] != ')') fail("expected `)`");
            ++pos_;
            return a;
        }
        if (std::isdigit(static_cast<unsigned char>(c)) || c == '.')
            return number();
        if (!(std::isalpha(static_cast<unsigned char>(c)) || c == '_'))
            fail(std::string("unexpected '") + c + "'");

        const std::size_t nameStart = pos_;
        const std::string id = name();
        skip();
        if (pos_ < s_.size() && s_[pos_] == '(')
        {
            ++pos_;
            std::vector<int> args;
            skip();
            if (pos_ < s_.size() && s_[pos_] == ')') fail("`" + id + "()` takes an argument");
            for (;;)
            {
                args.push_back(expr());
                skip();
                if (pos_ < s_.size() && s_[pos_] == ',') { ++pos_; continue; }
                if (pos_ < s_.size() && s_[pos_] == ')') { ++pos_; break; }
                fail("expected `,` or `)` in the arguments of `" + id + "`");
            }
            return call(id, args, nameStart);
        }

        const auto sym = resolve_(id);
        if (!sym)
        {
            pos_ = nameStart;
            fail("unknown name `" + id + "`." + closestHint(id, known_)
                 + "  A name is a symbol the reactor supplies (T, P, x[i],"
                   " c[i], p[i]), a declared parameter, or a definition.");
        }
        Node n;
        n.text = id;
        n.dims = sym->dims;
        if (sym->constant)
        {
            n.op = Op::Const; n.value = sym->value;
            n.isConst = true; n.constValue = sym->value;
        }
        else
        {
            n.op = Op::Slot; n.slot = sym->slot;
            f_.slots_.push_back(sym->slot);
        }
        return push(std::move(n));
    }

    int call(const std::string& fn, const std::vector<int>& args, std::size_t at0)
    {
        auto arity = [&](std::size_t k)
        {
            if (args.size() != k)
            {
                pos_ = at0;
                fail("`" + fn + "` takes " + std::to_string(k) + " argument"
                     + (k == 1 ? "" : "s") + ", got " + std::to_string(args.size()));
            }
        };
        auto dimensionless = [&](int a, const std::string& why)
        {
            if (!at(a).dims.isDimensionless()) failDims(why, at(a));
        };

        if (fn == "pow") { arity(2); return binary(Op::Pow, args[0], args[1]); }
        if (fn == "min") { arity(2); return binary(Op::Min, args[0], args[1]); }
        if (fn == "max") { arity(2); return binary(Op::Max, args[0], args[1]); }

        Op op;
        if      (fn == "exp")   op = Op::Exp;
        else if (fn == "ln")    op = Op::Ln;
        else if (fn == "log10") op = Op::Log10;
        else if (fn == "sqrt")  op = Op::Sqrt;
        else
        {
            const auto tab = tables_ ? tables_(fn) : nullptr;
            if (!tab)
            {
                pos_ = at0;
                static const std::vector<std::string> fns =
                    { "exp", "ln", "log10", "sqrt", "pow", "min", "max" };
                fail("unknown function `" + fn + "`." + closestHint(fn, fns)
                     + "  The functions are exp, ln, log10, sqrt, pow, min,"
                       " max, and every column of a declared table.");
            }
            arity(1);
            if (at(args[0]).dims != tab->xDims)
                failDims("table `" + tab->group + "` column `" + fn + "` is read"
                         " at an argument of dimensions " + dimsText(tab->xDims), at(args[0]));
            Node n; n.op = Op::Table; n.a = args[0]; n.table = tab;
            n.text = fn; n.dims = tab->yDims;
            return push(std::move(n));
        }
        arity(1);
        const int a = args[0];
        Node n; n.op = op; n.a = a; n.text = fn;
        if (op == Op::Sqrt)
        {
            const Dimensions& d = at(a).dims;
            if (d.M % 2 || d.L % 2 || d.T % 2 || d.Theta % 2 || d.N % 2)
                failDims("`sqrt` of a quantity with an odd dimensional exponent"
                         " has fractional dimensions; normalise it first", at(a));
            n.dims = Dimensions(d.M / 2, d.L / 2, d.T / 2, d.Theta / 2, d.N / 2);
        }
        else
        {
            dimensionless(a, "`" + fn + "` takes a dimensionless argument;"
                          " normalise it by a reference first (e.g. `T /"
                          " Kelvin` with `Kelvin 1 K;`)");
        }
        n.isConst = at(a).isConst;
        if (n.isConst)
        {
            const scalar x = at(a).constValue;
            n.constValue = op == Op::Exp ? std::exp(x) : op == Op::Ln ? std::log(x)
                         : op == Op::Log10 ? std::log10(x) : std::sqrt(x);
        }
        return push(std::move(n));
    }
};

Formula Formula::compile(const std::string&              text,
                         const Resolver&                 resolve,
                         const TableResolver&            tables,
                         const std::string&              where,
                         const std::vector<std::string>& known)
{
    FormulaCompiler c(text, resolve, tables, where, known);
    return c.run();
}

scalar Formula::evaluate(const std::vector<scalar>& slots, Trace* trace) const
{
    return eval(root_, slots, trace);
}

scalar Formula::eval(int i, const std::vector<scalar>& s, Trace* tr) const
{
    const Node& n = nodes_[i];
    switch (n.op)
    {
        case Op::Num:   return n.value;
        case Op::Const: return n.value;
        case Op::Slot:  return s[n.slot];
        case Op::Neg:   return -eval(n.a, s, tr);
        case Op::Add:   { const scalar x = eval(n.a, s, tr); return x + eval(n.b, s, tr); }
        case Op::Sub:   { const scalar x = eval(n.a, s, tr); return x - eval(n.b, s, tr); }
        case Op::Mul:   { const scalar x = eval(n.a, s, tr); return x * eval(n.b, s, tr); }
        case Op::Div:   { const scalar x = eval(n.a, s, tr); return x / eval(n.b, s, tr); }
        case Op::Pow:   { const scalar x = eval(n.a, s, tr); return std::pow(x, eval(n.b, s, tr)); }
        case Op::Min:   { const scalar x = eval(n.a, s, tr); return std::min(x, eval(n.b, s, tr)); }
        case Op::Max:   { const scalar x = eval(n.a, s, tr); return std::max(x, eval(n.b, s, tr)); }
        case Op::Exp:   return std::exp  (eval(n.a, s, tr));
        case Op::Ln:    return std::log  (eval(n.a, s, tr));
        case Op::Log10: return std::log10(eval(n.a, s, tr));
        case Op::Sqrt:  return std::sqrt (eval(n.a, s, tr));
        case Op::Table:
        {
            const Table& t = *n.table;
            const scalar x = eval(n.a, s, tr);
            const std::size_t m = t.x.size();
            if (!(x >= t.x.front() && x <= t.x.back()))
            {
                std::ostringstream os;
                os << "table `" << t.group << "` (column `" << t.name << "`) was"
                      " read at " << std::setprecision(8) << x / t.xFactor << " "
                   << t.xUnit << ", OUTSIDE its declared points ("
                   << t.x.front() / t.xFactor << " to " << t.x.back() / t.xFactor
                   << " " << t.xUnit << ").  A table has no form beyond its"
                      " points, so it is never extrapolated -- this REFUSES."
                      "  Declare a point that covers the state, or write a law"
                      " that does not read the table there.";
                throw std::runtime_error(os.str());
            }
            for (std::size_t k = 0; k < m; ++k)
                if (x == t.x[k]) return t.y[k];        // ON a point: its own value, exactly
            std::size_t k = 0;
            while (k + 2 < m && x > t.x[k + 1]) ++k;
            const scalar w = (x - t.x[k]) / (t.x[k + 1] - t.x[k]);
            if (tr)
            {
                std::ostringstream os;
                os << "table `" << t.group << "` LINEARLY INTERPOLATED between its"
                      " points at " << std::setprecision(6) << t.x[k] / t.xFactor
                   << " and " << t.x[k + 1] / t.xFactor << " " << t.xUnit
                   << " -- the linear rule is Choupo's, not the source's";
                const std::string msg = os.str();
                if (std::find(tr->interpolated.begin(), tr->interpolated.end(), msg)
                    == tr->interpolated.end())
                    tr->interpolated.push_back(msg);
            }
            return t.y[k] + w * (t.y[k + 1] - t.y[k]);
        }
    }
    return 0.0;
}

//  Precedence for printing: 1 additive, 2 multiplicative, 3 unary minus,
//  4 power, 5 atom.  A child is parenthesised when it binds looser than its
//  parent requires, so the printed text reproduces the PARSE.
std::string Formula::print(int i, int parentPrec) const
{
    const Node& n = nodes_[i];
    auto wrap = [&](int prec, const std::string& t)
    { return prec < parentPrec ? "(" + t + ")" : t; };
    switch (n.op)
    {
        case Op::Num:   return n.text;
        case Op::Const: case Op::Slot: return n.text;
        case Op::Neg:   return wrap(3, "-" + print(n.a, 4));
        case Op::Add:   return wrap(1, print(n.a, 1) + " + " + print(n.b, 2));
        case Op::Sub:   return wrap(1, print(n.a, 1) + " - " + print(n.b, 2));
        case Op::Mul:   return wrap(2, print(n.a, 2) + "*" + print(n.b, 3));
        case Op::Div:   return wrap(2, print(n.a, 2) + "/" + print(n.b, 3));
        case Op::Pow:   return wrap(4, print(n.a, 5) + "^" + print(n.b, 4));
        case Op::Min:   return "min(" + print(n.a, 0) + ", " + print(n.b, 0) + ")";
        case Op::Max:   return "max(" + print(n.a, 0) + ", " + print(n.b, 0) + ")";
        case Op::Exp: case Op::Ln: case Op::Log10: case Op::Sqrt: case Op::Table:
            return n.text + "(" + print(n.a, 0) + ")";
    }
    return "?";
}

std::string Formula::pretty() const
{
    return print(root_, 0);
}

} // namespace Choupo
