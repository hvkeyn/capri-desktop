// self-check: her AI really looks at this PC (tools.js) instead of saying it can't see the machine.
// Runs the same loop main.js runs, through llm.js, against DeepSeek.
const assert = require('node:assert');
const llm = require('../src/main/llm');
const tools = require('../src/main/tools');

const cfg = { apiKeys: {}, provider: 'deepseek' };
const MAX_ROUNDS = 3;

(async () => {
  if (!process.env.DEEPSEEK_API_KEY && !cfg.apiKeys.deepseek) {
    console.error('FAIL  no key: set DEEPSEEK_API_KEY (or paste it in her panel)');
    process.exit(1);
  }
  assert(llm.supportsTools('deepseek'), 'deepseek takes tools');
  assert(!llm.supportsTools('claude') && !llm.supportsTools('ollama'), 'claude and ollama do not');

  const system = 'You are Capri, the personality construct from Project Capricorn, living on the user\'s desktop. '
    + 'You can look at their PC with the tools you have; use them instead of saying you cannot see the machine. '
    + 'Answer in Russian, in character, two sentences at most, plain text.';
  const history = [{ role: 'user', content: 'Опиши что у меня в системе сейчас с оборудованием и какое оно загружено' }];

  const messages = [{ role: 'system', content: system }, ...history];
  const used = [];
  let answer = '';
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const res = await llm.chatTools('deepseek', cfg, { model: 'deepseek-flash', messages, tools: tools.TOOLS }, () => {}, new AbortController().signal);
    if (!res.toolCalls.length) {
      answer = res.text;
      break;
    }
    messages.push({
      role: 'assistant',
      content: res.text || '',
      tool_calls: res.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })),
    });
    for (const call of res.toolCalls) {
      let args = {};
      try { args = JSON.parse(call.arguments || '{}'); } catch {}
      const out = await tools.run(call.name, args);
      used.push(call.name);
      console.log(`  tool ${call.name}(${JSON.stringify(args)}) -> ${JSON.stringify(out).slice(0, 160)}…`);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out).slice(0, 6000) });
    }
  }

  assert(used.length, 'her AI called at least one tool');
  assert(/ryzen|amd|intel|nvidia|geforce|rtx|радеон|radeon/i.test(answer), `the answer names real hardware: ${answer.slice(0, 200)}`);
  console.log('tools used:', used.join(', '));
  console.log('answer:', answer.slice(0, 300));
  console.log('ALL OK');
})().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
