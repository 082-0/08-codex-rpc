'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

function latestIndex(text) {
  let latest = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (typeof row.id === 'string' && typeof row.thread_name === 'string' &&
          (!latest || String(row.updated_at || '') >= String(latest.updated_at || ''))) latest = row;
    } catch { /* Ignore an incomplete final line. */ }
  }
  return latest;
}

function indexedThread(text, id) {
  let found = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes(id)) continue;
    try {
      const row = JSON.parse(line);
      if (row.id === id && typeof row.thread_name === 'string') found = row;
    } catch { /* Ignore an incomplete line. */ }
  }
  return found;
}

function lastSelection(text) {
  let selection = { model: '', effort: '' };
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('"turn_context"')) continue;
    try {
      const row = JSON.parse(line);
      if (row.type === 'turn_context' && typeof row.payload?.model === 'string') {
        selection = { model: row.payload.model, effort: String(row.payload.effort || '') };
      }
    } catch { /* A partial first or last line is expected. */ }
  }
  return selection;
}

function formatModel(model, effort) {
  if (!model) return '';
  const name = String(model).split('-').map((part, index) => index === 0 && part.toLowerCase() === 'gpt'
    ? 'GPT' : part ? part[0].toUpperCase() + part.slice(1) : '').join('-').replace(/-(Sol|Astra|Luna|Terra)$/i, ' $1');
  const effortName = ({ low: 'Low', medium: 'Medium', high: 'High', xhigh: 'X-High', max: 'Max', ultra: 'Ultra' })[String(effort || '').toLowerCase()] || '';
  return [name, effortName].filter(Boolean).join(' ');
}

function liveSelection(root, id) {
  const file = path.join(root, 'state_5.sqlite');
  if (!fs.existsSync(file)) return null;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare('select name, model, reasoning_effort from threads where id = ?').get(id);
    if (!row) return null;
    return { title: String(row.name || ''), model: String(row.model || ''), effort: String(row.reasoning_effort || '') };
  } finally { db.close(); }
}

function findRollout(root, id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const years = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
  for (const year of years) {
    const y = path.join(root, year);
    for (const month of fs.readdirSync(y, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse()) {
      const m = path.join(y, month);
      for (const day of fs.readdirSync(m, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse()) {
        const d = path.join(m, day);
        const file = fs.readdirSync(d).find((name) => name.endsWith(`${id}.jsonl`));
        if (file) return path.join(d, file);
      }
    }
  }
  return null;
}

function readTail(file, bytes = 8 * 1024 * 1024) {
  const size = fs.statSync(file).size;
  const length = Math.min(size, bytes);
  const fd = fs.openSync(file, 'r');
  try {
    const data = Buffer.alloc(length);
    fs.readSync(fd, data, 0, length, size - length);
    return data.toString('utf8');
  } finally { fs.closeSync(fd); }
}

function selectionEvent(text) {
  let latest = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('thread_stream_view_activity_changed')) continue;
    const appearance = line.match(/\brendererWindowAppearance=(\S+)/);
    if (appearance && appearance[1] !== 'primary') continue;
    const active = line.match(/\bactive=(true|false)\b/);
    const id = line.match(/\bconversationId=([a-f0-9-]{36})\b/i);
    const timestampText = line.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/);
    const timestamp = timestampText ? Date.parse(timestampText[0]) : NaN;
    if (active && id) latest = { id: id[1].toLowerCase(), active: active[1] === 'true', timestamp: Number.isNaN(timestamp) ? 0 : timestamp };
  }
  return latest;
}

function selectedThreadId(text) {
  const event = selectionEvent(text);
  return event?.active ? event.id : '';
}

function desktopLogRoots(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'darwin') return [path.join(home, 'Library', 'Logs', 'com.openai.codex')];
  if (platform === 'linux') {
    return [...new Set([
      path.join(env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'codex', 'logs'),
      path.join(env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'Codex', 'Logs'),
      path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Codex', 'logs'),
      path.join(home, '.config', 'Codex', 'logs'),
    ])];
  }
  const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const roots = [path.join(local, 'Codex', 'Logs')];
  try {
    for (const entry of fs.readdirSync(path.join(local, 'Packages'), { withFileTypes: true })) {
      if (entry.isDirectory() && /^OpenAI\.Codex_/i.test(entry.name)) {
        roots.push(path.join(local, 'Packages', entry.name, 'LocalCache', 'Local', 'Codex', 'Logs'));
      }
    }
  } catch { /* A non-packaged install has no Packages directory. */ }
  return roots;
}

function desktopSelection(logsRoots) {
  const roots = Array.isArray(logsRoots) ? logsRoots : [logsRoots];
  const files = [];
  for (const root of roots) {
    try {
      const years = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort().reverse();
      for (const year of years.slice(0, 2)) {
        const y = path.join(root, year);
        for (const month of fs.readdirSync(y, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort().reverse().slice(0, 2)) {
          const m = path.join(y, month);
          for (const day of fs.readdirSync(m, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort().reverse().slice(0, 3)) {
            const d = path.join(m, day);
            for (const name of fs.readdirSync(d)) if (/^codex-desktop-.*\.log$/.test(name)) {
              const file = path.join(d, name);
              files.push({ file, modified: fs.statSync(file).mtimeMs });
            }
          }
        }
      }
    } catch { /* Try the other install locations. */ }
  }
  let selected = null;
  for (const { file, modified } of files.sort((a, b) => b.modified - a.modified).slice(0, 12)) {
    try {
      const event = selectionEvent(readTail(file, 1024 * 1024));
      if (event && (!selected || event.timestamp > selected.timestamp ||
          (event.timestamp === selected.timestamp && modified > selected.modified))) selected = { ...event, modified };
    } catch { /* A rotated log can disappear between listing and reading. */ }
  }
  return selected ? (selected.active ? selected.id : '') : null;
}

let cachedId = '';
let cachedFile = null;
function readSession(root = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
  logsRoots = desktopLogRoots()) {
  try {
    const index = fs.readFileSync(path.join(root, 'session_index.jsonl'), 'utf8');
    const row = latestIndex(index);
    if (!row) return { title: '', model: '', effort: '', modelLabel: '' };
    const selectedId = desktopSelection(logsRoots);
    if (selectedId === '') return { title: '', model: '', effort: '', modelLabel: '' };
    const id = selectedId || row.id;
    const indexed = id === row.id ? row : indexedThread(index, id);
    let live = null;
    try {
      live = liveSelection(root, id);
      if (live && live.model) return { title: live.title || indexed?.thread_name || '', model: live.model, effort: live.effort, modelLabel: formatModel(live.model, live.effort) };
    } catch { /* Fall back to the session log if the live database is unavailable. */ }
    if (id !== cachedId) {
      cachedId = id;
      try { cachedFile = findRollout(path.join(root, 'sessions'), id); }
      catch { cachedFile = null; }
    }
    let selection = { model: '', effort: '' };
    try { if (cachedFile) selection = lastSelection(readTail(cachedFile)); }
    catch { /* The session log may have moved or been deleted. */ }
    return { title: live?.title || indexed?.thread_name || '', ...selection, modelLabel: formatModel(selection.model, selection.effort) };
  } catch { return { title: '', model: '', effort: '', modelLabel: '' }; }
}

module.exports = { latestIndex, lastSelection, formatModel, selectedThreadId, selectionEvent, desktopLogRoots, desktopSelection, readSession };

