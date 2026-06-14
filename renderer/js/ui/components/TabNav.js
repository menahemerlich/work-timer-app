import { blurHiddenPanelFields } from "./FocusGuard.js";

export class TabNav {
  constructor() {
    this.tabs = document.querySelectorAll("[data-tab]");
    this.panels = document.querySelectorAll("[data-panel]");
    this.onChange = null;
  }

  init(onChange) {
    this.onChange = onChange;
    this.tabs.forEach((tab) => {
      tab.addEventListener("click", () => this.activate(tab.dataset.tab));
    });
    document.body.dataset.activeTab = "timer";
    this.syncPanelState("timer");
  }

  activate(tabId) {
    blurHiddenPanelFields();
    this.syncPanelState(tabId);
    document.body.dataset.activeTab = tabId;

    if (this.onChange) {
      this.onChange(tabId);
    }
  }

  syncPanelState(tabId) {
    this.tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === tabId);
    });

    this.panels.forEach((panel) => {
      const isActive = panel.dataset.panel === tabId;
      panel.classList.toggle("active", isActive);
      panel.toggleAttribute("inert", !isActive);
      if (isActive) {
        panel.scrollTop = 0;
      }
    });

    blurHiddenPanelFields();
  }
}
