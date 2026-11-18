# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
# within_tol.awk -- the ONE golden comparison (C429, 2026-11-18).
#
# bin/runTests (within_tol) and bin/curate/check_golden_comparator.py both run
# THIS file; there is no second implementation to drift from it.
#
#   single:  awk -v a=<actual> -v e=<expected> -v t=<tolerance> -f within_tol.awk
#            exit 0 PASS | 1 FAIL | 2 MISSING (actual empty) | 3 REFUSED (the
#            golden itself is not a finite number / not a valid tolerance)
#   batch:   awk -v batch=1 -f within_tol.awk   (stdin: actual TAB expected TAB tol,
#            one row per line; stdout: PASS|FAIL|MISSING|REFUSED per line)
#
# THE RULES.
#   tolerance `abs:<v>`   |a - e| <= v, in the row's own unit, whatever |e| is.
#   plain number t        a NON-ZERO expected is compared RELATIVELY, |a-e|/|e| <= t,
#                         whatever its size (until C429 an |e| <= 1e-9 was compared
#                         absolutely at the relative t, so it could move by any factor).
#   expected exactly 0    |a| <= t: "this quantity is zero", the claim a zero row makes.
#   actual NaN, inf or not a number   FAIL always (awk coerces "nan" to 0, which
#                         passed against an expected 0 or any abs: band).
#   expected NaN, inf or not a number REFUSED: a golden cannot pin what is not a number.
#   (`exact` words are compared by bin/runTests's check loop, never here.)

function isnum(s) {
    return s ~ /^[-+]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?$/
}

function verdict(a, e, t,    ae, diff, rel, band, isabs) {
    if (a == "")                       return "MISSING"
    if (!isnum(e))                     return "REFUSED"
    isabs = (substr(t, 1, 4) == "abs:")
    band = isabs ? substr(t, 5) : t
    if (!isnum(band))                  return "REFUSED"
    if (!isnum(a))                     return "FAIL"
    ae = (e + 0 < 0) ? -e : e + 0
    diff = a - e; if (diff < 0) diff = -diff
    if (isabs)                         return (diff <= band + 0) ? "PASS" : "FAIL"
    rel = (ae > 0) ? diff / ae : diff
    return (rel <= band + 0) ? "PASS" : "FAIL"
}

BEGIN {
    FS = "\t"
    if (batch) {
        while ((getline line) > 0) {
            n = split(line, f, "\t")
            print verdict(f[1], f[2], f[3])
        }
        exit 0
    }
    v = verdict(a, e, t)
    exit (v == "PASS") ? 0 : (v == "FAIL") ? 1 : (v == "MISSING") ? 2 : 3
}
