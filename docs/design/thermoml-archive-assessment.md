# The ThermoML Archive: what it is, what its terms say, and what Choupo may do with it

*Assessment 2026-08-25.  Every quotation below was read from the named source
on that date, over the session's own network — none is remembered or
second-hand.  The DECISION this memo prepares (whether any value from the
archive may enter `data/standards/`) is reserved to Vítor under the project
constitution; this memo is the evidence, not the ruling.*

## 1. What it is

The NIST/TRC ThermoML Archive: experimental thermophysical and
thermochemical property data **extracted from journal articles by NIST/TRC
personnel**, stored in the IUPAC ThermoML XML standard (plus JSON), covering
the cooperation between NIST TRC and five journals from ~2003 through 2019:

- Journal of Chemical & Engineering Data (ACS)
- The Journal of Chemical Thermodynamics (Elsevier)
- Fluid Phase Equilibria (Elsevier)
- Thermochimica Acta (Elsevier)
- International Journal of Thermophysics (Springer)

Scale (as reported by DWSIM's integration announcement, not independently
counted): >120 000 phase-equilibrium datasets plus pure-compound property
records.  **Each dataset carries the citation of the article it came from**
— which is the property everything below turns on.

## 2. The terms, verbatim, with sources and dates

**(a) The TRC page** (nist.gov/mml/acmd/trc/thermoml, "Updated May 29,
2026", read 2026-08-25):

> "Files in the ThermoML Archives are available with permission of the
> journal publishers."

**(b) The formal data-repository record** (data.nist.gov RMM record for
ark:/88434/mds2-2422, read 2026-08-25):

> `"@type": ["nrdp:DataPublication", "nrdp:PublicDataResource"]`
> `"license": "https://www.nist.gov/open/license"`
> `"accessLevel": "public"`

The string "SRD" appears NOWHERE in the record.  The archive is typed a
public data resource, **not** Standard Reference Data — which matters
because the NIST licence bifurcates exactly there, and because Choupo's
own exclusion list names "NIST SRD" specifically.

**(c) The NIST licence page** (nist.gov/open/license, read 2026-08-25),
the branch that applies to non-SRD data:

> "Data/works created by NIST employees that are not covered by the
> Standard Reference Data Act are subject to 17 U.S.C. §105 and generally
> are not subject to copyright protection within the United States.  NIST
> data or other works may be subject to copyright protection in foreign
> countries."

and, in the same document:

> "NIST provides the data 'AS IS' and makes ... NO WARRANTY OF
> NON-INFRINGEMENT OF THIRD PARTY INTELLECTUAL PROPERTY RIGHTS.  Users are
> solely responsible for ensuring the accuracy, currency, and other
> qualities for use of NIST-provided data or for any products derived from
> or in connection with the NIST-provided data."

## 3. Honest reading

The three statements pull in different directions and none may be dropped:

- The **formal record grants an open licence** and types the archive
  non-SRD.  An earlier reading in this session ("no downstream grant
  exists") was WRONG on this point and is corrected here: a grant exists.
- The **licence itself disclaims third-party rights**, in capitals.  NIST
  says: we don't promise the publishers have no claim on this.
- The **TRC page acknowledges the publishers by name** as the source of the
  permission under which the files are posted.

So: the U.S. copyright position of the *values* is strong (facts; §105;
Feist).  The position of a *bulk extraction of the arrangement* is exactly
what NIST declines to warrant — and the underlying rightsholders are ACS,
Elsevier and Springer, not NIST.  Whether EU database *sui generis* right
reaches any of this (Choupo and TalentGround are Portuguese) is a question
this memo deliberately does NOT answer: it is counsel's, not an
assistant's, and a confident wrong answer here would be worse than the gap.

## 4. What Choupo may do — three tiers

| use | verdict | why |
|---|---|---|
| **Bibliographic index**: which article measured which property for which system | **YES, no reservation** | Reading a bibliography infringes nothing; the output is a citation, and the article is what gets read and cited.  This also attacks the project's ACTUAL bottleneck, which is locating primaries — not lacking numbers. |
| **Point values, cited to the ORIGINAL article**, checked against it when the paper is in hand | **YES** | This is the constitution's own rule ("cite the PRIMARY source per value, never the aggregator's arrangement") applied as written.  The archive locates; the article sources. |
| **Bulk import of values into `data/standards/`** | **VÍTOR + COUNSEL** | The open licence argues for; the third-party disclaimer, the publishers' named permission, and the provenance-laundering clause of Choupo's own licence policy argue against.  Not an assistant's call in either direction. |

## 4b. The public API is metadata-only BY THE ARCHIVE'S OWN DESIGN (found 2026-08-25, after the tiers above were written)

The archive's search application documents its own API thus:

> "The designed purpose of the API is to provide searching capability on
> ThermoML metadata, not the actual numerical data points.  Thus, the
> ThermoML JSON files are modified to contain no data points before they
> are posted to Cordra; the data points are replaced with a summary of the
> data point counts."

So tier 1 is not merely permitted — it is the use the service was BUILT
for, and a tool that queries it cannot import a value even by accident.
The full data files live separately (data.nist.gov bulk download), which
is exactly the tier-3 boundary: crossing from the API to the bulk files is
a deliberate act, not a slippery slope.

The tool: `bin/curate/thermoml_locate.py <compound> [<compound>...]` —
prints authors, title, journal, year, DOI and the archive's own
data-point summary per property.  Cordra REST + Lucene at
trc.nist.gov/ThermoML-API.  First real use, same day: located five
candidate primaries (with DOIs) for `HCHO.dat`'s "primary re-citation
pending" mark, including Albert/Hasse/Kuhnert/Maurer JCED 2005 and
Grutzner/Hasse JCED 2004.  The papers still have to be READ before any
record moves — the tool ends its own output with that sentence.

## 5. What was verified vs what was not

Verified on 2026-08-25 over live network: the three quotations above; the
PDR record's type, licence and access fields; that DWSIM's
`Databases.vb` (branch `windows`) contains no ThermoML code (its
integration presumably lives elsewhere in that repository — not chased
further, since Choupo needs nothing from their implementation).

NOT verified: the archive's actual dataset count (the 120k figure is
DWSIM's marketing claim); the terms of each publisher's cooperation
agreement with NIST (not public, as far as searched); any EU-law analysis.
