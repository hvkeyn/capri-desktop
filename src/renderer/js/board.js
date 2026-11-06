// The board: what work order she is on, which of its five phases she is in, the steps of it, and what
// she just did — drawn beside her while she works, in the same Night City HUD as her panel.
//
// It shows a snapshot the main process sends (main.js -> agent/runner.js -> Plan.snapshot()), never a
// guess of its own: the board cannot get ahead of her. One thing at a time is the point of it — the
// step she is on is the biggest thing on it, the rest is a list that gets quieter as it goes.
//
// The rules it is drawn by, from the design references this was rebuilt against (a staged product
// shot, the way Benji Taylor's stageshow taught it; the component conventions of ExpoKit):
//   - one focal object: NOW, at twice the weight of anything else;
//   - real words only where they carry meaning — the goal, the step; bars and counts for the rest;
//   - no dead corners: the footer always holds the clock and the two buttons;
//   - 44 px targets, a visible focus ring, and nothing moves if Windows says no animation.

import { reducedMotion } from './util.js';

const PHASES = [
  { id: 'spec', label: 'SPEC' },
  { id: 'plan', label: 'PLAN' },
  { id: 'tasks', label: 'TASKS' },
  { id: 'build', label: 'BUILD' },
  { id: 'report', label: 'REPORT' },
];

