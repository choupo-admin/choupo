#!/usr/bin/env python3
"""usage: summ.py TAG  -> table op x model x class, reason families and components behind each"""
import collections, os, re, sys
E = os.path.expanduser("~/.cache/choupo/expl/")
tag = sys.argv[1]            # "" for the first run (res_/res2_), "after" for the second (resA_/resA2_)
pre = "resA" if tag == "after" else "res"
rows = {}
for f in ["singles", "pairs_other", "pairs_txy"]:
    for l in open(E + f"{pre}_{f}.tsv"):
        r = l.rstrip("\n").split("\t")
        if len(r) >= 6:
            rows[r[0]] = r
    p = E + f"{pre}2_{f}.tsv"
    if os.path.exists(p):
        for l in open(p):
            r = l.rstrip("\n").split("\t")
            if len(r) >= 6:
                rows[r[0]] = r            # the better reason replaces the first-pass row

def family(reason):
    s = reason
    s = re.sub(r"^ADVISORY: ", "", s)
    pats = [
        (r"UNIFAC: component\(s\) (.+?) have no group decomposition", "UNIFAC: no group decomposition"),
        (r"(NRTL|Wilson): the case declares .*?: (.+)$", r"\1: no curated pair (would run ideal)"),
        (r"Wilson: component '(.+?)' has Vliq", "Wilson: no Vliq"),
        (r"(SRK|PR): component '(.+?)' is missing Tc or Pc", r"\1: missing Tc or Pc"),
        (r"shadow: the case's record", "case record shadows the catalogue (no overlayOf/variationOf)"),
        (r"unknown model '(.+?)'", "unknown transport model"),
        (r"missing scalar entry 's_298'", "record has no standardThermochemistry (s_298)"),
        (r"produced NO value.*Reason at the first point: (.*)", "scan produced no value: \\1"),
        (r"views, view .* y = null at x", "figure refused: null on log axis"),
        (r"csv holds nan", "answered, with nan points"),
    ]
    for p, name in pats:
        if re.search(p, s):
            return re.sub(p, name, s) if "\\" in name else name
    return s[:110]

def comps_of(r):
    return r[3].split(",")

tab = collections.defaultdict(collections.Counter)
fam = collections.defaultdict(lambda: collections.defaultdict(set))
for r in rows.values():
    op = r[1]
    model = r[2]
    if op.startswith("scan:"):
        key = (op, model if len(model) < 12 else model[:12])
    else:
        key = (op, model)
    tab[key][r[5]] += 1
    if r[5] != "ok":
        f = family(r[6]) if r[6] else "(no reason given)"
        for c in comps_of(r):
            fam[key + (r[5],)][f].add(c)
        # keep count too
        fam[key + (r[5],)][f + "\0n"].add(r[0])

print("op | model | ok | ok-with-nan | refused (named) | refused-other | crash | timeout | no-reason | total")
for k in sorted(tab):
    c = tab[k]
    print(" | ".join([k[0], k[1]] + [str(c.get(x, 0)) for x in ["ok", "ok-with-nan", "refused", "refused-other", "crash", "timeout", "no-reason"]] + [str(sum(c.values()))]))
print()
print("REASON FAMILIES (class, op, model, family: cases / distinct components named)")
tot = collections.Counter()
for k in sorted(fam):
    for f, s in sorted(fam[k].items()):
        if f.endswith("\0n"):
            continue
        n = len(fam[k][f + "\0n"])
        print(f"  {k[2]:14s} {k[0]:30s} {k[1]:36s} {n:5d} cases, {len(s):4d} comps | {f}")
        tot[(k[2], f)] += n
print()
print("TOTALS by family")
for (cl, f), n in sorted(tot.items(), key=lambda x: -x[1]):
    print(f"  {n:6d}  {cl:14s} {f}")
print("rows:", len(rows), " classes:", collections.Counter(r[5] for r in rows.values()))
