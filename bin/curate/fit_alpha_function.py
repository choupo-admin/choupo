#!/usr/bin/env python3
"""fit_alpha_function.py -- CURATE a cubic's Mathias-Copeman alpha constants.

DEV.md 4c C408, slice 0 (docs/design/c408-eos-ge-mixing-rules.md, ruling 2).

WHAT IT DOES.  Fits c1, c2, c3 of the Mathias-Copeman alpha function

    alpha(Tr) = [ 1 + c1 x + c2 x^2 + c3 x^3 ]^2 ,  x = 1 - sqrt(Tr)   (Tr <= 1)
    alpha(Tr) = [ 1 + c1 x ]^2                                         (Tr  > 1)

(Poling, Prausnitz & O'Connell, The Properties of Gases and Liquids, 5th ed.,
Table 4-7, pp. 4.19-4.20, which prints the Tr <= 1 form; the Tr > 1 branch is
Mathias & Copeman, Fluid Phase Equilib. 13 (1983) 91, NOT held, and is the
engine's own continuous extension, announced in the Theory Guide) of ONE cubic
(SRK or Peng-Robinson) to the component record's OWN vapour-pressure law, over
the window THAT LAW declares.  It writes the three constants into the record
as a `cubicAlpha { <cubic> { ... } }` block with a provenance entry
(`origin derived`; the law fitted to, the window, the largest deviation, a
value sha), and never reads a constant from a table.

Nothing estimates during a simulation (record-rule 6): this is the curation
act.  The engine refuses `alphaFunction MathiasCopeman;` for a component whose
record lacks the block, and names this tool.

USAGE
    bin/curate/fit_alpha_function.py <component> --cubic SRK|PengRobinson
        [--records data/standards/components] [--write] [--report]

Without --write it prints the fit and the before/after Psat table and touches
nothing.  Supported law: Antoine (log10 P/bar = A - B/(T/K + C)); any other
law, or a record whose Tb is annotated as a SUBLIMATION point (the law is then
not the liquid-vapour curve a cubic can reproduce), is REFUSED by name.

EXIT: 0 fitted (and written with --write); 2 refused; 1 error.
"""
import argparse
import hashlib
import math
import os
import re
import sys

import numpy as np


def brentq(f, a, b, xtol=1e-13):
    """Bisection to xtol (numpy only: the tree's curation tools take no scipy)."""
    fa = f(a)
    for _ in range(200):
        m = 0.5 * (a + b)
        fm = f(m)
        if fm == 0.0 or 0.5 * (b - a) < xtol:
            return m
        if fa * fm < 0:
            b = m
        else:
            a, fa = m, fm
    return 0.5 * (a + b)


class _Fit:
    pass


def least_squares(fun, x0, **_):
    """Levenberg-Marquardt with a forward-difference Jacobian (3 parameters)."""
    x = np.array(x0, float)
    r = fun(x)
    lam = 1e-3
    for _ in range(200):
        J = np.empty((len(r), len(x)))
        for k in range(len(x)):
            h = 1e-6 * max(1.0, abs(x[k]))
            xp = x.copy()
            xp[k] += h
            J[:, k] = (fun(xp) - r) / h
        g = J.T @ r
        H = J.T @ J
        improved = False
        for _try in range(30):
            try:
                dx = np.linalg.solve(H + lam * np.diag(np.diag(H) + 1e-12), -g)
            except np.linalg.LinAlgError:
                lam *= 10
                continue
            rn = fun(x + dx)
            if rn @ rn < r @ r:
                x, r, lam, improved = x + dx, rn, max(lam / 10, 1e-12), True
                break
            lam *= 10
        if not improved or np.linalg.norm(dx) < 1e-13 * (1 + np.linalg.norm(x)):
            break
    out = _Fit()
    out.x = x
    return out

