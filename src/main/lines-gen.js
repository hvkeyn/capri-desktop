'use strict';

// Asking the model for more of a character's own lines: a list per kind (hello, idle, done, error, work,
// alert…), in the voice of whoever lives on the desktop and in the language they speak. The result is
// stored (lines-store.js) and used when there is no model at all — the offline case this exists for.

const KINDS = {
  hello: {
    en: 'the user has just opened a chat with you. Say hello your own way, one short line, not like an assistant',
    ru: 'пользователь только что открыл с тобой чат. Поздоровайся по-своему, одной короткой фразой, не как ассистент',
  },
  resume: {
    en: 'they came back after a while. Welcome them back in one short line',
    ru: 'пользователь вернулся после паузы. Одна короткая фраза, что ты на месте',
  },
  idle: {
    en: 'nothing is happening and you are just there. Say something under your breath: the city, the work, their habits, this day',
    ru: 'рядом никого нет, ничего не происходит. Скажи что-нибудь себе под нос: про город, работу, привычки пользователя, этот день',
  },
  work: {
    en: 'the coding assistant has just started a task. One short line, watching it work',
    ru: 'ассистент только что начал задачу. Одна короткая фраза, что ты следишь за работой',
  },
  done: {
    en: 'the assistant\'s job just finished and it worked. React briefly, your own way, not like a report',
    ru: 'работа ассистента только что закончилась, всё получилось. Отреагируй коротко и по-своему, без отчёта',
  },
  error: {
    en: 'the assistant just failed with an error. One short line in character, no technical detail',
    ru: 'ассистент только что упал с ошибкой. Одна короткая реплика в своём характере, без технических деталей',
  },
  alert: {
    en: 'the assistant needs the user\'s permission before it can go on. One short line, urgent but not bossy',
    ru: 'ассистенту нужно разрешение пользователя, чтобы продолжить. Одна короткая фраза, срочно, но не начальственно',
  },
  gaze: {
    en: 'you are looking up at the satellite over the city. One short line about it, no explanation',
    ru: 'ты смотришь вверх на спутник над городом. Одна короткая фраза про него, без объяснений',
  },
  uplink: {
    en: 'you think about going up there yourself one day. One short line, wistful but dry',
    ru: 'ты думаешь, что однажды поднимешься туда сама. Одна короткая фраза, с тоской, но сухо',
  },
  reply: {
    en: 'they just said something to you and you answer back, one short line, no question',
    ru: 'пользователь только что что-то сказал, ответь одной короткой фразой, без вопроса',
  },
  bye: {
    en: 'they are closing the chat or leaving for the night. Say goodbye in one short line',
    ru: 'пользователь закрывает чат или уходит на ночь. Попрощайся одной короткой фразой',
  },
};

const LANGUAGE = { ru: 'Russian', en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese' };

// The prompt: a character, a language, a list of kinds and how many lines each. JSON out, nothing else.
function messages({ character = 'Capri', persona = [], lang = 'ru', kinds = Object.keys(KINDS), perKind = 6 }) {
  const voice = (Array.isArray(persona) ? persona.filter((line) => typeof line === 'string') : []).join(' ');
  const wanted = kinds.filter((kind) => KINDS[kind]);
  const list = wanted.map((kind) => `- ${kind}: ${KINDS[kind].ru || KINDS[kind].en}`).join('\n');
  return [
    {
      role: 'system',
      content: `${voice || `You are ${character}, the personality living on this person's desktop.`}\n\nYou write short lines for yourself. Each one is one sentence, in character, no report, no assistant tone.`,
    },
    {
      role: 'user',
      content: [
        `Write ${perKind} different lines for each of these situations:`,
        list,
        `Write them in ${LANGUAGE[lang] || 'English'}. One sentence each, fifteen words at most.`,
        'No numbering, no quotes, no explanations. Never mention being an AI or a model. Do not repeat a line.',
        'One short sentence each, no semicolons, no emoji, no stage directions.',
        'The lines must be about different things — work, tech, music, food, sleep, money, their habits, the city, a joke — not the same subject in every one.',
        'Answer with JSON only: {"kind": ["line", "line"], …} using exactly the kind names above.',
      ].join('\n\n'),
    },
  ];
}

const FENCE = /^\s*```[a-z]*\s*\n([\s\S]*?)\n\s*```\s*$/i;

function parse(text) {
  const source = String(text || '').trim();
  const fenced = FENCE.exec(source);
  const body = fenced ? fenced[1] : source;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// One round: ask, parse, hand back the packs (unsanitized; lines-store does that).
async function generate({ ask, character, persona, lang, kinds, perKind } = {}) {
  if (typeof ask !== 'function') return { ok: false, error: 'no model to ask' };
  try {
    const text = await ask(messages({ character, persona, lang, kinds, perKind }));
    const packs = parse(text);
    if (!packs) return { ok: false, error: 'the model did not answer with JSON' };
    const wanted = new Set((kinds || Object.keys(KINDS)).filter((kind) => KINDS[kind]));
    const out = {};
    for (const [kind, list] of Object.entries(packs)) if (wanted.has(kind) && Array.isArray(list)) out[kind] = list;
    if (!Object.keys(out).length) return { ok: false, error: 'no lines came back' };
    return { ok: true, packs: out };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { KINDS, LANGUAGE, messages, parse, generate };
