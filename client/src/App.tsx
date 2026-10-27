// App — thin shell: owns all screen/form state, renders one screen at a
// time. Screens (screens/, plan/) own their queries, mutations and
// presentation; pure helpers live in wizard.ts, selfchecks.ts, plan-utils.ts
// and server/src/planner-core.ts. State stays here so leaving a screen for
// Settings and coming back never loses half-typed input or unsaved edits.
import { useState } from "react";
import { initialWizard, type WizardState } from "./wizard";
import type { EditManpower, EditTask } from "../../server/src/planner-core";
import { EntryScreen } from "./screens/EntryScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { DemoScreen } from "./screens/DemoScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { WizardScreen } from "./screens/WizardScreen";
import { PlanScreen } from "./plan/PlanScreen";

export function App() {
  const [plannerName, setPlannerName] = useState<string>(() => {
    try {
      return sessionStorage.getItem("ep-name") || localStorage.getItem("ep-name") || "";
    } catch {
      return "";
    }
  });
  const [nameInput, setNameInput] = useState("");
  const [screen, setScreen] = useState<"entry" | "home" | "wizard" | "plan" | "settings" | "demo">(() =>
    plannerName ? "home" : "entry",
  );
  const [returnScreen, setReturnScreen] = useState<"home" | "wizard" | "plan">("home");
  const [genCount, setGenCount] = useState<number>(() => {
    try {
      return Number(sessionStorage.getItem("ep-gen-count") || 0);
    } catch {
      return 0;
    }
  });
  const [genMessage, setGenMessage] = useState("");
  const [settingsKeyInput, setSettingsKeyInput] = useState("");
  const [settingsModelInput, setSettingsModelInput] = useState("gemini-3.5-flash-lite");
  const [regenSection, setRegenSection] = useState("all");
  const [regenInstruction, setRegenInstruction] = useState("");
  function bumpGenCount() {
    setGenCount((prev) => {
      const n = prev + 1;
      try {
        sessionStorage.setItem("ep-gen-count", String(n));
      } catch {}
      return n;
    });
  }
  const [wizardStep, setWizardStep] = useState(0);
  const [wiz, setWiz] = useState<WizardState>(initialWizard);
  const [currentEventId, setCurrentEventId] = useState<number | null>(null);
  const [planTab, setPlanTab] = useState("Overview");
  const [wizardError, setWizardError] = useState("");
  const [editLines, setEditLines] = useState<{ category: string; label: string; plannedInr: number; note?: string }[]>(
    [],
  );
  const [editCostPerPlate, setEditCostPerPlate] = useState(0);
  const [editDesserts, setEditDesserts] = useState(false);
  const [editFruits, setEditFruits] = useState(false);
  const [editDryFruits, setEditDryFruits] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [editManpower, setEditManpower] = useState<EditManpower[]>([]);
  const [editTasks, setEditTasks] = useState<EditTask[]>([]);
  const [editMenuCourses, setEditMenuCourses] = useState<string[]>([]);
  const [newCourse, setNewCourse] = useState("");
  const [editSelectedVenue, setEditSelectedVenue] = useState<string | null>(null);
  const [editVenueConfirmed, setEditVenueConfirmed] = useState(false);
  const [editBudgetMin, setEditBudgetMin] = useState(0);
  const [editBudgetMax, setEditBudgetMax] = useState(0);
  const [raiseMaxChecked, setRaiseMaxChecked] = useState(false);
  const [auditSeverityFilter, setAuditSeverityFilter] = useState<string>("all");
  const [auditResolvedFilter, setAuditResolvedFilter] = useState<string>("all");
  const [fixMessage, setFixMessage] = useState("");
  const [compareAId, setCompareAId] = useState<number | null>(null);
  const [compareBId, setCompareBId] = useState<number | null>(null);
  const [summaryVersionId, setSummaryVersionId] = useState<number | null>(null);
  const [restoreConfirmId, setRestoreConfirmId] = useState<number | null>(null);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [copyMsg, setCopyMsg] = useState("");

  function handleEnterName() {
    const n = nameInput.trim();
    if (!n) return;
    setPlannerName(n);
    try {
      sessionStorage.setItem("ep-name", n);
      localStorage.setItem("ep-name", n);
    } catch {}
    setScreen("home");
  }

  if (screen === "entry") {
    return (
      <EntryScreen
        nameInput={nameInput}
        setNameInput={setNameInput}
        onEnterName={handleEnterName}
        onDemo={() => setScreen("demo")}
      />
    );
  }
  if (screen === "settings") {
    return (
      <SettingsScreen
        settingsKeyInput={settingsKeyInput}
        setSettingsKeyInput={setSettingsKeyInput}
        settingsModelInput={settingsModelInput}
        setSettingsModelInput={setSettingsModelInput}
        genCount={genCount}
        onBack={() => setScreen(returnScreen)}
      />
    );
  }
  if (screen === "demo") {
    return (
      <DemoScreen
        genCount={genCount}
        onBack={() => setScreen(plannerName ? "home" : "entry")}
        onSettings={() => {
          setReturnScreen("home");
          setScreen("settings");
        }}
      />
    );
  }
  if (screen === "home") {
    return (
      <HomeScreen
        plannerName={plannerName}
        genCount={genCount}
        onSettings={() => {
          setReturnScreen("home");
          setScreen("settings");
        }}
        onDemo={() => setScreen("demo")}
        onStartWizard={() => {
          setWiz(initialWizard());
          setWizardStep(0);
          setWizardError("");
          setScreen("wizard");
        }}
        onOpenEvent={(id) => {
          setCurrentEventId(id);
          setScreen("plan");
        }}
        onUseDifferentName={() => {
          setPlannerName("");
          try {
            sessionStorage.removeItem("ep-name");
            localStorage.removeItem("ep-name");
          } catch {}
          setScreen("entry");
        }}
      />
    );
  }
  if (screen === "wizard") {
    return (
      <WizardScreen
        wiz={wiz}
        setWiz={setWiz}
        wizardStep={wizardStep}
        setWizardStep={setWizardStep}
        wizardError={wizardError}
        setWizardError={setWizardError}
        plannerName={plannerName}
        genCount={genCount}
        genMessage={genMessage}
        onCreated={(id) => {
          setCurrentEventId(id);
          setScreen("plan");
          setPlanTab("Overview");
        }}
        onAiMessage={setGenMessage}
        onBumpGenCount={bumpGenCount}
        onCancel={() => setScreen("home")}
        onSettings={() => {
          setReturnScreen("wizard");
          setScreen("settings");
        }}
      />
    );
  }
  if (screen === "plan") {
    return (
      <PlanScreen
        currentEventId={currentEventId}
        plannerName={plannerName}
        genCount={genCount}
        onBumpGenCount={bumpGenCount}
        genMessage={genMessage}
        onGenMessage={setGenMessage}
        planTab={planTab}
        setPlanTab={setPlanTab}
        editLines={editLines}
        setEditLines={setEditLines}
        editCostPerPlate={editCostPerPlate}
        setEditCostPerPlate={setEditCostPerPlate}
        editDesserts={editDesserts}
        setEditDesserts={setEditDesserts}
        editFruits={editFruits}
        setEditFruits={setEditFruits}
        editDryFruits={editDryFruits}
        setEditDryFruits={setEditDryFruits}
        saveMsg={saveMsg}
        setSaveMsg={setSaveMsg}
        editManpower={editManpower}
        setEditManpower={setEditManpower}
        editTasks={editTasks}
        setEditTasks={setEditTasks}
        editMenuCourses={editMenuCourses}
        setEditMenuCourses={setEditMenuCourses}
        newCourse={newCourse}
        setNewCourse={setNewCourse}
        editSelectedVenue={editSelectedVenue}
        setEditSelectedVenue={setEditSelectedVenue}
        editVenueConfirmed={editVenueConfirmed}
        setEditVenueConfirmed={setEditVenueConfirmed}
        editBudgetMin={editBudgetMin}
        setEditBudgetMin={setEditBudgetMin}
        editBudgetMax={editBudgetMax}
        setEditBudgetMax={setEditBudgetMax}
        raiseMaxChecked={raiseMaxChecked}
        setRaiseMaxChecked={setRaiseMaxChecked}
        auditSeverityFilter={auditSeverityFilter}
        setAuditSeverityFilter={setAuditSeverityFilter}
        auditResolvedFilter={auditResolvedFilter}
        setAuditResolvedFilter={setAuditResolvedFilter}
        fixMessage={fixMessage}
        setFixMessage={setFixMessage}
        compareAId={compareAId}
        setCompareAId={setCompareAId}
        compareBId={compareBId}
        setCompareBId={setCompareBId}
        summaryVersionId={summaryVersionId}
        setSummaryVersionId={setSummaryVersionId}
        restoreConfirmId={restoreConfirmId}
        setRestoreConfirmId={setRestoreConfirmId}
        restoreMsg={restoreMsg}
        setRestoreMsg={setRestoreMsg}
        copyMsg={copyMsg}
        setCopyMsg={setCopyMsg}
        regenSection={regenSection}
        setRegenSection={setRegenSection}
        regenInstruction={regenInstruction}
        setRegenInstruction={setRegenInstruction}
        onHome={() => setScreen("home")}
        onNewEvent={() => {
          setWiz(initialWizard());
          setWizardStep(0);
          setScreen("wizard");
        }}
        onSettings={() => {
          setReturnScreen("plan");
          setScreen("settings");
        }}
        onDemo={() => setScreen("demo")}
      />
    );
  }
  return null;
}
