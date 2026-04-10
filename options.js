const DEFAULTS = globalThis.CGPT_DOM_TRIMMER_DEFAULTS;

async function load() {
  const data = await chrome.storage.sync.get(DEFAULTS);

  document.getElementById("enabled").checked = data.enabled;
  document.getElementById("keepCount").value = data.keepCount;
  document.getElementById("trimThreshold").value = data.trimThreshold;
  document.getElementById("debug").checked = data.debug;
}

async function save() {
  await chrome.storage.sync.set({
    enabled: document.getElementById("enabled").checked,
    keepCount: Number(document.getElementById("keepCount").value),
    trimThreshold: Number(document.getElementById("trimThreshold").value),
    debug: document.getElementById("debug").checked,
  });

  const status = document.getElementById("status");
  status.textContent = "Saved";
  setTimeout(() => {
    status.textContent = "";
  }, 1500);
}

document.getElementById("save").addEventListener("click", save);
load();
