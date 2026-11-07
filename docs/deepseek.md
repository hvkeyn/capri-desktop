# Capri on DeepSeek

This fork turns her chat on with **DeepSeek** out of the box, instead of a local model on Ollama.

| | upstream | this fork |
|---|---|---|
| `config.json` › `provider` | `ollama` | `deepseek` |
| `config.json` › `chatModel` | `null` (the first model Ollama has) | `deepseek-flash` |
| her setup guide, services with a key | Groq first | DeepSeek first |

Everything else is untouched: her hooks, her windows, her chat, what she does on your PC. Only *who writes
her answers* changes, and those answers (and the picture of your screen, when you ask her to look) now go to
DeepSeek's servers instead of staying on your PC. What leaves your machine is described in the README under
[What leaves your machine](../README.md#what-leaves-your-machine).

## The key

Her answers need a DeepSeek API key. Two ways, both kept on your PC:

- **In her panel**: right-click her › **AI model** › **API key or address…** › **DeepSeek**, then paste the key.
  It's encrypted with your Windows account (DPAPI) before it's written to `config.json`, and only ever sent to
  DeepSeek.
- **In the environment**: set `DEEPSEEK_API_KEY` (`setx DEEPSEEK_API_KEY "sk-…"`), then start Capri. `llm.js`
  falls back to it whenever `config.json` has no key for DeepSeek. Handy for a build you hand to someone else
  without baking a key into it.

Keys are never in this repository: `config.json` lives in `%APPDATA%\capri-desktop\`, not in the checkout.

Check the pairing without starting her:

```bash
DEEPSEEK_API_KEY=sk-… npm run check:deepseek
```

It lists the models DeepSeek serves (as `llm.js` asks for them), streams one answer through `deepseek-flash`,
and checks that a bad key is refused with a message her setup can act on.

## Models

`deepseek-flash` is the default: fast and cheap, which is what a desktop pet that comments on everything
needs. Her menu › **AI model** also offers what the account serves, `deepseek-v4-pro` among them; pick it there
if you want her longer answers, at a higher price per message.

## What she can see on your PC, and what she can do there

This fork also gives her AI **hands on the machine**, through tools (`src/main/tools.js`, OpenAI-style
function calling, added in `src/main/llm.js` and `src/main/main.js`). Before she answers, DeepSeek can call:

| tool | what it returns |
|---|---|
| `system_info` | Windows version and build, processor model and cores and how hard it works right now, graphics card, memory used and total, disk free and total, battery, local IP, the eight programs using the most memory |
| `open_apps` | the programs open on your desktop right now, with their window titles |
| `find_files` | files in your home folder by part of their name |
| `launch_folder` | where she is installed, where her process was started, your home folder, and the level her commands run at |
| `list_dir` | a folder by path (`~` is your home; at full access any absolute path) |
| `read_file` | a text file, with an offset for the rest of a long one |
| `search_files` | every matching line under a folder, with file and line |
| `run_command` | a command, and what it printed: exit code, output, stderr. No shell tricks unless the command *is* a shell |

The commands go through the same guard a work order uses (`agent/guard.js`), at the level in her menu
(**Work › What she may run**, `full` by default): `full` is any program, a shell too; `trusted` is
anything but the destructive ones; `guard` is a project's tools only. The disk-wiping set (`format`,
`diskpart`, `bcdedit`, `reg`, `sc`…) is refused at every level. Below `full`, file tools stay in your home
folder; at `full` they read anywhere, because a read is harmless and a refusal only teaches her to guess.

That is the honest trade: a chat that can look but not act has to answer *"I can't list that folder"* —
which is what she used to say. Now she looks, acts and tells you what changed. A refusal comes back as a
sentence she reads (the rule, not an obstacle), and she is told never to claim a command ran unless a tool
result says it did.

Tools are offered to the OpenAI-compatible providers (`deepseek`, `openai`, `groq`, `gemini`, `mistral`,
`openrouter`, `custom`, LM Studio, llama.cpp). Ollama and Claude Code keep their own path, and a server that
doesn't know tools just gets a plain request instead (the answer is still written, just without her looking).

Check it without starting her:

```bash
DEEPSEEK_API_KEY=sk-… npm run check:tools
```

It runs her real loop against this machine: the model is handed the tools, calls `system_info`, and its
answer has to name the hardware it found.

## Build it

```bash
npm install
npm run dist
```

`npm run dist` (electron-builder) writes `Capri-Setup-<version>.exe` to `dist\`: the same installer as upstream,
with her defaults pointed at DeepSeek. The installer isn't signed, so Windows SmartScreen may ask for
**More info** › **Run anyway**.

From the checkout, `npm start` runs the very same code.
