'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, parseProcessLines, detectCodex } = require('../src/detect');
const { packet, socketPaths, DiscordConnection } = require('../src/ipc');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
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

test('recognizes native macOS Desktop and Unix CLI without matching RPC or shell commands', () => {
  assert.equal(classify(parseProcessLines('/Applications/Codex.app/Contents/MacOS/Codex\n/bin/ps -axo args=')), 'desktop');
  assert.equal(classify(parseProcessLines('/opt/homebrew/bin/codex resume')), 'cli');
  assert.equal(classify(parseProcessLines('node /usr/lib/node_modules/@openai/codex/bin/codex.js')), 'cli');
  assert.equal(classify(parseProcessLines('/usr/local/bin/codex\n/Applications/Codex.app/Contents/MacOS/Codex')), 'both');
  assert.equal(classify(parseProcessLines('"/Applications/08 Codex RPC.app/Contents/MacOS/08 Codex RPC"\n/bin/sh -c echo codex\n/usr/bin/node /home/me/codex-rpc/src/main.js')), 'off');
});

test('uses the native Unix process list instead of PowerShell', async () => {
  const result = await detectCodex('linux', (file, args, options, callback) => {
    assert.equal(file, '/bin/ps');
    assert.deepEqual(args, ['-axo', 'args=']);
    callback(null, '/usr/local/bin/codex');
  });
  assert.equal(result, 'cli');
});

test('discovers Windows pipes and macOS/Linux socket locations', () => {
  assert.equal(socketPaths('win32', {})[0], '\\\\?\\pipe\\discord-ipc-0');
  assert.equal(socketPaths('win32', {}).length, 10);
  const mac = socketPaths('darwin', { TMPDIR: '/var/folders/example' });
  assert.ok(mac.includes('/var/folders/example/discord-ipc-0'));
  assert.ok(mac.includes('/tmp/discord-ipc-9'));
  const linux = socketPaths('linux', { XDG_RUNTIME_DIR: '/run/user/1000' });
  assert.ok(linux.includes('/run/user/1000/discord-ipc-0'));
  assert.ok(linux.includes('/run/user/1000/app/com.discordapp.Discord/discord-ipc-0'));
  assert.ok(linux.includes('/run/user/1000/snap.discord/discord-ipc-0'));
});

test('performs a real local IPC handshake and sends presence on each host OS', { timeout: 5000 }, async (t) => {
  const endpoint = process.platform === 'win32' ? `\\\\?\\pipe\\08-rpc-test-${randomUUID()}` : `/tmp/08-rpc-${randomUUID()}.sock`;
  let resolveActivity;
  const receivedActivity = new Promise((resolve) => { resolveActivity = resolve; });
  const server = net.createServer((socket) => {
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 8 && pending.length >= pending.readUInt32LE(4) + 8) {
        const length = pending.readUInt32LE(4);
        const opcode = pending.readUInt32LE(0);
        const message = JSON.parse(pending.subarray(8, 8 + length));
        pending = pending.subarray(8 + length);
        if (opcode === 0) {
          assert.equal(message.client_id, '123456789012345678');
          const ready = packet(1, { evt: 'READY' });
          socket.write(ready.subarray(0, 5));
          setImmediate(() => socket.write(ready.subarray(5)));
        } else if (message.cmd === 'SET_ACTIVITY') resolveActivity(message);
      }
    });
  });
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const connection = new DiscordConnection((status) => { if (status === 'connected') resolveReady(); });
  t.after(() => { connection.close(); server.close(); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); });
  connection.clientId = '123456789012345678';
  assert.equal(await connection.open(endpoint), true);
  await ready;
  connection.activity({ details: 'Example chat', state: 'GPT-6 Sol High' });
  const message = await receivedActivity;
  assert.equal(message.args.activity.state, 'GPT-6 Sol High');
  assert.equal(message.args.pid, process.pid);
});
