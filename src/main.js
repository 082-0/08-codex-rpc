'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { DiscordConnection } = require('./ipc');
const { detectCodex } = require('./detect');
const { readSession } = require('./session');
const bundledId = require('./app-id.json').clientId;

if (!app.requestSingleInstanceLock()) app.quit();

const defaults = Object.freeze({
  showElapsed: true,
  pause: false,
  userLabel: '@8_08',
  showModel: true,
  showChat: true,
});

let window;
let tray;
let settings = { ...defaults };
let codex = 'off';
let discord = 'disconnected';
let startedAt = 0;
let lastActivity = '';
let session = { title: '', model: '', effort: '', modelLabel: '' };
let quitting = false;
const connection = new DiscordConnection((status) => {
  discord = status;
  broadcast();
  if (status === 'connected') publish();
});

function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }
function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = { ...defaults, ...saved };
  } catch { settings = { ...defaults }; }
}
function saveSettings() {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}
function clean(value, max) {
  return String(value || '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function snapshot() {
  return { codex, discord, settings, session, startedAt, appIdReady: /^\d{17,20}$/.test(process.env.DISCORD_CLIENT_ID || bundledId || '') };
}
function broadcast() {
  if (window && !window.isDestroyed()) window.webContents.send('snapshot', snapshot());
  tray?.setToolTip(`08 Codex RPC · ${codex === 'off' ? 'Codex off' : 'Codex active'} · ${discord}`);
  updateTrayMenu();
}
function activity() {
  if (codex === 'off' || settings.pause) return null;
  const details = settings.showChat && session.title ? clean(session.title, 120) : 'Using Codex';
  const model = settings.showModel && session.modelLabel ? clean(session.modelLabel, 70) : '';
  const user = clean(settings.userLabel, 40);
  const status = [model, user].filter(Boolean).join(' · ') || 'Using Codex';
  const output = {
    type: 0,
    details,
    state: status,
  };
  if (settings.showElapsed && startedAt) output.timestamps = { start: startedAt };
  output.assets = { large_image: 'codex_logo', large_text: 'Codex' };
  return output;
}
function publish() {
  if (!connection.ready) return;
  const value = activity();
  const serialized = JSON.stringify(value);
  if (serialized === lastActivity) return;
  lastActivity = serialized;
  connection.activity(value);
}
async function tick() {
  const next = await detectCodex();
  const newSession = readSession();
  const sessionChanged = newSession.title !== session.title || newSession.modelLabel !== session.modelLabel;
  session = newSession;
  if (next !== codex) {
    codex = next;
    startedAt = next === 'off' ? 0 : Math.floor(Date.now() / 1000);
    broadcast();
    publish();
  }
  if (sessionChanged) { broadcast(); publish(); }
  if (!connection.ready) {
    const id = process.env.DISCORD_CLIENT_ID || bundledId;
    await connection.connect(id);
    lastActivity = '';
  }
}
function showWindow() { window?.show(); window?.focus(); }
function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '08 Codex RPC', enabled: false },
    { label: `Codex: ${codex}`, enabled: false },
    { label: `Discord: ${discord}`, enabled: false },
    { type: 'separator' },
    { label: 'Open dashboard', click: showWindow },
    { label: settings.pause ? 'Resume presence' : 'Pause presence', click: () => { settings.pause = !settings.pause; saveSettings(); publish(); broadcast(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; connection.activity(null); app.quit(); } },
  ]));
}

app.on('second-instance', showWindow);
app.on('activate', showWindow);
app.on('window-all-closed', () => { if (process.platform === 'linux') app.quit(); });
app.whenReady().then(() => {
  app.setAppUserModelId('dev.eight.codexrpc');
  loadSettings();
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', '08.png'));
  window = new BrowserWindow({
    width: 920, height: 660, minWidth: 760, minHeight: 560,
    backgroundColor: '#000000', icon, title: '08 Codex RPC',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  window.removeMenu();
  window.loadFile(path.join(__dirname, 'ui.html'));
  window.on('close', (event) => { if (!quitting && process.platform !== 'linux') { event.preventDefault(); window.hide(); } });
  tray = new Tray(icon.resize({ width: process.platform === 'darwin' ? 18 : 32, height: process.platform === 'darwin' ? 18 : 32 }));
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  updateTrayMenu();
  ipcMain.handle('snapshot', () => snapshot());
  ipcMain.handle('save', (_event, next) => {
    settings = {
      showElapsed: Boolean(next.showElapsed), pause: Boolean(next.pause),
      userLabel: clean(next.userLabel, 40), showModel: Boolean(next.showModel), showChat: Boolean(next.showChat),
    };
    saveSettings(); publish(); broadcast(); return snapshot();
  });
  ipcMain.handle('pause', () => { settings.pause = !settings.pause; saveSettings(); publish(); broadcast(); return snapshot(); });
  ipcMain.handle('reconnect', async () => { connection.close(); lastActivity = ''; await tick(); return snapshot(); });
  tick();
  setInterval(tick, 10_000);
});
app.on('before-quit', () => { quitting = true; connection.activity(null); connection.close(); });