R = 8.314462618          # J/(mol K)  -- the value only scales a_c, b; cancels in Z, phi
CUBICS = {
    #            eps, sig, omegaA, omegaB   (src/thermo/equationOfState/SRK.cpp, PR.cpp)
    "SRK":          (0.0, 1.0, 0.42747, 0.08664),
    "PengRobinson": (1.0 - math.sqrt(2.0), 1.0 + math.sqrt(2.0), 0.45724, 0.07780),
}
TOOL = "bin/curate/fit_alpha_function.py"


# ----------------------------------------------------------------------------
#  record text helpers (comment- and string-aware brace matching)
# ----------------------------------------------------------------------------
def _scan(text):
    """Yield (index, char) of structural characters outside comments/strings."""
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == "/" and text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        if c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 1
            i = j + 1
            continue
        yield i, c
        i += 1


def top_blocks(text):
    """{name: (start_of_name, open_brace, close_brace)} for the record's top-level blocks."""
    out, depth, last_word_start, last_word = {}, 0, None, None
    word = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
    stack_start = {}
    pos = 0
    for i, c in _scan(text):
        if depth == 0 and c == "{":
            pre = text[pos:i]
            m = None
            for m in word.finditer(pre):
                pass
            if m:
                stack_start[0] = (m.group(0), pos + m.start(), i)
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0 and 0 in stack_start:
                nm, s, o = stack_start.pop(0)
                out[nm] = (s, o, i)
                pos = i + 1
        elif c == ";" and depth == 0:
            pos = i + 1
    return out


def sub_blocks(text, o, c):
    """Direct sub-blocks of the block whose braces are at text[o], text[c]."""
    body = text[o + 1:c]
    res, depth, pos = {}, 0, 0
    word = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
    cur = None
    for i, ch in _scan(body):
        if ch == "{":
            if depth == 0:
                m = None
                for m in word.finditer(body[pos:i]):
                    pass
                cur = (m.group(0), pos + m.start(), i) if m else None
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and cur:
                res[cur[0]] = (o + 1 + cur[1], o + 1 + cur[2], o + 1 + i)
                pos = i + 1
        elif ch == ";" and depth == 0:
            pos = i + 1
    return res


def scalar(text, key):
    m = re.search(r"(?m)^\s*" + key + r"\s+([-+0-9.eE]+)\s*;", text)
    return float(m.group(1)) if m else None


# ----------------------------------------------------------------------------
#  the cubic, pure component
# ----------------------------------------------------------------------------
def pure_phi_diff(T, P, g, Tc, Pc, cub):
    """ln phi_L - ln phi_V of the pure cubic at (T, P) with sqrt(alpha) = g.
    None when the isotherm has no liquid/vapour pair at this P."""
    eps, sig, Oa, Ob = CUBICS[cub]
    a = Oa * R * R * Tc * Tc / Pc * g * g
    b = Ob * R * Tc / Pc
    A = a * P / (R * T) ** 2
    B = b * P / (R * T)
    c2 = (eps + sig - 1.0) * B - 1.0
    c1 = eps * sig * B * B - (eps + sig) * (B * B + B) + A
    c0 = -(eps * sig * (B ** 3 + B ** 2) + A * B)
    rts = np.roots([1.0, c2, c1, c0])
    zr = sorted(z.real for z in rts if abs(z.imag) < 1e-9 * max(1.0, abs(z.real)) and z.real > B)
    if len(zr) < 2:
        return None
    ZL, ZV = zr[0], zr[-1]

    def lnphi(Z):
        return (Z - 1.0) - math.log(Z - B) - (A / B) * math.log((Z + sig * B) / (Z + eps * B)) / (sig - eps)

    return lnphi(ZL) - lnphi(ZV)


