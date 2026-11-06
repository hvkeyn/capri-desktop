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

## Build it

```bash
npm install
npm run dist
```

`npm run dist` (electron-builder) writes `Capri-Setup-0.5.1.exe` to `dist\`: the same installer as upstream,
with her defaults pointed at DeepSeek. The installer isn't signed, so Windows SmartScreen may ask for
**More info** › **Run anyway**.

From the checkout, `npm start` runs the very same code.
