const toast = document.getElementById("toast");
const toastText = document.getElementById("toastText");

const EMOJI_REGEX =
  /(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*[\ufe0f\u20e3]*|\p{Regional_Indicator}{2})/gu;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderPhraseHtml(phrase) {
  return escapeHtml(phrase).replace(
    EMOJI_REGEX,
    (match) => `<span class="toast-emoji">${match}</span>`
  );
}

function showPhrase(payload) {
  const phrase = typeof payload === "string" ? payload : payload?.phrase;

  if (phrase) {
    toastText.innerHTML = renderPhraseHtml(phrase);
  }

  // Reset to the off-screen-right start state before animating in.
  toast.classList.remove("visible", "leaving");
  // Force a reflow so the next class change triggers a transition.
  void toast.offsetWidth;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add("visible");
    });
  });
}

function hideToast() {
  toast.classList.remove("visible");
  toast.classList.add("leaving");
}

if (window.electronAPI?.motivation?.onShow) {
  window.electronAPI.motivation.onShow((payload) => showPhrase(payload));
}

if (window.electronAPI?.motivation?.onHide) {
  window.electronAPI.motivation.onHide(() => hideToast());
}
