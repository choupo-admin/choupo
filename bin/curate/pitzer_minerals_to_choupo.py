#!/usr/bin/env python3
"""
pitzer_minerals_to_choupo.py -- re-express USGS pitzer.dat / phreeqc.dat mineral
dissolution reactions into Choupo's master-ion basis and emit
data/standards/chemistry/mineralSolubility/<mineral>.dat records.

WHY a re-expression (not a copy): Choupo writes every mineral in terms of its
MASTER ions (Ca, Mg, Na, K, SO4, Cl, F, HCO3, H4SiO4, B(OH)4, H) + water via
nuWater; OH-, CO3-2, CO2, silicic anions etc. are DERIVED species with their
own aqueousSpeciation reactions. So the source reaction (often written with
OH-/CO3-2 on the RHS) must be reduced to masters, and log_k / dH / analytic
shifted by the same linear combination of the linking speciation reactions.

ACCEPTANCE TEST: re-derive the 25 minerals Choupo already ships and compare
logK25/dH to the committed .dat files. Only if that passes do we trust the new
ones. Run:  python3 bin/curate/pitzer_minerals_to_choupo.py --check

Public-domain sources: bin/curate/refs/{pitzer.dat,phreeqc.dat} (USGS).
Primary citations are carried per-record in the emitted source string.
"""
import re, sys, os, math

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPEC_DIR = os.path.join(REPO, "data/standards/chemistry/aqueousSpeciation")
MIN_DIR  = os.path.join(REPO, "data/standards/chemistry/mineralSolubility")

# --- Choupo master ions (the ions written directly in masters(); water is separate) ---
# Collected from the catalogue's existing masters() usage + species/aqueous identities.
MASTERS = {
    "H", "HCO3", "Ca", "Mg", "Na", "K", "SO4", "Cl", "F", "Ba", "Sr",
    "H4SiO4", "Li", "B(OH)4", "NH4", "Br", "NO3", "Fe", "Mn", "PO4",
}
# PHREEQC species token -> Choupo master ion name (identity where trivial)
ION_ALIAS = {
    "Ca+2": "Ca", "Mg+2": "Mg", "Na+": "Na", "K+": "K", "Ba+2": "Ba",
    "Sr+2": "Sr", "Cl-": "Cl", "SO4-2": "SO4", "F-": "F", "HCO3-": "HCO3",
    "H+": "H", "H4SiO4": "H4SiO4", "Li+": "Li", "B(OH)4-": "B(OH)4",
    "NH4+": "NH4", "Br-": "Br", "NO3-": "NO3",
    "Fe+2": "Fe", "Mn+2": "Mn", "PO4-3": "PO4",
}
# Derived PHREEQC species -> the Choupo aqueousSpeciation record file that
# expresses it in masters. (species token in source -> Choupo species name)
DERIVED = {
    "OH-": "OH", "CO3-2": "CO3", "CO2": "CO2aq",
    "H3SiO4-": "H3SiO4m", "H2SiO4-2": "H2SiO4m2",
    "HPO4-2": "HPO4", "H2PO4-": "H2PO4", "H3PO4": "H3PO4",
    "B(OH)3": None,  # neutral boric acid: handled as master B(OH)4 + H (see load)
}

def kcal_to_J(x): return x * 4184.0

def parse_delta_h(line):
    # "-delta_h -3.15 kcal" | "delta_h -6.169" (already kJ? PHREEQC default kJ)
    m = re.search(r'-?delta_[hH]\s+(-?[0-9.eE+]+)\s*(kcal|kJ)?', line)
    if not m: return None
    v = float(m.group(1)); unit = (m.group(2) or "kJ")
    return kcal_to_J(v) if unit == "kcal" else v * 1000.0

