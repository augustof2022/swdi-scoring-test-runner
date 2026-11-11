/* Runs the capture in the page so it finishes even if the popup closes; keeps the last capture per browser session. */
'use strict';
const HOSTS = [/^https:\/\/4ps-dp-preprod\.dswd\.gov\.ph\//, /^https:\/\/4ps-dp-preprod-loadtest\.dswd\.gov\.ph\//];

async function capture(tabId, url, answers) {
  if (!HOSTS.some(h => h.test(url || ''))) throw new Error('Open the Assessment Review in 4Ps Forward (preprod or preprod load test) first.');
  await chrome.storage.session.set({ busy: { tabId, startedAt: Date.now() } });
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['capture.js'] });
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: opts => self.SWDICapture.run(opts), args: [{ answers }] });
    const out = res && res.result;
    if (!out || !out.ok) throw new Error((out && out.error) || 'Nothing was captured.');
    await chrome.storage.session.set({ last: out.capture, error: null });
    return out.capture;
  } finally {
    await chrome.storage.session.remove('busy');
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'capture') {
    capture(msg.tabId, msg.url, msg.answers !== false)
      .then(c => reply({ ok: true, capture: c }))
      .catch(async e => { await chrome.storage.session.set({ error: e.message }); reply({ ok: false, error: e.message }); });
    return true;
  }
  return false;
});
