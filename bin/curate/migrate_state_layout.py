#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""migrate_state_layout -- the ONE-SHOT migration of a time-integrated case's
`0/` from the retired shape to the ratified state layout (task #186,
2026-09-30, Vitor's ruling).

    RETIRED                              RATIFIED (what the steady path uses)
    0/internalState   units { "<u>" {} }  ->  0/internalStates/<u>   holdup {}
    0/streamFaces     faces { "<u>.<p>" } ->  0/<stream>             one file each

A stream has ONE identity -- the name the flowsheet gives it -- and ONE file.
A face key "<unit>.<port>" is resolved to that name through the unit's OWN
declaration in system/flowsheetDict: a vessel's feed face is the stream it
declares as `in` (and a vessel that declared none is given `in <port>;`, the
port's own word, plus `outputs ( product );` so its outlet has a name a time
directory can write it under); a quasi-steady unit's face is keyed by the
stream already (`inputs ( ... )`).  NOTHING is matched by similarity.

What is COPIED VERBATIM, so a migrated case reproduces its answer to the last
bit: every value token (a holdup's T/P/V and inventory, a face's T, P and
per-component flows) -- the stream files gain explicit units whose conversion
factor is exactly 1 (K, Pa, kmol/s), never a rescaled number.  Comments inside
a unit's block travel with it.  A header written for THIS case (not the
retired boilerplate) is carried into the new file with its first line
re-addressed; the retired boilerplate is replaced by a header that describes
the new file.

Deterministic, idempotent (a case already migrated is reported and left
alone), refuses a case that carries BOTH shapes, and refuses any path under
data/standards/ (a curation tool never writes the frozen tree).

Usage:
    bin/curate/migrate_state_layout.py <case> [<case> ...]
    bin/curate/migrate_state_layout.py --check <case> ...   (report, write nothing)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STANDARDS = (ROOT / "data" / "standards").resolve()

#  The retired headers that said nothing about THEIR case -- replaced, not
#  carried (they describe the retired file, which is the whole defect).
BOILERPLATE = (
    "the batch vessels' initial HOLDUP (the SINGLE source of",
    "DYNAMIC initial holdup (the SINGLE source of truth",
    "DYNAMIC initial state (the SINGLE source of truth",
    "DYNAMIC face state (the SINGLE source of truth",
)

BAR = ("/*--------------------------------*- Choupo -*"
       "----------------------------------*\\")
END = ("\\*-------------------------------------------------------"
       "----------------------*/")


