# The fluidisation laboratory (a pop-out of the `fluidised-beds` EduTool)

Written 2026-11-13 with the view.  The student's task, in one sentence:
*"I turn up the gas on a bed of particles, I watch what the bed does and I
read the instruments, and from my own readings I find the velocity at which
it fluidises and the one at which it is carried away."*

The commission, in the project owner's words (2026-11-13):

> "Na pagina da fluidização não era muito giro ter um laboratorio virtual uem
> qie se visse uma coluna com particulas a mexer? Isso podia ficar num popup
> ou abrir noutro tab."

and, clarifying:

> "Quando digoi particulos digo apenas uma coisa esquematicxo de pontos a
> mexer e depois a expandir e depois a sair! Ate se podem por dois ou tres
> tipo de particulas!"

He was told, and did not object, that the dots are a stylised drawing and
nothing is simulated, and that the kinds of particle are shown in columns side
by side rather than mixed in one column.

Files: `gui/src/case/fluidisationLab.ts` (the pure half: the URL, the computed
state of a column, the drawing as a function of state and time, the notebook's
reveal), `gui/src/ui/methods/FluidisationLabTab.tsx` (the tab: controls,
canvases, instruments, notebook), `gui/src/case/fluidisedBedPresets.ts` (the
page's example particles and gases, moved there unchanged so the page and the
tab read one list), `gui/tests/fluidisationLab.test.ts` (the checks).  The
page's arithmetic and its record: `gui/src/case/fluidisedBeds.ts`,
[`fluidised-bed-hydrodynamics.md`](fluidised-bed-hydrodynamics.md).

## 1. How it is opened, and what survives a reload

A button on the page, "Open the laboratory (new tab)", opens
`?fluidlab=1&gas=…&T=…&P=…&mu=…&L=…&Dt=…&nd=…&Dg=…&u=…&c=…` in a new tab;
`gui/src/ui/AppShell.tsx` routes it before any other shell, as it does
`?component=`.  Every input rides in the URL, so the tab survives F5, a
bookmark and a cold browser, and has nothing to expire: there is no stash.
The velocity is written back to the URL as it moves (`history.replaceState`).
A URL that does not read (an unknown gas or particle, a value that is not a
number, more than three columns) refuses in place, by name, with the way back.
The bare link `?fluidlab=1` opens three default columns.

Chosen over a localStorage stash (the `?explore=mccabe` and `?layout=`
pattern) because the laboratory's inputs are a dozen numbers that need no
engine to rebuild: a stash can expire and must then refuse, a URL cannot.

The notebook is kept in the tab's `sessionStorage`, keyed by the set-up: it
survives F5 in the same tab and is never shared.  The columns are refilled on
a reload.

## 2. What is computed and what is decoration

Every number on the tab is CALLED from `gui/src/case/fluidisedBeds.ts`:

| shown | from |
|---|---|
| pressure drop | `bedPressureDrop`, on the charge still in the column |
| regime word | `regimeMap(...).at` |
| u_mf (revealed), Wen and Yu beside it | `minimumFluidisation` (its `wenYu`) |
| u_t (revealed) | `terminalVelocity` |
| Geldart group | `geldartGroup`; group C's sentence is `GELDART_SAYS.C` |
| bed height below u_mf | the packed charge, L_mf |
| bed height in the particulate band | `particulateExpansion` (added, section 3) |
| bed height when bubbling | `bubbleBed(...).H` |
| a void's diameter at its height | `bubbleAt` (Mori and Wen) |
| a void's rise velocity | `bubbleAt(...).ub`, integrated up the bed as the time to rise |
| how many voids | their mean area in the drawn slice equals `bubbleBed(...).deltaMean` |
| d_b and u_b at the top, mean bubble fraction | `bubbleBed(...).profile` and `deltaMean` |

The drawing is a pure function `labFrame(state, t, reduced)` returning
positions in metres; the canvas only paints it.  The tests hold it to the
numbers above: nothing moves below u_mf, the drawn height is the computed
height, each void's diameter is Mori and Wen's at its height, the voids' mean
area fraction is the computed bubble fraction (to 5 % over 200 s of drawing
time), dots leave only above u_t, and reduced motion gives still frames.

DECORATION, said on the screen in plain words: the number and the size of the
dots, the way each one moves, where a void appears across the column, the
speed of a dot leaving (u − u_t, the single particle's slip, on the column's
scale), and how fast a column empties above u_t (a fixed twelve seconds: the
page computes no elutriation rate).  The column is drawn to scale, the same
metres per pixel across and up, and time runs at real speed, so no factor
needs stating.

Above u_t the column empties in the drawing, and the instruments follow what
remains (`bedPressureDrop` and the heights are evaluated on the remaining
charge), so a student coming down after the bed was carried out records a
lower pressure drop, which is what a real column would show.  "Refill the
columns" puts the charge back.

