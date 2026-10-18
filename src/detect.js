'use strict';

const { execFile } = require('node:child_process');

function classify(records) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  let desktop = false;
  let cli = false;
  for (const item of list) {
    const path = String(item.ExecutablePath || '').toLowerCase().replaceAll('\\', '/');
    const line = String(item.CommandLine || '').toLowerCase().replaceAll('\\', '/');
    if (path.includes('/openai.codex_') || path.includes('/openai/codex/bin/') || path.includes('/programs/codex/') || /\/codex\.app\/contents\//.test(path + ' ' + line)) desktop = true;
    else if (path.includes('/@openai/codex/') || /(?:^|\/)codex(?:\.exe)?$/.test(path) || /\/@openai\/codex\/[^\s]*codex(?:\.js|\.exe)?(?:\s|$)/.test(line)) cli = true;
  }
  if (desktop && cli) return 'both';
  if (desktop) return 'desktop';
  if (cli) return 'cli';
  return 'off';
}

function parseProcessLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const match = line.trim().match(/^(?:"([^"]+)"|(\S+))/);
    return { ExecutablePath: match?.[1] || match?.[2] || '', CommandLine: line.trim() };
  });
}

function detectCodex(platform = process.platform, run = execFile) {
  return new Promise((resolve) => {
    if (platform !== 'win32') {
      run('/bin/ps', ['-axo', 'args='], { timeout: 7000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
        resolve(error ? 'off' : classify(parseProcessLines(stdout || '')));
      });
      return;
    }
    const script = "Get-CimInstance Win32_Process -Filter \"Name = 'codex.exe'\" | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress";
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 7000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error || !stdout.trim()) { resolve('off'); return; }
        try { resolve(classify(JSON.parse(stdout))); } catch { resolve('off'); }
      });
  });
}

module.exports = { classify, detectCodex, parseProcessLines };
