#!/usr/bin/env python3
"""Gate: every reference (multiparameter Helmholtz) equation of state the catalogue ships reproduces its publication's own check values, in the engine AND in an independent implementation.

    bin/curate/check_reference_eos.py

WHY THIS EXISTS.  A reference equation of state is a few hundred digits in a
record (data/standards/parameters/Helmholtz/<equation>.dat) and one kernel
(src/thermo/equationOfState/{HelmholtzEnergy,ReferenceFluid}.cpp).  A single
mistranscribed digit, or one wrong sign in one analytic derivative of one
term type, produces numbers that look like water and are not.  The
publications print CHECK VALUES for exactly this reason (IAPWS R6-95(2018)
Section 7: "to assist the user in computer-program verification").

WHAT IS CHECKED

  (a) INDEPENDENT RECOMPUTATION.  This file carries its own implementation
      of the reduced Helmholtz energy and its derivatives (written from the
      equations, not from the C++), its own property relations, its own
      density inversion and its own Maxwell saturation, reads each record
      with its own parser, and reproduces EVERY check value of the record at
      the published precision (half a unit in the last printed digit).
  (b) THE ENGINE AGREES.  The witness case
      tutorials/props/thermo/refEoS01_iapws95_verification is run; its log
      must report every check value of every equation it loads as
      reproduced (the engine refuses a record that fails, so a failing
      record is an exit != 0), and the state/saturation CSVs it writes (12
      significant digits) must agree with this file's recomputation of the
      same states to 1e-9 relative.
  (d) A GENERATED RECORD IS ITS TRANSCRIPTION: every record built from a
      page-image transcription under bin/curate/helmholtz/<fluid>/ is
      byte-identical to what bin/curate/helmholtz/gen_record.py makes of it
      (a hand edit of the record, or a transcription edit not regenerated,
      fails here).
  (c) A RECORD IS A COMPLETE CLAIM: every record under
      data/standards/parameters/Helmholtz/ names its equation as its file
      stem, its fluid, a citation, a url, the date it was read, a licence
      sentence, a validity window with the publication's words on
      extrapolation, an uncertainty statement and a non-empty checkValues
      block.

WHAT THIS DOES NOT CHECK.  It does not judge whether the publication's
equation is RIGHT (its uncertainty is the publication's statement, carried in
the record); it does not exercise the PureFluidModel route inside a
flowsheet; it does not cover a state near the critical point closer than the
publication's own check values do.

SABOTAGES (by hand, 2026-11-12; recorded in docs/design/reference-equations-of-state.md):
  S1  one digit of one residual coefficient changed in the record
      (IAPWS95 n_10) -- the engine refuses to load the record (exit != 0)
      and arm (a) fails on the same value.
  S2  the exponential term's a_dd made to drop its -c^2 delta^c term in
      HelmholtzEnergy.cpp -- the engine refuses (Table 6 ar_dd and Table 7
      cv/w fail); arm (a) still passes, so arm (b) names the engine.
  Slice 2 (2026-11-12), one coefficient per new fluid, changed in its
  TRANSCRIPTION in the 5th digit and regenerated:
  S3  CO2 Span-Wagner n_10 -- engine refuses (Table 34, 220 K psat); arm (a)
      misses 41 of 67.
  S4  N2 Span et al. n_10 -- engine refuses (saturation 70 K psat); arm (a)
      misses 11 of 67.
  S5  CH4 Setzmann-Wagner n_9 -- engine refuses (Table 39, 100 K psat); arm
      (a) misses 29 of 74.
  The same edit WITHOUT regenerating the record leaves the engine green and
  is caught by arm (d) alone.
"""
import math
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RECDIR = os.path.join(ROOT, "data", "standards", "parameters", "Helmholtz")
CASE = os.path.join(ROOT, "tutorials", "props", "thermo", "refEoS01_iapws95_verification")

FAIL = []


def fail(arm, msg):
    FAIL.append(f"({arm}) {msg}")


