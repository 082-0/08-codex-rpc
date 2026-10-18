'use strict';
const $ = (id) => document.getElementById(id);
let current;
function sourceLabel(value) { return value === 'both' ? 'Desktop + CLI' : value === 'cli' ? 'CLI' : value === 'desktop' ? 'Desktop' : 'Not running'; }
function statusLabel(value) { return ({ connected: 'Connected', connecting: 'Connecting…', 'discord-closed': 'Open Discord desktop', 'app-id-needed': 'Unavailable', 'rpc-error': 'Connection rejected', disconnected: 'Disconnected' })[value] || value; }
function preview() {
  const title = $('showChat').checked ? current?.session?.title || '' : '';
  const model = $('showModel').checked ? current?.session?.modelLabel || '' : '';
  $('preview-details').textContent = title || 'Using Codex';
  $('preview-state').textContent = [model, $('userLabel').value.trim()].filter(Boolean).join(' · ') || 'Using Codex';
  $('preview-time').hidden = !$('showElapsed').checked;
}
function render(data) {
  current = data;
  $('codex-status').textContent = sourceLabel(data.codex);
  $('codex-dot').classList.toggle('on', data.codex !== 'off');
  $('discord-status').textContent = statusLabel(data.discord);
  $('discord-dot').classList.toggle('on', data.discord === 'connected');
  $('pause').textContent = data.settings.pause ? 'Resume' : 'Pause';
  preview();
}
window.rpc.snapshot().then((data) => {
  for (const key of ['userLabel', 'showChat', 'showModel', 'showElapsed']) {
    if ($(key).type === 'checkbox') $(key).checked = Boolean(data.settings[key]);
    else $(key).value = data.settings[key];
    $(key).addEventListener('input', preview);
  }
  render(data);
});
window.rpc.onSnapshot(render);
$('save').addEventListener('click', async () => {
  const settings = { userLabel: $('userLabel').value, showChat: $('showChat').checked, showModel: $('showModel').checked, showElapsed: $('showElapsed').checked, pause: current?.settings.pause || false };
  render(await window.rpc.save(settings));
  $('feedback').textContent = 'Saved. Discord will update now.';
});
$('pause').addEventListener('click', async () => render(await window.rpc.pause()));
$('reconnect').addEventListener('click', async () => render(await window.rpc.reconnect()));
