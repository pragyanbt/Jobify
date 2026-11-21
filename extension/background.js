// Jobify Autopilot: background worker.
// Asks Jobify for the next prepared application, opens its form in a background
// tab, fills and submits it (filler.js), and reports the result back.

const TICK_MINUTES = 5;
const MAX_PER_TICK = 5;
const PAGE_TIMEOUT_MS = 45_000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("tick", { periodInMinutes: TICK_MINUTES });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("tick", { periodInMinutes: TICK_MINUTES });
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "tick") void run("schedule");
});
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "run-now") {
    run("manual").then(reply);
    return true; // async reply
  }
  if (msg?.type === "ping") {
    api("/api/extension/ping").then((r) => reply({ ok: true, data: r }), (e) => reply({ ok: false, error: String(e.message || e) }));
    return true;
  }
});

let running = false;

async function settings() {
  const s = await chrome.storage.local.get({ baseUrl: "http://localhost:3000", token: "", enabled: true, testMode: false });
  return { ...s, baseUrl: String(s.baseUrl).replace(/\/+$/, "") };
}

async function api(path, init = {}) {
  const { baseUrl, token } = await settings();
  if (!token) throw new Error("Add your extension key first.");
  const res = await fetch(baseUrl + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Jobify returned ${res.status}`);
  }
  return res.headers.get("content-type")?.includes("application/json") ? res.json() : res;
}

async function log(entry) {
  const { history = [] } = await chrome.storage.local.get("history");
  history.unshift({ at: Date.now(), ...entry });
  await chrome.storage.local.set({ history: history.slice(0, 30) });
}

async function run(trigger) {
  const s = await settings();
  if (!s.token) return { ran: 0, message: "Add your extension key first." };
  if (!s.enabled && trigger === "schedule") return { ran: 0, message: "Paused." };
  if (running) return { ran: 0, message: "Already running." };
  running = true;
  let ran = 0;
  try {
    for (let i = 0; i < MAX_PER_TICK; i++) {
      const { task } = await api("/api/extension/next", { method: "POST", body: "{}" });
      if (!task) break;
      ran++;
      const outcome = await submitTask(task, s.testMode).catch((e) => ({ status: "failed", note: String(e.message || e) }));
      await api(`/api/extension/tasks/${task.id}/result`, { method: "POST", body: JSON.stringify(outcome) }).catch(() => {});
      await log({ job: `${task.title} · ${task.company}`, status: outcome.status, note: outcome.note || "" });
    }
    await chrome.storage.local.set({ lastRun: Date.now(), lastError: "" });
    return { ran, message: ran ? `Handled ${ran} application(s).` : "Nothing to submit right now." };
  } catch (e) {
    const message = String(e.message || e);
    await chrome.storage.local.set({ lastRun: Date.now(), lastError: message });
    return { ran, message };
  } finally {
    running = false;
  }
}

async function submitTask(task, testMode) {
  // Resume PDF → base64, handed to the page to attach.
  const pdfRes = await api(`/api/extension/tasks/${task.id}/resume`);
  const buf = new Uint8Array(await pdfRes.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const pdfB64 = btoa(bin);

  const tab = await chrome.tabs.create({ url: task.applyUrl, active: false });
  try {
    await waitForLoad(tab.id);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["filler.js"] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (t, b64, test) => window.__jobifyFill(t, b64, test),
      args: [task, pdfB64, !!testMode],
    });
    const outcome = result || { status: "failed", note: "The page didn't respond." };
    // Leave the tab open when it needs the user, so they can finish it; close otherwise.
    if (outcome.status !== "needs_you") await chrome.tabs.remove(tab.id).catch(() => {});
    return outcome;
  } catch (e) {
    return { status: "needs_you", note: `Couldn't fill this form automatically: ${String(e.message || e)}` };
  }
}

function waitForLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpd); reject(new Error("The page took too long to load.")); }, PAGE_TIMEOUT_MS);
    function onUpd(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpd);
        setTimeout(resolve, 2500); // let client-rendered forms appear
      }
    }
    chrome.tabs.onUpdated.addListener(onUpd);
  });
}