## 3. One quantity added to the page's arithmetic

The page had no bed height for the particulate band of a group A powder
(between u_mf and u_mb): `bubbleBed` assumes bubbles.  Rather than bring a
published expansion law and its constants from memory, `particulateExpansion`
extends step 1's balance with the voidage free: the bed opens until Ergun's
gradient at the new voidage again equals the bed's weight at that voidage,
solved by bisection on [ε_mf, 1).  No new constant.  It is a stated
approximation, not a published expansion law (Richardson and Zaki's is the
usual one and is not on the page); its tests hold it to the balance, to mass
conservation of the charge and to the packed bed at u_mf.

## 4. Side by side, not mixed

The page computes each kind of particle alone.  A mixed bed has rules the page
does not have: segregation by size and density, a mixture's own minimum
fluidisation velocity, the fines that lubricate the coarse.  Drawing two kinds
in one column would show a behaviour no line of the page computes, so the kinds
sit in one to three columns side by side, with the same gas and one velocity
control.

The default columns are three of the page's example particles that land in
three different Geldart groups by the page's own `geldartGroup` (air at
20 °C): cracking-catalyst-like (A), sand-like (B), grain-like (D).  Opened from
the page, the page's particle comes first and presets of groups not yet
present fill the rest, the group C fine powder last.  The particle values are
the page's own illustrative numbers, not measurements, as the page already
says.

## 5. Group C, turbulent and transport

Group C: the page's own text (`GELDART_SAYS.C`) says a cohesive powder opens
channels and lifts as a plug instead of fluidising.  The laboratory does not
animate a fluidisation the page says does not happen: the column is drawn
packed at every velocity, the page's sentence is shown under it, and the
instruments still show the page's Ergun numbers with a note that they assume a
powder that fluidises.  Nothing is drawn leaving above u_t (a cohesive powder
leaves as clumps the page does not describe).

Turbulent, fast fluidisation and pneumatic transport: the page computes
nothing of its own there.  The bed height drawn is `bubbleBed`'s two-phase
result taken outside its regime, drawn dashed and labelled so, and no voids
are drawn.

## 6. What is not shown

Listed on the screen (`NOT_SHOWN` in `FluidisationLabTab.tsx`):

* the hysteresis of a first fluidisation (the overshoot on the way up, the
  lower curve on the way down);
* channelling, and the plug a cohesive powder lifts as;
* slugging in a narrow column (a computed bubble wider than the column is
  drawn across it and flagged, never modelled);
* a mixed bed of several kinds in one column;
* the structure of the turbulent and transport regimes;
* how fast particles are carried out (no elutriation rate);
* the distributor's own pressure drop, the wall's friction and the jets above
  the orifices;
* anything the page's arithmetic does not compute.

## 7. Predict, then reveal

"Record this reading" writes (u, ΔP, H) for every column, marked up or down
against the column's previous reading; the points are plotted ΔP against u on
a log axis, one plot per column.  u/u_mf and u_t stay hidden on the
instruments until the student types the velocity he read off his own points;
only then are the page's u_mf (with Wen and Yu's beside it) or u_t shown, with
the difference in % of the page's value, and the page's ΔP line for the full
charge is overlaid on his points.

## 8. Motion and cost

The canvases repaint from one `requestAnimationFrame` loop that never renders
React per frame; the loop stops when the tab is hidden, when paused, and under
`prefers-reduced-motion`, where the columns are still frames with the same
numbers and a column above u_t is shown already empty.  At most 140 dots, 24
dots in flight and 60 voids per column; when more voids than that are computed
to be present, one in N is drawn and the instruments say so.  Every control is
a button, a slider or a field, reachable by keyboard.

## 9. Rejected alternatives

* **A particle simulation** (discrete particles with drag and collisions, or a
  two-fluid model).  It would compute a behaviour the page does not, would be
  the only number on the tab with no line of the page behind it, and would run
  badly on a phone.  The owner asked for a schematic of moving dots.
* **A mixed bed in one column** (section 4).
* **A modal over the page.**  The credo prefers a real tab, and a tab lets the
  student keep the page's derivations beside the laboratory.
* **A localStorage stash** (section 1).
* **Richardson and Zaki for the particulate band**: constants not on the page
  and not checked against their source; the page's own balance with the
  voidage free was used instead (section 3).

## 10. A second slice could be

* the hysteresis of a first fluidisation as a declared, flagged overshoot,
  once the page itself computes one;
* a size distribution in one column, carried out class by class with step 5's
  cut diameter;
* the page's bypass and exchange numbers on the instruments, with the cloud
  drawn around a void;
* a printable notebook.
