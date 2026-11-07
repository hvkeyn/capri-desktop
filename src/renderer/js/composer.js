// The chat composer: more than a line.
//
// Enter sends, Shift+Enter breaks the line, the box grows with what you write. Files come in by the paperclip,
// by paste, or by dropping them on the box; each becomes a chip with a little × for removing it. The pencil
// holds the edit actions — undo, redo, throw the edit away — and a right click brings the usual cut/copy/paste
// menu, because a text box that refuses one is a text box that fights you.
//
// Everything here is plain DOM: no framework, no contenteditable trickery, so selection, clipboard and the
// caret keep working the way Windows expects.

const MAX_ROWS = 6;

// What the model reads of the files that came with a message: a heading with the name, then the text the
// main process pulled out (OCR for a picture, the file itself for text). Pure, so tests can call it.
export function fileContext(files = []) {
  return (Array.isArray(files) ? files : [])
    .filter((file) => file && file.name)
    .map((file) => `\n\n[Приложен файл: ${file.name}]\n${file.text || '(текст не прочитан)'}`)
    .join('');
}

export class Composer {
  constructor({ form, input, files, attach, pencil, menu, host, onSend, lang = 'ru' }) {
    this.form = form;
    this.input = input;
    this.filesEl = files;
    this.attachBtn = attach;
    this.pencilBtn = pencil;
    this.menuEl = menu;
    this.host = host;
    this.onSend = onSend;
    this.lang = lang;
    this.files = []; // [{ name, path, image, bytes, text }]
    this.stack = []; // undo: [{ text, at }]
    this.at = -1;
    this.lastPush = 0;
    this.focusSnapshot = null;
    this.menuOpen = false;

    this.wire();
    this.renderFiles();
    this.grow();
  }

  get text() {
    return this.input.value;
  }

