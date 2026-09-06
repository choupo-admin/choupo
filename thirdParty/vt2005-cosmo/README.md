# thirdParty/vt2005-cosmo — the VT-2005 sigma-profile database (NOT redistributed)

**There are no data files in this directory, and there will not be.**  This card
exists so that the source does not vanish from the project's memory just because
its values may not be shipped.

## The source

The VT-2005 sigma-profile database: 1432 compounds, DFT-COSMO surfaces computed
with DMol3, from Virginia Tech's Design Research Group.

Cite: Mullins, E., Oldland, R., Liu, Y. A., Wang, S., Sandler, S. I., Chen,
C.-C., Zwolak, M., Seavey, K. C., *Sigma-profile database for using COSMO-based
thermodynamic methods*, **Ind. Eng. Chem. Res.** 45 (2006) 4389.

Two routes to a copy: the original Virginia Tech pages (now only through the
Internet Archive), or the `profiles/VT2005/` folder of the NIST reference
implementation, `https://github.com/usnistgov/COSMOSAC`.

## Licence — read this before assuming

Established from primary texts on 2026-09-06, because the project had twice
recorded the opposite:

* **usnistgov/COSMOSAC README:** the CODE is MIT / not subject to US copyright.
  Then, verbatim: *"The .cosmo files in the folders `profiles/UD` and
  `profiles/VT2005` are covered by less permissive licenses… Permission from
  BioVia was obtained to make the .cosmo files available for academic,
  non-commercial use.  For all other use, please contact ian.bell@nist.gov."*
  The `profiles/VT2005/` folder itself carries no licence file.
* **`profiles/UD/Readme.txt`:** *"This database can be freely used for
  non-profit, academic purposes.  Re-distribution of the database without the
  concent of the authors is prohibited."* (sic)
* **The original Virginia Tech page** (Internet Archive snapshot
  `web.archive.org/web/20190701184554/https://www.design.che.vt.edu/VT-Databases.html`)
  offers the files under "Open Literature Resources" and contains **no licence,
  copyright or permission statement of any kind**.

Under this project's licence policy (`CLAUDE.md` §10) both outcomes are
excluded: a **NonCommercial** permission conflicts with Choupo's free-for-
commercial promise, and a page with **no grant at all** leaves nothing to
honour.  Silence is not permission.

**What would change this:** a written open-licence grant from the database's
authors — Y. A. Liu (Virginia Tech) or Ian Bell (NIST).  That is a human act
nobody here can perform, and a written grant is something
`check_source_licence` could then cite.

## What Choupo does instead

Component records name the set as an EXTERNAL REFERENCE and ship none of its
values:

    cosmo { VT2005 { model COSMOSAC; variant "2002"; source "…"; 
                     licence externalRestricted; installed false; } }

The user installs their own copy with `bin/choupo-import-cosmo`, into
`data/local/cosmo/VT2005/` (gitignored).  Absent, `CosmoSac` refuses by name and
prints the install command.  `check_cosmo_scrub` enforces zero shipped values,
refuses `installed true;` in the public tree, and refuses a `variant "2002"`
label on a profile from any other database.

**One narrow exception, stated rather than hidden:** a single ethanol
`.cosmo`/`.sigma` reference pair lives under
`data/tmp/_sources/nist_cosmosac_ref/` as the external golden of a curation
tool's selftest.  It is a test fixture; no number in it reaches a Choupo record.
Its own README carries the reasoning and the remedy.

Record: [`docs/design/the-licence-of-a-sigma-profile.md`](../../docs/design/the-licence-of-a-sigma-profile.md).
