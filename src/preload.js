'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (fn) => {
  const listener = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('host', {
  onClaudeEvent: on('claude:event'),
  onCommand: on('capri:command'),
  onConfig: on('capri:config'),
  onResize: on('overlay:resize'),
  onWindows: on('windows:update'),
  setInteractive: (on) => ipcRenderer.send('overlay:interactive', Boolean(on)),
  rearm: () => ipcRenderer.send('overlay:rearm'),
  cursor: () => ipcRenderer.invoke('overlay:cursor'),
  screens: () => ipcRenderer.invoke('screens:list'),
  moveScreen: (id) => ipcRenderer.invoke('screens:move', id),
  getConfig: () => ipcRenderer.invoke('config:get'),
  characterSkin: (id) => ipcRenderer.invoke('characters:skin', id), // the pictures of who's on the desktop
  characters: () => ipcRenderer.invoke('characters:list'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  listSounds: () => ipcRenderer.invoke('sounds:list'),
  hooksStatus: () => ipcRenderer.invoke('hooks:status'),
  demoWindow: (open) => ipcRenderer.invoke('demo:window', Boolean(open)),
  openMenu: () => ipcRenderer.send('menu:open'),
  installHooks: () => ipcRenderer.invoke('hooks:install'),
  claudeFound: () => ipcRenderer.invoke('claude:found'),
  openClaudeHelp: () => ipcRenderer.send('claude:help'),
  windowsNow: () => ipcRenderer.invoke('windows:get'),
  closePage: (id, key) => ipcRenderer.invoke('windows:closePage', { id, key }),
  trayPlace: () => ipcRenderer.invoke('guide:tray'),
  openClaudeFolder: () => ipcRenderer.invoke('guide:claudeFolder'),
  copyImage: (rect) => ipcRenderer.invoke('panel:copy', rect),
  chatStatus: () => ipcRenderer.invoke('chat:status'),
  chatSend: (request) => ipcRenderer.invoke('chat:send', request),
  chatStop: (id) => ipcRenderer.send('chat:stop', id),
  chatMemory: () => ipcRenderer.invoke('chat:memory'),
  chatRemember: (history) => ipcRenderer.send('chat:remember', history),
  // lines the character writes for itself, in its own voice, from the recent chat (voice/improv.js)
  voiceLines: (request) => ipcRenderer.invoke('voice:lines', request),
  // more of a character's own lines: the ones kept on disk, and a fresh batch from the model
  chatPick: () => ipcRenderer.invoke('chat:pick'),
  // Electron 44 has no File.path any more: the preload is where a dropped file still knows its place
  filePath: (file) => {
    try { return webUtils.getPathForFile(file) || null; } catch { return null; }
  },
  chatAttach: (paths) => ipcRenderer.invoke('chat:attach', { paths }),
  linesExtra: () => ipcRenderer.invoke('lines:extra'),
  linesGenerate: (request) => ipcRenderer.invoke('lines:generate', request),
  onChatDelta: on('chat:delta'),
  // what she is doing while she answers: her narration, and each tool starting and ending
  onChatEvent: on('chat:event'),
  // a work order (main.js -> agent/runner.js): the board draws what comes back here
  workStart: (request) => ipcRenderer.invoke('work:start', request),
  workStop: () => ipcRenderer.invoke('work:stop'),
  workState: () => ipcRenderer.invoke('work:state'),
  pickFolder: () => ipcRenderer.invoke('work:pick'),
  // what you hand her: files from a picker, paths from a drop, the clipboard (files and text)
  attachPick: () => ipcRenderer.invoke('attach:pick'),
  attachPaths: (paths) => ipcRenderer.invoke('attach:paths', paths),
  attachClipboard: () => ipcRenderer.invoke('attach:clipboard'),
  openFolder: (dir) => ipcRenderer.invoke('work:open', dir),
  openHarness: () => ipcRenderer.invoke('harness:open'),
  onWorkState: on('work:state'),
  // her improving her own harness (agent/evolve.js)
  evolveStart: () => ipcRenderer.invoke('evolve:start'),
  onEvolve: on('evolve:event'),
  // a new version from her releases (update.js): the panel asks, main downloads and swaps it
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateApply: () => ipcRenderer.invoke('update:apply'),
  updateState: () => ipcRenderer.invoke('update:state'),
  // what she can do right now: model, tools, level, version (her menu › Check my access)
  accessCheck: () => ipcRenderer.invoke('access:check'),
  // what you said to her, and what she answered: observations evolve.js learns from
  observe: (entry) => ipcRenderer.send('agent:observe', entry),
  lookSnap: () => ipcRenderer.invoke('look:snap'),
  lookSay: (request) => ipcRenderer.invoke('look:say', request),
  lookWhere: () => ipcRenderer.invoke('look:where'),
  cpu: () => ipcRenderer.invoke('pc:cpu'),
  pcDo: (req) => ipcRenderer.invoke('pc:do', req),
  openOllama: () => ipcRenderer.send('chat:ollama'),
  setupInfo: () => ipcRenderer.invoke('setup:info'),
  ollamaState: () => ipcRenderer.invoke('setup:ollama'),
  installOllama: () => ipcRenderer.invoke('setup:install'),
  startOllama: () => ipcRenderer.invoke('setup:start'),
  pullModel: (name) => ipcRenderer.invoke('setup:pull', name),
  cancelSetup: () => ipcRenderer.send('setup:cancel'),
  useProvider: (choice) => ipcRenderer.invoke('setup:use', choice),
  keyPage: (provider) => ipcRenderer.send('setup:keyPage', provider),
  launchThroughOllama: (integration) => ipcRenderer.invoke('setup:launch', integration),
  onSetupProgress: on('setup:progress'),
  openApps: () => ipcRenderer.invoke('apps:list'),
  findApp: (wanted) => ipcRenderer.invoke('apps:find', wanted),
  closeApp: (name, force) => ipcRenderer.invoke('apps:close', { name, force: Boolean(force) }),
  findLaunch: (text) => ipcRenderer.invoke('apps:findLaunch', text),
  launch: (item) => ipcRenderer.invoke('apps:launch', item),
  media: (action) => ipcRenderer.invoke('apps:media', action),
  music: (query) => ipcRenderer.invoke('apps:music', query),
  youtube: (query) => ipcRenderer.invoke('apps:youtube', query),
  roblox: (query) => ipcRenderer.invoke('apps:roblox', query),
  searchFiles: (query) => ipcRenderer.invoke('files:search', query),
  openFile: (file, reveal) => ipcRenderer.invoke('files:open', { file, reveal }),
  screenshot: () => ipcRenderer.invoke('files:screenshot'),
  webSearch: (query) => ipcRenderer.invoke('web:search', query),
  openSite: (address) => ipcRenderer.invoke('apps:site', address),
  focusOverlay: (on) => ipcRenderer.send('overlay:focus', Boolean(on)),
});
