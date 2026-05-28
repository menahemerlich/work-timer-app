export class SettingsView {
  constructor() {
    this.employerNameInput = document.getElementById("employerNameInput");
    this.addEmployerBtn = document.getElementById("addEmployerBtn");
    this.employersList = document.getElementById("employersList");
    this.feedbackEl = document.getElementById("settingsFeedback");
    this.settingsPanel = document.getElementById("settingsPanel");
    this.hardPullBtn = document.getElementById("hardPullBtn");
    this.monthlyTargetDaysInput = document.getElementById("monthlyTargetDays");
    this.monthlyTargetHoursPerDayInput = document.getElementById("monthlyTargetHoursPerDay");
  }

  showFeedback(message, type = "success") {
    if (!this.feedbackEl) {
      return;
    }

    this.feedbackEl.textContent = message;
    this.feedbackEl.className = `settings-feedback is-${type}`;
    this.feedbackEl.hidden = false;

    clearTimeout(this.feedbackTimeout);
    this.feedbackTimeout = setTimeout(() => {
      this.feedbackEl.hidden = true;
    }, 2500);
  }

  renderEmployers(employers, { editingId, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onSetHourlyRate }) {
    this.preserveFocusBeforeListUpdate();
    this.employersList.innerHTML = "";

    if (!employers.length) {
      this.employersList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏢</div>
          <p>אין מעסיקים עדיין — הוסף את הראשון!</p>
        </div>`;
      return;
    }

    employers.forEach((employer) => {
      const isEditing = employer.id === editingId;
      const item = document.createElement("div");
      item.className = `employer-item${isEditing ? " is-editing" : ""}`;

      const nameBlock = document.createElement("div");
      nameBlock.className = "employer-name-block";

      if (isEditing) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "employer-name-input";
        input.value = employer.name;
        input.dataset.id = employer.id;
        nameBlock.appendChild(input);

        requestAnimationFrame(() => {
          input.focus();
          input.select();
        });

        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSaveEdit(employer.id, input.value);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancelEdit();
          }
        });
      } else {
        const nameRow = document.createElement("div");
        nameRow.className = "employer-name-row";

        if (employer.color) {
          const swatch = document.createElement("span");
          swatch.className = "employer-color-swatch";
          swatch.style.backgroundColor = employer.color;
          swatch.title = "צבע בדוחות";
          nameRow.appendChild(swatch);
        }

        const nameEl = document.createElement("span");
        nameEl.className = "employer-name";
        nameEl.textContent = employer.name;
        nameRow.appendChild(nameEl);
        nameBlock.appendChild(nameRow);

        const rateRow = document.createElement("div");
        rateRow.className = "employer-rate-row";
        rateRow.innerHTML = `
          <label class="employer-rate-label">₪ לשעה</label>
          <input class="employer-rate-input" type="number" inputmode="decimal" step="0.01" min="0" placeholder="לדוגמה: 75" />
        `;

        const rateInput = rateRow.querySelector(".employer-rate-input");
        rateInput.value = employer.hourlyRate ?? "";
        rateInput.addEventListener("change", () => {
          const raw = rateInput.value;
          const num = raw === "" ? null : Number(raw);
          onSetHourlyRate?.(employer.id, Number.isFinite(num) ? num : null);
        });

        nameBlock.appendChild(rateRow);
      }

      const actions = document.createElement("div");
      actions.className = "employer-actions";

      if (isEditing) {
        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "btn-small btn-save-employer";
        saveBtn.textContent = "שמור";
        saveBtn.addEventListener("click", () => {
          const input = item.querySelector(".employer-name-input");
          onSaveEdit(employer.id, input.value);
        });

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn-small btn-cancel-employer";
        cancelBtn.textContent = "ביטול";
        cancelBtn.addEventListener("click", () => onCancelEdit());

        actions.append(saveBtn, cancelBtn);
      } else {
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn-small btn-edit";
        editBtn.textContent = "ערוך";
        editBtn.addEventListener("click", () => onStartEdit(employer.id));

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn-small btn-delete-employer";
        deleteBtn.textContent = "מחק";
        deleteBtn.addEventListener("click", () => onDelete(employer.id));

        actions.append(editBtn, deleteBtn);
      }

      item.append(nameBlock, actions);
      this.employersList.appendChild(item);
    });
  }

  clearInput() {
    this.employerNameInput.value = "";
  }

  getInputValue() {
    return this.employerNameInput.value.trim();
  }

  preserveFocusBeforeListUpdate() {
    const active = document.activeElement;
    if (active && this.employersList.contains(active)) {
      this.employerNameInput?.focus({ preventScroll: true });
    }
  }
}