def psat(T, g, Tc, Pc, cub, P0):
    """Saturation pressure [Pa] of the cubic at T, bracketed about P0; None if absent."""
    f = lambda lp: pure_phi_diff(T, math.exp(lp), g, Tc, Pc, cub)
    lo, hi = math.log(P0), math.log(P0)
    flo = f(lo)
    for k in range(1, 60):
        step = 0.02 * k
        for cand in (math.log(P0) - step, math.log(P0) + step):
            fc = f(cand)
            if fc is None:
                continue
            if flo is not None and fc * flo < 0:
                return math.exp(brentq(lambda x: f(x) if f(x) is not None else 1e9, min(cand, lo), max(cand, lo), xtol=1e-13))
            if flo is None:
                lo, flo = cand, fc
    return None


def mc_g(T, Tc, c1, c2, c3):
    x = 1.0 - math.sqrt(T / Tc)
    if T <= Tc:
        return 1.0 + x * (c1 + x * (c2 + x * c3))
    return 1.0 + c1 * x


def soave_slope(omega):                       # SRK.cpp:soave_m (Graboski-Daubert)
    return 0.48508 + 1.55171 * omega - 0.15613 * omega ** 2


def pr_slope(omega):                          # PR.cpp:pr_kappa (PR78)
    if omega <= 0.491:
        return 0.37464 + 1.54226 * omega - 0.26992 * omega ** 2
    return 0.379642 + 1.48503 * omega - 0.164423 * omega ** 2 + 0.016666 * omega ** 3


