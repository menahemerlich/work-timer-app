import { LocalStorageAdapter } from "./data/repositories/LocalStorageAdapter.js";
import { EmployerRepository, SettingsRepository } from "./data/repositories/EmployerRepository.js";
import { LogRepository } from "./data/repositories/LogRepository.js";
import { TimerStateRepository } from "./data/repositories/TimerStateRepository.js";
import { DataMigrator } from "./data/migration/DataMigrator.js";
import { TimerService } from "./core/services/TimerService.js";
import { ReportSummaryService } from "./core/services/ReportSummaryService.js";
import { LogValidationService } from "./core/services/LogValidationService.js";
import { CsvExporter } from "./export/CsvExporter.js";
import { CsvImporter } from "./export/CsvImporter.js";
import { JsonBackupService } from "./export/JsonBackupService.js";
import { TabNav } from "./ui/components/TabNav.js";
import { Modal } from "./ui/components/Modal.js";
import { initFocusGuard } from "./ui/components/FocusGuard.js";
import { initConfirmDialog } from "./ui/components/ConfirmDialog.js";
import { TimerView } from "./ui/views/TimerView.js";
import { ReportsView } from "./ui/views/ReportsView.js";
import { SettingsView } from "./ui/views/SettingsView.js";
import { TimerController } from "./ui/controllers/TimerController.js";
import { ReportsController } from "./ui/controllers/ReportsController.js";
import { SettingsController } from "./ui/controllers/SettingsController.js";

const storage = new LocalStorageAdapter();
const settingsRepo = new SettingsRepository(storage);
const employerRepo = new EmployerRepository(storage);
const logRepo = new LogRepository(storage);
const timerStateRepo = new TimerStateRepository(storage);

DataMigrator.run({ logRepo, settingsRepo });

const timerService = new TimerService({ timerStateRepo, logRepo });
const reportService = new ReportSummaryService();
const validationService = new LogValidationService();
const csvExporter = new CsvExporter();
const csvImporter = new CsvImporter({ logRepo });
const jsonBackupService = new JsonBackupService({ logRepo, settingsRepo });

const tabNav = new TabNav();
const modal = new Modal("appModal");

const timerView = new TimerView();
const reportsView = new ReportsView();
const settingsView = new SettingsView();

const reportsController = new ReportsController({
  view: reportsView,
  modal,
  logRepo,
  employerRepo,
  reportService,
  validationService,
  csvExporter,
  csvImporter,
  jsonBackupService
});

const settingsController = new SettingsController({
  view: settingsView,
  employerRepo,
  onEmployersChanged: () => reportsController.refresh()
});

const timerController = new TimerController({
  view: timerView,
  modal,
  timerService,
  employerRepo,
  onLogAdded: () => reportsController.refresh(),
  onEmployersChanged: () => {
    settingsController.refresh();
    reportsController.refresh();
  }
});

function safeInit(label, initFn) {
  try {
    initFn();
  } catch (error) {
    console.error(`Init failed: ${label}`, error);
    alert(`שגיאה בטעינת ${label}: ${error.message}`);
  }
}

initFocusGuard();
initConfirmDialog(modal);
tabNav.init();

safeInit("הגדרות", () => settingsController.init());
safeInit("דוחות", () => reportsController.init());
safeInit("טיימר", () => timerController.init());
