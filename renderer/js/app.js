import { LogRepository } from "./data/repositories/LogRepository.js";
import { EmployerRepository, SettingsRepository } from "./data/repositories/EmployerRepository.js";
import { TimerStateRepository } from "./data/repositories/TimerStateRepository.js";
import { ProjectRepository } from "./data/repositories/ProjectRepository.js";
import { DataMigrator } from "./data/migration/DataMigrator.js";
import { TimerService } from "./core/services/TimerService.js";
import { ReportSummaryService } from "./core/services/ReportSummaryService.js";
import { ChartDataService } from "./core/services/ChartDataService.js";
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
import { AuthController } from "./ui/controllers/AuthController.js";
import { SyncStatusController } from "./ui/controllers/SyncStatusController.js";
import { ChartsController } from "./ui/controllers/ChartsController.js";

const settingsRepo = new SettingsRepository();
const employerRepo = new EmployerRepository(settingsRepo);
const logRepo = new LogRepository();
const projectRepo = new ProjectRepository();
const timerStateRepo = new TimerStateRepository();

let timerService = null;
let reportsController = null;

async function bootstrapRepositories() {
  await logRepo.init();
  await employerRepo.init();
  await projectRepo.init();
  await timerStateRepo.init();
  await DataMigrator.run({ logRepo, settingsRepo });
}

async function startApp() {
  try {
    await bootstrapRepositories();
  } catch (error) {
    console.error("Bootstrap failed:", error);
    alert(`שגיאה בטעינת הנתונים: ${error.message}`);
    return;
  }

  timerService = new TimerService({ timerStateRepo, logRepo });
  const reportService = new ReportSummaryService();
  const validationService = new LogValidationService();
  const csvExporter = new CsvExporter();
  const csvImporter = new CsvImporter({ logRepo });
  const jsonBackupService = new JsonBackupService({ logRepo, settingsRepo, projectRepo });

  const tabNav = new TabNav();
  const modal = new Modal("appModal");

  const timerView = new TimerView();
  const reportsView = new ReportsView();
  const settingsView = new SettingsView();

  reportsController = new ReportsController({
    view: reportsView,
    modal,
    logRepo,
    employerRepo,
    projectRepo,
    reportService,
    validationService,
    csvExporter,
    csvImporter,
    jsonBackupService
  });

  const settingsController = new SettingsController({
    view: settingsView,
    employerRepo,
    projectRepo,
    logRepo,
    modal,
    onEmployersChanged: () => reportsController.refresh()
  });

  const timerController = new TimerController({
    view: timerView,
    modal,
    timerService,
    employerRepo,
    projectRepo,
    logRepo,
    reportService,
    onLogAdded: () => reportsController.refresh(),
    onEmployersChanged: () => {
      settingsController.refresh();
      reportsController.refresh();
    }
  });

  const chartsController = new ChartsController({
    logRepo,
    employerRepo,
    projectRepo,
    chartDataService: new ChartDataService()
  });

  const authController = new AuthController({ modal });
  const syncStatusController = new SyncStatusController();

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
  tabNav.init((tabId) => chartsController.onTabChange(tabId));

  document.getElementById("windowMinimizeBtn")?.addEventListener("click", () => {
    window.electronAPI?.window?.minimize();
  });
  document.getElementById("windowCloseBtn")?.addEventListener("click", () => {
    window.electronAPI?.window?.close();
  });

  safeInit("סנכרון", () => syncStatusController.init());
  safeInit("התחברות", () => authController.init());
  safeInit("הגדרות", () => settingsController.init());
  safeInit("דוחות", () => reportsController.init());
  safeInit("טיימר", () => timerController.init());
  safeInit("גרפים", () => chartsController.init());
}

startApp();
