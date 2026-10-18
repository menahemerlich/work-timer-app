import { getCurrentRate } from "../../core/utils/employerRates.js";
import { formatMoney } from "../../core/utils/projectBilling.js";
import { formatHebrewDateFromInput } from "../../core/utils/dateParse.js";

export class SettingsView {
  constructor() {
    this.employerNameInput = document.getElementById("employerNameInput");
    this.addEmployerBtn = document.getElementById("addEmployerBtn");
    this.employersList = document.getElementById("employersList");
    this.feedbackEl = document.getElementById("settingsFeedback");
    this.settingsPanel = document.getElementById("settingsPanel");
    this.hardPullBtn = document.getElementById("hardPullBtn");
    this.monthlyTargetHoursPerDayInput = document.getElementById("monthlyTargetHoursPerDay");
    this.earningsWindowCornerSelect = document.getElementById("earningsWindowCorner");
    this.openEarningsBtn = document.getElementById("openEarningsBtn");
    this.motivationPositionSelect = document.getElementById("motivationPosition");
    this.motivationIntervalInput = document.getElementById("motivationInterval");
    this.motivationDurationInput = document.getElementById("motivationDuration");
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

  createRaisesList(employer, onRemoveRaise) {
    const list = document.createElement("ul");
    list.className = "employer-raises";

    const base = document.createElement("li");
    base.className = "employer-raise employer-raise-base";
    base.textContent = `בסיס: ${employer.hourlyRate === null ? "לא הוגדר" : formatMoney(employer.hourlyRate)}`;
    list.appendChild(base);

    employer.rateChanges.forEach((change) => {
      const item = document.createElement("li");
      item.className = "employer-raise";

      const text = document.createElement("span");
      text.textContent = `${formatMoney(change.rate)} מ־${formatHebrewDateFromInput(change.from)}`;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "employer-raise-remove";
      removeBtn.title = "מחיקת עדכון השכר";
      removeBtn.setAttribute("aria-label", "מחיקת עדכון השכר");
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => onRemoveRaise?.(employer.id, change.from));

      item.append(text, removeBtn);
      list.appendChild(item);
    });

    return list;
  }

