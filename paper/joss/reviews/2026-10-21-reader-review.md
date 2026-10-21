# Reader review of the JOSS draft v2 (2026-10-21)

An external reviewer read the JOSS draft at cbb354786 as three readers: an
engineer designing a plant, an engineer doing research, and a professor
teaching in the age of AI.  Vítor forwarded it; it was given in
Portuguese, and this is a faithful English rendering, condensed only where
it repeated itself.

**Verdict:** the paper explains in detail how the program was built and
policed, but leaves the engineer and the professor to translate it into
their own work.  "I still need to see, in the first pages, a problem of
mine being solved.  That demonstration is what would make me open Choupo
and try it."

## The engineer designing a plant

- The first sentence interests them (connect operations, compute balances,
  solve recycles), then the text turns to C++17, dictionaries, pure
  functions and model registration.  Sizing, costing, layout, comparing
  conditions and optimisation sit almost inside a parenthesis.
- Their questions: starting from a feed and a production target, what
  results do I get?  Can I compare two configurations and see which uses
  less energy?  Can I go from flows to equipment sizes and an investment
  estimate?  What do I receive at the end (stream table, equipment list,
  utility needs, costs)?  To what level of design, and what data must I
  supply?
- The text names tools for these tasks but does not show the path from
  the problem to the decision.  The ammonia figure could: its caption
  explains colours and lines; it should say which engineering question was
  solved and which results the user can read.
- No full study needed: one short example with inputs, results and scope
  of use would do more than the list of algorithms.

## The engineer doing research

- Potentially valuable: adding a transport law and using it inside a
  process.  But "one class and one registration line" does not say how much
  work that is.  The question: "If I already have a model of my membrane,
  what no longer needs programming when I integrate it in Choupo?"  List
  what becomes available -- connection to streams, balances, property
  calls, recycle solution, varying conditions, presenting results -- as far
  as it is actually implemented.
- The membrane section is organised around articles, reproduced tables and
  file paths: it shows checks were made, not what the researcher gains.
- The most expressive example is already there: the limiting current
  falls as the diluate depletes in a batch run.  Develop the use: which
  conditions can be varied, which behaviour studied, which comparison made.
  Tutorial paths can be discreet links, not the centre.

## The professor teaching with AI

- The concern is pertinent (AI prepares and runs a simulation; the
  student must still understand it), but the answer stays at "files are
  readable, sources identified, iterations in the log".  That gives the
  professor material, not an activity in which the student must think.
- Their questions: what task can I set when AI already produces the
  result?  How do I assess the choice of hypotheses and the physical
  interpretation?  How do I tell a copied answer from an understood
  decision?  What preparation does it need from me and the students?  Is
  there an exercise I can try in one class?
- Suggested concrete example, presented as a possible use with no claim
  of measured effectiveness: (1) the student predicts the effect of
  changing an operating condition; (2) uses an AI to prepare two variants
  of the case; (3) runs them and identifies the models and assumptions
  used; (4) explains a difference in the results and defends the chosen
  option; (5) the professor changes a condition and asks the student to
  anticipate and interpret the response.  Showing the log alone does not
  demonstrate learning.
- The positive opportunity is under-used: if AI reduces preparation
  work, the student can compare more alternatives and spend more time on
  interpretation.  The text dwells on controlling errors.

## What is taking the place of that explanation

| The paper highlights | The reader wants to know |
|---|---|
| A shared C++ core | Can I start in the browser and continue locally? |
| Cases entirely in text | Can I hand in, compare and exactly reproduce a student's or colleague's work? |
| Extension by classes and registration | Which model of mine can I add, and what work does the simulator then do for me? |
| Sources and limits of parameters | Can I tell whether the data suit the conditions I am studying? |
| Hundreds of tutorials and dozens of operations | Is there an example close to my problem that I can adapt? |
| Iterations and residuals | Can I understand why a calculation failed and decide what to change? |

Architecture may stay, but each detail should appear tied to the task it
makes possible or easier.  A practical trust question: the sentence about
plants known not to close the balances leaves the reader asking which
examples can be used and which demonstrate open problems -- they need a
clear marking of that distinction, not the internal tracking mechanism.

## Proposed organisation

Three capabilities, each with one short example using only demonstrated
features:

- **Study a process:** define feeds and operations, compute the
  behaviour, compare alternatives.
- **Investigate a model:** incorporate one's own relation and study its
  consequences in a larger system.
- **Teach with AI:** use the assistance in preparation while keeping the
  hypotheses, calculations and decisions available for discussion and
  assessment.
