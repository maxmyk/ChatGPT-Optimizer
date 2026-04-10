const DEFAULTS = globalThis.CGPT_DOM_TRIMMER_DEFAULTS;

let settings = { ...DEFAULTS };
let observer = null;
let scheduled = false;
let navInterval = null;

let currentRemovedCount = 0;
let maxObservedTurns = 0;
let currentPageKey = "";
let lastKnownPath = location.pathname;
let hasSeenConversationContent = false;

let removedTurnIds = new Set();

function log(...args) {
  if (settings.debug) {
    console.log("[ChatGPT DOM Trimmer]", ...args);
  }
}

function getPageKey() {
  return `cgpt-dom-trimmer:v1:${location.pathname}`;
}

function getRemovedIdsKey() {
  return `${getPageKey()}:ids`;
}

function getMaxTurnsKey() {
  return `${getPageKey()}:maxTurns`;
}

function loadPageState() {
  currentPageKey = getPageKey();

  const rawCount = sessionStorage.getItem(currentPageKey);
  currentRemovedCount = rawCount ? Number(rawCount) || 0 : 0;

  const rawIds = sessionStorage.getItem(getRemovedIdsKey());
  try {
    removedTurnIds = new Set(rawIds ? JSON.parse(rawIds) : []);
  } catch {
    removedTurnIds = new Set();
  }

  const rawMax = sessionStorage.getItem(getMaxTurnsKey());
  maxObservedTurns = rawMax ? Number(rawMax) || 0 : 0;
}

function savePageState() {
  sessionStorage.setItem(currentPageKey, String(currentRemovedCount));
  sessionStorage.setItem(
    getRemovedIdsKey(),
    JSON.stringify([...removedTurnIds]),
  );
  sessionStorage.setItem(getMaxTurnsKey(), String(maxObservedTurns));
}

async function sendBadgeUpdate(count = currentRemovedCount) {
  try {
    await chrome.runtime.sendMessage({
      type: "badgeUpdate",
      enabled: settings.enabled,
      count: count > 99 ? "99+" : String(count),
    });
  } catch (e) {
    log("Badge update failed", e);
  }
}

function debounceApply() {
  if (scheduled) return;
  scheduled = true;

  setTimeout(() => {
    scheduled = false;
    applyTrim();
  }, 60);
}

function isVisible(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (!el.isConnected) return false;

  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;

  const rect = el.getBoundingClientRect();
  return rect.width > 4 && rect.height > 4;
}

function getConversationRoot() {
  return document.querySelector("main") || document.body;
}

function getMessageNodes() {
  const root = getConversationRoot();
  if (!root) return [];

  return [
    ...root.querySelectorAll(
      '[data-message-author-role="user"], [data-message-author-role="assistant"]',
    ),
  ]
    .filter(isVisible)
    .sort(
      (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
    );
}

function getStableTurnId(messageEl, index) {
  const msgId = messageEl.getAttribute("data-message-id");
  const role = messageEl.getAttribute("data-message-author-role") || "unknown";
  return msgId ? `${role}:${msgId}` : `${role}:idx:${index}`;
}

function getTurnContainer(messageEl) {
  if (!(messageEl instanceof HTMLElement)) return null;

  let current = messageEl;
  let candidate = messageEl;

  for (let i = 0; i < 8 && current.parentElement; i++) {
    const parent = current.parentElement;
    if (!parent || !parent.isConnected) break;

    const roleChildren = parent.querySelectorAll("[data-message-author-role]");
    if (roleChildren.length > 1) break;

    const textLen = (parent.innerText || "").trim().length;
    if (textLen > 20000) break;

    candidate = parent;
    current = parent;
  }

  return candidate;
}

function dedupeContainers(items) {
  const arr = [...new Set(items.filter(Boolean))];
  return arr.filter(
    (el) => !arr.some((other) => other !== el && other.contains(el)),
  );
}

function getRenderedTurns() {
  const messageNodes = getMessageNodes();

  const mapped = messageNodes.map((node, index) => {
    const container = getTurnContainer(node);
    const id = getStableTurnId(node, index);
    return { id, node, container };
  });

  const uniqueContainers = dedupeContainers(mapped.map((x) => x.container));

  const result = mapped.filter((item) =>
    uniqueContainers.includes(item.container),
  );

  result.sort((a, b) => {
    const ra = a.container.getBoundingClientRect();
    const rb = b.container.getBoundingClientRect();
    return ra.top - rb.top;
  });

  return result;
}

function canTrustConversationState(messageNodes, turns) {
  if (messageNodes.length > 0 || turns.length > 0) {
    hasSeenConversationContent = true;
  }
  return hasSeenConversationContent;
}

function shouldTrim(totalTurns) {
  return settings.enabled && totalTurns > settings.trimThreshold;
}

function safelyRemoveNode(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (!node.isConnected) return false;

  try {
    node.remove();
    return true;
  } catch (e) {
    log("remove failed", e);
    return false;
  }
}

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function looksLikeThoughtForText(text) {
  const t = normalizeText(text);
  if (!t) return false;

  return (
    t.startsWith("thought for ") ||
    t === "thought for" ||
    /^thought for \d+(\.\d+)?s$/.test(t) ||
    /^thought for \d+(\.\d+)? sec/.test(t) ||
    /^thought for \d+(\.\d+)? second/.test(t)
  );
}

function looksLikeFeedbackText(text) {
  const t = normalizeText(text);
  if (!t) return false;

  return (
    t === "good response" ||
    t === "bad response" ||
    t === "copy" ||
    t === "edit" ||
    t === "retry"
  );
}

function removeAuxUiInsideTurn(turnContainer) {
  if (!(turnContainer instanceof HTMLElement) || !turnContainer.isConnected)
    return;

  const selectors = [
    '[data-testid*="feedback"]',
    '[data-testid*="thumb"]',
    '[aria-label*="Good response"]',
    '[aria-label*="Bad response"]',
    '[aria-label*="Copy"]',
    '[aria-label*="Edit"]',
    '[aria-label*="Retry"]',
    'button[aria-label*="Good"]',
    'button[aria-label*="Bad"]',
  ];

  for (const selector of selectors) {
    turnContainer.querySelectorAll(selector).forEach((el) => {
      try {
        el.remove();
      } catch {}
    });
  }

  const textish = turnContainer.querySelectorAll("span, div, p");
  for (const el of textish) {
    const text = el.textContent || "";
    if (looksLikeThoughtForText(text) || looksLikeFeedbackText(text)) {
      try {
        el.remove();
      } catch {}
    }
  }
}

/**
 * Some "thought for ..." pills are rendered OUTSIDE the turn container.
 * This pass removes standalone aux UI globally.
 */
function removeStandaloneAuxUi() {
  const root = getConversationRoot();
  if (!root) return;

  const candidates = root.querySelectorAll("span, div, p, button");

  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;
    if (!el.isConnected || !isVisible(el)) continue;

    const text = el.textContent || "";
    const normalized = normalizeText(text);

    if (!normalized) continue;

    const isThought = looksLikeThoughtForText(normalized);
    const isFeedback = looksLikeFeedbackText(normalized);

    if (!isThought && !isFeedback) continue;

    const childElementCount = el.children.length;
    const textLen = normalized.length;

    if (childElementCount > 8 || textLen > 80) continue;

    try {
      el.remove();
    } catch {}
  }

  const extraSelectors = [
    '[data-testid*="feedback"]',
    '[data-testid*="thumb"]',
    '[aria-label*="Good response"]',
    '[aria-label*="Bad response"]',
  ];

  for (const selector of extraSelectors) {
    root.querySelectorAll(selector).forEach((el) => {
      try {
        el.remove();
      } catch {}
    });
  }
}

