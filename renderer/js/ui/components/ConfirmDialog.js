import { releaseTrappedFocus, restoreFieldFocus } from "./FocusGuard.js";

let modalRef = null;

export function initConfirmDialog(modal) {
  modalRef = modal;
}

export function confirmDialog(message) {
  if (!modalRef) {
    const result = window.confirm(message);
    releaseTrappedFocus();
    return Promise.resolve(result);
  }

  return new Promise((resolve) => {
    let settled = false;

    const settle = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    modalRef.show({
      title: "אישור פעולה",
      bodyHtml: `<p class="modal-hint">${escapeHtml(message)}</p>`,
      confirmText: "אישור",
      onConfirm: () => {
        modalRef.hide();
        settle(true);
      },
      onDismiss: () => {
        settle(false);
      }
    });
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function refocusSettingsInput() {
  const input = document.getElementById("employerNameInput");
  restoreFieldFocus(input);
}