  wire() {
    this.input.addEventListener('input', () => {
      this.grow();
      this.remember();
      this.hideMenu();
    });
    this.input.addEventListener('keydown', (e) => this.keydown(e));
    this.input.addEventListener('paste', (e) => this.paste(e));
    this.input.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.openMenu(e.clientX, e.clientY);
    });
    this.input.addEventListener('focus', () => {
      if (this.focusSnapshot === null) this.focusSnapshot = this.input.value;
    });
    this.form.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.form.classList.add('is-drop');
    });
    this.form.addEventListener('dragleave', () => this.form.classList.remove('is-drop'));
    this.form.addEventListener('drop', (e) => {
      e.preventDefault();
      this.form.classList.remove('is-drop');
      const paths = [...(e.dataTransfer?.files || [])].map((file) => file.path || this.host.filePath?.(file)).filter(Boolean);
      if (paths.length) this.attach(paths);
    });
    this.attachBtn.addEventListener('click', async () => {
      const picked = await this.host.chatPick();
      if (picked?.ok && picked.paths?.length) this.attach(picked.paths);
    });
    this.pencilBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.menuOpen) this.hideMenu();
      else this.openMenu(this.pencilBtn.getBoundingClientRect().left, this.pencilBtn.getBoundingClientRect().top, true);
    });
    document.addEventListener('click', () => this.hideMenu());
  }

  keydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (this.input.value.trim() || this.files.length) this.form.requestSubmit();
      return;
    }
    if (e.key === 'Escape') {
      if (this.menuOpen) {
        e.preventDefault();
        this.hideMenu();
        return;
      }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.undo();
    } else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault();
      this.redo();
    }
  }

  // ---- the text, with a memory of what it was ------------------------------------------------------

  grow() {
    const style = getComputedStyle(this.input);
    const line = parseFloat(style.lineHeight) || 20;
    this.input.style.height = 'auto';
    const max = line * MAX_ROWS + 14;
    this.input.style.height = `${Math.min(max, Math.max(line + 12, this.input.scrollHeight))}px`;
    this.input.style.overflowY = this.input.scrollHeight > max ? 'auto' : 'hidden';
  }

  remember() {
    const now = performance.now();
    const text = this.input.value;
    if (this.stack[this.at]?.text === text) return;
    if (now - this.lastPush < 350 && this.at > 0 && this.stack[this.at]?.text.startsWith(text.slice(0, 1))) {
      this.stack[this.at] = { text, at: now };
      return;
    }
    this.stack = this.stack.slice(0, this.at + 1);
    this.stack.push({ text, at: now });
    if (this.stack.length > 60) this.stack.shift();
    this.at = this.stack.length - 1;
    this.lastPush = now;
  }

  undo() {
    if (this.at <= 0) return;
    this.at -= 1;
    this.input.value = this.stack[this.at].text;
    this.grow();
  }

  redo() {
    if (this.at < 0 || this.at >= this.stack.length - 1) return;
    this.at += 1;
    this.input.value = this.stack[this.at].text;
    this.grow();
  }

  cancelEdit() {
    if (this.focusSnapshot !== null) {
      this.input.value = this.focusSnapshot;
      this.focusSnapshot = null;
      this.grow();
      this.remember();
    }
  }

  // ---- files ---------------------------------------------------------------------------------------

  paste(e) {
    const files = [...(e.clipboardData?.files || [])].map((file) => file.path || this.host.filePath?.(file)).filter(Boolean);
    if (!files.length) return; // a text paste is the browser's business
    e.preventDefault();
    this.attach(files);
  }

  async attach(paths) {
    const res = await this.host.chatAttach(paths).catch(() => null);
    if (!res?.ok || !res.files?.length) return;
    for (const one of res.files) {
      if (this.files.length >= 6) break;
      if (this.files.some((f) => f.path === one.path)) continue;
      this.files.push(one);
    }
    this.renderFiles();
    this.input.focus();
  }

  renderFiles() {
    this.filesEl.hidden = this.files.length === 0;
    this.filesEl.replaceChildren(...this.files.map((file, index) => {
      const li = document.createElement('li');
      li.className = 'panel__file';
      const icon = document.createElement('span');
      icon.className = 'panel__file-icon';
      icon.textContent = file.image ? '▣' : '▤';
      const name = document.createElement('span');
      name.className = 'panel__file-name';
      name.textContent = file.name;
      name.title = file.path;
      const size = document.createElement('span');
      size.className = 'panel__file-size';
      size.textContent = file.bytes > 1024 * 1024 ? `${(file.bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.bytes / 1024))} KB`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'panel__file-remove';
      remove.textContent = '×';
      remove.title = 'Убрать';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        this.files.splice(index, 1);
        this.renderFiles();
      });
      li.append(icon, name, size, remove);
      return li;
    }));
  }

  // ---- menus ---------------------------------------------------------------------------------------

  hideMenu() {
    this.menuEl.hidden = true;
    this.menuOpen = false;
  }

  openMenu(x, y, fromPencil = false) {
    const items = fromPencil
      ? [
        ['Отменить правку', () => this.cancelEdit()],
        ['Вернуть', () => this.redo()],
        ['Отменить ввод', () => this.undo()],
        ['Очистить', () => this.clear()],
      ]
      : [
        ['Вырезать', () => document.execCommand('cut')],
        ['Копировать', () => document.execCommand('copy')],
        ['Вставить', () => this.pasteFromClipboard()],
        ['Выделить всё', () => this.input.select()],
        ['—', null],
        ['Отменить', () => this.undo()],
        ['Вернуть', () => this.redo()],
        ['Очистить', () => this.clear()],
      ];
    this.menuEl.replaceChildren(...items.map(([label, action]) => {
      if (!action) {
        const hr = document.createElement('div');
        hr.className = 'panel__menu-sep';
        return hr;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'panel__menu-item';
      button.textContent = label;
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideMenu();
        action();
        this.input.focus();
      });
      return button;
    }));
    const panel = this.form.getBoundingClientRect();
    this.menuEl.hidden = false;
    const width = this.menuEl.offsetWidth || 150;
    if (fromPencil) {
      // above the whole composer, right-aligned: it must never sit on top of what you are typing
      this.menuEl.style.left = 'auto';
      this.menuEl.style.right = '6px';
      this.menuEl.style.top = `${-(this.menuEl.offsetHeight + 8)}px`;
    } else {
      this.menuEl.style.right = 'auto';
      this.menuEl.style.left = `${Math.max(6, Math.min(x - panel.left, panel.width - width - 6))}px`;
      this.menuEl.style.top = `${Math.max(4, y - panel.top + 8)}px`;
    }
    this.menuOpen = true;
  }

  async pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const start = this.input.selectionStart ?? this.input.value.length;
        const end = this.input.selectionEnd ?? start;
        this.input.setRangeText(text, start, end, 'end');
        this.remember();
        this.grow();
      }
    } catch {
      // no clipboard permission: Ctrl+V still works, this menu item just does nothing
    }
  }

  clear() {
    this.files = [];
    this.input.value = '';
    this.renderFiles();
    this.grow();
    this.remember();
  }

  setBusy(busy) {
    this.input.disabled = busy;
    this.attachBtn.disabled = busy;
    this.pencilBtn.disabled = busy;
    if (!busy) this.input.focus();
  }

  reset() {
    this.clear();
    this.focusSnapshot = null;
  }
}
