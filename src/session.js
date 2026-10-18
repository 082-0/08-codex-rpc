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

function selectedThreadId(text) {
  let id = '';
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('thread_stream_view_activity_changed active=true')) continue;
    const match = line.match(/\bconversationId=([a-f0-9-]{36})\b/);
    if (match && line.includes('rendererWindowAppearance=primary')) id = match[1];
  }
  return id;
}

function desktopSelection(logsRoot) {
  try {
    const years = fs.readdirSync(logsRoot, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort().reverse();
    const files = [];
    for (const year of years.slice(0, 2)) {
      const y = path.join(logsRoot, year);
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
    for (const { file } of files.sort((a, b) => b.modified - a.modified).slice(0, 5)) {
      const id = selectedThreadId(readTail(file, 1024 * 1024));
      if (id) return id;
    }
  } catch { /* Desktop log may be unavailable. */ }
  return '';
}

let cachedId = '';
let cachedFile = null;
function readSession(root = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
  logsRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Codex', 'Logs')) {
  try {
    const row = latestIndex(fs.readFileSync(path.join(root, 'session_index.jsonl'), 'utf8'));
    if (!row) return { title: '', model: '', effort: '', modelLabel: '' };
    const selectedId = process.platform === 'win32' ? desktopSelection(logsRoot) : '';
    let id = row.id;
    if (selectedId) {
      try { if (liveSelection(root, selectedId)) id = selectedId; } catch { /* Use the latest indexed chat. */ }
    }
    try {
      const live = liveSelection(root, id);
      if (live && live.model) return { title: live.title || row.thread_name, model: live.model, effort: live.effort, modelLabel: formatModel(live.model, live.effort) };
    } catch { /* Fall back to the session log if the live database is unavailable. */ }
    if (id !== cachedId) {
      cachedId = id;
      cachedFile = findRollout(path.join(root, 'sessions'), id);
    }
    const selection = cachedFile ? lastSelection(readTail(cachedFile)) : { model: '', effort: '' };
    return { title: id === row.id ? row.thread_name : '', ...selection, modelLabel: formatModel(selection.model, selection.effort) };
  } catch { return { title: '', model: '', effort: '', modelLabel: '' }; }
}

module.exports = { latestIndex, lastSelection, formatModel, selectedThreadId, readSession };
