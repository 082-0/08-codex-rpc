'use strict';

const net = require('node:net');
const { randomUUID } = require('node:crypto');

function packet(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

class DiscordConnection {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.socket = null;
    this.ready = false;
    this.pending = Buffer.alloc(0);
    this.clientId = '';
    this.connecting = false;
  }

  async connect(clientId) {
    if (!/^\d{17,20}$/.test(clientId || '')) {
      this.onStatus('app-id-needed');
      return;
    }
    if (this.ready && this.clientId === clientId) return;
    if (this.connecting) return;
    this.close();
    this.clientId = clientId;
    this.connecting = true;
    this.onStatus('connecting');
    for (let slot = 0; slot < 10; slot++) {
      const opened = await this.open(`\\\\?\\pipe\\discord-ipc-${slot}`).catch(() => false);
      if (opened) return;
    }
    this.connecting = false;
    this.onStatus('discord-closed');
  }

  open(pipe) {
    return new Promise((resolve) => {
      const candidate = net.createConnection(pipe);
      let settled = false;
      const finish = (value) => {
        if (!settled) { settled = true; resolve(value); }
      };
      candidate.once('connect', () => {
        this.socket = candidate;
        this.pending = Buffer.alloc(0);
        candidate.write(packet(0, { v: 1, client_id: this.clientId }));
        finish(true);
      });
      candidate.on('data', (chunk) => this.receive(chunk));
      candidate.once('error', () => finish(false));
      candidate.once('close', () => {
        finish(false);
        if (this.socket === candidate) {
          this.socket = null;
          this.ready = false;
          this.connecting = false;
          this.onStatus('disconnected');
        }
      });
    });
  }

  receive(chunk) {
    this.pending = Buffer.concat([this.pending, chunk]);
    while (this.pending.length >= 8) {
      const opcode = this.pending.readUInt32LE(0);
      const length = this.pending.readUInt32LE(4);
      if (length > 1024 * 1024) { this.close(); return; }
      if (this.pending.length < length + 8) return;
      const raw = this.pending.subarray(8, length + 8);
      this.pending = this.pending.subarray(length + 8);
      if (opcode === 3) {
        let ping;
        try { ping = JSON.parse(raw.toString('utf8')); } catch { this.close(); return; }
        this.socket?.write(packet(4, ping));
        continue;
      }
      if (opcode !== 1) continue;
      let message;
      try { message = JSON.parse(raw.toString('utf8')); } catch { continue; }
      if (message.evt === 'READY') {
        this.ready = true;
        this.connecting = false;
        this.onStatus('connected');
      } else if (message.evt === 'ERROR') {
        this.onStatus('rpc-error');
      }
    }
  }

  activity(value) {
    if (!this.ready || !this.socket) return;
    this.socket.write(packet(1, {
      cmd: 'SET_ACTIVITY',
      args: value ? { pid: process.pid, activity: value } : { pid: process.pid },
      nonce: randomUUID(),
    }));
  }

  close() {
    this.socket?.destroy();
    this.socket = null;
    this.ready = false;
  }
}

module.exports = { DiscordConnection, packet };