def parse_reaction(rhs_lhs):
    """'Mg(OH)2 + 2 H+ = Mg+2 + 2 H2O' -> (mineral, {species: net_coeff_on_dissolution_side})
    Net coefficients are for  MINERAL = sum(coeff * species) + nuWater*H2O + Hcoeff*H+.
    We return raw species->coeff with H2O and H+ kept as pseudo-species '_H2O','H+'."""
    lhs, rhs = rhs_lhs.split("=")
    def terms(side):
        # split on ' + ' / ' - ' (whitespace-sign-whitespace) so charge notation
        # like Ca+2 / Na+ / SO4-2 stays attached; captures subtraction terms
        # (e.g. '... - 8 H2O') as negative coefficients.
        s = side.strip()
        lead = 1
        if s and s[0] in "+-":                 # explicit leading sign ('- H2O + ...')
            lead = 1 if s[0] == "+" else -1
            s = s[1:].strip()
        parts = re.split(r'\s+([+\-])\s+', s)   # ' + '/' - ' separators; charges stay attached
        signed = [(lead, parts[0])]
        for i in range(1, len(parts) - 1, 2):
            signed.append((1 if parts[i] == "+" else -1, parts[i + 1]))
        out = []
        for sgn, t in signed:
            t = t.strip()
            if not t: continue
            m = re.match(r'^(\d*\.?\d+)?\s*(.+)$', t)   # int OR decimal coeff
            c = float(m.group(1)) if m.group(1) else 1.0
            out.append((sgn * c, m.group(2).strip()))
        return out
    L, R = terms(lhs), terms(rhs)
    mineral = L[0][1]
    net = {}  # species -> coeff on the RHS (dissolution) side
    for c, sp in R:
        net[sp] = net.get(sp, 0) + c
    for c, sp in L[1:]:      # LHS extras (H+, H2O) move to RHS with -sign
        net[sp] = net.get(sp, 0) - c
    return mineral, net

def load_speciation():
    """species name -> dict(masters={ion:nu}, nuWater, logK, dH, analytic[list])"""
    sub = {}
    for fn in os.listdir(SPEC_DIR):
        if not fn.endswith(".dat"): continue
        txt = open(os.path.join(SPEC_DIR, fn)).read()
        nm = re.search(r'\bspecies\s+(\w+)', txt).group(1)
        mm = re.findall(r'\{\s*ion\s+([A-Za-z0-9()]+)\s*;\s*nu\s+(-?\d+)\s*;\s*\}', txt)
        masters = {ion: int(nu) for ion, nu in mm}
        nw = re.search(r'nuWater\s+(-?\d+)', txt)
        lk = re.search(r'logK25\s+(-?[0-9.eE+]+)', txt)
        dh = re.search(r'\bdH\s+(-?[0-9.eE+]+)', txt)
        an = re.search(r'analytic\s*\(([^)]*)\)', txt)
        sub[nm] = dict(
            masters=masters,
            nuWater=int(nw.group(1)) if nw else 0,
            logK=float(lk.group(1)) if lk else 0.0,
            dH=float(dh.group(1)) if dh else 0.0,
            analytic=[float(x) for x in an.group(1).split()] if an else [],
        )
    return sub

def parse_phases(path):
    """Yield (name, reaction_str, log_k, dH_J, analytic[list], vm) from a PHREEQC
    PHASES block file."""
    txt = open(path, encoding="utf-8", errors="replace").read().splitlines()
    # find PHASES section
    out = {}
    i = 0
    while i < len(txt) and not txt[i].strip().upper().startswith("PHASES"):
        i += 1
    i += 1
    cur = None
    while i < len(txt):
        ln = txt[i]; s = ln.strip()
        if re.match(r'^[A-Z_]{3,}\s*$', ln) and ln[0] == ln.lstrip()[0] and not ln[0].islower():
            if ln.strip().isupper() and " " not in ln.strip():
                break  # next top-level keyword section
        if ln and ln[0] not in " \t" and not ln.startswith("#") and "=" not in ln:
            cur = s.split("#")[0].strip()
            out[cur] = dict(name=cur, rxn=None, log_k=None, dH=None, an=[], vm=None)
        elif cur is not None:
            body = s.split("#")[0].strip()
            if "=" in body and out[cur]["rxn"] is None:
                out[cur]["rxn"] = body
            for piece in body.split(";"):
                p = piece.strip()
                m = re.match(r'-?log_k\s+(-?[0-9.eE+]+)', p)
                if m: out[cur]["log_k"] = float(m.group(1))
                if re.search(r'-?delta_[hH]', p):
                    dh = parse_delta_h(p)
                    if dh is not None: out[cur]["dH"] = dh
                m = re.match(r'-?analytic(?:al_expression)?\s+(.+)', p)
                if m:
                    out[cur]["an"] = [float(x) for x in m.group(1).split()]
        i += 1
    return out

