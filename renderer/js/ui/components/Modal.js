import {
  blurHiddenPanelFields,
  releaseTrappedFocus,
  restoreFieldFocus,
  setModalOpen
} from "./FocusGuard.js";

export class Modal {
  constructor(rootId) {
    this.root = document.getElementById(rootId);
    this.titleEl = this.root.querySelector("[data-modal-title]");
    this.bodyEl = this.root.querySelector("[data-modal-body]");
    this.confirmBtn = this.root.querySelector("[data-modal-confirm]");
    this.cancelBtn = this.root.querySelector("[data-modal-cancel]");
    this.closeBtn = this.root.querySelector("[data-modal-close]");
    this.onConfirm = null;
    this.onDismiss = null;

    this.confirmBtn.addEventListener("click", () => this.handleConfirm());
    this.cancelBtn.addEventListener("click", () => this.dismiss());
    this.closeBtn.addEventListener("click", () => this.dismiss());
    this.root.addEventListener("click", (event) => {
      if (event.target === this.root) {
        this.dismiss();
      }
    });

    this.bodyEl.addEventListener("mousedown", (event) => {
      const field = event.target.closest("input, select, textarea");
      if (field) {
        field.focus({ preventScroll: true });
      }
    });

    this.bodyEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) {
        return;
      }

      const field = event.target.closest("input, select, textarea");
      if (field && field.tagName === "INPUT" && field.type === "text") {
        event.preventDefault();
        event.stopPropagation();
        this.handleConfirm(field);
      }
    });
  }

  handleConfirm(preferredField = null) {
    if (this.onConfirm) {
      this.onConfirm(preferredField);
    }

    if (this.root.classList.contains("open") && preferredField) {
      restoreFieldFocus(preferredField);
    }
  }

  dismiss() {
    if (!this.root.classList.contains("open")) {
      return;
    }

    const dismissHandler = this.onDismiss;
    this.hide();
    dismissHandler?.();
  }

  show({
    title,
    bodyHtml,
    confirmText = "אישור",
    onConfirm,
    onDismiss = null,
    hideConfirm = false
  }) {
    releaseTrappedFocus();

    this.titleEl.textContent = title;
    this.bodyEl.innerHTML = bodyHtml;
    this.confirmBtn.textContent = confirmText;
    this.confirmBtn.style.display = hideConfirm ? "none" : "inline-flex";
    this.onConfirm = onConfirm;
    this.onDismiss = onDismiss;
    this.root.classList.add("open");
    setModalOpen(true);
    this.focusFirstField();
  }

  focusFirstField() {
    const field = this.bodyEl.querySelector("input, select, textarea");
    if (field) {
      restoreFieldFocus(field);
      return;
    }

    this.confirmBtn.focus({ preventScroll: true });
  }

  focusField(fieldOrId) {
    const field =
      typeof fieldOrId === "string" ? document.getElementById(fieldOrId) : fieldOrId;
    restoreFieldFocus(field);
  }

  showFeedback(message, type = "error") {
    let feedback = this.bodyEl.querySelector("[data-modal-feedback]");

    if (!feedback) {
      feedback = document.createElement("div");
      feedback.dataset.modalFeedback = "";
      feedback.className = "modal-feedback";
      this.bodyEl.prepend(feedback);
    }

    feedback.textContent = message;
    feedback.className = `modal-feedback is-${type}`;
    feedback.hidden = false;
  }

  hide() {
    if (!this.root.classList.contains("open")) {
      return;
    }

    this.root.classList.remove("open");
    setModalOpen(false);
    this.onConfirm = null;
    this.onDismiss = null;
    releaseTrappedFocus();
  }
}
