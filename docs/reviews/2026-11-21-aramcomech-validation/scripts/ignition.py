#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""ignition -- the ONE definition of the ignition delay both codes are read with.

    from ignition import tau_maxdTdt, tau_crossing, read_choupo

Both codes are sampled on the SAME uniform grid (Choupo writes its state at every
deltaT; Cantera is advanced to the same instants with ReactorNet.advance), so the
grid values are each integrator's own solution at those times, never an interpolant
of the other code's steps.

  tau_maxdTdt: the time of the maximum of dT/dt.  dT/dt at the grid midpoints by
               first differences; the maximum is refined by the parabola through the
               largest midpoint value and its two neighbours (vertex time).
  tau_crossing: the time T first exceeds T0 + rise (400 K), linear between the two
               grid points that bracket it.
  tau_dpdt:    the same as tau_maxdTdt on the pressure (constant V only).
"""
import csv


def _parabola_vertex(x, y, i):
    """Vertex time of the parabola through (x[i-1..i+1], y[i-1..i+1]); x uniform."""
    if i <= 0 or i >= len(y) - 1:
        return x[i]
    y0, y1, y2 = y[i - 1], y[i], y[i + 1]
    den = y0 - 2.0 * y1 + y2
    if den == 0.0:
        return x[i]
    h = x[i + 1] - x[i]
    return x[i] + 0.5 * h * (y0 - y2) / den


def tau_max_slope(t, y):
    tm = [0.5 * (t[k] + t[k + 1]) for k in range(len(t) - 1)]
    d = [(y[k + 1] - y[k]) / (t[k + 1] - t[k]) for k in range(len(t) - 1)]
    i = max(range(len(d)), key=lambda k: d[k])
    return _parabola_vertex(tm, d, i), d[i]


def tau_maxdTdt(t, T):
    return tau_max_slope(t, T)[0]


def tau_crossing(t, T, rise=400.0):
    target = T[0] + rise
    for k in range(1, len(T)):
        if T[k] >= target:
            return t[k - 1] + (target - T[k - 1]) * (t[k] - t[k - 1]) / (T[k] - T[k - 1])
    return float("nan")


def read_choupo(case, unit="bomb"):
    """-> (t, T, P, {species: n}) from CASE/trajectory.csv (T and P columns as written)."""
    rows = list(csv.reader(open(case + "/trajectory.csv")))
    h = rows[0]
    col = {name: k for k, name in enumerate(h)}
    t = [float(r[0]) for r in rows[1:]]
    T = [float(r[col[unit + ".T"]]) for r in rows[1:]]
    P = [float(r[col[unit + ".P"]]) for r in rows[1:]] if unit + ".P" in col else None
    n = {name[len(unit) + 3:]: [float(r[k]) for r in rows[1:]] for name, k in col.items()
         if name.startswith(unit + ".n_")}
    return t, T, P, n