def reduce_mineral(name, rxn, log_k, dH, an, SUB):
    """Return dict(masters, nuWater, logK, dH, analytic) in Choupo basis, or None
    if the reaction contains a species we cannot reduce to masters."""
    mineral, net = parse_reaction(rxn)
    masters = {}
    nuWater = 0
    logK = log_k if log_k is not None else 0.0
    dHo = dH if dH is not None else 0.0
    analytic = list(an) + [0.0] * (6 - len(an)) if an else []
    def add_analytic(coeff, arr):
        nonlocal analytic
        if not analytic:
            return
        arr = list(arr) + [0.0] * (6 - len(arr))
        analytic = [a - coeff * b for a, b in zip(analytic, arr)]
    for sp, coeff in net.items():
        if sp in ("H2O", "H2O(l)"):
            nuWater += coeff; continue
        if sp in ION_ALIAS:
            m = ION_ALIAS[sp]; masters[m] = masters.get(m, 0) + coeff; continue
        if sp in DERIVED and DERIVED[sp] in SUB:
            s = SUB[DERIVED[sp]]
            for ion, nu in s["masters"].items():
                masters[ion] = masters.get(ion, 0) + coeff * nu
            nuWater += coeff * s["nuWater"]
            logK -= coeff * s["logK"]
            dHo  -= coeff * s["dH"]
            add_analytic(coeff, s["analytic"])
            continue
        return None  # unreducible (redox / unsupported species)
    masters = {k: v for k, v in masters.items() if v != 0}
    return dict(mineral=mineral, masters=masters, nuWater=nuWater,
                logK=logK, dH=dHo, analytic=analytic)

