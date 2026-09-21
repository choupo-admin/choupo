# ammoniaRate01_dyson_simon — the rate law, and the curve a converter zigzags about

`tutorials/plant/ammonia03_quench_converter` builds a three-bed quench
converter out of equilibrium beds and then says, in its own README, what it
cannot do: it cannot size a bed, it cannot tell a good injection point from a
bad one, and it rewards over-quenching into a region where a real catalyst is
too slow to reach the equilibrium the model hands it.  All three gaps are the
same gap — **there is no rate law**.

This case is the rate law.

```
runCase tutorials/props/kinetics/ammoniaRate01_dyson_simon
```

**The source.**  D. C. Dyson and J. M. Simon, *A kinetic expression with
diffusion correction for ammonia synthesis on industrial catalyst*,
**Ind. Eng. Chem. Fundam. 7 (1968) 605–610**.  Equations 2, 6–8, 18, 19, 39
with Table I, and 40.

Nothing in this case is measured by Choupo: the data these equations were
fitted to are Nielsen, Kjær and Hansen's (J. Catalysis 3 (1964) 68).


## 1. Read this first: xi and eta are swapped

| | Dyson & Simon, and this case | `CatalystPellet.H`, and most textbooks |
|---|---|---|
| effectiveness factor | **ξ** | **η** |
| conversion of nitrogen | **η** | (no standard letter) |

The same two letters, meaning opposite things.  This case keeps the **paper's**
convention because every number in it is read off the paper's own equations,
and the engine says so at every surface that prints either letter.  Carry `η`
across from the reactor side and you will read a conversion as an
effectiveness factor.


## 2. What the object carries

A correlation in this tree is an object with three things a reader can check,
and this one is no exception:

* **`citation()`** — the primary, equation by equation.
* **`validityWindow()`** — 150 to 300 atm; ξ tabulated at exactly 150, 225 and
  300 atm; ξ for 6–10 mm particles; ξ fitted on a 3:1 H₂/N₂ mixture with
  12.7 % inerts.
* **`verify()`** — five anchors, each stating **what kind of claim it is**.

The kinds matter more than the numbers:

| anchor | kind | what it proves |
|---|---|---|
| forward/reverse = (Ka/Q)² | **theory** | Eq 19 and Eq 2 are the *same* equilibrium — an identity at every composition, so the rate is exactly zero at Q = Ka and changes sign across it |
| V₃ = 0 at the Gillespie–Beattie equilibrium | **theory** | the same statement, in the form a student cares about |
| Ka(700 K) from Eq 2 | **arithmetic** | five coefficients were typed correctly.  Nothing about ammonia |
| ξ(300 atm, 700 K, η = 0.2) from Eq 39 | **arithmetic** | seven more coefficients were typed correctly |
| ξ falls with pressure | **theory** | the ordering pore diffusion requires, and the only check that reads all 21 of Table I's constants at once |

**None is `measured`, and the run says so.**  An arithmetic anchor reproducing
a literal to twelve figures proves a transcription; it is not a validation,
and a bench that let a 0.000 % deviation read as one would be lying quietly.


## 3. The locus of maximum rate, and it DESCENDS

Sweep temperature at a fixed conversion on the paper's own reference mixture
and there is one temperature where the net rate is greatest: high enough for
the forward rate, low enough that the equilibrium has not retreated.  Raise
the conversion and that temperature **falls**.

Measured, at 300 atm, sweeping 600–900 K:

| η (N₂ conversion) | T of maximum rate | V₃ [kmol NH₃ / m³ bed / h] | V₃ [lb-mol/ft³/h] | ξ (8 mm) |
|---|---|---|---|---|
| 0.05 | **900 K** (on the window edge) | 9449.9 | 589.9 | **−0.0942** |
| 0.15 | **867 K** | 1275.6 | 79.6 | 0.234 |
| 0.25 | **794 K** | 274.1 | 17.1 | 0.532 |

Three things in that table are worth as much as the locus itself.

* **The first row's maximum is the window's edge, not a maximum**, and the
  bench says so rather than reporting the edge as an answer.
* **ξ is negative in the first row.**  Equation 39 is a cubic in T and η, the
  paper states no domain for it, and at 900 K and 5 % conversion it has left
  the region it was fitted in.  The value is **announced and returned
  unclamped** — clamping it to zero would hide exactly the fact that the
  reader has walked off the table.
* **Two unit systems, one paper.**  Equation 19 is kg-mol/m³/h; Figures 2 and
  3 are lb-mol/ft³/h.  Both columns are printed, and converting is a named act.

The rate falls by a factor of 34 between η = 0.05 and η = 0.25 while the
temperature of best rate falls 106 K.  **That descent is the curve
ammonia03's quench converter zigzags about** — and until this case existed,
nothing in Choupo could draw it.


