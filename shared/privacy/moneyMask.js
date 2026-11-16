// Blurs every money amount on the page until the user reads "מזמור לתודה" in the gate window.
// Amounts are found automatically ("₪1,234.50" in any text node) or marked explicitly with
// [data-money]. Anything inside [data-money-skip] is left alone (e.g. the charts page, which
// has its own lock), and so are form fields.

const MONEY_RE = /-?₪\s?-?\d(?:[\d,.]*\d)?/g;
const SKIP_SELECTOR =
  "script, style, textarea, input, select, option, svg, [contenteditable], [data-money-skip], .money-mask";
const REVEALED_CLASS = "money-revealed";

let revealedUntil = 0;
let expiryTimer = null;
let pillTimer = null;
let pill = null;
const listeners = new Set();

function privacyApi() {
  return window.electronAPI?.privacy;
}

export function isMoneyRevealed() {
  return revealedUntil > Date.now();
}

/** Calls back with true/false whenever amounts become visible or hidden. Returns an unsubscribe. */
export function onMoneyRevealChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function requestMoneyReveal() {
  privacyApi()?.requestReveal("reveal");
}

function createMask(text) {
  const mask = document.createElement("span");
  mask.className = "money-mask";
  const value = document.createElement("span");
  value.className = "money-mask__value";
  value.textContent = text;
  mask.appendChild(value);
  return mask;
}

function maskTextNode(node) {
  const text = node.nodeValue;
  MONEY_RE.lastIndex = 0;
  if (!MONEY_RE.test(text)) {
    return;
  }

  const fragment = document.createDocumentFragment();
  let last = 0;
  MONEY_RE.lastIndex = 0;
  for (const match of text.matchAll(MONEY_RE)) {
    if (match.index > last) {
      fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    fragment.appendChild(createMask(match[0]));
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(last)));
  }
  node.replaceWith(fragment);
}

/** [data-money] elements: the whole content is the amount. */
function maskExplicit(el) {
  if (el.closest("[data-money-skip]")) {
    return;
  }
  el.classList.add("money-mask");
  const only = el.childNodes.length === 1 ? el.firstChild : null;
  if (only?.nodeType === Node.ELEMENT_NODE && only.classList.contains("money-mask__value")) {
    return;
  }
  const value = document.createElement("span");
  value.className = "money-mask__value";
  while (el.firstChild) {
    value.appendChild(el.firstChild);
  }
  el.appendChild(value);
}

function shouldSkipText(node) {
  const parent = node.parentElement;
  return !parent || Boolean(parent.closest(SKIP_SELECTOR));
}

function scan(root) {
  if (!root) {
    return;
  }

  if (root.nodeType === Node.TEXT_NODE) {
    if (!shouldSkipText(root)) {
      maskTextNode(root);
    }
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return;
  }

  if (root.matches?.("[data-money]")) {
    maskExplicit(root);
  }
  root.querySelectorAll?.("[data-money]").forEach(maskExplicit);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.nodeValue.includes("₪") && !shouldSkipText(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
  });
  const found = [];
  while (walker.nextNode()) {
    found.push(walker.currentNode);
  }
  found.forEach(maskTextNode);
}

function handleMutations(mutations) {
  for (const mutation of mutations) {
    if (mutation.type === "characterData") {
      scan(mutation.target);
      continue;
    }
    // Content of an explicit amount was replaced (e.g. textContent = ...): wrap it again.
    const explicit = mutation.target.closest?.("[data-money]");
    if (explicit) {
      maskExplicit(explicit);
    }
    mutation.addedNodes.forEach((node) => {
      if (node.isConnected) {
        scan(node);
      }
    });
  }
}

/** Clicking a hidden amount (or its eye) opens the psalm gate instead of the normal action. */
function interceptClick(event) {
  if (isMoneyRevealed()) {
    return;
  }
  const mask = event.target.closest?.(".money-mask");
  if (!mask || mask.closest("[data-money-skip]")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.type === "click") {
    requestMoneyReveal();
  }
}

function renderPill() {
  if (!pill) {
    return;
  }
  const seconds = Math.max(0, Math.ceil((revealedUntil - Date.now()) / 1000));
  pill.querySelector(".money-pill__count").textContent = String(seconds);
}

function applyState() {
  const revealed = isMoneyRevealed();
  document.documentElement.classList.toggle(REVEALED_CLASS, revealed);

  clearTimeout(expiryTimer);
  clearInterval(pillTimer);
  if (revealed) {
    expiryTimer = setTimeout(applyState, revealedUntil - Date.now() + 20);
    if (pill) {
      renderPill();
      pillTimer = setInterval(renderPill, 250);
    }
  }
  if (pill) {
    pill.hidden = !revealed;
  }

  listeners.forEach((callback) => {
    try {
      callback(revealed);
    } catch (error) {
      console.error("money reveal listener failed:", error);
    }
  });
}

function setState(state) {
  revealedUntil = Number(state?.revealedUntil) || 0;
  applyState();
}

function createPill() {
  const el = document.createElement("div");
  el.className = "money-pill";
  el.setAttribute("data-money-skip", "");
  el.setAttribute("role", "status");
  el.hidden = true;
  el.innerHTML = `
    <span class="money-pill__icon" aria-hidden="true"></span>
    <span>הסכומים גלויים עוד <b class="money-pill__count">15</b> שניות</span>
    <button type="button" class="money-pill__hide">הסתר עכשיו</button>
  `;
  el.querySelector(".money-pill__hide").addEventListener("click", () => privacyApi()?.hideNow());
  document.body.appendChild(el);
  return el;
}

/**
 * Starts masking amounts on this page.
 * @param {{ showPill?: boolean }} options showPill adds a "visible for N seconds" badge.
 */
export function initMoneyMask({ showPill = false } = {}) {
  if (showPill) {
    pill = createPill();
  }

  scan(document.body);
  new MutationObserver(handleMutations).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  document.addEventListener("click", interceptClick, true);
  document.addEventListener("mousedown", interceptClick, true);
  document.addEventListener("dblclick", interceptClick, true);

  const api = privacyApi();
  if (!api) {
    return;
  }
  api.onState(setState);
  api
    .getState()
    .then(setState)
    .catch((error) => console.error("privacy:getState failed:", error));
}
