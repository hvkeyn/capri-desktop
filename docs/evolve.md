# Evolving her own harness

She can edit the words that make her her — her standing notes, how she works a work order, the
checklists under `skills/` — from what she has been corrected on. This is the part of the project that
follows **RRSI**: *Regularized Recursive Self-Improvement of Agent Harnesses*
([arxiv 2609.24972](https://arxiv.org/abs/2609.24972), [google-research/rrsi](https://github.com/google-research/rrsi)).

The short version of the paper: an agent is mostly its harness — the prompts, control flow, tools,
memory around a frozen model — so you can improve the agent by editing the harness. But a loop that only
asks *"did the score go up on what I've seen?"* memorises what it has seen, and the gains vanish on
anything new. RRSI keeps the edit space open and **regularizes the search** instead. That's the design
here, at the scale of one desktop app.

## What it may edit

Only `/harness` — copied into `<userData>/agent/harness` on first run, and edited there:

| File | What a change to it does |
|---|---|
| `persona.md` | her standing notes, appended to her chat's system prompt |
| `work.md` | how a work order runs (read first, smallest change, check after) |
| `skills/*.md` | the checklist a build step reads |

Not `src/`. Not your files. Not her config. A proposal that names any other file is refused by the
critic before anything is evaluated.

## A round

1. **The cases.** Moments where you corrected her: a message that starts with *"no"*, *"не так"*,
   *"that's not what I asked"*, kept with the question it corrected. Up to six per round.
2. **The proposal.** Her model is shown the harness, the edit history (so a falsified idea isn't
   redrawn), the pruned components, and the annealed budget. It answers with JSON edits:
   `{component, hypothesis, file, find, replace}`, each attached to a hypothesis.
3. **The critic** (`screen` in `evolve.js`), before a single token is spent on evaluation:
   - the file must be a harness file, and `find` must occur in it **exactly once**;
   - a hypothesis is required — an edit without one is a guess, not a proposal;
   - no links, addresses, keys, task ids, or "case 3"-style references in the change;
   - **no copying the words of a case it will be scored on** (five-word shingles) — that is the
     memorisation the paper is about, refused structurally;
   - no more than the round's budget of edits.
4. **The evaluation.** The harness as it is, and the harness with the edits, answer the same cases.
   A judge (her model, reading your correction) scores each answer 0–1; the score is the mean.
5. **Selection** — a gain has to clear two gates:
   - **the noise floor** (`delta`, 0.04): a gain inside it is a rerun, not an improvement;
   - **the cost rule**: a gain has to pay for the extra tokens the candidate spent.
   Failing either rejects the whole candidate (and records every edit in it as rejected).
6. **Keeping it.** An accepted round is **backed up first** (`agent/evolution/backups/rN-…`), then
   written, then recorded. `agent/evolution/history.jsonl` has one line per edit: component,
   hypothesis, verdict, gain, cost, reason.

## The regularisers, mapped to the paper

| RRSI | Here |
|---|---|
| Annealed edit budget `b_t` | `editBudget(round, {rounds, maxEdits})`: 4 edits at round 0, 1 by round 5 |
| Proposer conditioned on history `L_t` | `historyNote()` — the last eight verdicts go into the prompt |
| Stall flag, untried components | pruned components are named in the prompt as off-limits |
| Critic, leakage screen | `screen()`: file, uniqueness, hypothesis, secrets/ids, case-shingle leakage |
| Noise-adjusted floor `delta` | `minGain`, default 0.04 |
| Cost rule | `costWeight` per 1k tokens, default 0.02 |
| Prune set `B_t` | `prune()`: three rejections in a row and a component leaves the search |
| Audit trail | `evolution/history.jsonl`, `evolution/state.json`, backups |
| Candidates in worktrees | the candidate is an in-memory harness copy, written only on acceptance |

## Running it

- **From her menu:** *Work › Learn from me*. One round. She says on the panel what it found, and the
  board stays quiet — this is not a work order.
- **From the console:** `agent.evolve()` returns `{ok, summary}`.
- Nothing runs on its own. There is no schedule, no background loop: a round costs a handful of model
  calls (six cases × two harnesses, plus the proposer and the judge) and it is your call when to spend
  them.

## What can go wrong

- **The judge is the model that wrote the change.** It is a weak signal, which is why the critic and
  the floor are structural and not a matter of taste: copying a case's words is refused before scoring,
  and a small gain does not count.
- **Six cases is not a benchmark.** A round can move her in a direction you didn't want. The backup and
  `history.jsonl` are there so you can see what changed and undo it: copy
  `agent/evolution/backups/rN-*/` over `agent/harness/`, or delete a line from `persona.md`.
- **Corrections are read by a regex.** *"no, actually…"* starts a correction; *"не так"* does; a
  politely rephrased request may not. Nothing else in your chat is used as a case.
- **Nothing about you leaves for training.** Observations stay in `<userData>/agent/observations.jsonl`
  and only go out as a prompt when a round actually runs.
