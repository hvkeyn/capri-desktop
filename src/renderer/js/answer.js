// What she wrote, cut into paragraphs and marked up: **bold** from her own text, `code`, and the numbers
// that carry meaning (50 из 64 ГБ, 62.9 GB free, 4 %, 49 °C, 2.1 s). No innerHTML anywhere — the panel
// builds nodes from these segments, so a model that writes HTML gets it shown, never executed.
//
// Pure: no DOM, no globals. tests/answer.test.js calls it the way the panel does.

// A number with the unit that makes it mean something. "Обновлено в 5" stays plain; "5 ГБ" is a fact.
const NUM = /(\d+(?:[.,]\d+)?\s?(?:%|GB|MB|TB|ГБ|МБ|ТБ|°C|°|ms|мс|fps|s|C))(?=[\s.,;:!?)–—-]|$)/g;

function textRun(out, text) {
  let rest = String(text || '');
  NUM.lastIndex = 0;
  let m;
  while ((m = NUM.exec(rest))) {
    const before = rest.slice(0, m.index);
    if (before) out.push({ type: 'text', text: before });
    out.push({ type: 'num', text: m[0].trim() });
    rest = rest.slice(m.index + m[0].length);
    NUM.lastIndex = 0;
  }
  if (rest) out.push({ type: 'text', text: rest });
}

// One paragraph, as segments: { type: 'text' | 'b' | 'code' | 'num', text }.
export function segments(text) {
  const out = [];
  let rest = String(text || '');
  const mark = /(\*\*[^*]+\*\*|`[^`]+`)/;
  while (rest) {
    const m = mark.exec(rest);
    if (!m) {
      textRun(out, rest);
      break;
    }
    if (m.index > 0) textRun(out, rest.slice(0, m.index));
    const token = m[0];
    if (token.startsWith('**')) out.push({ type: 'b', text: token.slice(2, -2).trim() });
    else out.push({ type: 'code', text: token.slice(1, -1) });
    rest = rest.slice(m.index + token.length);
  }
  return out;
}

// Her answer as paragraphs: blank-line separated, each with its segments. Single newlines stay inside a
// paragraph, which the line's `white-space: pre-wrap` keeps.
export function paragraphs(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ text: part, segments: segments(part) }));
}