## 4. The rate inside ammonia03's converter — and a finding

The bench also evaluates the rate at three gases **transcribed from
ammonia03's converged answer**:

| state | T | V₃ [kmol/m³/h] | ξ (8 mm, interpolated) | Eq 40 |
|---|---|---|---|---|
| bed 1 inlet | 683.15 K | **929.13** | 0.337 | 312.96 |
| bed 1 outlet | 841.28 K | **9.341** | 0.502 | 4.69 |
| bed 3 outlet (converter exit) | 777.51 K | **1.0031** | 0.767 | 0.77 |

**The rate falls by a factor of 99.5 across bed 1 and 926 across the whole
converter.**  That single column is the quantitative answer to a question
ammonia03 could only ask: a bed that reaches equilibrium is doing almost all
of its work in its first few centimetres, and the last of it takes a length no
one would build.

**And bed 1's outlet should have a rate of ZERO, because the flowsheet solved
it as an equilibrium — it has 9.341.**  That is not an error in either place:
it is **two independent equilibria disagreeing**.  Choupo reaches equilibrium
by minimising Gibbs energy with SRK fugacities and its own formation data;
Dyson & Simon use Gillespie & Beattie's 1930 Ka with the fugacity coefficients
of Eqs 6–8.  Solved out, at 841.28 K and 200 bar from bed 1's own feed:

* Dyson & Simon: **x(NH₃) = 0.106761**
* Choupo (`gibbsReactor`, SRK): **x(NH₃) = 0.1060861**
* **0.636 % apart**, with Choupo the more conservative of the two.

That is the first independent check in this corpus of the ammonia equilibrium
every one of its plant cases rests on, and it is a cross-check between two
sources rather than a model checking itself.  It is also why the residual rate
is 9.341 and not zero: it is 1.01 % of the inlet rate, which is what 0.636 % in
composition buys you this close to equilibrium.

Those three gases are a **second home** for somebody else's numbers, so
`check_ammonia_rate` runs ammonia03 and holds them to its converged result.


## 5. Every branch of Equation 40 refuses or announces, and none defaults

There is **no default particle size** anywhere in this slice.  Which branch of
Eq 39/40 applies depends entirely on it:

| the bed is packed with | what happens |
|---|---|
| nothing declared | **REFUSES**, naming `particleDiameter` and the two alternatives |
| below 6 mm | ξ = 1 **exactly**, announced as **the authors' own position** |
| 6 to 10 mm | Eq 39 with Table I |
| above 10 mm | **REFUSES** — a bigger particle is a different diffusion problem, not a further value of this correlation |

And on pressure:

| pressure | the rate (Eq 19) | the effectiveness factor (Eq 39) |
|---|---|---|
| one of 150 / 225 / 300 atm | evaluated | Table I's own column, no interpolation |
| between them | evaluated | **linearly interpolated, announced with both endpoints** — Choupo's choice, not the paper's; it is linear because three points do not justify anything more |
| outside 150–300 atm | **announced**, still returned | **REFUSED** |

The asymmetry in the last row is the point: Eq 19 is a closed expression in T,
P and composition that degrades smoothly, and Eq 39 is *three columns of a
table*.  There is nothing to extrapolate through three points, so it refuses.

The ξ = 1 below 6 mm needs saying carefully, because it sounds exactly like
something else the engine already says.  The four reactors that read
`catalystLoading` announce that they take the effectiveness factor as 1 — and
what they mean is **the correction is unpriced**.  Here the authors priced it
and found it unity.  Same number, opposite claims, and the engine keeps them
apart in words.


## 6. What is still missing — and it is most of a converter

This is a rate law, not a reactor.  Nothing here is wired into any unit, and
`ammonia03`'s beds still reach equilibrium.  To size a bed you would still need
an axial integration, a pressure drop, a bulk density and a space velocity,
none of which this case carries and none of which may be invented.

And the authors say themselves what Equation 40 leaves out: **corrections for
the effect of particle size on reduction, on poisoning and on catalyst
ageing.**  A bed sized from this expression is fresh, clean and fully reduced,
and a working converter is none of those for most of its life.  The engine
carries that sentence on every result rather than in a comment, because it has
to reach wherever a size is eventually published.


## 7. Things to try

1. **Move the catalyst to 3 mm** and watch ξ become exactly 1 — and read
   whose position that is.
2. **Move it to 12 mm** and read the refusal.
3. **Widen the sweep to 1100 K** and watch the η = 0.05 maximum come off the
   edge at about 1046 K — then ask whether an iron catalyst would survive
   there, and notice that the correlation will not tell you.
4. **Change `pressure` to 225 atm** and watch the interpolation announcement
   disappear, because you have landed on one of Table I's own columns.
5. Then reopen `ammonia03`'s README §5 and ask which of its two "bad splits"
   this case can now tell apart.
