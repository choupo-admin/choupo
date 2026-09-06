# NIST COSMO-SAC reference pair — what this is, and why it is here

Two files, one substance (ethanol, InChIKey `LFQSCWFLJHTTHZ-UHFFFAOYSA-N`),
taken from the reference implementation at
[`usnistgov/COSMOSAC`](https://github.com/usnistgov/COSMOSAC):

| file | what it is |
|---|---|
| `…-N.cosmo` | the RAW DMol3/COSMO output — the molecular surface itself |
| `…-N.sigma` | the sigma profile NIST's own code computes from that surface |

## Why they are kept

They are the **external golden pair** of `../cosmo_tools/sigma_profile.py
--selftest`: the `.cosmo` is the input, the `.sigma` is the answer our
implementation must reproduce.  Without them that tool has no
independent check at all, and a check that cannot run must not pass.

**No value in either file enters a Choupo record.**  They are a test
fixture for a curation tool, not data the simulator reads, not a
component `.dat`, and not part of any case.

## The licence position, stated rather than assumed

The NIST repository's own README says (read 2026-09-06):

> *MIT licensed (see LICENSE for specifics), not subject to copyright in
> the USA. Foreign Rights Reserved, Secretary of Commerce.*
>
> *The .cosmo files in the folders `profiles/UD` and `profiles/VT2005`
> are covered by less permissive licenses, for which the respective
> README file should be consulted.  Permission from BioVia was obtained
> to make the .cosmo files available for academic, non-commercial use.
> For all other use, please contact ian.bell@nist.gov for more
> information.*

So the CODE there is MIT; the `.cosmo` files are not.  The restriction
exists because DMol3 is BioVia's commercial software and the `.cosmo`
format is its output.

**This is a deliberate, narrow retention, and it is the exception rather
than the rule.**  Choupo ships no VT-2005 sigma-profile values in
`data/standards/` — every set there is an external reference
(`licence externalRestricted; installed false;`) that the user installs
from their own copy with `bin/choupo-import-cosmo`.  What is kept here is
one substance's reference pair, used to verify a tool against the
implementation that produced it — a use the restriction's own purpose
(academic) covers, and one that redistributes no database.

If that reading is ever judged too generous, the remedy costs one commit:
delete the pair, and have `sigma_profile.py --selftest` REFUSE by name
with the instruction to fetch it from `usnistgov/COSMOSAC` — the same
posture `CosmoSac` already takes when a VT-2005 set is not installed.
What must not happen is the quiet third option, where the files go and
the selftest silently stops checking anything.

Full reasoning, and the primary texts behind the VT-2005 decision:
[`docs/design/the-licence-of-a-sigma-profile.md`](../../../../docs/design/the-licence-of-a-sigma-profile.md).