# ---------------------------------------------------------------------------
#  A small reader of the Choupo dict grammar, enough for these records.
# ---------------------------------------------------------------------------
UNITS = {"K": 1.0, "kg/m3": 1.0, "J/kg/K": 1.0, "J/kg": 1.0, "Pa": 1.0,
         "MPa": 1.0e6, "kPa": 1.0e3, "m/s": 1.0, "m3/kg": 1.0, "bar": 1.0e5}


def tokens(text):
    """Strings first (a `//` inside a quoted URL is not a comment), then
    comments, then punctuation and words."""
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c == '"':
            j = text.index('"', i + 1); out.append(text[i:j + 1]); i = j + 1
        elif text.startswith("//", i):
            j = text.find("\n", i); i = n if j < 0 else j
        elif text.startswith("/*", i):
            i = text.index("*/", i) + 2
        elif c == "[":
            j = text.index("]", i); out.append(text[i:j + 1]); i = j + 1
        elif c in "{}();":
            out.append(c); i += 1
        elif c.isspace():
            i += 1
        else:
            j = i
            while j < n and not text[j].isspace() and text[j] not in '{}();"' \
                    and not text.startswith("//", j):
                j += 1
            out.append(text[i:j]); i = j
    return out


def parse_block(tk, i):
    d = {}
    while i < len(tk) and tk[i] != "}":
        key = tk[i]; i += 1
        if tk[i] == "{":
            sub, i = parse_block(tk, i + 1); d[key] = sub; i += 1
        elif tk[i] == "(":
            i += 1
            if tk[i] == "{":
                lst = []
                while tk[i] == "{":
                    sub, i = parse_block(tk, i + 1); lst.append(sub); i += 1
                d[key] = lst
            else:
                lst = []
                while tk[i] != ")":
                    lst.append(float(tk[i])); i += 1
                d[key] = lst
            i += 1                      # ')'
            if i < len(tk) and tk[i] == ";": i += 1
        else:
            vals = []
            while tk[i] != ";":
                vals.append(tk[i]); i += 1
            i += 1
            d[key] = vals
    return d, i


def read_record(path):
    d, _ = parse_block(tokens(open(path, encoding="utf-8").read()) + ["}"], 0)
    return d


def num(v):
    """A scalar entry: [value] or [value unit] or [[dims] value]."""
    v = [x for x in v if not x.startswith("[")]
    x = float(v[0])
    if len(v) > 1:
        x *= UNITS[v[1]]
    return x


def word(v):
    return " ".join(v).strip('"')