const TEXT = {
  en: {
    order: 'Work order', placeholder: 'What should I do?', start: 'Start', stop: 'Stop', folder: 'Folder',
    close: 'Close', pick: 'Choose a folder…', goal: 'WORK ORDER', now: 'NOW', steps: 'STEPS',
    running: 'RUNNING', done: 'DONE', failed: 'FAILED', stopped: 'STOPPED', queued: 'QUEUED',
    empty: 'Nothing running. Give me a folder and a sentence.', workspace: 'FOLDER', pickFirst: 'Folder: your home, Capri Workspace',
  },
  ru: {
    order: 'Работа', placeholder: 'Что нужно сделать?', start: 'Начать', stop: 'Стоп', folder: 'Папка',
    close: 'Закрыть', pick: 'Выбрать папку…', goal: 'ЗАДАНИЕ', now: 'СЕЙЧАС', steps: 'ШАГИ',
    running: 'ИДЁТ', done: 'ГОТОВО', failed: 'СБОЙ', stopped: 'ОСТАНОВЛЕНО', queued: 'В ОЧЕРЕДИ',
    empty: 'Пока ничего. Дай мне папку и одну фразу.', workspace: 'ПАПКА', pickFirst: 'Папка: домашняя, Capri Workspace',
  },
  fr: {
    order: 'Commande', placeholder: 'Que dois-je faire ?', start: 'Commencer', stop: 'Arrêter', folder: 'Dossier',
    close: 'Fermer', pick: 'Choisir un dossier…', goal: 'COMMANDE', now: 'MAINTENANT', steps: 'ÉTAPES',
    running: 'EN COURS', done: 'FINI', failed: 'ÉCHEC', stopped: 'ARRÊTÉ', queued: 'EN ATTENTE',
    empty: 'Rien en cours. Donne-moi un dossier et une phrase.', workspace: 'DOSSIER', pickFirst: 'Dossier : le mien, Capri Workspace',
  },
  es: {
    order: 'Encargo', placeholder: '¿Qué hago?', start: 'Empezar', stop: 'Parar', folder: 'Carpeta',
    close: 'Cerrar', pick: 'Elegir carpeta…', goal: 'ENCARGO', now: 'AHORA', steps: 'PASOS',
    running: 'EN MARCHA', done: 'HECHO', failed: 'FALLO', stopped: 'PARADO', queued: 'EN COLA',
    empty: 'Nada en marcha. Dame una carpeta y una frase.', workspace: 'CARPETA', pickFirst: 'Carpeta: la mía, Capri Workspace',
  },
  pt: {
    order: 'Ordem', placeholder: 'O que eu faço?', start: 'Começar', stop: 'Parar', folder: 'Pasta',
    close: 'Fechar', pick: 'Escolher uma pasta…', goal: 'ORDEM', now: 'AGORA', steps: 'PASSOS',
    running: 'A CORRER', done: 'FEITO', failed: 'FALHA', stopped: 'PARADO', queued: 'EM ESPERA',
    empty: 'Nada a correr. Dá-me uma pasta e uma frase.', workspace: 'PASTA', pickFirst: 'Pasta: a minha, Capri Workspace',
  },
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export class Board {
  constructor({ board, host, capri, panel = null, lang = () => 'en' }) {
    this.el = board;
    this.host = host;
    this.capri = capri;
    this.panel = panel;
    this.lang = lang;
    this.state = null;      // the last snapshot main sent
    this.mode = 'order';    // 'order' (a sentence to give her) or 'run' (a work order on screen)
    this.onStart = null;    // (goal, workspace) => void, wired by app.js
    this.onStop = null;
    this.onPick = null;     // () => Promise<workspace>, the folder picker in main
    this.workspace = null;
    this.open = false;
    this.timer = null;
    this.face = 'caret';    // which phase we last acted out, so she doesn't repeat herself

    this.frame = el('div', 'board__frame');
    this.el.appendChild(this.frame);

    // header: the number of the work order, what it is doing, and a way out
    const head = el('header', 'board__head');
    this.kicker = el('span', 'board__kicker', '');
    this.chip = el('span', 'board__chip', '');
    this.closeBtn = el('button', 'board__icon', '✕');
    this.closeBtn.type = 'button';
    this.closeBtn.setAttribute('aria-label', 'Close');
    this.closeBtn.addEventListener('click', () => this.hide());
    head.append(this.kicker, this.chip, this.closeBtn);

    // the order: one line of the goal, the folder, and Start
    this.orderWrap = el('form', 'board__order');
    this.goalLabel = el('label', 'board__label', '');
    this.goalInput = el('input', 'board__input');
    this.goalInput.type = 'text';
    this.goalInput.maxLength = 500;
    this.goalInput.autocomplete = 'off';
    this.goalInput.spellcheck = false;
    this.goalLabel.htmlFor = 'board-goal';
    this.goalInput.id = 'board-goal';
    this.goalLabel.textContent = 'Work order';
    const target = el('div', 'board__target');
    this.ws = el('span', 'board__ws', '');
    this.pickBtn = el('button', 'board__pick', '');
    this.pickBtn.type = 'button';
    this.pickBtn.addEventListener('click', () => this.pick());
    target.append(this.ws, this.pickBtn);
    this.startBtn = el('button', 'board__action is-primary', '');
    this.startBtn.type = 'submit';
    this.orderWrap.append(this.goalLabel, this.goalInput, target, this.startBtn);
    this.orderWrap.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.orderWrap.addEventListener('click', (e) => e.stopPropagation());
    this.goalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });

    // the run: her goal, the five phases as a stepper, NOW, the steps, the last few things she did
    this.runWrap = el('div', 'board__run');
    this.goal = el('p', 'board__goal', '');
    this.stepper = el('ol', 'board__phases');
    this.now = el('section', 'board__now');
    this.nowLabel = el('span', 'board__now-label', '');
    this.nowStep = el('p', 'board__now-step', '');
    this.meter = el('div', 'board__meter');
    this.meterBar = el('span', 'board__meter-bar', '');
    this.meter.append(this.meterBar);
    this.count = el('span', 'board__count', '');
    this.now.append(this.nowLabel, this.nowStep, this.meter, this.count);
    this.stepsTitle = el('h2', 'board__steps-title', '');
    this.stepsList = el('ol', 'board__steps');
    this.logTitle = el('h2', 'board__log-title', 'LOG');
    this.log = el('ol', 'board__log');
    this.foot = el('footer', 'board__foot');
    this.elapsed = el('span', 'board__elapsed', '');
    this.stopBtn = el('button', 'board__action', '');
    this.stopBtn.type = 'button';
    this.stopBtn.addEventListener('click', () => this.stop());
    this.folderBtn = el('button', 'board__action', '');
    this.folderBtn.type = 'button';
    this.folderBtn.addEventListener('click', () => this.folder());
    this.foot.append(this.elapsed, this.stopBtn, this.folderBtn);
    this.runWrap.append(this.goal, this.stepper, this.now, this.stepsTitle, this.stepsList, this.logTitle, this.log, this.foot);

    this.empty = el('p', 'board__empty', '');

    this.frame.append(head, this.orderWrap, this.runWrap, this.empty);
    this.el.hidden = true;
    this.render();
    window.addEventListener('resize', () => this.place());
  }

  get t() {
    return TEXT[this.lang()] || TEXT.en;
  }

  // Where the board is, for app.js's click-through test: the overlay is click-through everywhere but
  // on her, her panel and this.
  rect() {
    if (!this.open) return null;
    const r = this.el.getBoundingClientRect();
    return r.width ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
  }

  contains(x, y) {
    const r = this.rect();
    return Boolean(r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  }

  // The board sits on the right of the screen she is on, under the top edge, clear of the taskbar. It
  // never covers her: she is anchored to the opposite side while it is open (app.js moves her).
  place() {
    if (!this.open) return;
    const h = this.el.offsetHeight || 0;
    const top = clamp(Math.round(innerHeight * 0.14), 64, Math.max(64, innerHeight - h - 48));
    this.el.style.transform = `translateY(${top}px)`;
  }

  showOrder(workspace = null) {
    this.mode = 'order';
    if (workspace) this.workspace = workspace;
    this.state = null;
    this.show();
    this.goalInput.focus({ preventScroll: true });
    return this;
  }

  show() {
    this.open = true;
    this.el.hidden = false;
    this.el.classList.remove('is-leaving');
    this.host.focusOverlay?.(true); // the keyboard, for the sentence you type
    this.render();
    this.place();
    if (!reducedMotion.matches) this.el.classList.add('is-arriving');
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000);
    return this;
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('is-leaving');
    this.host.focusOverlay?.(false);
    clearInterval(this.timer);
    this.timer = null;
    setTimeout(() => {
      if (this.open) return;
      this.el.hidden = true;
      this.el.classList.remove('is-leaving', 'is-arriving');
    }, reducedMotion.matches ? 0 : 220);
    return this;
  }

  // A snapshot from main. A finished order keeps the board open on its report: that is the thing you
  // came to see, and it stays until you close it.
  update(snapshot) {
    if (!snapshot) return this;
    const wasRunning = this.state?.status === 'running';
    this.state = snapshot;
    this.mode = 'run';
    if (!this.open) this.show();
    this.render();
    this.place();
    this.act(snapshot, wasRunning);
    this.ticker(snapshot);
    if (snapshot.status !== 'running' && wasRunning) {
      // the last thing she has to say about it, once
      const done = snapshot.status === 'done';
      this.panel?.say?.({
        kind: done ? 'done' : 'error',
        line: done
          ? `${this.t.done} · ${snapshot.steps.filter((s) => s.status === 'done').length}/${snapshot.steps.length}`
          : snapshot.error || '',
        hold: 8000,
      });
    }
    return this;
  }

  // She acts out the phase, without ever interrupting her own work animations: the phase is the mood,
  // the ticker is the work.
  act(snapshot, wasRunning) {
    if (snapshot.status === 'done' && wasRunning) {
      this.capri?.perform?.('victory', 0);
      return;
    }
    if (snapshot.status === 'failed' || snapshot.status === 'stopped') {
      this.capri?.perform?.('flinch', 0);
      return;
    }
    if (snapshot.phase === this.face) return;
    this.face = snapshot.phase;
    const byPhase = {
      spec: 'curious', plan: 'curious', tasks: 'look', build: 'talk', report: 'gaze',
    };
    const act = byPhase[snapshot.phase];
    if (act) this.capri?.perform?.(act, 0);
  }

  // The ticker over her head says what she is doing too, so a work order reads on her and not only on
  // the board: the last thing in the log, split into its verb and the thing it touched. Nothing on
  // screen when the order is over — that's her panel's moment.
  ticker(snapshot) {
    if (!this.panel?.setTicker) return;
    if (snapshot.status !== 'running') {
      this.panel.setTicker(null);
      return;
    }
    const last = snapshot.log?.at(-1);
    const match = last && /^([A-Z]{2,})\s+(.+)$/.exec(last.text);
    if (!match) return;
    this.panel.setTicker({ verb: match[1], target: match[2].slice(0, 48), error: last.kind === 'error' });
  }

  tick() {
    if (!this.open || !this.state) return;
    const s = this.state;
    const ms = s.endedAt ? s.endedAt - s.startedAt : Date.now() - s.startedAt;
    this.elapsed.textContent = this.clock(ms);
  }

  clock(ms) {
    const total = Math.max(0, Math.round((ms || 0) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  render() {
    const t = this.t;
    const running = this.mode === 'run' && this.state;
    this.orderWrap.hidden = Boolean(running) || this.state?.status === 'done';
    this.runWrap.hidden = !running;
    this.empty.hidden = running || this.mode === 'order';
    this.empty.textContent = t.empty;
    this.orderWrap.setAttribute('aria-label', t.order);
    this.goalLabel.textContent = t.order;
    this.goalInput.placeholder = t.placeholder;
    this.startBtn.textContent = t.start;
    this.pickBtn.textContent = t.pick;
    this.ws.textContent = this.workspace || t.pickFirst;

    if (!running) {
      this.nowLabel.textContent = t.now;
      this.nowStep.textContent = t.empty;
      this.count.textContent = '';
      this.stepper.replaceChildren();
      this.stepsList.replaceChildren();
      this.log.replaceChildren();
      return;
    }

    const s = this.state;
    const index = Math.max(0, PHASES.findIndex((p) => p.id === s.phase));
    const doneCount = s.steps.filter((step) => step.status === 'done').length;
    this.kicker.textContent = `${t.goal} ${/^(\d{3})/.exec(s.id || '')?.[1] || ''}`.trim();
    this.chip.textContent = this.statusText(s.status);
    this.chip.dataset.state = s.status;
    this.goal.textContent = s.goal || '';
    this.goal.title = s.goal || '';

    // phases: the ones behind her are filled, the one she is in is lit, the ones ahead are outline only
    this.stepper.replaceChildren(...PHASES.map((p, i) => {
      const li = el('li', 'board__phase');
      li.dataset.at = i < index ? 'done' : i === index ? 'now' : 'next';
      li.append(el('span', 'board__phase-dot'), el('span', 'board__phase-label', p.label));
      return li;
    }));

    const current = s.current;
    this.nowLabel.textContent = t.now;
    this.nowStep.textContent = current ? `${current.id} · ${current.title}` : s.goal;
    const share = s.steps.length ? doneCount / s.steps.length : (s.status === 'done' ? 1 : 0);
    this.meterBar.style.transform = `scaleX(${share.toFixed(3)})`;
    this.count.textContent = `${doneCount}/${s.steps.length}`;
    this.elapsed.textContent = this.clock(s.elapsedMs);

    this.stepsTitle.textContent = `${t.steps} · ${s.steps.length}`;
    this.stepsList.replaceChildren(...s.steps.map((step) => {
      const li = el('li', 'board__step');
      li.dataset.status = step.status;
      const mark = el('span', 'board__step-mark', step.status === 'done' ? '✓' : step.status === 'failed' ? '✕' : step.status === 'running' ? '▸' : '·');
      const title = el('span', 'board__step-title', step.title);
      const note = el('span', 'board__step-note', step.note || '');
      li.append(mark, title, note);
      return li;
    }));

    this.logTitle.textContent = 'LOG';
    this.log.replaceChildren(...(s.log || []).slice(-5).map((row) => {
      const li = el('li', 'board__log-line');
      li.dataset.kind = row.kind;
      li.textContent = row.text;
      return li;
    }));

    this.stopBtn.textContent = t.stop;
    this.stopBtn.disabled = s.status !== 'running';
    this.folderBtn.textContent = t.folder;
    this.stopBtn.dataset.act = 'stop';
    this.folderBtn.dataset.act = 'folder';
  }

  statusText(status) {
    const t = this.t;
    return ({ running: t.running, done: t.done, failed: t.failed, stopped: t.stopped })[status] || status;
  }

  submit() {
    const goal = this.goalInput.value.trim();
    if (!goal) {
      this.goalInput.focus();
      return;
    }
    this.goalInput.value = '';
    this.onStart?.(goal, this.workspace);
  }

  async pick() {
    if (!this.onPick) return;
    const picked = await this.onPick();
    if (picked) {
      this.workspace = picked;
      this.ws.textContent = picked;
    }
  }

  stop() {
    this.onStop?.();
    this.stopBtn.disabled = true;
  }

  folder() {
    if (this.state?.workspace) this.host.openFolder?.(this.state.workspace);
  }
}
