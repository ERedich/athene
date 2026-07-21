import type { TourStep } from "./onboardingSteps";

export const MONITORING_HELP_STEPS: TourStep[] = [
  {
    id: "tableEdit",
    target: "mon-table",
    titleKey: "monitoring.helpTour.tableEditTitle",
    bodyKey: "monitoring.helpTour.tableEditBody",
  },
  {
    id: "contextMenu",
    target: "mon-table",
    titleKey: "monitoring.helpTour.contextMenuTitle",
    bodyKey: "monitoring.helpTour.contextMenuBody",
  },
  {
    id: "status",
    target: "mon-status",
    titleKey: "monitoring.helpTour.statusTitle",
    bodyKey: "monitoring.helpTour.statusBody",
    showStatusLegend: true,
  },
  {
    id: "startStop",
    target: "mon-start-stop",
    titleKey: "monitoring.helpTour.startStopTitle",
    bodyKey: "monitoring.helpTour.startStopBody",
  },
  {
    id: "references",
    target: "mon-references",
    titleKey: "monitoring.helpTour.referencesTitle",
    bodyKey: "monitoring.helpTour.referencesBody",
  },
  {
    id: "create",
    target: "mon-create",
    titleKey: "monitoring.helpTour.createTitle",
    bodyKey: "monitoring.helpTour.createBody",
  },
  {
    id: "filter",
    target: "mon-filter",
    titleKey: "monitoring.helpTour.filterTitle",
    bodyKey: "monitoring.helpTour.filterBody",
  },
  {
    id: "presets",
    target: "mon-presets",
    titleKey: "monitoring.helpTour.presetsTitle",
    bodyKey: "monitoring.helpTour.presetsBody",
  },
  {
    id: "live",
    target: "mon-table",
    titleKey: "monitoring.helpTour.liveTitle",
    bodyKey: "monitoring.helpTour.liveBody",
  },
];
