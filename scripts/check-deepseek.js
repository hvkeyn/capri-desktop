// self-check: her chat through DeepSeek (llm.js), the provider this build starts on.
// The key comes from DEEPSEEK_API_KEY, or from config.json's apiKeys.deepseek.
const assert = require('node:assert');
const llm = require('../src/main/llm');

(async () => {
  const cfg = { apiKeys: {}, provider: 'deepseek' };
  if (!process.env.DEEPSEEK_API_KEY && !cfg.apiKeys.deepseek) {
    console.error('FAIL  no key: set DEEPSEEK_API_KEY (or paste it in her panel)');
    process.exit(1);
  }

  const models = await llm.models('deepseek', cfg);
  assert(models.length, 'deepseek models');
  console.log('models:', models.join(', '));
  assert(models.includes('deepseek-flash'), 'deepseek-flash is served');

  assert(!llm.isLocal('deepseek', cfg), 'deepseek is a cloud provider');

  const messages = [
    { role: 'system', content: 'You are Capri, a playful construct. One short sentence, nothing else.' },
    { role: 'user', content: 'Say just: hi' },
  ];
  let streamed = '';
  const text = await llm.chat('deepseek', cfg, { model: 'deepseek-flash', messages }, (p) => { streamed += p; }, new AbortController().signal);
  assert(text && text === streamed, 'deepseek streams');
  console.log(`deepseek-flash -> ${text.slice(0, 80)}`);

  // a bad key must read as one, so her setup asks for it again instead of failing silently
  await assert.rejects(llm.models('deepseek', { apiKeys: { deepseek: 'sk-bad' } }), /./, 'a bad key is refused');
  console.log('ALL OK');
})().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
