const DEFAULTS = globalThis.CGPT_DOM_TRIMMER_DEFAULTS;

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("No active tab");
  return chrome.tabs.sendMessage(tab.id, message);
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
  if (text) {
    setTimeout(() => {
      document.getElementById("status").textContent = "";
    }, 1500);
  }
}

async function refreshRemovedCount() {
  try {
    const result = await sendToActiveTab({ type: "getRemovedCount" });
    const count = result?.count ?? 0;
    document.getElementById("removedCount").textContent =
      `Removed messages: ${count}`;
  } catch {
    document.getElementById("removedCount").textContent = "";
  }
}

async function load() {
  const data = await chrome.storage.sync.get(DEFAULTS);

  document.getElementById("enabled").checked = data.enabled;
  document.getElementById("keepCount").value = data.keepCount;
  document.getElementById("trimThreshold").value = data.trimThreshold;

  await refreshRemovedCount();
}

async function save() {
  await chrome.storage.sync.set({
    enabled: document.getElementById("enabled").checked,
    keepCount: Number(document.getElementById("keepCount").value),
    trimThreshold: Number(document.getElementById("trimThreshold").value),
  });

  setStatus("Saved");
}

document.getElementById("save").addEventListener("click", save);

document.getElementById("apply").addEventListener("click", async () => {
  try {
    await save();
    await sendToActiveTab({ type: "applyNow" });
    setStatus("Applied");
    setTimeout(refreshRemovedCount, 150);
  } catch {
    setStatus("Apply failed");
  }
});

load();
