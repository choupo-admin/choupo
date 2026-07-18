#!/usr/bin/env python3
"""Migrate a dynamic case's inline initial{}/inlet{} -> 0/internalState + 0/streamFaces.

Reads the case's system/flowsheetDict, for its (single) dynamic unit pulls the
`initial{}` (holdup) and `inlet{}` (feed face), writes 0/internalState +
0/streamFaces in the engine's format, and DELETES the inline blocks (no legacy).

Units seen in ctrl cases: T [K], P [bar], F [kmol/s]; V + totalMoles are bare SI.
"""
import re, sys
from pathlib import Path

def to_si(val, unit):
    unit = (unit or "").strip()
    v = float(val)
    if unit in ("", "K", "kmol/s", "kmol", "m^3", "-"): return v
    if unit == "bar":  return v * 1.0e5
    if unit == "Pa":   return v
    if unit == "atm":  return v * 101325.0
    if unit == "degC": return v + 273.15
    if unit == "kmol/h": return v / 3600.0
    raise SystemExit(f"unknown unit {unit!r} for {val}")

def find_block(text, key, start=0):
    """Return (inner, span) of `key { ... }` (brace-matched) or (None, None)."""
    m = re.search(r'(?m)^\s*' + re.escape(key) + r'\s*\{', text[start:])
    if not m: return None, None
    i = start + m.end() - 1        # at the '{'
    depth = 0
    for j in range(i, len(text)):
        if text[j] == '{': depth += 1
        elif text[j] == '}':
            depth -= 1
            if depth == 0:
                return text[i+1:j], (start + m.start(), j+1)
    return None, None

def scalars(block):
    """key -> (value, unit) for `key <num> [unit];` lines (skips sub-blocks)."""
    out = {}
    # strip nested sub-blocks so their scalars don't leak up
    flat = re.sub(r'\{[^{}]*\}', '{}', block)
    for m in re.finditer(r'(?m)^\s*(\w+)\s+(-?[0-9][0-9.eE+-]*)\s*([A-Za-z/^0-9]*)\s*;', flat):
        out[m.group(1)] = (m.group(2), m.group(3))
    return out

def comp_block(block, key):
    inner, _ = find_block(block, key)
    if inner is None: return {}
    d = {}
    for m in re.finditer(r'(\w+)\s+(-?[0-9][0-9.eE+-]*)\s*;', inner):
        d[m.group(1)] = float(m.group(2))
    return d

def fmt(x): return repr(float(x))

def migrate(case):
    fd = Path(case) / "system" / "flowsheetDict"
    txt = fd.read_text()
    uname_m = re.search(r'(?m)^\s*name\s+(\w+)\s*;', txt)
    utype_m = re.search(r'(?m)^\s*type\s+(\w+)\s*;', txt)
    uname = uname_m.group(1); utype = utype_m.group(1)

    init_inner, init_span = find_block(txt, "initial")
    inlet_inner, inlet_span = find_block(txt, "inlet")
    if init_inner is None:
        print(f"  {case}: no initial{{}} -- skip"); return
    isc = scalars(init_inner)
    T = to_si(*isc["T"]); P = to_si(*isc.get("P", ("1.013", "bar")))
    V = to_si(*isc["V"]); nTot = to_si(*isc["totalMoles"])
    icomp = comp_block(init_inner, "molarComposition")

    # 0/internalState
    hold = "\n".join(f"            {c}   {fmt(nTot*x)};" for c, x in icomp.items())
    istate = f"""/*--------------------------------*- Choupo -*----------------------------------*\\
  0/internalState -- DYNAMIC initial holdup (the SINGLE source of truth; the
  inline initial{{}} block is retired).  Per unit: T [K], P [Pa], V [m^3] and the
  per-species inventory holdupMolar [kmol].  Materialised by bin/choupo-init0.
\\*-----------------------------------------------------------------------------*/
time            0;
application     ctrl;

units
{{
    "{uname}"
    {{
        type        {utype};
        T           {fmt(T)};
        P           {fmt(P)};
        V           {fmt(V)};
        holdupMolar
        {{
{hold}
        }}
    }}
}}
"""
    (Path(case) / "0").mkdir(exist_ok=True)
    (Path(case) / "0" / "internalState").write_text(istate)

    # 0/streamFaces (inlet face)
    streams_txt = ""
    if inlet_inner is not None:
        nsc = scalars(inlet_inner)
        F = to_si(*nsc["F"]); Tin = to_si(*nsc["T"])
        ncomp = comp_block(inlet_inner, "molarComposition")
        mf = "\n".join(f"            {c}   {fmt(F*x)};" for c, x in ncomp.items())
        streams_txt = f"""/*--------------------------------*- Choupo -*----------------------------------*\\
  0/streamFaces -- DYNAMIC face state (the SINGLE source of truth; inline inlet{{}}
  is retired).  The inlet face carries F [kmol/s], T [K] + per-species molarFlows.
\\*-----------------------------------------------------------------------------*/
time            0;
faces
{{
    "{uname}.feed"
    {{
        bc          inlet;
        T           {fmt(Tin)};
        P           {fmt(P)};
        molarFlows
        {{
{mf}
        }}
    }}
}}
"""
        (Path(case) / "0" / "streamFaces").write_text(streams_txt)

    # delete the inline blocks (highest span first so offsets stay valid)
    spans = [s for s in (init_span, inlet_span) if s]
    for a, b in sorted(spans, reverse=True):
        # also swallow the trailing newline
        end = b
        while end < len(txt) and txt[end] in " \t": end += 1
        if end < len(txt) and txt[end] == "\n": end += 1
        txt = txt[:a] + txt[b:]
    fd.write_text(txt)
    print(f"  {case}: 0/internalState + 0/streamFaces written; inline blocks removed")

for c in sys.argv[1:]:
    migrate(c)
