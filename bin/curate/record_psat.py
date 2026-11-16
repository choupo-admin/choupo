#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""record_psat -- a component record's own vapour-pressure law, evaluated in Python.

ONE home for the gates that recompute a saturation pressure from a record
instead of asking the engine (second opinions share no code with the C++).
Until 2026-11-16 every such gate parsed an Antoine block by regex, because
every record's law was Antoine.  Water's is now the IAPWS saturation equation
(`model Wagner`), so the parse lives here and knows both:

    Antoine : log10(P/bar) = A - B/(T/K + C)
    Wagner  : ln(P/Pr)    = (Tr/T) sum a_i tau^e_i,  tau = 1 - T/Tr
              (reducing { T <K>; P <pressure>; }, exponents, coefficients)

    psat_pa(record_text, T)         -> Pa
    tsat_k(record_text, P_pa)       -> K  (bisection, bracketed on the law's window)
    law_of(record_text)             -> ('Antoine'|'Wagner', params)

Anything else is refused by name (never a silent default).
"""
import math
import re

_UNITS = {"Pa": 1.0, "kPa": 1e3, "MPa": 1e6, "bar": 1e5, "atm": 101325.0}


def _vp_block(text):
    m = re.search(r"(?m)^vaporPressure\s*\{", text)
    if not m:
        raise ValueError("record has no vaporPressure block")
    depth, i = 0, m.end() - 1
    j = i
    while j < len(text):
        c = text[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
        j += 1
    body = text[i + 1:j]
    # comments out
    body = re.sub(r"//[^\n]*", "", body)
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    return body


def law_of(text):
    body = _vp_block(text)
    model = re.search(r"model\s+(\w+)\s*;", body)
    model = model.group(1) if model else None
    coeffs = [float(x) for x in re.search(r"coefficients\s*\(([^)]*)\)", body).group(1).split()]
    if model == "Antoine":
        return "Antoine", coeffs
    if model == "Wagner":
        red = re.search(r"reducing\s*\{\s*T\s+([0-9.eE+-]+)\s*K\s*;\s*P\s+([0-9.eE+-]+)\s*(\w+)\s*;", body)
        Tr, Pr, u = float(red.group(1)), float(red.group(2)), red.group(3)
        ex = [float(x) for x in re.search(r"exponents\s*\(([^)]*)\)", body).group(1).split()]
        return "Wagner", (Tr, Pr * _UNITS[u], ex, coeffs)
    raise ValueError("vaporPressure model %r: only Antoine and Wagner are read by this helper" % model)


def psat_pa(text, T):
    kind, p = law_of(text)
    if kind == "Antoine":
        A, B, C = p
        return 10.0 ** (A - B / (T + C)) * 1.0e5
    Tr, Pr, ex, co = p
    u = 1.0 - T / Tr
    return Pr * math.exp(Tr / T * sum(c * u ** e for c, e in zip(co, ex)))


def tsat_k(text, P_pa, lo=200.0, hi=640.0):
    f = lambda T: math.log(psat_pa(text, T) / P_pa)
    a, b = lo, hi
    for _ in range(200):
        m = 0.5 * (a + b)
        if f(a) * f(m) <= 0:
            b = m
        else:
            a = m
    return 0.5 * (a + b)
