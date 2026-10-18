'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../src/detect');
const { packet } = require('../src/ipc');
const { latestIndex, lastSelection, formatModel } = require('../src/session');

test('detects desktop and CLI without reading session content', () => {
  assert.equal(classify({ ExecutablePath: 'C:\\Users\\Me\\AppData\\Local\\OpenAI\\Codex\\bin\\abc\\codex.exe' }), 'desktop');
  assert.equal(classify({ ExecutablePath: 'C:\\Tools\\@openai\\codex\\codex.exe' }), 'cli');
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
