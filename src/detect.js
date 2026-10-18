'use strict';

const { execFile } = require('node:child_process');

function classify(records) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  let desktop = false;
  let cli = false;
  for (const item of list) {
    const path = String(item.ExecutablePath || '').toLowerCase().replaceAll('\\', '/');
    const line = String(item.CommandLine || '').toLowerCase();
    if (path.includes('/openai.codex_') || path.includes('/openai/codex/bin/') || path.includes('/programs/codex/') || path.includes('/codex.app/')) desktop = true;
    else if (path.includes('/@openai/codex/') || path.endsWith('/codex.exe') || line.includes('codex')) cli = true;
  }
  if (desktop && cli) return 'both';
  if (desktop) return 'desktop';
  if (cli) return 'cli';
  return 'off';
}

function detectCodex() {
  return new Promise((resolve) => {
    const script = "Get-CimInstance Win32_Process -Filter \"Name = 'codex.exe'\" | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress";
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 7000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error || !stdout.trim()) { resolve('off'); return; }
        try { resolve(classify(JSON.parse(stdout))); } catch { resolve('off'); }
      });
  });
}

module.exports = { classify, detectCodex };