function trimTurn(turn) {
  const { id, container } = turn;
  if (!container || !container.isConnected) return false;
  if (removedTurnIds.has(id)) return false;

  removeAuxUiInsideTurn(container);

  const removed = safelyRemoveNode(container);
  if (!removed) return false;

  removedTurnIds.add(id);
  currentRemovedCount = removedTurnIds.size;
  return true;
}

function pruneStaleRemovedIds(turns) {
  const visibleIds = new Set(turns.map((t) => t.id));
  let changed = false;

  for (const id of [...removedTurnIds]) {
    if (visibleIds.has(id)) {
      removedTurnIds.delete(id);
      changed = true;
    }
  }

  if (changed) {
    currentRemovedCount = removedTurnIds.size;
    savePageState();
  }
}

function applyTrim() {
  if (!document.body) return;

  const messageNodes = getMessageNodes();
  const turns = getRenderedTurns();

  log("detected message nodes:", messageNodes.length, "turns:", turns.length);

  const ready = canTrustConversationState(messageNodes, turns);
  if (!ready) {
    sendBadgeUpdate();
    return;
  }

  maxObservedTurns = Math.max(maxObservedTurns, turns.length);

  pruneStaleRemovedIds(turns);

  if (!shouldTrim(turns.length)) {
    removeStandaloneAuxUi();
    sendBadgeUpdate();
    return;
  }

  const trimCount = Math.max(0, turns.length - settings.keepCount);
  const toTrim = turns.slice(0, trimCount);

  let changed = false;
  for (const turn of toTrim) {
    const removed = trimTurn(turn);
    if (removed) changed = true;
  }

  removeStandaloneAuxUi();

  if (changed) {
    savePageState();
  }

  sendBadgeUpdate();
}

function checkForPageChange() {
  if (location.pathname === lastKnownPath) return;

  lastKnownPath = location.pathname;
  hasSeenConversationContent = false;
  maxObservedTurns = 0;

  loadPageState();
  sendBadgeUpdate();
  debounceApply();
}

async function loadSettings() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  settings = { ...DEFAULTS, ...data };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "applyNow") {
    debounceApply();
    sendResponse({ ok: true });
    return true;
  }

  if (msg?.type === "getRemovedCount") {
    sendResponse({
      ok: true,
      count: currentRemovedCount,
    });
    return true;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;

  const wasEnabled = settings.enabled;

  for (const [key, value] of Object.entries(changes)) {
    settings[key] = value.newValue;
  }

  if (wasEnabled && !settings.enabled) {
    currentRemovedCount = 0;
    removedTurnIds.clear();
    maxObservedTurns = 0;
    savePageState();
    sendBadgeUpdate(0);
    return;
  }

  debounceApply();
});

async function init() {
  await loadSettings();
  loadPageState();
  sendBadgeUpdate();

  applyTrim();

  observer = new MutationObserver(() => {
    checkForPageChange();
    debounceApply();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  navInterval = setInterval(checkForPageChange, 500);
}

init().catch((err) => console.error(err));
