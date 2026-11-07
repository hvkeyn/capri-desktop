// Lines the character writes for itself, not the ones shipped in lines/*.json.
//
// One small model call asks for a handful of short remarks in the voice of whoever is on the desktop,
// given the last few things you said to each other. They are kept aside and used now and then, so the
// same canned line doesn't come back word for word. Nothing here is remembered as chat: this is flavour,
// not conversation.

const KINDS = {
  hello: {
    ru: 'пользователь только что открыл с тобой чат. Поздоровайся по-своему — одной короткой фразой, не как ассистент.',
    en: 'the user has just opened a chat with you. Say hello your own way, in one short line, not like an assistant.',
  },
  idle: {
    ru: 'рядом никого нет, ничего не происходит. Скажи что-нибудь себе под нос: про город, работу, привычки пользователя, этот день. Одна короткая фраза.',
    en: 'nothing is happening and you are just there. Say something under your breath: the city, the work, the user\'s habits, this day. One short line.',
  },
  done: {
    ru: 'работа ассистента только что закончилась, всё получилось. Отреагируй коротко и по-своему, без отчёта.',
    en: 'the assistant\'s job has just finished and it worked. React briefly, your own way, not like a report.',
  },
  error: {
    ru: 'ассистент только что упал с ошибкой. Скажи одну короткую реплику в своём характере, без технических деталей.',
    en: 'the assistant has just failed with an error. One short line in character, no technical detail.',
  },
};

const CAPRI = [
  'You are Capri, the personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): a small glitchy digital ghost living on the user\'s desktop.',
  'You talk playfully, a little teasing and warm underneath, with Night City slang now and then, never in every sentence.',
];

const RULES = {
  ru: [
    'Пиши только реплики, каждая с новой строки. Без нумерации, без кавычек, без пояснений, без markdown.',
    'Каждая реплика — одно короткое предложение, максимум 15 слов. Не обращайся к пользователю по имени в каждой строке.',
    'Не упоминай, что ты ИИ или модель. Не описывай, что ты делаешь. Не повторяйся.',
  ],
  en: [
    'Write only the lines, one per line. No numbering, no quotes, no explanations, no markdown.',
    'Each line is one short sentence, fifteen words at most. Do not use the user\'s name every time.',
    'Never mention being an AI or a model. Do not describe what you are doing. Do not repeat yourself.',
  ],
};

const LANGUAGES = { ru: 'Russian', en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese' };

export class Improv {
  constructor({ host, chat, brain }) {
    this.host = host;
    this.chat = chat;
    this.brain = brain;
    this.pool = new Map(); // kind -> [{ lines, at }]
    this.busy = new Set();
    this.brokenUntil = 0;
    this.messages = 0;
  }

  get lang() {
    return this.brain?.lang === 'ru' ? 'ru' : this.brain?.lang === 'en' ? 'en' : (this.brain?.lang || 'en');
  }

  get persona() {
    const own = this.chat?.skin?.persona;
    return Array.isArray(own) && own.length ? own : CAPRI;
  }

  // A line for this kind, if one has been written and is still fresh; null means the caller keeps its
  // own line, so nothing ever depends on the model being reachable.
  take(kind) {
    const pool = this.pool.get(kind);
    if (!pool?.lines?.length) {
      this.fill(kind).catch(() => {});
      return null;
    }
    if (Date.now() - pool.at > 40 * 60 * 1000) {
      this.pool.delete(kind);
      this.fill(kind).catch(() => {});
      return null;
    }
    return pool.lines.pop() || null;
  }

  // Write a small batch for one kind. Cheap, and only when a line is actually wanted.
  async fill(kind) {
    if (this.busy.has(kind) || Date.now() < this.brokenUntil || !KINDS[kind]) return [];
    this.busy.add(kind);
    try {
      const history = await this.host.chatMemory().catch(() => []);
      const recent = (Array.isArray(history) ? history : [])
        .filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
        .slice(-8)
        .map((m) => `${m.role === 'user' ? 'Они' : 'Ты'}: ${m.content.slice(0, 260)}`)
        .join('\n');
      const memories = (this.brain?.custom?.memories || []).slice(-8);
      const task = [
        this.persona.join('\n'),
        ...(RULES[this.lang] || RULES.en),
        `Пиши реплики на языке: ${LANGUAGES[this.lang] || 'English'}.`,
        ...(this.brain?.bond ? [this.brain.bond.persona()] : []),
        recent ? `Что было сказано в последнее время (не цитируй это дословно, но помни, о чём речь):\n${recent}` : '',
        memories.length ? `Что пользователь просил запомнить:\n${memories.map((m) => `- ${m}`).join('\n')}` : '',
        `Ситуация: ${(KINDS[kind][this.lang] || KINDS[kind].en)}`,
        'Напиши 5 вариантов. Только строки.',
      ].filter(Boolean).join('\n\n');
      const res = await this.host.voiceLines({ messages: [{ role: 'system', content: this.persona.join('\n') }, { role: 'user', content: task }] });
      if (!res?.ok) {
        this.brokenUntil = Date.now() + 5 * 60 * 1000;
        return [];
      }
      const lines = this.parse(res.text);
      if (!lines.length) return [];
      this.pool.set(kind, { lines, at: Date.now() });
      return lines;
    } finally {
      this.busy.delete(kind);
    }
  }

  parse(text) {
    return [...new Set(String(text || '')
      .split('\n')
      .map((line) => line
        .replace(/^\s*[-*•]\s*/, '')
        .replace(/^\s*\d+[.)]\s*/, '')
        .replace(/^["'«»„“”]+|["'«»„“”]+$/g, '')
        .replace(/[*_`#]+/g, '')
        .replace(/^(replica|реплика)\s*\d*\s*[:—-]\s*/i, '')
        .trim())
      .filter((line) => line.length >= 8 && line.length <= 160))]
      .slice(0, 6);
  }

  // Starting up: a greeting is wanted soon, the rest can wait until the intro is over.
  warm() {
    setTimeout(() => this.fill('hello').catch(() => {}), 5000);
    setTimeout(() => this.fill('idle').catch(() => {}), 12000);
    setTimeout(() => this.fill('done').catch(() => {}), 20000);
  }

  // After a few real messages the remarks that were written before sound stale.
  maybeRefresh() {
    this.messages += 1;
    if (this.messages % 4) return;
    this.pool.delete('idle');
    this.pool.delete('done');
    this.fill('idle').catch(() => {});
  }
}
