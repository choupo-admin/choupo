# Prompts for your AI assistant

Paste prompt A once per conversation and wait for its ten lines; then paste B, replacing `<pack>` with one name from the pack list; then C, replacing the angle brackets with your task.
Your assistant gives you the case as a .zip: open it in the app with File, Open Case from .zip, run it, look, and go back to the assistant with what you saw.

## A. First, make it learn Choupo

```text
Before I ask you anything, learn Choupo from its own instructions. Read these three whole, in this order:
1. https://www.choupo.org/llm/start-here.md
2. https://www.choupo.org/llm/brief.md (the contract: what a case is, how a stream is fixed, units and sources, what a refusal means)
3. https://www.choupo.org/llm/capabilities.md (what Choupo does and does not do)
Then tell me in ten lines what you learned and wait for my task.
Standing rule: a tutorial is a worked check, never a template. Derive my case from the contract and the grammar; only afterwards compare it with the nearest tutorial and say where they differ. Never invent a property, a price or a parameter: stop and ask me.
```

## B. Then, make it learn the area of the task

```text
Now read https://www.choupo.org/llm/packs/<pack>.md whole and tell me in five lines what it adds to what you already know. Then wait.
```

Packs: `batch-plant` (batch plan, machines, GMP), `design-cost` (sizing, CAPEX, OPEX, NPV), `layout` (plot plan), `pharmaceutical` (a tablet plant from a drug and a dose), `pressure` (pumps, pipes, valves), `reactors` (kinetics, equilibrium, Gibbs), `recycles` (loops, tears), `separations` (columns, absorbers, extraction).
For a property, a component or a pair, read https://www.choupo.org/llm/reference/thermo.md and https://www.choupo.org/llm/reference/components.md instead.

## C. Then, the task in your own words

```text
My task: <what I want, in plain words: the product, the route, the numbers I have>.
Work from the contract you learned. First write the three decisions you had to take and why. Then give me the whole case folder as a .zip to download, every value with its unit and its source, and one short note. Only if you cannot create a file, give each file as its own block headed `=== FILE: <path> ===` (path inside the case folder). If a datum is missing, stop and ask me. If you could not run the case, say so and name the step I take after opening it (File, Complete 0/, then Run).
```
