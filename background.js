importScripts("defaults.js");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "badgeUpdate") return;

  const tabId = sender.tab?.id;
  if (!tabId) return;

  chrome.action.setBadgeText({
    tabId,
    text: msg.enabled ? String(msg.count || "") : "",
  });

  chrome.action.setBadgeBackgroundColor({
    tabId,
    color: "#444",
  });

  sendResponse({ ok: true });
});