  renderEmployers(
    employers,
    {
      editingId,
      onStartEdit,
      onSaveEdit,
      onCancelEdit,
      onDelete,
      onSetHourlyRate,
      onAddRaise,
      onRemoveRaise,
      getProjects = () => [],
      getProjectStats = () => null,
      onAddProject,
      onUpdateProject,
      onDeleteProject
    }
  ) {
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
          <button type="button" class="btn-small btn-raise" title="עדכון שכר מתאריך מסוים">💰 עדכון שכר</button>
        `;

        const rateInput = rateRow.querySelector(".employer-rate-input");
        rateInput.value = getCurrentRate(employer) ?? "";
        rateInput.addEventListener("change", () => {
          const raw = rateInput.value;
          const num = raw === "" ? null : Number(raw);
          onSetHourlyRate?.(employer.id, Number.isFinite(num) ? num : null);
        });
        rateRow.querySelector(".btn-raise").addEventListener("click", () => onAddRaise?.(employer.id));

        nameBlock.appendChild(rateRow);
        if (employer.rateChanges?.length) {
          nameBlock.appendChild(this.createRaisesList(employer, onRemoveRaise));
        }
        nameBlock.appendChild(
          this.createProjectsBlock(employer, {
            projects: getProjects(employer.id),
            getProjectStats,
            onAddProject,
            onUpdateProject,
            onDeleteProject
          })
        );
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

  createBillingSelect(value) {
    const select = document.createElement("select");
    select.className = "project-billing-select";
    select.innerHTML = `
      <option value="hourly">לפי שעה</option>
      <option value="fixed">לפי עבודה</option>
      <option value="unit">לפי יחידה</option>
    `;
    select.value = ["fixed", "unit"].includes(value) ? value : "hourly";
    return select;
  }

  createPriceInput(value, { placeholder = "₪ לעבודה", title = "כמה אתה לוקח על העבודה" } = {}) {
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "decimal";
    input.step = "0.01";
    input.min = "0";
    input.className = "project-price-input";
    input.placeholder = placeholder;
    input.title = title;
    input.value = value ?? "";
    return input;
  }

  createUnitNameInput(value, { placeholder = "ברבים (תיקים)", title = "שם היחידה ברבים, לדוגמה: תיקים" } = {}) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "project-unit-name-input";
    input.placeholder = placeholder;
    input.title = title;
    input.value = value || "";
    return input;
  }

  readPrice(input) {
    const raw = input.value;
    if (raw === "") {
      return null;
    }
    const num = Number(raw);
    return Number.isFinite(num) ? num : NaN;
  }

  /** Price/unit fields that depend on the billing type; returns { elements, sync, read }. */
  createBillingFields(project = null) {
    const fixedPrice = this.createPriceInput(project?.fixedPrice ?? null);
    const unitSingular = this.createUnitNameInput(project?.unitSingular, {
      placeholder: "ביחיד (תיק)",
      title: "שם היחידה ביחיד, לדוגמה: תיק"
    });
    const unitName = this.createUnitNameInput(project?.unitName);
    const unitPrice = this.createPriceInput(project?.unitPrice ?? null, {
      placeholder: "₪ ליחידה",
      title: "כמה אתה מקבל על כל יחידה"
    });

    const sync = (billingType) => {
      fixedPrice.hidden = billingType !== "fixed";
      unitName.hidden = billingType !== "unit";
      unitSingular.hidden = billingType !== "unit";
      unitPrice.hidden = billingType !== "unit";
    };

    const read = (billingType) => ({
      fixedPrice: billingType === "fixed" ? this.readPrice(fixedPrice) : null,
      unitPrice: billingType === "unit" ? this.readPrice(unitPrice) : null,
      unitName: billingType === "unit" ? unitName.value.trim() || null : null,
      unitSingular: billingType === "unit" ? unitSingular.value.trim() || null : null
    });

    return {
      fixedPrice,
      unitName,
      unitSingular,
      unitPrice,
      elements: [fixedPrice, unitSingular, unitName, unitPrice],
      sync,
      read
    };
  }

  createProjectsBlock(employer, { projects, getProjectStats, onAddProject, onUpdateProject, onDeleteProject }) {
    this.openProjectBlocks ??= new Set();

    const details = document.createElement("details");
    details.className = "employer-projects";
    details.open = this.openProjectBlocks.has(employer.id);
    details.addEventListener("toggle", () => {
      if (details.open) {
        this.openProjectBlocks.add(employer.id);
      } else {
        this.openProjectBlocks.delete(employer.id);
      }
    });

    const summary = document.createElement("summary");
    summary.className = "employer-projects-summary";
    summary.textContent = projects.length ? `📁 פרויקטים (${projects.length})` : "📁 פרויקטים";
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "project-list";

    if (!projects.length) {
      const empty = document.createElement("p");
      empty.className = "project-empty";
      empty.textContent = "אין פרויקטים — עבודה בלי פרויקט נספרת לפי התעריף לשעה.";
      list.appendChild(empty);
    }

    projects.forEach((project) => {
      const row = document.createElement("div");
      row.className = `project-row${project.isFixed ? " is-fixed" : ""}${project.isUnit ? " is-unit" : ""}`;

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "project-name-input";
      nameInput.value = project.name;
      nameInput.addEventListener("change", () => {
        onUpdateProject?.(project.id, { name: nameInput.value });
      });

      const billingSelect = this.createBillingSelect(project.billingType);
      const billing = this.createBillingFields(project);
      billing.sync(project.billingType);

      billingSelect.addEventListener("change", () => {
        onUpdateProject?.(project.id, { billingType: billingSelect.value });
      });
      billing.fixedPrice.addEventListener("change", () => {
        onUpdateProject?.(project.id, { fixedPrice: this.readPrice(billing.fixedPrice) });
      });
      billing.unitPrice.addEventListener("change", () => {
        onUpdateProject?.(project.id, { unitPrice: this.readPrice(billing.unitPrice) });
      });
      billing.unitName.addEventListener("change", () => {
        onUpdateProject?.(project.id, { unitName: billing.unitName.value.trim() || null });
      });
      billing.unitSingular.addEventListener("change", () => {
        onUpdateProject?.(project.id, { unitSingular: billing.unitSingular.value.trim() || null });
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn-small btn-delete-employer project-delete-btn";
      deleteBtn.textContent = "מחק";
      deleteBtn.addEventListener("click", () => onDeleteProject?.(project.id));

      const fields = document.createElement("div");
      fields.className = "project-fields";
      fields.append(nameInput, billingSelect, ...billing.elements, deleteBtn);
      row.appendChild(fields);

      const stats = getProjectStats(project);
      if (stats) {
        const statsEl = document.createElement("div");
        statsEl.className = "project-stats";
        statsEl.textContent = stats;
        row.appendChild(statsEl);
      }

      list.appendChild(row);
    });

    details.appendChild(list);

    const addRow = document.createElement("div");
    addRow.className = "project-fields project-add-row";

    const newName = document.createElement("input");
    newName.type = "text";
    newName.className = "project-name-input";
    newName.placeholder = "שם פרויקט חדש…";
    newName.autocomplete = "off";

    const newBilling = this.createBillingSelect("hourly");
    const newBillingFields = this.createBillingFields();
    newBillingFields.sync("hourly");
    newBilling.addEventListener("change", () => newBillingFields.sync(newBilling.value));

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn-small btn-save-employer";
    addBtn.textContent = "+ הוסף";

    const submit = () => {
      onAddProject?.(employer.id, {
        name: newName.value,
        billingType: newBilling.value,
        ...newBillingFields.read(newBilling.value)
      });
    };
    addBtn.addEventListener("click", submit);
    newName.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });

    addRow.append(newName, newBilling, ...newBillingFields.elements, addBtn);
    details.appendChild(addRow);

    return details;
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
