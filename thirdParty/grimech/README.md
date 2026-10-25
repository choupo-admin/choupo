# thirdParty/grimech — GRI-Mech 3.0, a mechanism Choupo does NOT redistribute

## The source

Smith, G. P., Golden, D. M., Frenklach, M., Moriarty, N. W., Eiteneer, B.,
Goldenberg, M., Bowman, C. T., Hanson, R. K., Song, S., Gardiner, W. C. Jr.,
Lissianski, V. V. and Qin, Z.  *GRI-Mech 3.0*,
http://combustion.berkeley.edu/gri-mech/ (1999).  The natural-gas combustion
mechanism (53 species, 325 reactions) with its thermodynamic file (NASA-7
polynomials) and transport file.

## Licence, and how it was established

There is **no licence**.  The pages carry a disclaimer and a permission to
CITE, read on 2026-10-25 at
http://combustion.berkeley.edu/gri-mech/overview.html:

> "GRI DISCLAIMER LEGAL NOTICE  These files, both the ones intended for use as
> computer input as well as those comprising documentation, were prepared by
> The University of California, Berkeley, Stanford University, The University
> of Texas at Austin, and SRI International as a result of work sponsored by
> the Gas Research Institute (GRI).  Neither GRI, members of GRI, nor any
> person acting on behalf of either: Makes any warranty or representation,
> express or implied, [...]"

> "You are welcome to make whatever use you like of this information and have
> our permission to cite this Web documentation if you so desire."

Using and citing is not redistributing: nothing on the pages grants a right to
copy the files, or their numbers, into another work.  So GRI-Mech is in the
**no-grant** class CLAUDE.md §10 excludes, and Vítor ruled it so on
2026-10-25 (DEV.md §4c C164: *"Não podes usar de forma direta!"*).  The
2026-06-21 kinetics record ([`docs/chemkin-kinetics-plan.md`](../../docs/chemkin-kinetics-plan.md))
had already said fetch-and-cite.  Its reduced and derived sets (DRM19, DRM22,
the Cantera `h2o2.yaml` subset) inherit the same terms.

## Does Choupo redistribute it?

**No, and no value in the public tree may come from it.**  Until 2026-10-25
the H/O subset was copied verbatim into three tutorials' `constant/reactions`
and 17 catalogue components (plus the NASA-7 heat capacities of 28 case-local
records) had been generated from its thermo file.  All of it was replaced the
same day — the rates by Ó Conaire et al. (2004), the thermo by
NASA/TP-2002-211556 ([`../nasa-tp2002/README.md`](../nasa-tp2002/README.md)) —
or the species removed where no clean primary exists (CH2(S), NNH; and CH2CO,
whose primary disagrees with itself).

`bin/curate/check_source_licence.py` enforces it: a line naming GRI-Mech in a
catalogue record or anywhere under a case's `constant/` REFUSES, unless a
cross-check marker comes before the name — a comparison enters no value.

## Using your own copy

You may download the files for your own work and keep them here (gitignored),
for a LOCAL comparison — the parity runs of DEV.md §4c C160 are exactly that.
No tool in this tree reads them into `data/standards/` or `tutorials/`:
`bin/curate/gri_subset_to_choupo.py`, which did, was retired, and
`bin/import_nasa.py --thermo` refuses to write a CHEMKIN file's values under
either tree.