# ---------------------------------------------------------------------------
#  The independent kernel.  Each term type returns (a, a_d, a_dd, a_t, a_tt, a_dt).
# ---------------------------------------------------------------------------
class Equation:
    def __init__(self, rec):
        self.Tc = num(rec["reducing"]["Tc"]); self.rhoc = num(rec["reducing"]["rhoc"])
        self.R = num(rec["R"])
        self.Tt = num(rec["triplePoint"]["T"])
        self.ideal = rec["ideal"]; self.res = rec["residual"]

    def alpha0(self, de, ta):
        a = [math.log(de), 1 / de, -1 / de ** 2, 0.0, 0.0, 0.0]
        for key, g in self.ideal.items():
            if key == "lead":
                a1, a2 = g
                a[0] += a1 + a2 * ta; a[3] += a2
            elif key == "logTau":
                n = num(g)
                a[0] += n * math.log(ta); a[3] += n / ta; a[4] += -n / ta ** 2
            elif key == "power":
                for n, t in zip(g["n"], g["t"]):
                    a[0] += n * ta ** t; a[3] += n * t * ta ** (t - 1); a[4] += n * t * (t - 1) * ta ** (t - 2)
            elif key == "planckEinstein":
                for n, ga in zip(g["n"], g["gamma"]):
                    e = math.exp(-ga * ta)
                    a[0] += n * math.log(1 - e)
                    # d/dtau ln(1-e^{-g tau}) = g e/(1-e); second = -g^2 e/(1-e)^2
                    a[3] += n * ga * e / (1 - e)
                    a[4] += -n * ga * ga * e / (1 - e) ** 2
            else:
                raise ValueError("ideal term " + key)
        return a

    def alphar(self, de, ta):
        a = [0.0] * 6
        for key, g in self.res.items():
            if key == "power":
                for n, d, t in zip(g["n"], g["d"], g["t"]):
                    x = n * de ** d * ta ** t
                    a[0] += x; a[1] += x * d / de; a[2] += x * d * (d - 1) / de ** 2
                    a[3] += x * t / ta; a[4] += x * t * (t - 1) / ta ** 2; a[5] += x * d * t / (de * ta)
            elif key == "exponential":
                for n, d, t, c in zip(g["n"], g["d"], g["t"], g["c"]):
                    # f = n de^d ta^t exp(-de^c); write f = x(de,ta), dl = d ln f / d de
                    x = n * de ** d * ta ** t * math.exp(-de ** c)
                    dc = de ** c
                    dl = (d - c * dc) / de                         # d ln f/d de
                    # f''/f = dl^2 + d(dl)/d de = [(d - c dc)(d - 1 - c dc) - c^2 dc]/de^2,
                    # expanded so that d = 1 at a tiny de does not cancel 1 - 1
                    ddf = ((d - c * dc) * ((d - 1) - c * dc) - c * c * dc) / de ** 2
                    tl = t / ta; tl2 = -t / ta ** 2
                    a[0] += x; a[1] += x * dl; a[2] += x * ddf
                    a[3] += x * tl; a[4] += x * (tl * tl + tl2); a[5] += x * dl * tl
            elif key == "gaussian":
                for n, d, t, al, be, ga, ep in zip(g["n"], g["d"], g["t"], g["alpha"], g["beta"], g["gamma"], g["epsilon"]):
                    x = n * de ** d * ta ** t * math.exp(-al * (de - ep) ** 2 - be * (ta - ga) ** 2)
                    dl = d / de - 2 * al * (de - ep); dl2 = -d / de ** 2 - 2 * al
                    tl = t / ta - 2 * be * (ta - ga); tl2 = -t / ta ** 2 - 2 * be
                    a[0] += x; a[1] += x * dl; a[2] += x * (dl * dl + dl2)
                    a[3] += x * tl; a[4] += x * (tl * tl + tl2); a[5] += x * dl * tl
            elif key == "nonAnalytic":
                for n, aa, b, B, C, D, A, be in zip(g["n"], g["a"], g["b"], g["B"], g["C"], g["D"], g["A"], g["beta"]):
                    dl = de if abs(de - 1) >= 1e-12 else 1 + 1e-12
                    r = self._nonanalytic(n, aa, b, B, C, D, A, be, dl, ta)
                    for k in range(6): a[k] += r[k]
            else:
                raise ValueError("residual term " + key)
        return a

    @staticmethod
    def _nonanalytic(n, a, b, B, C, D, A, be, de, ta):
        # Independent route: a central-difference-free closed form written
        # through the chain rule on F = Delta^b * de * psi, with
        # q = (de-1)^2,  theta = (1-ta) + A q^(1/(2be)),  Delta = theta^2 + B q^a.
        q = (de - 1) ** 2
        th = (1 - ta) + A * q ** (1 / (2 * be))
        De = th * th + B * q ** a
        ps = math.exp(-C * q - D * (ta - 1) ** 2)
        # derivatives of q, theta, Delta w.r.t. de
        q1 = 2 * (de - 1); q2 = 2.0
        m = 1 / (2 * be)
        th1 = A * m * q ** (m - 1) * q1
        th2 = A * m * ((m - 1) * q ** (m - 2) * q1 * q1 + q ** (m - 1) * q2)
        De1 = 2 * th * th1 + B * a * q ** (a - 1) * q1
        De2 = 2 * (th1 * th1 + th * th2) + B * a * ((a - 1) * q ** (a - 2) * q1 * q1 + q ** (a - 1) * q2)
        # w.r.t. ta: theta_t = -1
        De_t = -2 * th; De_tt = 2.0; De_dt = -2 * th1
        Db = De ** b
        Db_d = b * De ** (b - 1) * De1
        Db_dd = b * ((b - 1) * De ** (b - 2) * De1 * De1 + De ** (b - 1) * De2)
        Db_t = b * De ** (b - 1) * De_t
        Db_tt = b * ((b - 1) * De ** (b - 2) * De_t * De_t + De ** (b - 1) * De_tt)
        Db_dt = b * ((b - 1) * De ** (b - 2) * De1 * De_t + De ** (b - 1) * De_dt)
        ps_d = -C * q1 * ps; ps_dd = (C * C * q1 * q1 - C * q2) * ps
        ps_t = -2 * D * (ta - 1) * ps; ps_tt = (4 * D * D * (ta - 1) ** 2 - 2 * D) * ps
        ps_dt = -C * q1 * ps_t
        # G = de * psi
        G = de * ps; G_d = ps + de * ps_d; G_dd = 2 * ps_d + de * ps_dd
        G_t = de * ps_t; G_tt = de * ps_tt; G_dt = ps_t + de * ps_dt
        return [n * Db * G,
                n * (Db_d * G + Db * G_d),
                n * (Db_dd * G + 2 * Db_d * G_d + Db * G_dd),
                n * (Db_t * G + Db * G_t),
                n * (Db_tt * G + 2 * Db_t * G_t + Db * G_tt),
                n * (Db_dt * G + Db_d * G_t + Db_t * G_d + Db * G_dt)]

    # ---- properties ---------------------------------------------------------
    def state(self, T, rho):
        de = rho / self.rhoc; ta = self.Tc / T
        o = self.alpha0(de, ta); r = self.alphar(de, ta)
        R = self.R; RT = R * T
        s = {"rho": rho, "a0": o, "ar": r}
        s["p"] = rho * RT * (1 + de * r[1])
        s["u"] = RT * ta * (o[3] + r[3])
        s["h"] = RT * (1 + ta * (o[3] + r[3]) + de * r[1])
        s["s"] = R * (ta * (o[3] + r[3]) - o[0] - r[0])
        s["g"] = RT * (1 + o[0] + r[0] + de * r[1])
        s["cv"] = -R * ta * ta * (o[4] + r[4])
        num_ = 1 + de * r[1] - de * ta * r[5]
        den = 1 + 2 * de * r[1] + de * de * r[2]
        s["cp"] = s["cv"] + R * num_ ** 2 / den
        w2 = RT * (den - num_ ** 2 / (ta * ta * (o[4] + r[4])))
        # inside the unstable region a trial root may have w^2 < 0 (cv < 0):
        # not a state, and only its g is read there
        s["w"] = math.sqrt(w2) if w2 >= 0 else float("nan")
        s["phi"] = math.exp(r[0] + de * r[1] - math.log(1 + de * r[1]))
        s["dpdrho"] = RT * den
        return s

    def p(self, T, rho):
        de = rho / self.rhoc
        return rho * self.R * T * (1 + de * self.alphar(de, self.Tc / T)[1])

    def dpdrho(self, T, rho):
        de = rho / self.rhoc
        r = self.alphar(de, self.Tc / T)
        return self.R * T * (1 + 2 * de * r[1] + de * de * r[2])

    def _bisect(self, f, a, b, n=200):
        fa = f(a)
        for _ in range(n):
            m = 0.5 * (a + b)
            if b - a <= 1e-16 * abs(m): break
            fm = f(m)
            if (fm > 0) == (fa > 0): a, fa = m, fm
            else: b = m
        return 0.5 * (a + b)

    def saturation(self, T):
        if not hasattr(self, "_sat"): self._sat = {}
        if T not in self._sat: self._sat[T] = self._saturation(T)
        return self._sat[T]

    def spinodals(self, T):
        if not hasattr(self, "_spin"): self._spin = {}
        if T in self._spin: return self._spin[T]
        rc = self.rhoc
        rho = 1e-12 * rc
        while self.dpdrho(T, rho * 1.01) > 0: rho *= 1.01
        rV = self._bisect(lambda r: self.dpdrho(T, r), rho, rho * 1.01)
        rho = 4 * rc
        while self.dpdrho(T, rho / 1.001) > 0 and rho > rV: rho /= 1.001
        rL = self._bisect(lambda r: -self.dpdrho(T, r), rho / 1.001, rho)
        self._spin[T] = (rV, rL)
        return rV, rL

    def density(self, T, p):
        """The stable root of p(T, rho) = p.  Below T_c: the branch this
        file's own Maxwell psat names, bisected inside the spinodal bracket.
        Above T_c: every crossing of a geometric scan, the lowest g taken."""
        rc = self.rhoc
        if T < self.Tc:
            psat = self.saturation(T)[0]
            rV, rL = self.spinodals(T)
            if p < psat:
                return self._bisect(lambda r: self.p(T, r) - p, 1e-15 * rc, rV * (1 - 1e-12))
            hi = 4 * rc
            while self.p(T, hi) < p: hi *= 1.1
            return self._bisect(lambda r: self.p(T, r) - p, rL * (1 + 1e-12), hi)
        grid = [rc * 1e-12 * (5e12) ** (i / 3000) for i in range(3001)]
        best = None
        for x, y in zip(grid, grid[1:]):
            fx, fy = self.p(T, x) - p, self.p(T, y) - p
            if (fx > 0) != (fy > 0):
                r = self._bisect(lambda z: self.p(T, z) - p, x, y)
                if self.dpdrho(T, r) > 0:
                    g = self.state(T, r)["g"]
                    if best is None or g < best[0]: best = (g, r)
        return best[1]

    def _saturation(self, T):
        """Maxwell: equal p and g.  An INDEPENDENT route from the C++: the
        vapour spinodal is found by walking DOWN in density from the ideal-gas
        side on a geometric grid, and the equal-g pressure by plain bisection
        in ln p (no Newton)."""
        rc = self.rhoc
        # spinodals: the vapour one walking UP from 1e-12 rc, the liquid one
        # walking DOWN from 4 rc (never through the unstable stretch)
        rV_sp, rL_sp = self.spinodals(T)
        pTop = self.p(T, rV_sp)
        pBot = max(self.p(T, rL_sp), 1e-12 * pTop)

        def roots(p):
            rv = self._bisect(lambda r: self.p(T, r) - p, 1e-15 * rc, rV_sp * (1 - 1e-12))
            rl = self._bisect(lambda r: self.p(T, r) - p, rL_sp * (1 + 1e-12), 4 * rc)
            return rl, rv

        a, b = math.log(pBot), math.log(pTop * (1 - 1e-12))
        for _ in range(200):
            m = 0.5 * (a + b)
            rl, rv = roots(math.exp(m))
            dg = self.state(T, rl)["g"] - self.state(T, rv)["g"]
            if dg > 0: a = m
            else: b = m
            if b - a < 1e-16: break
        p = math.exp(0.5 * (a + b))
        rl, rv = roots(p)
        return p, self.state(T, rl), self.state(T, rv)

    def virial(self, T):
        de = 1e-14; ta = self.Tc / T
        r = self.alphar(de, ta)
        return r[1] / self.rhoc, r[2] / self.rhoc ** 2


