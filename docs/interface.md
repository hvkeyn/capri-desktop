# The interface pass

Two references were asked for, and neither is a drop-in for an Electron overlay drawn in plain CSS:
[benjitaylor/skills](https://github.com/benjitaylor/skills) is a **stageshow** skill for building faux
product UI in React, and [Anshkaran7/expokit](https://github.com/Anshkaran7/expokit) is an
Expo/React Native component kit. So what was taken from them is what transfers: the rules they encode,
applied to her board and her panel.

## From stageshow (benjitaylor/skills)

The skill's one idea is *"a real product, simplified to what the viewer needs, framed with intent, and
every motion has a cause"*, and its five failure modes are what a HUD panel usually gets wrong.

| The rule | Here |
|---|---|
| **One focal object.** The eye has to land somewhere first. | `NOW` is the only 16px/700 block on the board; the phase labels are 8px caps, the log 10px, the steps 11px. |
| **Restraint: real words only where they carry meaning.** | The goal and the current step are written out; the counts are `1/3`, the phases are `SPEC PLAN TASKS BUILD REPORT`, the log is a short verb + target. No fake metrics. |
| **No dead corners.** A card that ends in a void is unfinished. | The footer always holds the clock and both buttons; the log is never empty (it starts with "writing the spec"), and the steps list is the body of the panel. |
| **Every motion has a cause.** | Rows arrive once (`board-frame-in`), a line slides in as it's logged, the meter moves only when a step changes, and the step that is running is the only thing that pulses. Nothing loops. |
| **Hard crop, no shrink-to-fit.** | The board is a fixed-width plate anchored to the screen's right edge, not a floating card with air on four sides. |
| **Reduce it to what the story is about.** | Five phases, the current step, the steps, the last few actions: a work order is exactly that, and anything else is her panel's job. |

## From ExpoKit (Anshkaran7/expokit)

Its conventions are those of a component kit that cares about touch, theming and accessibility
(shadcn-style: components you own, one `KitProvider` for the theme, 44pt targets, roles and labels for
VoiceOver/TalkBack, springs instead of linear tweens).

| The convention | Here |
|---|---|
| **Components you own, not a library** | `board.js` + `board.css` are plain files in the repo, built from the tokens already in `capri.css` (`--ink`, `--yellow`, `--cyan`, `--cut`, `--ease-out`). Nothing imported, nothing to upgrade. |
| **One theme re-skins everything** | The board uses only the existing custom properties, so her Night City theme and the classic one both apply without a second palette. |
| **44pt touch targets** | Every board control is ≥44px tall (`board__action`, `board__icon`, `board__pick`, the input). Her panel keeps 32px: it's a pointer target on a desktop overlay, and making the speech bubble chunky would cost more than it gains — but nothing in it is under 32px either (`interface.css`). |
| **Accessible roles, states and labels** | The board is a `region` with an `aria-label`; the close button has one; the phase list is an `ol`; the fields have real `<label for>`; the board is `aria-live="polite"` so a screen reader hears the status change. |
| **Motion you can turn off** | `reducedMotion` (Windows' animation setting, or her menu) skips the board's entrance; a `prefers-reduced-motion` media query covers the CSS-only animations; `scroll-behavior: smooth` only when motion is allowed. |
| **Springs, not linear** | The board's transitions use `--ease-out` (the power4-out curve the rest of her UI uses), 120–600 ms: fast in, slow to settle. |
| **Haptics-ready feedback** | No haptics on a desktop, but the equivalent: a status that changes has a colour *and* a word (`RUNNING` / `ГОТОВО` / `СБОЙ`), never colour alone. |

## The cross-cutting fixes (`styles/interface.css`)

- **A focus ring on everything focusable** (`:where(button, input, a, [tabindex]):focus-visible`), so
  nothing is reachable but invisible — the old panel had rings on its buttons but not on its field.
- **A bigger hit area for the panel's controls** (32px minimum), and `touch-action: manipulation`.
- **Tabular figures** for every number that changes (the clock, the counts, her state).
- **A visible caret and selection** in her colours.
- **A scrollbar you can see** in her answer panel, smooth only when motion is allowed.
- **Forced colours / high contrast**: her hairlines become real lines, her fill becomes the system
  highlight, so the board doesn't disappear in high-contrast mode.

## What was deliberately not done

- No React, no Expo, no new dependency: the overlay is a single HTML page with modules, and adding a
  framework for one panel would be the largest change in the project for the smallest gain.
- No light theme: she is a Night City HUD; the classic theme already exists for the old violet look.
- No animated cursor walkthroughs (stageshow's subject): there is nothing to demonstrate — the board
  is the thing, live.

## The thinking stream

A long answer used to be a blinking bar. Now, while a turn runs, the panel shows **what she is doing,
above the answer**:

- a line of her own narration (the model's note before a tool, in her voice: *"the disk's full again —
  figures"*), dim and italic;
- then each tool as a line of its own: a verb, the thing it touches, a pencil-dot while it runs and its
  time when it lands (`LISTS C:\Projects` … `1.2 s`), red if it was refused;
- the frame and her face take the colour of the work: violet for thinking, cyan for reading, green for a
  search, yellow for a command, the accent for writing, red for a failure — so the kind of work is
  readable before a word is.

Eight lines at most, oldest dropped, cleared at the start of the next message. The answer then streams
into the bubble *below* the stream, so the panel reads top-down: what she did, then what she concluded.

This is the stageshow rule again — one focal object (the answer), and everything else steps back — plus
the ExpoKit one: state has a colour **and** a word, never colour alone.

