#!/usr/bin/env python3
"""The ONE Python home for a `utility` golden row: which key an allocation
entry publishes, and what value a row reads back from a result.

    from utility_rows import row_values, lookup

WHY THIS EXISTS (2026-10-05, DEV.md 4c C37 item 2).  `bin/choupo-import`
refused to re-seal `heatExchanger01_water_water` and
`heatExchanger03_pure_water_plateau` with

    utility hx.heating.-.carried MISSING from the sealed run

on a sealed run that published exactly that entry.  The importer's reader
knew ONE shape of `utility` row -- `<tier>.<utility>.<field>`, looked up on an
ALLOCATED entry by its utility name -- and on 2026-09-03 (e26e5591d) the
golden format gained two more: an UNALLOCATED entry is pinned by ONE row,
`<tier>.<port>.carried` or `<tier>.<port>.unserved` (port `-` when the entry
declares none), value 1, its kind told by the record's typed `carried`
field.  bin/runTests' writer and reader learnt them that day, and so did
check_utility_allocation_pinned; the importer did not, so every seal of a
case carrying a carried or unserved duty read its row as MISSING and refused
-- fail-closed, which is why it surfaced only when somebody re-sealed one.
Three readers had written the rule out three times; the fourth copy was the
one that went stale.  The two Python readers now call this module.

THE RULE IS bin/runTests' (`get_utility`, and the generator beside it), and
it is restated here, not reinvented:
  * an ALLOCATED entry publishes `<tier>.<norm(utility)>.<field>` for each of
    FIELDS it carries as a number;
  * an UNALLOCATED entry's `utility` is PROSE ("(none adequate)",
    "(carried: ...)") and is never a key; it publishes ONE row,
    `<tier>.<norm(port) or "-">.<carried|unserved>`, value 1, the kind read
    off the typed `carried` field and never off the prose;
  * whitespace in a name is `_` (a golden row is whitespace-delimited);
  * a lookup takes the FIRST entry of the unit that publishes the key, in the
    order the result lists them.

WHAT KEEPS THE TWO LANGUAGES TOGETHER.  bin/runTests is shell and awk and
keeps its own copy -- moving the suite's own checker onto Python is a change
on a path every case goes through, not taken here.  The parity is CHECKED,
not hoped for: check_utility_allocation_pinned derives each case's published
keys through `row_values` and holds them, both ways, against the rows
runTests' generator wrote into the case's `expected`, over the corpus.  A
divergence between this home and the awk fails that gate.
"""
import re

#  The numeric fields an allocated entry is pinned by (the generator's list).
FIELDS = ("duty_kW", "T", "kg_s", "eur_h")


def norm(s) -> str:
    """Whitespace -> `_`, exactly as bin/runTests' `norm()`."""
    return re.sub(r"[ \t]+", "_", str(s))


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def row_values(entry: dict) -> dict:
    """{"<tier>.<name>.<field>": value} -- every `utility` row key ONE parsed
    `utilityAllocation` entry publishes, with the value a row reads back."""
    tier = entry.get("tier")
    if not tier:
        return {}
    if entry.get("allocated") is not True:
        port = norm(entry.get("port") or "") or "-"
        kind = "carried" if entry.get("carried") is True else "unserved"
        return {"%s.%s.%s" % (tier, port, kind): 1.0}
    name = entry.get("utility")
    if name is None:
        return {}
    name = norm(name)
    return {"%s.%s.%s" % (tier, name, f): float(entry[f])
            for f in FIELDS if _is_number(entry.get(f))}


def lookup(allocations, unit: str, key: str):
    """The value a `utility <unit> <key>` row reads from a result's
    `utilityAllocation` list, or None when no entry publishes it."""
    for e in allocations or []:
        if e.get("unit") != unit:
            continue
        v = row_values(e).get(key)
        if v is not None:
            return v
    return None