def judge(pub, calc, digits, scale=1.0):
    """Half a unit in the last digit PRINTED; `scale` (the record's
    printedScale) maps a converted value back to the number on the page."""
    if pub == 0.0:
        return abs(calc) < 1e-12, abs(calc)
    e = math.floor(math.log10(abs(pub / scale)))
    ulp = 10.0 ** (e - digits + 1) * abs(scale)
    return abs(calc - pub) <= 0.5 * ulp * (1 + 1e-9), abs(calc - pub) / abs(pub)


def recompute(eq, cv):
    """Every check value of one record: (label, ok, relDev)."""
    out = []
    A0 = ["a0", "a0_d", "a0_dd", "a0_t", "a0_tt", "a0_dt"]
    AR = ["ar", "ar_d", "ar_dd", "ar_t", "ar_tt", "ar_dt"]
    for e in cv.get("reducedHelmholtz", []):
        T, rho, dig = num(e["T"]), num(e["rho"]), int(num(e["digits"]))
        sc = num(e["printedScale"]) if "printedScale" in e else 1.0
        s = eq.state(T, rho)
        for k, name in enumerate(A0):
            if name in e: out.append((f"{word(e['table'])} {name}",) + judge(num(e[name]), s["a0"][k], dig, sc))
        for k, name in enumerate(AR):
            if name in e: out.append((f"{word(e['table'])} {name}",) + judge(num(e[name]), s["ar"][k], dig, sc))
    for e in cv.get("singlePhase", []):
        T, rho, dig = num(e["T"]), num(e["rho"]), int(num(e["digits"]))
        sc = num(e["printedScale"]) if "printedScale" in e else 1.0
        s = eq.state(T, rho)
        for k in ("p", "cv", "cp", "w", "s", "h", "u"):
            if k in e: out.append((f"{word(e['table'])} T={T} rho={rho} {k}",) + judge(num(e[k]), s[k], dig, sc))
    for e in cv.get("pTState", []):
        T, p, dig = num(e["T"]), num(e["p"]), int(num(e["digits"]))
        sc = num(e["printedScale"]) if "printedScale" in e else 1.0
        s = eq.state(T, eq.density(T, p))
        for k in ("rho", "u", "h", "s", "cv", "cp", "w"):
            if k in e: out.append((f"{word(e['table'])} T={T} p={p} {k}",) + judge(num(e[k]), s[k], dig, sc))
    for e in cv.get("saturation", []):
        T, dig = num(e["T"]), int(num(e["digits"]))
        sc = num(e["printedScale"]) if "printedScale" in e else 1.0
        p, L, V = eq.saturation(T)
        got = {"psat": p, "rhoL": L["rho"], "rhoV": V["rho"], "hL": L["h"], "hV": V["h"], "sL": L["s"], "sV": V["s"],
               "cvL": L["cv"], "cvV": V["cv"], "cpL": L["cp"], "cpV": V["cp"], "wL": L["w"], "wV": V["w"]}
        for k, v in got.items():
            if k in e: out.append((f"{word(e['table'])} T={T} {k}",) + judge(num(e[k]), v, dig, sc))
    for e in cv.get("virial", []):
        T, dig = num(e["T"]), int(num(e["digits"]))
        sc = num(e["printedScale"]) if "printedScale" in e else 1.0
        B, C = eq.virial(T)
        if "B" in e: out.append((f"{word(e['table'])} B",) + judge(num(e["B"]), B, dig, sc))
        if "C" in e: out.append((f"{word(e['table'])} C",) + judge(num(e["C"]), C, dig, sc))
    return out


