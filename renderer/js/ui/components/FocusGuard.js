let modalRoot = null;
let modalOpen = false;

export function initFocusGuard({
  modalId = "appModal",
  appShellSelector = ".app-shell"
} = {}) {
  modalRoot = document.getElementById(modalId);
  document.querySelector(appShellSelector);

  document.body.classList.remove("modal-open");
  modalRoot?.classList.remove("open");
  modalOpen = false;

  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (!target || target === document.body) {
        return;
      }

      if (modalOpen) {
        if (!modalRoot?.contains(target)) {
          target.blur?.();
          focusModalField();
        }
        return;
      }

      if (modalRoot?.contains(target)) {
        target.blur?.();
        focusVisibleAppControl();
        return;
      }

      if (target.closest(".tab-panel:not(.active)")) {
        target.blur?.();
        focusVisibleAppControl();
      }
    },
    true
  );
}

export function setModalOpen(isOpen) {
  modalOpen = isOpen;
  document.body.classList.toggle("modal-open", isOpen);

  if (!isOpen) {
    modalRoot?.classList.remove("open");
  }
}

export function blurHiddenPanelFields() {
  document
    .querySelectorAll(
      ".tab-panel:not(.active) input, .tab-panel:not(.active) select, .tab-panel:not(.active) textarea"
    )
    .forEach((field) => {
      if (document.activeElement === field) {
        field.blur();
      }
    });
}

export function releaseTrappedFocus() {
  const active = document.activeElement;

  if (active && active !== document.body) {
    const isHiddenModal = modalRoot?.contains(active);
    const isHiddenPanel = active.closest?.(".tab-panel:not(.active)");
    const isDetached = !document.body.contains(active);

    if (isHiddenModal || isHiddenPanel || isDetached) {
      active.blur();
    }
  }

  blurHiddenPanelFields();
  focusVisibleAppControl();
}

export function restoreFieldFocus(field) {
  if (!field || !document.body.contains(field)) {
    return;
  }

  requestAnimationFrame(() => {
    field.focus({ preventScroll: true });
    setTimeout(() => {
      if (document.body.contains(field)) {
        field.focus({ preventScroll: true });
      }
    }, 0);
  });
}

function focusVisibleAppControl() {
  const activeTab = document.body.dataset.activeTab;

  if (activeTab === "settings") {
    const settingsInput = document.getElementById("employerNameInput");
    if (settingsInput) {
      settingsInput.focus({ preventScroll: true });
      return;
    }
  }

  document.querySelector(".tab-btn.active")?.focus({ preventScroll: true });
}

function focusModalField() {
  const field = modalRoot?.querySelector(
    "[data-modal-body] input, [data-modal-body] select, [data-modal-body] textarea"
  );
  if (field) {
    field.focus({ preventScroll: true });
    return;
  }

  modalRoot?.querySelector("[data-modal-confirm]")?.focus({ preventScroll: true });
}
