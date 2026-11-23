#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Geometric-mean ratio and scatter of each model against the measured delays (points.tsv)."""
import csv
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(HERE, "points.tsv")), delimiter="\t"))


def stat(a, b):
    ls = [math.log(float(r[a]) / float(r[b])) for r in rows]
    m = sum(ls) / len(ls)
    sd = math.sqrt(sum((x - m) ** 2 for x in ls) / (len(ls) - 1))
    return math.exp(m), math.exp(sd), min(float(r[a]) / float(r[b]) for r in rows), max(float(r[a]) / float(r[b]) for r in rows)


for a, b in [("aramco_us", "measured_us"), ("millerBowmanFull_us", "measured_us"), ("assembled_us", "measured_us"),
             ("c1Chain_us", "measured_us"), ("assembled_us", "millerBowmanFull_us"), ("c1Chain_us", "millerBowmanFull_us")]:
    g, s, lo, hi = stat(a, b)
    print("%-22s / %-22s geometric mean %.3f  scatter x%.2f  range %.3f .. %.3f" % (a, b, g, s, lo, hi))
