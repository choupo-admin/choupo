#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""property_grades -- the ONE home of the severity grades of a curation fit.

DEV.md 4c C336 (Vitor, 2026-11-12): the limits of a grade depend on the KIND
of property, in three classes, on the maximum error over the kept points:

  A  vapour pressure, liquid density, liquid Cp, bubble PRESSURE (per cent):
     clean to 5, warning to 10, severe to 20, refused above
  B  Henry constants, infinite-dilution activity coefficients, transport
     properties (viscosity, thermal conductivity, diffusivity, surface
     tension) (per cent): clean to 10, warning to 20, severe to 30, refused
     above -- laboratories themselves disagree by 10-30 % on these
  C  bubble TEMPERATURE (pairs) (kelvin): clean to 1, warning to 2, severe to
     4, refused above

Every tool that grades a fit reads its limits from HERE (c287_new_components,
pairs_c283 and through it pairs_px, henry_organic, transport_fit); none
carries a copy.  A property kind that is not in KIND_CLASS is refused by name
rather than defaulted.  The caps of C300 (in-sample, one laboratory, one
temperature) live in pairs_c283.cap_grade and still apply on top.
"""
GRADES = ("clean", "warning", "severe", "refused")

CLASS_A_PCT = (5.0, 10.0, 20.0)
CLASS_B_PCT = (10.0, 20.0, 30.0)
CLASS_C_K = (1.0, 2.0, 4.0)

KIND_CLASS = {
    "vaporPressure": "A", "liquidDensity": "A", "liquidCp": "A", "bubblePressure": "A",
    "henry": "B", "gammaInfinity": "B", "viscosity": "B", "thermalConductivity": "B",
    "diffusivity": "B", "surfaceTension": "B",
    "bubbleTemperature": "C",
}
LIMITS = {"A": CLASS_A_PCT, "B": CLASS_B_PCT, "C": CLASS_C_K}


def limits_of(kind):
    """The (clean, warning, severe) upper limits of a property kind."""
    if kind not in KIND_CLASS:
        raise KeyError(f"property_grades: no grade class for kind {kind!r} (known: {sorted(KIND_CLASS)})")
    return LIMITS[KIND_CLASS[kind]]


def grade_of(x, limits, nan=0):
    """clean / warning / severe / refused: the first upper limit x stays within."""
    if nan or x != x:
        return "refused"
    for g, lim in zip(GRADES, limits):
        if x <= lim:
            return g
    return GRADES[-1]


def limits_text(limits, unit="%"):
    return f"{limits[0]:g} / {limits[1]:g} / {limits[2]:g} {unit}"
