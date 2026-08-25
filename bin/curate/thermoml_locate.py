#!/usr/bin/env python3
"""Locate PRIMARY articles for a property measurement via the ThermoML index.

    bin/curate/thermoml_locate.py water octanol
    bin/curate/thermoml_locate.py formaldehyde water --max 10
    bin/curate/thermoml_locate.py CO2 --raw-query 'type:TRCTml4 AND ...'

WHAT THIS IS.  A curation-time bibliographic tool: it asks the NIST/TRC
ThermoML Archive's public search API "which journal articles report
measurements for these compounds?" and prints citations -- authors, title,
journal, year, DOI, and the archive's own per-property data-point summary.
The output is a READING LIST.  What gets read, and cited in any Choupo
record, is the ARTICLE -- the constitution's primary-source rule applied
as written.

WHAT THIS IS NOT, by the archive's own design and not merely by our
policy.  The search API serves metadata with the data points STRIPPED --
the archive's documentation: "the ThermoML JSON files are modified to
contain no data points before they are posted to Cordra; the data points
are replaced with a summary of the data point counts."  So this tool
CANNOT bring a number into the tree even by accident.  The licence
assessment, with verbatim quotes and the three-tier ruling, is
docs/design/thermoml-archive-assessment.md: bibliographic use is tier 1
(unreserved); bulk value import stays reserved to Vitor with counsel.

MECHANICS.  The API is a Cordra digital-object repository at
trc.nist.gov/ThermoML-API using Lucene query syntax.  Compound names match
the archive's own sCommonName fields; the query built here requires EVERY
named compound to appear in the entry, which is the "system contains A and
B" question a curator actually asks.  Coverage: the five cooperating
journals (JCED, J. Chem. Thermodyn., Fluid Phase Equilib., Thermochim.
Acta, Int. J. Thermophys.), ~2003-2019.  A paper outside those journals or
years is simply not here -- absence of a hit is NOT absence of literature.

Requires network access to trc.nist.gov; refuses loudly when the session's
egress policy blocks it rather than printing an empty list that reads as
"nobody measured this".
"""

import argparse
import json
import sys
import os
import ssl
import urllib.parse
import urllib.request

API = "https://trc.nist.gov/ThermoML-API/objects"

#  The session's egress proxy re-terminates TLS, so its CA must be trusted;
#  and the endpoint rejects Python's default User-Agent with a bare 403,
#  which without this header reads as a licence problem it is not.
CA = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
UA = "choupo-curation/1.0 (bibliographic lookup; bin/curate/thermoml_locate.py)"


def build_query(compounds, raw):
    if raw:
        return raw
    terms = " AND ".join(
        r"/Compound/\_/sCommonName/\_:" + urllib.parse.quote(c.lower())
        if False else r"/Compound/\_/sCommonName/\_:" + c.lower()
        for c in compounds)
    return f"type:TRCTml4 AND ({terms})"


def fetch(query, page_size):
    url = (API + "?" + urllib.parse.urlencode(
        {"query": query, "pageNum": 0, "pageSize": page_size}))
    req = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": UA})
    ctx = ssl.create_default_context(
        cafile=CA if os.path.exists(CA) else None)
    try:
        with urllib.request.urlopen(req, timeout=45, context=ctx) as r:
            return json.load(r)
    except Exception as e:
        sys.exit(
            f"thermoml_locate: the archive is unreachable ({e}).\n"
            "  This tool needs network egress to trc.nist.gov.  A blocked or\n"
            "  offline session must say so -- an empty list here would read\n"
            "  as 'nobody measured this', which is a different claim.")


def authors_of(cit):
    a = cit.get("sAuthor") or cit.get("sAuthors") or []
    if isinstance(a, str):
        return a
    names = [x.split("[")[0].strip() if isinstance(x, str) else str(x)
             for x in a]
    out = "; ".join(names[:4])
    return out + (" et al." if len(names) > 4 else "")


def property_summary(content):
    """The archive's own data-point counts, per property name."""
    out = {}
    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if isinstance(v, dict) and "data_points" in v:
                    out[k] = out.get(k, 0) + v.get("data_points", 0)
                else:
                    walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(content.get("summary") or content.get("Summary") or {})
    return out


def main():
    ap = argparse.ArgumentParser(
        description="Find primary articles in the ThermoML Archive "
                    "(citations only -- the API carries no data points).")
    ap.add_argument("compounds", nargs="*",
                    help="compound common names; every one must appear")
    ap.add_argument("--max", type=int, default=25, dest="max_n")
    ap.add_argument("--raw-query", default=None,
                    help="full Lucene query, verbatim (overrides compounds)")
    ap.add_argument("--json", action="store_true",
                    help="machine-readable output")
    a = ap.parse_args()
    if not a.compounds and not a.raw_query:
        ap.error("name at least one compound, or pass --raw-query")

    q = build_query(a.compounds, a.raw_query)
    d = fetch(q, a.max_n)
    total = d.get("size", 0)
    rows = []
    for r in d.get("results", []):
        c = r.get("content", {})
        cit = c.get("Citation", {})
        rows.append({
            "authors": authors_of(cit),
            "title":   cit.get("sTitle", "?"),
            "journal": cit.get("sPubName", "?"),
            "year":    cit.get("yrPubYr", "?"),
            "doi":     cit.get("sDOI", ""),
            "points":  property_summary(c),
        })

    if a.json:
        print(json.dumps({"query": q, "total": total, "shown": len(rows),
                          "results": rows}, indent=2))
        return

    print(f"ThermoML index: {total} entr{'y' if total == 1 else 'ies'} for "
          f"{' + '.join(a.compounds) if a.compounds else a.raw_query}"
          f"  (showing {len(rows)}; five journals, ~2003-2019 -- absence"
          " here is not absence of literature)")
    for r in rows:
        print(f"\n  {r['authors']} ({r['year']})")
        print(f"    {r['title'][:96]}")
        print(f"    {r['journal']}" + (f"  doi:{r['doi']}" if r['doi'] else ""))
        if r["points"]:
            top = sorted(r["points"].items(), key=lambda kv: -kv[1])[:3]
            print("    measured: " + "; ".join(
                f"{k} ({v} pts)" for k, v in top))
    print("\n  The article is the source.  Read it, cite IT -- never this "
          "index -- and\n  record the value with the paper's own units and "
          "uncertainty.")


if __name__ == "__main__":
    main()
