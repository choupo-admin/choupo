# Heat exchange in and around a catalyst bed: a cooled multitubular pfr, and a converter that is one shell

Status: **SHIPPED 2026-10-12** -- commission C69 (DEV.md §4c), on stated
defaults the commander took; Vítor can reverse any of them.

## 1. What was asked

Vítor asked whether a `pfr` can size a heat exchanger "em contacto com o
catalisador ou a seguir ao enchimento", and relayed a second opinion he
accepted: a cooled multitubular reactor, and the ammonia case's three beds
and two interbed coolers grouped as ONE multibed converter.

## 2. Part A -- a cooled multitubular pfr

Measured first: the `pfr` already had `thermalMode heatExchange` with a
DECLARED U, a DECLARED area per volume and a CONSTANT coolant temperature.
Added, all opt-in (a `pfr` without them is byte-identical, measured against
a build of the parent on the pfr corpus):

* `tubes { count; innerDiameter; length; wallThickness; wallConductivity; }`
  -- the area and the bed volume follow from the geometry, so an outer
  `designSpec` can SOLVE the tube count;
* `coolant { arrangement coCurrent | counterCurrent | boiling; ... }` -- the
  coolant's own energy balance marched with the species by the same RK4
  (counter-current by shooting); `boiling` is the old constant-T form;
* `wallHeatTransfer { model LiFinlayson; }` -- the bed-side wall coefficient
  from a packed-tube correlation at the LOCAL gas, in series with the wall
  and the declared coolant film; NOT an empty-tube Dittus-Boelter;
* a bundle sizer (tube count, area, shell ID, catalyst mass).

Witness `tutorials/steady/reactors/pfr05_cooled_multitubular`
(Zuluaga-Botero et al., Catalysts 10 (2020) 626, CC BY 4.0; author-set
values named in its header).  Gate `check_cooled_pfr`.

## 3. Part B -- a multibed converter is ONE pressure shell

A sector may be declared a converter (`type converterShell` in the
postDict): its beds become internal baskets (not costed, naming the shell),
the interbed exchangers keep their own blocks, and ONE shell -- stacked
axially, at the sector's design pressure -- is sized and costed, with ONE
relief valve on it.  Gate `check_converter_shell`.

## 4. The rule the first cut got wrong: ONE diameter

The first cut sized the shell at the WIDEST bed while each bed kept its own
`L_over_D` -- so the comparison "one shell 31.4 MEUR vs three shells 18.7
MEUR" compared vessels of different diameters and meant nothing.  ADOPTED:

* **inside a converter the beds share ONE diameter, and its one home is the
  flowsheet variable the beds read** (`operation.diameter $D_converter`);
  each bed's length is V_R / (pi D^2 / 4);
* a bed's own `L_over_D`, two beds declaring two diameters, a `D` in the
  shell's own design rules, and an exchanger wider than the converter each
  REFUSE by name;
* D is SOLVED by the case's `designSpec` with a new target form,
  `largestOf ( p1 p2 ... ); value; tol;` -- the largest of the beds'
  `dP_over_allowable` equals 1, so no bed is named in advance as the binding
  one; the target names which was largest at the answer and announces a tie;
* the shell sizer CHECKS D: it scales each bed's Ergun drop to any diameter
  (D^-4 viscous, D^-6 inertial, each bed's solved axial state held fixed;
  each bed publishes `ergunInertialShare_bed`), bisects in ln D on
  [0.1, 10] m, publishes `D_smallestAdmissible` with the binding bed and the
  bracket, refuses by name when no diameter satisfies every bed, and warns
  when the declared D is below it.

**REJECTED: D declared on the shell, in the postDict** (the brief's form).
The Ergun drop is integrated WITH the reactions -- the local pressure feeds
the rate law and the bed outlet leaves at P_in - dP -- so D must be known
during the solve, and the sizing pass runs after it.  A D chosen in the
postDict would size a converter whose drops are not the ones in the stream
table.

## 5. What it measured on greenAmmonia03_basicDesign

D = 2.2283 m, bed 3 binding at its 1 bar allowable (bed 1 at 0.31, bed 2 at
0.62).  At EQUAL diameter one shell costs MORE than three (16.79 against
15.90 MEUR): the two coolers sit inside it at the full diameter and 167 bar.
FCI 61.02 -> 59.14 MEUR, NPV -344.68 -> -340.93 MEUR against the previous
main.  The re-record list was shown to Vítor (C69_moved_rows.md).

## 6. Named, not fixed

* The coolers' shells are counted TWICE -- inside the converter's height and
  in each cooler's own Turton exchanger cost (no bundle-only correlation is
  carried); the basis string says so.  Whether a real converter needs that
  full-diameter height for its exchangers is a construction question the
  sizer does not answer.
* No head space, cooling annulus, distributor or plenum in the shell height.
* The plant `designSpec` from a perturbed start is in no gate (about 18
  minutes per run); arm (h) uses a two-bed fixture.
* The recycle tear moved to `PreheatedFeed` because the sequential plan
  refuses a tear on a sector outlet named by its plant label; the fixed
  point is the same to round-off.