class Refused(Exception):
    pass


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def balanced(text, open_idx):
    """Index just past the brace that closes the one at `open_idx`."""
    depth = 0
    for j in range(open_idx, len(text)):
        c = text[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return j + 1
    raise Refused("unbalanced braces")


def header_and_body(text):
    """Split a retired file into its leading comment(s) and the rest, at its
    first top-level statement (`time`, or the block itself where a file
    carries no `time`)."""
    m = re.search(r"(?m)^(time|application|units|faces)\b", text)
    if not m:
        raise Refused("no top-level statement -- not a retired state file")
    return text[:m.start()].rstrip() + "\n", text[m.start():]


def named_blocks(body, container):
    """[(name, inner_text)] of `"<name>" { ... }` entries inside the
    top-level `<container> { ... }` block, in file order, comments kept."""
    m = re.search(r"(?m)^" + container + r"\s*\{", body)
    if not m:
        raise Refused("no `%s {}` block" % container)
    end = balanced(body, m.end() - 1)
    inner = body[m.end():end - 1]
    out = []
    pos = 0
    rx = re.compile(r'"([^"]+)"\s*\{')
    while True:
        mm = rx.search(inner, pos)
        if not mm:
            break
        close = balanced(inner, mm.end() - 1)
        out.append((mm.group(1), inner[mm.end():close - 1]))
        pos = close
    return out


def dedent(block, by):
    lines = [ln.rstrip() for ln in block.split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    out = []
    for ln in lines:
        k = 0
        while k < by and k < len(ln) and ln[k] == " ":
            k += 1
        out.append(ln[k:])
    return out


def carried_header(head, old, new):
    """The retired header re-addressed, or None when it is boilerplate."""
    if any(b in head for b in BOILERPLATE):
        return None
    return head.replace("0/" + old, new, 1)


# ---- flowsheetDict -------------------------------------------------------
def read_units(fd_text):
    """[(name, type, inputs, outputs, span_of_type_line)] in file order."""
    clean = strip_comments(fd_text)
    units = []
    for m in re.finditer(r"(?m)^\s*name\s+([A-Za-z0-9_.]+)\s*;", clean):
        name = m.group(1)
        # the unit's own block: from its name to the next `name` at depth
        nxt = re.search(r"(?m)^\s*name\s+[A-Za-z0-9_.]+\s*;", clean[m.end():])
        seg = clean[m.end(): m.end() + nxt.start()] if nxt else clean[m.end():]
        t = re.search(r"(?m)^\s*type\s+(\w+)\s*;", seg)
        typ = t.group(1) if t else "?"
        ins = []
        mi = re.search(r"(?m)^\s*inputs\s*\(([^)]*)\)", seg)
        if mi:
            ins = mi.group(1).split()
        else:
            mi = re.search(r"(?m)^\s*in\s+(\w+)\s*;", seg)
            if mi:
                ins = [mi.group(1)]
        mo = re.search(r"(?m)^\s*outputs\s*\(([^)]*)\)", seg)
        outs = mo.group(1).split() if mo else []
        units.append({"name": name, "type": typ, "in": ins, "out": outs})
    return units


def add_topology(fd_text, uname, words):
    """Insert `words` (lines) right after unit `uname`'s `type` line."""
    m = re.search(r"(?m)^([ \t]*)name\s+" + re.escape(uname) + r"\s*;", fd_text)
    if not m:
        raise Refused("flowsheetDict: no unit named '%s'" % uname)
    t = re.search(r"(?m)^([ \t]*)type\s+\w+\s*;[^\n]*\n", fd_text[m.end():])
    if not t:
        raise Refused("flowsheetDict: unit '%s' declares no type" % uname)
    at = m.end() + t.end()
    ind = t.group(1)
    ins = "".join("%s%-12s%s\n" % (ind, k, v) for k, v in words)
    return fd_text[:at] + ins + fd_text[at:]


# ---- the two files -------------------------------------------------------
def holdup_file(uname, equipment, body_lines, head):
    out = []
    if head is not None:
        out.append(head.rstrip("\n"))
    else:
        out += [BAR,
                "  0/internalStates/%s -- the initial HOLDUP of '%s', the SINGLE" % (uname, uname),
                "  source of truth (an inline initial{} block in flowsheetDict is refused).",
                "  The `holdup {}` block is the vessel's starting state: T, P, V and the",
                "  inventory (totalMoles + molarComposition, or per species as",
                "  holdupMolar).  Every <t>/internalStates/%s a run writes carries the" % uname,
                "  same kind, so a time directory renamed 0/ starts the case from t.",
                END]
    out.append("")
    out.append("recordType  internalState;")
    out.append("")
    out.append('unit        "%s";' % uname)
    out.append("equipment   %s;" % equipment)
    out.append("")
    out.append("holdup")
    out.append("{")
    for ln in body_lines:
        out.append(("    " + ln) if ln.strip() else "")
    out.append("}")
    return "\n".join(out) + "\n"


def stream_file(sname, face_inner, head, routed):
    """A face body -> the canonical stream-state grammar, values verbatim."""
    body = face_inner
    flows_m = re.search(r"molarFlows\s*\{", body)
    if not flows_m:
        raise Refused("face '%s' carries no molarFlows {}" % sname)
    close = balanced(body, flows_m.end() - 1)
    flows = body[flows_m.end():close - 1]
    rest = body[:flows_m.start()] + body[close:]

    def scalar(key):
        m = re.search(r"(?m)^\s*" + key + r"\s+([^;\s]+)\s*([^;]*);", rest)
        if not m:
            raise Refused("face '%s' declares no %s" % (sname, key))
        return m.group(1), m.group(2).strip()

    T, Tu = scalar("T")
    P, Pu = scalar("P")
    for u, want in ((Tu, "K"), (Pu, "Pa")):
        if u not in ("", want):
            raise Refused("face '%s' carries a unit '%s' the migrator does not"
                          " convert (it copies values verbatim)" % (sname, u))
    rows = []
    for m in re.finditer(r"(?m)^\s*(\w+)\s+([^;\s]+)\s*([^;]*);([^\n]*)", flows):
        unit = m.group(3).strip()
        if unit not in ("", "kmol/s"):
            raise Refused("face '%s': flow unit '%s' is not kmol/s" % (sname, unit))
        rows.append((m.group(1), m.group(2), m.group(4).rstrip()))

    out = []
    if head is not None:
        out.append(head.rstrip("\n"))
    else:
        out += [BAR,
                "  0/%s -- the state of stream '%s' at t = 0: ONE file per stream," % (sname, sname),
                "  in the canonical grammar every state view uses."]
        if routed:
            out += ["  A ROUTED stream: this is its value until the first accepted step,",
                    "  from which the router overwrites it with the upstream outlet."]
        else:
            out += ["  A domain inlet: its state for the whole run, unless a controller",
                    "  or a signal drives one of its fields."]
        out.append(END)
    out.append("")
    out.append("componentMolarFlows")
    out.append("{")
    w = max(len(r[0]) for r in rows) if rows else 8
    for c, v, cm in rows:
        out.append("    %-*s  %s kmol/s;%s" % (w, c, v, cm))
    out.append("}")
    out.append("")
    out.append("T               %s K;" % T)
    out.append("P               %s Pa;" % P)
    return "\n".join(out) + "\n"


def migrate(case, check=False):
    case = Path(case).resolve()
    try:
        case.relative_to(STANDARDS)
        raise Refused("refused: %s is under data/standards/ -- the frozen"
                      " tree is written by curation acts, never by this tool"
                      % case)
    except ValueError:
        pass
    z = case / "0"
    old_is, old_sf = z / "internalState", z / "streamFaces"
    if not old_is.exists() and not old_sf.exists():
        return "already migrated (no retired file)"
    new_root = z / "internalStates"
    if new_root.exists():
        raise Refused("both shapes present (%s and 0/internalStates/) --"
                      " resolve by hand" % ("0/internalState" if old_is.exists()
                                            else "0/streamFaces"))

    fd_path = case / "system" / "flowsheetDict"
    fd_text = fd_path.read_text()
    units = read_units(fd_text)
    by_name = {u["name"]: u for u in units}
    produced = {w for u in units for w in u["out"]}
    writes = {}          # Path -> text
    fd_new = fd_text
    notes = []

    if old_is.exists():
        head, body = header_and_body(old_is.read_text())
        head = carried_header(head, "internalState", "0/internalStates/<unit>")
        for uname, inner in named_blocks(body, "units"):
            if uname not in by_name:
                raise Refused("0/internalState names unit '%s', which the"
                              " flowsheet does not declare" % uname)
            eq = by_name[uname]["type"]
            m = re.search(r"(?m)^\s*type\s+(\w+)\s*;[^\n]*\n?", inner)
            if m:
                if m.group(1) != eq:
                    raise Refused("0/internalState says unit '%s' is a %s;"
                                  " the flowsheet says %s" % (uname, m.group(1), eq))
                inner = inner[:m.start()] + inner[m.end():]
            h = head.replace("<unit>", uname) if head else None
            writes[new_root / uname] = holdup_file(uname, eq, dedent(inner, 8), h)
            notes.append("internalStates/" + uname)

    if old_sf.exists():
        head, body = header_and_body(old_sf.read_text())
        faces = named_blocks(body, "faces")
        single = len(faces) == 1
        for key, inner in faces:
            if "." not in key:
                raise Refused("face '%s' is not <unit>.<port>" % key)
            uname, port = key.split(".", 1)
            u = by_name.get(uname)
            if u is None:
                raise Refused("face '%s' names unit '%s', which the flowsheet"
                              " does not declare" % (key, uname))
            if u["type"] == "quasiSteady":
                if port not in u["in"]:
                    raise Refused("face '%s': '%s' is not an inlet of"
                                  " quasiSteady '%s'" % (key, port, uname))
                sname = port
            elif u["in"]:
                if len(u["in"]) != 1:
                    raise Refused("vessel '%s' declares %d inlets" % (uname, len(u["in"])))
                sname = u["in"][0]
            else:
                sname = port
                taken = {w for x in units for w in x["in"] + x["out"]} | set(by_name)
                if sname in taken:
                    raise Refused("cannot name vessel '%s''s feed '%s': the"
                                  " name is taken" % (uname, sname))
                words = [("in", sname + ";")]
                if not u["out"]:
                    prod = "product" if "product" not in taken else uname + "Product"
                    words.append(("outputs", "( %s );" % prod))
                    u["out"] = [prod]
                fd_new = add_topology(fd_new, uname, words)
                u["in"] = [sname]
                notes.append("flowsheetDict: %s gains %s" % (
                    uname, ", ".join("%s %s" % w for w in words)))
            path = z / sname
            if path in writes:
                raise Refused("two faces resolve to stream '%s'" % sname)
            h = None
            if single:
                hh = carried_header(head, "streamFaces", "0/" + sname)
                h = hh
            writes[path] = stream_file(sname, inner, h, sname in produced)
            notes.append(sname)

    if check:
        return "would write: " + ", ".join(notes)
    for p, t in sorted(writes.items()):
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(t)
    if fd_new != fd_text:
        fd_path.write_text(fd_new)
    for f in (old_is, old_sf):
        if f.exists():
            f.unlink()
    return "migrated: " + ", ".join(notes)


def main(argv):
    check = "--check" in argv
    cases = [a for a in argv if a != "--check"]
    if not cases:
        print(__doc__)
        return 2
    rc = 0
    for c in cases:
        try:
            print("%s: %s" % (c, migrate(c, check)))
        except Refused as e:
            print("%s: REFUSED -- %s" % (c, e))
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