# ----------------------------------------------------------------------------
def refuse(msg):
    print(f"{TOOL}: REFUSED -- {msg}", file=sys.stderr)
    sys.exit(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("component")
    ap.add_argument("--cubic", required=True, choices=sorted(CUBICS))
    ap.add_argument("--records", default="data/standards/components")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--npts", type=int, default=41)
    a = ap.parse_args()

    path = os.path.join(a.records, a.component + ".dat")
    text = open(path).read()
    blocks = top_blocks(text)
    Tc, Pc_bar, omega, Tb = (scalar(text, k) for k in ("Tc", "Pc", "omega", "Tb"))
    if None in (Tc, Pc_bar, omega):
        refuse(f"{path}: Tc, Pc and omega are all required")
    Pc = Pc_bar * 1e5
    if "vaporPressure" not in blocks:
        refuse(f"{path} has no vaporPressure block to fit to")
    s, o, c = blocks["vaporPressure"]
    vp = text[o + 1:c]
    model = re.search(r"model\s+(\w+)", vp)
    if not model or model.group(1) != "Antoine":
        refuse(f"the vapour-pressure law of {a.component} is '{model.group(1) if model else '?'}'; "
               "only Antoine is supported (extend the tool, do not fit by hand)")
    co = re.search(r"coefficients\s*\(([^)]*)\)", vp)
    tr = re.search(r"Trange\s*\(([^)]*)\)", vp)
    if not co or not tr:
        refuse(f"{path}: the Antoine block lacks coefficients or Trange")
    A_, B_, C_ = (float(v) for v in co.group(1).split())
    Tlo, Thi = (float(v) for v in tr.group(1).split())
    if re.search(r"(?i)sublimation point", text):
        refuse(f"{path} annotates its Tb as a SUBLIMATION point: its Antoine law "
               f"(window {Tlo:g}-{Thi:g} K) is the solid-vapour line, which a cubic cannot "
               "reproduce as a liquid-vapour curve.  Curate a vapour-pressure law that covers "
               "the saturated liquid first, then re-run")
    Pl = lambda T: 10.0 ** (A_ - B_ / (T + C_)) * 1e5

    cub = a.cubic
    m0 = soave_slope(omega) if cub == "SRK" else pr_slope(omega)
    Ts = np.linspace(Tlo, Thi, a.npts)

    def residuals(c):
        out = []
        for T in Ts:
            p = psat(T, mc_g(T, Tc, *c), Tc, Pc, cub, Pl(T))
            out.append(5.0 if p is None else math.log(p / Pl(T)))
        return np.array(out)

    def table(c, label):
        Tg = np.linspace(Tlo, Thi, 201)
        errs = []
        for T in Tg:
            p = psat(T, mc_g(T, Tc, *c), Tc, Pc, cub, Pl(T))
            errs.append(float("nan") if p is None else 100.0 * (p / Pl(T) - 1.0))
        return np.array(errs)

    c_soave = (m0, 0.0, 0.0)
    r = least_squares(residuals, np.array(c_soave), method="lm", xtol=1e-14, ftol=1e-14)
    c_fit = tuple(float(v) for v in r.x)
    # round to what the record will carry, THEN evaluate (the record is the product)
    c_fit = tuple(float(f"{v:.8g}") for v in c_fit)

    e_before = table(c_soave, "before")
    e_after = table(c_fit, "after")
    if np.any(np.isnan(e_after)):
        refuse("the fitted function leaves a window point without a liquid-vapour pair")
    # g must stay positive over the fitted window and on to Tc (alpha = g^2 hides a sign flip)
    gmin = min(mc_g(Tc * tr_, Tc, *c_fit) for tr_ in np.linspace(Tlo / Tc, 1.0, 400))
    if gmin <= 0.0:
        refuse(f"sqrt(alpha) reaches {gmin:.3g} <= 0 inside the window or before Tc: "
               "the fitted constants are not usable")
    maxdev = float(np.nanmax(np.abs(e_after)))
    maxdev_before = float(np.nanmax(np.abs(e_before)))
    tb_line = ""
    if Tb:
        pb_b = psat(Tb, mc_g(Tb, Tc, *c_soave), Tc, Pc, cub, 101325.0)
        pb_a = psat(Tb, mc_g(Tb, Tc, *c_fit), Tc, Pc, cub, 101325.0)
        tb_line = (f"  Psat at the record's Tb = {Tb:g} K against 1.01325 bar: "
                   f"{100*(pb_b/101325-1):+.3f} % before, {100*(pb_a/101325-1):+.3f} % after; "
                   f"against the record's own law there: {100*(pb_a/Pl(Tb)-1):+.3f} %")
    print(f"{a.component} / {cub}: window {Tlo:g}-{Thi:g} K (the Antoine law's own), "
          f"{a.npts}-point least squares in ln P")
    print(f"  default alpha slope m = {m0:.6f}  (c1 = m, c2 = c3 = 0)")
    print(f"  fitted  c1 = {c_fit[0]:.8g}  c2 = {c_fit[1]:.8g}  c3 = {c_fit[2]:.8g}")
    print(f"  Psat deviation from the record's law over the window (201 points): "
          f"max {maxdev_before:.3f} % before, {maxdev:.4f} % after; min sqrt(alpha) {gmin:.4f}")
    if tb_line:
        print(tb_line)
    if not a.write:
        return 0

    # ------------------------------------------------------------------ write
    fmt = lambda v: f"{v:.8g}"
    sha_in = " ".join(fmt(v) for v in (*c_fit, Tlo, Thi))
    sha = hashlib.sha256(f"{cub} MathiasCopeman {sha_in}".encode()).hexdigest()
    law = f"Antoine log10(P/bar) = {A_:g} - {B_:g}/((T/K) {'+' if C_>=0 else '-'} {abs(C_):g}), {Tlo:g}-{Thi:g} K"
    val_block = (f"    {cub}\n    {{\n"
                 f"        form    MathiasCopeman;\n"
                 f"        c1      {fmt(c_fit[0])};\n"
                 f"        c2      {fmt(c_fit[1])};\n"
                 f"        c3      {fmt(c_fit[2])};\n"
                 f"        Trange  ({fmt(Tlo)} {fmt(Thi)});   // K, the window the vapour-pressure law declares\n"
                 f"    }}\n")
    prov_block = (f"        {cub}\n        {{\n"
                  f"            origin        derived;\n"
                  f"            method        \"least squares in ln Psat of the {cub} cubic's pure-component saturation pressure "
                  f"against this record's own vapour-pressure law ({law}), {a.npts} points over the law's window; "
                  f"Mathias-Copeman form as printed in Poling et al., 5th ed., Table 4-7; sqrt(alpha) kept positive to Tc\";\n"
                  f"            methodVersion \"{TOOL}\";\n"
                  f"            fittedTo      \"vaporPressure\";\n"
                  f"            window        ({fmt(Tlo)} {fmt(Thi)});\n"
                  f"            maxDeviation_pct  {maxdev:.4f};   // |Psat_cubic/Psat_law - 1| over the window, 201 points\n"
                  f"            defaultDeviation_pct  {maxdev_before:.3f};   // the same, with the default alpha function\n"
                  f"            valueSha256   \"{sha}\";   // sha256 of \"{cub} MathiasCopeman {sha_in}\"\n"
                  f"            uncertainty   \"in-sample: the constants reproduce THIS record's law over its window; outside it they extrapolate and above Tc only c1 acts\";\n"
                  f"            reviewStatus  autoPromoted;\n"
                  f"            review        {{ by none; }}\n"
                  f"            reviewReason  \"computed by a machine from the record's own law; not yet read back by a human\";\n"
                  f"        }}\n")

    def upsert(txt, blk_name, laws_text, laws_of_cubic):
        """Insert/replace sub-block `cub` inside top-level block `blk_name` (created if absent)."""
        bl = top_blocks(txt)
        if blk_name in bl:
            s_, o_, c_ = bl[blk_name]
            subs = sub_blocks(txt, o_, c_)
            if cub in subs:
                ss, so, sc = subs[cub]
                # replace the old sub-block IN PLACE (idempotent, order kept)
                ls = txt.rfind("\n", 0, ss) + 1
                le = txt.find("\n", sc) + 1
                return txt[:ls] + laws_text + txt[le:]
            ls = txt.rfind("\n", 0, c_) + 1
            return txt[:ls] + laws_text + txt[ls:]
        return None

    new = upsert(text, "cubicAlpha", val_block, None)
    if new is None:
        blk = "\n//  The cubic's alpha function, fitted BY CURATION to this record's own vapour-pressure\n" \
              "//  law (C408 slice 0): " + TOOL + " writes it, never a table.  Read only when a case\n" \
              "//  selects `alphaFunction MathiasCopeman;` on that cubic.\ncubicAlpha\n{\n" + val_block + "}\n"
        pb = top_blocks(text)
        if "provenance" in pb:
            at = text.rfind("\n", 0, pb["provenance"][0]) + 1
            new = text[:at] + blk.lstrip("\n") + "\n" + text[at:]
        else:
            new = text.rstrip("\n") + "\n" + blk
    text2 = new
    t3 = upsert(text2, "provenance", None, None) if False else None
    pb = top_blocks(text2)
    if "provenance" in pb:
        s_, o_, c_ = pb["provenance"]
        pcs = sub_blocks(text2, o_, c_)
        if "cubicAlpha" in pcs:
            r_ = upsert_inner = None
            ps, po, pc = pcs["cubicAlpha"]
            inner = sub_blocks(text2, po, pc)
            if cub in inner:
                ss, so, sc = inner[cub]
                ls = text2.rfind("\n", 0, ss) + 1
                le = text2.find("\n", sc) + 1
                text2 = text2[:ls] + prov_block + text2[le:]
            else:
                ls = text2.rfind("\n", 0, pc) + 1
                text2 = text2[:ls] + prov_block + text2[ls:]
        else:
            ls = text2.rfind("\n", 0, c_) + 1
            text2 = text2[:ls] + "    cubicAlpha\n    {\n" + prov_block + "    }\n" + text2[ls:]
    else:
        text2 = text2.rstrip("\n") + "\n\nprovenance\n{\n    cubicAlpha\n    {\n" + prov_block + "    }\n}\n"
    open(path, "w").write(text2)
    print(f"  written: {path}  (valueSha256 {sha[:16]}...)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