REQUIRED = ["recordType", "equation", "fluid", "citation", "url", "read", "licence",
            "reducing", "R", "triplePoint", "validity", "uncertainty", "ideal",
            "residual", "checkValues"]


def main():
    recs = sorted(f for f in os.listdir(RECDIR) if f.endswith(".dat"))
    if not recs:
        fail("c", f"no record under {RECDIR}")
    eqs = {}
    total = 0
    for f in recs:
        path = os.path.join(RECDIR, f)
        rec = read_record(path)
        for k in REQUIRED:
            if k not in rec: fail("c", f"{f}: missing `{k}`")
        if word(rec.get("equation", [""])) != f[:-4]:
            fail("c", f"{f}: `equation` is not the file stem")
        v = rec.get("validity", {})
        for k in ("Tmin", "Tmax", "pMax", "extrapolation"):
            if k not in v: fail("c", f"{f}: validity lacks `{k}`")
        if FAIL: continue
        eq = Equation(rec); eqs[f[:-4]] = eq
        res = recompute(eq, rec["checkValues"])
        if not res: fail("c", f"{f}: empty checkValues")
        bad = [r for r in res if not r[1]]
        worst = max(r[2] for r in res)
        for r in bad: fail("a", f"{f}: {r[0]} NOT reproduced independently (rel dev {r[2]:.3e})")
        print(f"[check_reference_eos] {f[:-4]}: {len(res) - len(bad)}/{len(res)} check values "
              f"reproduced independently, worst relative deviation {worst:.2e}")
        total += len(res)

    # (d) every generated record is the generation of its committed transcription
    gen = subprocess.run([sys.executable, os.path.join(ROOT, "bin", "curate", "helmholtz", "gen_record.py"), "--check"],
                         capture_output=True, text=True)
    if gen.returncode != 0:
        fail("d", gen.stdout.strip() or gen.stderr.strip())

    # (b) the engine
    exe = os.path.join(ROOT, "choupoProps")
    for fn in os.listdir(CASE):            # never compare a previous run's CSV
        if fn.endswith(".csv"): os.remove(os.path.join(CASE, fn))
    run = subprocess.run([exe, "."], cwd=CASE, capture_output=True, text=True)
    log = run.stdout + run.stderr
    if run.returncode != 0:
        fail("b", f"the witness case exits {run.returncode}: {log.strip().splitlines()[-1] if log.strip() else ''}")
    for m in re.finditer(r"\[referenceEoS\]\s+check values of the publication reproduced at the printed precision: (\d+) / (\d+)", log):
        if m.group(1) != m.group(2):
            fail("b", f"engine reproduces {m.group(1)}/{m.group(2)} check values")
    if not re.search(r"reproduced at the printed precision", log):
        fail("b", "the engine log carries no check-value line")
    nCsv = 0
    for fn in sorted(os.listdir(CASE)):
        if not fn.endswith(".csv"): continue
        rows = open(os.path.join(CASE, fn)).read().split()
        head = rows[0].split(","); vals = [float(x) for x in rows[1].split(",")]
        row = dict(zip(head, vals))
        eqname = fn.split("_")[0]
        eq = eqs.get(eqname)
        if eq is None:
            fail("b", f"{fn}: no record '{eqname}' for the CSV's prefix"); continue
        if "psat" in row:
            p, L, V = eq.saturation(row["T"])
            want = {"psat": p, "rhoL": L["rho"], "rhoV": V["rho"], "hL": L["h"], "hV": V["h"], "sL": L["s"], "sV": V["s"]}
        else:
            s = eq.state(row["T"], row["rho"])
            want = {k: s[k] for k in ("p", "h", "u", "s", "g", "cp", "cv", "w", "phi")}
        for k, v in want.items():
            if abs(row[k] - v) > 1e-9 * max(abs(v), 1e-300) and abs(row[k] - v) > 1e-9:
                fail("b", f"{fn}: engine {k} = {row[k]!r}, recomputed {v!r}")
        nCsv += 1
    if nCsv == 0:
        fail("b", "the witness wrote no CSV to compare")

    if FAIL:
        for f in FAIL: print("check_reference_eos: FAIL " + f)
        return 1
    print(f"check_reference_eos: OK -- {len(eqs)} reference equation(s) "
          f"({', '.join(sorted(eqs))}); {total} published check values reproduced at the "
          f"printed precision by an independent implementation and by the engine; "
          f"{nCsv} engine states agree with the recomputation to 1e-9.  NOT checked: "
          f"whether an equation is right (its uncertainty is the publication's), the "
          f"flowsheet route, states nearer the critical point than the check values.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
