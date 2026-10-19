'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../src/detect');
const { packet } = require('../src/ipc');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { latestIndex, lastSelection, formatModel, selectedThreadId, desktopLogRoots, desktopSelection, readSession } = require('../src/session');

test('detects desktop and CLI without reading session content', () => {
  assert.equal(classify({ ExecutablePath: 'C:\\Users\\Me\\AppData\\Local\\OpenAI\\Codex\\bin\\abc\\codex.exe' }), 'desktop');
  assert.equal(classify({ ExecutablePath: 'C:\\Tools\\@openai\\codex\\codex.exe' }), 'cli');
  assert.equal(classify({ ExecutablePath: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.9_x64__id\\app\\ChatGPT.exe' }), 'desktop');
  assert.equal(classify({ ExecutablePath: '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT' }), 'desktop');
  assert.equal(classify({ ExecutablePath: '/usr/lib/chatgpt/ChatGPT' }), 'desktop');
  assert.equal(classify([
    { ExecutablePath: 'C:\\Users\\Me\\AppData\\Local\\OpenAI\\Codex\\bin\\abc\\codex.exe' },
    { ExecutablePath: 'C:\\Tools\\@openai\\codex\\codex.exe' },
  ]), 'both');
});

test('Discord IPC frame length matches its JSON payload', () => {
  const value = { v: 1, client_id: '123456789012345678' };
  const data = packet(0, value);
  assert.equal(data.readUInt32LE(0), 0);
  assert.equal(data.readUInt32LE(4), data.length - 8);
  assert.deepEqual(JSON.parse(data.subarray(8).toString('utf8')), value);
});

test('reads only chat title and selected model from Codex metadata', () => {
  const index = [
    { id: 'old', thread_name: 'Earlier', updated_at: '2026-10-17T12:00:00Z' },
    { id: 'new', thread_name: 'Current chat', updated_at: '2026-10-18T12:00:00Z' },
  ].map(JSON.stringify).join('\n');
  assert.equal(latestIndex(index).thread_name, 'Current chat');
  const session = [
    { type: 'turn_context', payload: { model: 'gpt-6-sol' } },
    { type: 'response_item', payload: { content: 'private message' } },
    { type: 'turn_context', payload: { model: 'gpt-6-astra' } },
  ].map(JSON.stringify).join('\n');
  assert.deepEqual(lastSelection(session), { model: 'gpt-6-astra', effort: '' });
});

test('includes the selected reasoning level in the displayed model', () => {
  const session = [
    { type: 'turn_context', payload: { model: 'gpt-6-sol', effort: 'low' } },
    { type: 'turn_context', payload: { model: 'gpt-6-sol', effort: 'high' } },
  ].map(JSON.stringify).join('\n');
  assert.deepEqual(lastSelection(session), { model: 'gpt-6-sol', effort: 'high' });
  assert.equal(formatModel('gpt-6-sol', 'high'), 'GPT-6 Sol High');
});

test('follows the visible Codex desktop chat instead of the newest updated chat', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '08-rpc-chat-'));
  try {
    const logs = path.join(root, 'Logs', '2026', '10', '18');
    fs.mkdirSync(logs, { recursive: true });
    const oldId = '11111111-1111-1111-1111-111111111111';
    const visibleId = '22222222-2222-2222-2222-222222222222';
    fs.writeFileSync(path.join(root, 'session_index.jsonl'), JSON.stringify({ id: oldId, thread_name: 'Newest edited', updated_at: '2026-10-18T12:00:00Z' }));
    const db = new DatabaseSync(path.join(root, 'state_5.sqlite'));
    db.exec('create table threads (id text primary key, name text, model text, reasoning_effort text)');
    db.prepare('insert into threads values (?,?,?,?)').run(visibleId, 'Visible chat', 'gpt-6-sol', 'high');
    db.close();
    const line = `2026-10-18T12:00:00Z info thread_stream_view_activity_changed active=true conversationId=${oldId} rendererWindowAppearance=primary\n` +
      `2026-10-18T12:01:00Z info thread_stream_view_activity_changed active=true conversationId=${visibleId} rendererWindowAppearance=primary`;
    fs.writeFileSync(path.join(logs, 'codex-desktop-test.log'), line);
    assert.equal(selectedThreadId(line), visibleId);
    assert.deepEqual(readSession(root, path.join(root, 'Logs')),
      { title: 'Visible chat', model: 'gpt-6-sol', effort: 'high', modelLabel: 'GPT-6 Sol High' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('discovers packaged Windows and macOS Codex logs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '08-rpc-roots-'));
  try {
    const local = path.join(root, 'Local');
    fs.mkdirSync(path.join(local, 'Packages', 'OpenAI.Codex_test'), { recursive: true });
    const windows = desktopLogRoots('win32', { LOCALAPPDATA: local }, root);
    assert.ok(windows.includes(path.join(local, 'Packages', 'OpenAI.Codex_test', 'LocalCache', 'Local', 'Codex', 'Logs')));
    assert.deepEqual(desktopLogRoots('darwin', {}, root), [path.join(root, 'Library', 'Logs', 'com.openai.codex')]);
    assert.ok(desktopLogRoots('linux', {}, root).includes(path.join(root, '.local', 'state', 'codex', 'logs')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('tracks switches across logs and does not retain a deactivated chat', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '08-rpc-switch-'));
  try {
    const logs = path.join(root, '2026', '10', '19');
    fs.mkdirSync(logs, { recursive: true });
    const first = '11111111-1111-1111-1111-111111111111';
    const second = '22222222-2222-2222-2222-222222222222';
    const line = (time, active, id) => `${time} info thread_stream_view_activity_changed active=${active} conversationId=${id} rendererWindowAppearance=primary\n`;
    fs.writeFileSync(path.join(logs, 'codex-desktop-one.log'), line('2026-10-19T10:00:00Z', true, first));
    const next = path.join(logs, 'codex-desktop-two.log');
    fs.writeFileSync(next, line('2026-10-19T10:01:00Z', true, second));
    assert.equal(desktopSelection(root), second);
    fs.appendFileSync(next, line('2026-10-19T10:02:00Z', false, second));
    assert.equal(desktopSelection(root), '');
    assert.equal(selectedThreadId(fs.readFileSync(next, 'utf8')), '');
    fs.appendFileSync(next, line('2026-10-19T10:03:00Z', true, first));
    assert.equal(desktopSelection(root), first);
    fs.appendFileSync(next, `2026-10-19T10:04:00Z info thread_stream_view_activity_changed active=true conversationId=${second} rendererWindowFocused=true\n`);
    assert.equal(desktopSelection(root), second);
    fs.appendFileSync(next, `2026-10-19T10:05:00Z info thread_stream_view_activity_changed active=true conversationId=${first} rendererWindowAppearance=avatarOverlay\n`);
    assert.equal(desktopSelection(root), second);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('does not show the newest chat when the selected chat lacks database metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '08-rpc-missing-db-'));
  try {
    const logs = path.join(root, 'Logs', '2026', '10', '19');
    fs.mkdirSync(logs, { recursive: true });
    const newest = '11111111-1111-1111-1111-111111111111';
    const selected = '22222222-2222-2222-2222-222222222222';
    fs.writeFileSync(path.join(root, 'session_index.jsonl'), [
      { id: selected, thread_name: 'Selected chat', updated_at: '2026-10-19T09:00:00Z' },
      { id: newest, thread_name: 'Newest chat', updated_at: '2026-10-19T10:00:00Z' },
    ].map(JSON.stringify).join('\n'));
    const log = path.join(logs, 'codex-desktop-test.log');
    fs.writeFileSync(log, `2026-10-19T10:01:00.123Z info thread_stream_view_activity_changed active=true conversationId=${selected} rendererWindowAppearance=primary\n`);
    assert.equal(readSession(root, path.join(root, 'Logs')).title, 'Selected chat');
    fs.appendFileSync(log, `2026-10-19T10:02:00.123Z info thread_stream_view_activity_changed active=false conversationId=${selected} rendererWindowAppearance=primary\n`);
    assert.equal(readSession(root, path.join(root, 'Logs')).title, '');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

