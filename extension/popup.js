const $ = (id) => document.getElementById(id);

async function load() {
  const s = await chrome.storage.local.get({ baseUrl: "http://localhost:3000", token: "", enabled: true, testMode: false, history: [] });
  $("baseUrl").value = s.baseUrl;
  $("token").value = s.token;
  $("enabled").checked = s.enabled;
  $("testMode").checked = s.testMode;
  renderHistory(s.history);
  if (s.token) ping();
}

function renderHistory(history) {
  const ul = $("history");
  if (!history.length) return;
  ul.innerHTML = "";
  for (const h of history.slice(0, 15)) {
    const li = document.createElement("li");
    const b = document.createElement("b");
    b.textContent = h.job;
    const pill = document.createElement("span");
    pill.className = `pill ${h.status}`;
    pill.textContent = h.status === "needs_you" ? "needs you" : h.status;
    const note = document.createElement("span");
    note.className = "muted";
    note.textContent = ` ${new Date(h.at).toLocaleString()}${h.note ? ` · ${h.note}` : ""}`;
    li.append(b, pill, note);
    ul.append(li);
  }
}

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = `status ${kind || ""}`;
}

async function ping() {
  setStatus($("status"), "Checking…");
  const r = await chrome.runtime.sendMessage({ type: "ping" });
  if (!r?.ok) return setStatus($("status"), r?.error || "Couldn't reach Jobify.", "err");
  const d = r.data;
  setStatus(
    $("status"),
    d.autoSubmit
      ? `Connected as ${d.email} · ${d.queued} queued · ${d.submittedToday}/${d.dailyLimit} today`
      : `Connected as ${d.email} · turn on automatic submitting in Jobify → Settings → Autopilot`,
    d.autoSubmit ? "ok" : "",
  );
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ baseUrl: $("baseUrl").value.trim().replace(/\/+$/, ""), token: $("token").value.trim() });
  ping();
});
$("enabled").addEventListener("change", (e) => chrome.storage.local.set({ enabled: e.target.checked }));
$("testMode").addEventListener("change", (e) => chrome.storage.local.set({ testMode: e.target.checked }));
$("run").addEventListener("click", async () => {
  $("run").disabled = true;
  setStatus($("runMsg"), "Working… (leave this open)");
  const r = await chrome.runtime.sendMessage({ type: "run-now" });
  setStatus($("runMsg"), r?.message || "Done.", r?.ran ? "ok" : "");
  $("run").disabled = false;
  const { history = [] } = await chrome.storage.local.get("history");
  renderHistory(history);
  ping();
});

load();