def main():
    check = "--check" in sys.argv
    SUB = load_speciation()
    src = {}
    # phreeqc.dat wins for minerals present in both (it carries delta_h +
    # analytic that pitzer.dat often omits, and it is what the shipped catalogue
    # was curated from); pitzer.dat then fills the HMW-only evaporites/hydroxides.
    for f in ("phreeqc.dat", "pitzer.dat"):
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "refs", f)
        for nm, rec in parse_phases(p).items():
            if rec["rxn"] and nm not in src:
                src[nm] = rec

    if check:
        # ACCEPTANCE: re-derive the shipped minerals, compare logK25 & dH.
        ok = bad = 0
        for fn in sorted(os.listdir(MIN_DIR)):
            if not fn.endswith(".dat"): continue
            txt = open(os.path.join(MIN_DIR, fn)).read()
            want_lk = re.search(r'logK25\s+(-?[0-9.eE+]+)', txt)
            want_dh = re.search(r'\bdH\s+(-?[0-9.eE+]+)', txt)
            # source name = capitalised-ish; try a few keys
            base = fn[:-4]
            cand = [c for c in src if c.lower().replace("(a)", "a") ==
                    base.lower().replace("sio2a", "sio2a")]
            key = next((c for c in src if c.lower() == base.lower()), None)
            if not key:
                print(f"  ?  {base:16s} not found in source"); continue
            r = reduce_mineral(key, src[key]["rxn"], src[key]["log_k"],
                               src[key]["dH"], src[key]["an"], SUB)
            if not r:
                print(f"  X  {base:16s} unreducible"); bad += 1; continue
            glk = float(want_lk.group(1)) if want_lk else None
            gdh = float(want_dh.group(1)) if want_dh else None
            dlk = abs(r["logK"] - glk) if glk is not None else 0
            ddh = abs(r["dH"] - gdh) if gdh is not None else 0
            tag = "ok " if (dlk < 0.05 and ddh < 60) else "MISS"
            if tag != "ok ": bad += 1
            else: ok += 1
            print(f"  {tag} {base:16s} logK {r['logK']:+9.4f} (want {glk})  "
                  f"dH {r['dH']:+11.1f} (want {gdh})")
        print(f"\nACCEPTANCE: {ok} ok / {bad} miss of {ok+bad}")
        return

    # --- GENERATION: emit NEW minerals not already shipped ---
    have = {fn[:-4].lower() for fn in os.listdir(MIN_DIR) if fn.endswith(".dat")}
    emit = "--emit" in sys.argv
    made = skip_redox = skip_have = 0
    new_names = []
    for key, rec in sorted(src.items()):
        if key.endswith("(g)") or "(g)" in key:      # gases are not precipitating salts
            continue
        nm = sanitize(key)
        if nm.lower() in have:
            skip_have += 1; continue
        r = reduce_mineral(key, rec["rxn"], rec["log_k"], rec["dH"], rec["an"], SUB)
        if not r:
            skip_redox += 1
            print(f"  skip(unreducible/redox)  {key}  [{rec['rxn']}]")
            continue
        if rec["log_k"] is None:
            print(f"  skip(no log_k)  {key}"); continue
        text = format_record(nm, r, key)
        new_names.append(nm)
        if emit:
            open(os.path.join(MIN_DIR, nm + ".dat"), "w").write(text)
        made += 1
        print(f"  {'WROTE' if emit else 'new  '} {nm:20s} logK {r['logK']:+8.3f} "
              f"masters={r['masters']} nuWater={r['nuWater']}")
    print(f"\n{'EMITTED' if emit else 'WOULD ADD'} {made} new minerals; "
          f"skipped {skip_have} already-present, {skip_redox} unreducible(redox).")
    if not emit:
        print("(dry-run; pass --emit to write files)")

def sanitize(name):
    n = name
    n = n.replace("(a)", "a").replace("(d)", "_d").replace("(14A)", "14A")
    n = n.replace(":", "_").replace(",", "_")
    n = re.sub(r'[^A-Za-z0-9_]', "", n)
    return n[0].lower() + n[1:] if n else n

def numfmt(v):
    return str(int(round(v))) if abs(v - round(v)) < 1e-9 else f"{v:g}"

def format_record(nm, r, srckey):
    # UNIFIED substance file: the mineral IS a component carrying a solidPhase.
    ms = " ".join(f"{{ ion {i}; nu {numfmt(v)}; }}" for i, v in r["masters"].items())
    rxn = f'masters ( {ms} );'
    if r["nuWater"]:
        rxn += f' nuWater {numfmt(r["nuWater"])};'
    eq = f'logK25 {r["logK"]:.6g}; dH {r["dH"]:.6g};'
    if r["analytic"] and any(r["analytic"]):
        eq += ' analytic ( ' + " ".join(f"{a:.7g}" for a in r["analytic"]) + ' );'
        eq += ' validC ( 0 200 );'
    eq += (' source "USGS PHREEQC pitzer.dat/phreeqc.dat (public domain); '
           f'reaction re-expressed to Choupo master basis from {srckey}";')
    return (
        f'name {nm};\n'
        f'formula "{r["mineral"]}";\n\n'
        f'solidPhases\n{{\n'
        f'    {nm}\n    {{\n'
        f'        dissolutionReaction {{ {rxn} }}\n'
        f'        equilibrium {{ {eq} }}\n'
        f'    }}\n}}\n')

if __name__ == "__main__":
    main()
