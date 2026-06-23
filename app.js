const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxjyoeTapub57qLu0Gou6h1VNG4Sq2kmdAQeHYPnAFC_fGsczxDPF2rEf_Qfo6LHHAI/exec";
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const SESSION_STORAGE_KEY = "projectRegistrySession";
const PROJECT_STORAGE_KEY = "projectRegistryMockProjects";
const LEDGER_STORAGE_KEY = "projectRegistryMockLedgerRows";
const USER_STORAGE_KEY = "projectRegistryMockUsers";
const SESSION_TABLE_STORAGE_KEY = "projectRegistryMockSessions";
const DEFAULT_USERS = [
  { username: "admin", password: "Pr0iectȘimleu!2026", fullName: "Administrator Registru", role: "admin", active: "DA" },
  { username: "operator", password: "Op3ratorȚehnic!2026", fullName: "Operator Proiecte", role: "user", active: "DA" }
];
const ACTIVE_DEMO_USERS = [
  { username: "admin", password: "Pr0iectSimleu!2026", fullName: "Administrator Registru", role: "admin", active: "DA" },
  { username: "operator", password: "Op3ratorTehnic!2026", fullName: "Operator Proiecte", role: "user", active: "DA" }
];
const COUNTIES = [
  "Alba", "Arad", "Arges", "Bacau", "Bihor", "Bistrita-Nasaud", "Botosani", "Braila", "Brasov",
  "Bucuresti", "Buzau", "Calarasi", "Caras-Severin", "Cluj", "Constanta", "Covasna", "Dambovita",
  "Dolj", "Galati", "Giurgiu", "Gorj", "Harghita", "Hunedoara", "Ialomita", "Iasi", "Ilfov",
  "Maramures", "Mehedinti", "Mures", "Neamt", "Olt", "Prahova", "Salaj", "Satu Mare", "Sibiu",
  "Suceava", "Teleorman", "Timis", "Tulcea", "Valcea", "Vaslui", "Vrancea"
];
const PROJECT_CATEGORIES = [
  "Drumuri", "Podete", "Constructii civile", "Urbanism", "Expertiza", "Memoriu tehnic", "Instalatii", "Altele"
];
const PROJECT_STAGES = [
  "Oferta", "Masuratori", "Proiectare", "Verificare", "Avizare", "Predare", "Altele"
];
const PROJECT_STATUSES = [
  "In lucru", "In asteptare", "Urgent", "Finalizat", "Arhivat"
];
const LEDGER_DIRECTIONS = ["Intrare", "Iesire"];

const state = {
  session: {
    username: "",
    password: "",
    fullName: "",
    role: "",
    sessionToken: "",
    expiresAt: ""
  },
  projects: [],
  ledgerRows: [],
  editProjectRowIndex: null,
  editLedgerRowIndex: null,
  inactivityTimer: null,
  isSavingProject: false,
  isSavingLedger: false,
  mockMode: false,
  activeTab: "projects"
};

const el = (id) => document.getElementById(id);
const todayIso = () => new Date().toISOString().slice(0, 10);
let jsonpCounter = 0;

function isMockBackend() {
  return !GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_APPS_SCRIPT");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clampProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function slugifyStatus(value) {
  return normalizeText(value).toLowerCase().replaceAll(" ", "-");
}

function formatDisplayDate(iso) {
  if (!iso) return "-";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function formatDisplayDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ro-RO");
}

function daysUntil(dateIso) {
  if (!dateIso) return null;
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function saveRememberedCredentials(remember) {
  if (remember) {
    localStorage.setItem("projectRegistryRemember", "true");
    localStorage.setItem("projectRegistrySavedUser", el("loginUsername").value.trim());
    localStorage.setItem("projectRegistrySavedPassword", el("loginPassword").value.trim());
    return;
  }
  localStorage.removeItem("projectRegistryRemember");
  localStorage.removeItem("projectRegistrySavedUser");
  localStorage.removeItem("projectRegistrySavedPassword");
}

function loadRememberedCredentials() {
  if (localStorage.getItem("projectRegistryRemember") !== "true") return;
  el("loginUsername").value = localStorage.getItem("projectRegistrySavedUser") || "";
  el("loginPassword").value = localStorage.getItem("projectRegistrySavedPassword") || "";
  el("rememberLogin").checked = true;
}

function setInlineStatus(targetId, message, type = "info") {
  const target = el(targetId);
  target.textContent = message || "";
  target.className = "inline-status";
  if (!message) return;
  target.classList.add(type === "error" ? "is-error" : type === "success" ? "is-success" : "is-info");
}

function setSession(session) {
  state.session = {
    username: session.username || "",
    password: session.password || state.session.password || "",
    fullName: session.fullName || "",
    role: session.role || "user",
    sessionToken: session.sessionToken || "",
    expiresAt: session.sessionExpiresAt || session.expiresAt || ""
  };
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state.session));
  updateSessionLabels();
}

function clearSession() {
  state.session = {
    username: "",
    password: "",
    fullName: "",
    role: "",
    sessionToken: "",
    expiresAt: ""
  };
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  clearTimeout(state.inactivityTimer);
  state.inactivityTimer = null;
  updateSessionLabels();
}

function updateSessionLabels() {
  el("activeUserLabel").textContent = state.session.fullName || "-";
  el("activeRoleLabel").textContent = state.session.role || "-";
  el("sessionStateLabel").textContent = state.session.sessionToken ? "Activa" : "Inchisa";
  el("ownerNameInput").value = state.session.fullName || "";
  el("ledgerOwnerInput").value = state.session.fullName || "";
}

function showLogin() {
  el("loginPage").classList.remove("hidden");
  el("appPage").classList.add("hidden");
}

function showApp() {
  el("loginPage").classList.add("hidden");
  el("appPage").classList.remove("hidden");
}

function switchTab(tabName) {
  state.activeTab = tabName;
  const isProjects = tabName === "projects";
  el("projectsSection").classList.toggle("hidden", !isProjects);
  el("ledgerSection").classList.toggle("hidden", isProjects);
  el("tabProjectsBtn").classList.toggle("active", isProjects);
  el("tabLedgerBtn").classList.toggle("active", !isProjects);
}

function fillSelect(id, placeholder, values) {
  const select = el(id);
  select.innerHTML = "";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function fillSimpleSelect(id, values, selectedValue = "") {
  const select = el(id);
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    if (value === selectedValue) option.selected = true;
    select.appendChild(option);
  });
}

function updateProgressPreview(value) {
  const progress = clampProgress(value);
  el("progressInput").value = String(progress);
  el("progressPreviewFill").style.width = `${progress}%`;
  el("progressPreviewLabel").textContent = `${progress}%`;
}

function resetProjectForm() {
  state.editProjectRowIndex = null;
  el("formTitle").textContent = "Adauga proiect nou";
  el("projectCodeInput").value = "";
  el("projectNameInput").value = "";
  el("beneficiaryInput").value = "";
  el("countySelect").value = "";
  el("localityInput").value = "";
  el("categorySelect").value = "";
  el("stageSelect").value = "";
  el("statusSelect").value = PROJECT_STATUSES[0];
  el("registrationNoInput").value = "";
  el("receivedDateInput").value = todayIso();
  el("deadlineInput").value = "";
  el("notesInput").value = "";
  el("cancelEditBtn").classList.add("hidden");
  el("saveProjectBtn").textContent = "Salveaza proiect";
  updateProgressPreview(0);
}

function resetLedgerForm() {
  state.editLedgerRowIndex = null;
  el("ledgerFormTitle").textContent = "Adauga inregistrare noua";
  el("ledgerDirectionSelect").value = LEDGER_DIRECTIONS[0];
  el("ledgerRegNoInput").value = "";
  el("ledgerRegDateInput").value = todayIso();
  el("ledgerDocDateInput").value = "";
  el("ledgerSourceInput").value = "";
  el("ledgerSummaryInput").value = "";
  el("ledgerNotesInput").value = "";
  el("cancelLedgerEditBtn").classList.add("hidden");
  el("saveLedgerBtn").textContent = "Salveaza in registru";
}

function populateProjectForm(project) {
  state.editProjectRowIndex = project.rowIndex;
  el("formTitle").textContent = `Editeaza proiectul ${project.projectCode || project.projectName}`;
  el("projectCodeInput").value = project.projectCode || "";
  el("projectNameInput").value = project.projectName || "";
  el("beneficiaryInput").value = project.beneficiary || "";
  el("countySelect").value = project.county || "";
  el("localityInput").value = project.locality || "";
  el("categorySelect").value = project.category || "";
  el("stageSelect").value = project.stage || "";
  el("statusSelect").value = project.status || PROJECT_STATUSES[0];
  el("registrationNoInput").value = project.registrationNo || "";
  el("receivedDateInput").value = project.receivedDate || todayIso();
  el("deadlineInput").value = project.deadline || "";
  el("notesInput").value = project.notes || "";
  updateProgressPreview(project.progressPercent || 0);
  el("cancelEditBtn").classList.remove("hidden");
  el("saveProjectBtn").textContent = "Actualizeaza proiect";
  switchTab("projects");
  setInlineStatus("formStatus", "Mod editare activ.", "info");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function populateLedgerForm(row) {
  state.editLedgerRowIndex = row.rowIndex;
  const regNo = row.registrationNo || row.documentNo || "";
  el("ledgerFormTitle").textContent = `Editeaza ${row.direction.toLowerCase()} nr. ${regNo}`;
  el("ledgerDirectionSelect").value = row.direction || LEDGER_DIRECTIONS[0];
  el("ledgerRegNoInput").value = regNo;
  el("ledgerRegDateInput").value = row.registrationDate || row.entryDate || todayIso();
  el("ledgerDocDateInput").value = row.documentNoDate || row.documentNo || "";
  el("ledgerSourceInput").value = row.documentSource || row.partner || "";
  el("ledgerSummaryInput").value = row.documentSummary || row.summary || "";
  el("ledgerNotesInput").value = row.notes || "";
  el("cancelLedgerEditBtn").classList.remove("hidden");
  el("saveLedgerBtn").textContent = "Actualizeaza inregistrarea";
  switchTab("ledger");
  updateLedgerHeading();
  setInlineStatus("ledgerStatus", "Mod editare activ.", "info");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function collectProjectPayload() {
  return {
    projectCode: normalizeText(el("projectCodeInput").value),
    projectName: normalizeText(el("projectNameInput").value),
    beneficiary: normalizeText(el("beneficiaryInput").value),
    county: normalizeText(el("countySelect").value),
    locality: normalizeText(el("localityInput").value),
    category: normalizeText(el("categorySelect").value),
    stage: normalizeText(el("stageSelect").value),
    status: normalizeText(el("statusSelect").value),
    progressPercent: clampProgress(el("progressInput").value),
    registrationNo: normalizeText(el("registrationNoInput").value),
    receivedDate: normalizeText(el("receivedDateInput").value),
    deadline: normalizeText(el("deadlineInput").value),
    notes: normalizeText(el("notesInput").value)
  };
}

function collectLedgerPayload() {
  return {
    direction: normalizeText(el("ledgerDirectionSelect").value),
    registrationNo: normalizeText(el("ledgerRegNoInput").value),
    registrationDate: normalizeText(el("ledgerRegDateInput").value),
    documentNoDate: normalizeText(el("ledgerDocDateInput").value),
    documentSource: normalizeText(el("ledgerSourceInput").value),
    documentSummary: normalizeText(el("ledgerSummaryInput").value),
    notes: normalizeText(el("ledgerNotesInput").value)
  };
}

function validateProjectPayload(payload) {
  if (!payload.projectName) return "Completeaza denumirea proiectului.";
  if (!payload.beneficiary) return "Completeaza beneficiarul.";
  if (!payload.county) return "Selecteaza judetul.";
  if (!payload.stage) return "Selecteaza stadiul.";
  if (!payload.status) return "Selecteaza statusul.";
  if (!payload.receivedDate) return "Alege data de intrare.";
  return "";
}

function validateLedgerPayload(payload) {
  if (!payload.direction) return "Selecteaza tipul registrului.";
  if (!payload.registrationNo) return "Completeaza Nr. de inregistrare.";
  if (!payload.registrationDate) return "Completeaza Data inregistrare.";
  if (!payload.documentNoDate) return "Completeaza Nr. si data documentului.";
  if (!payload.documentSource) return "Completeaza De unde provine documentul.";
  if (!payload.documentSummary) return "Completeaza Continutul pe scurt al documentului.";
  return "";
}

function getStoredArray(storageKey, fallback) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    if (fallback) localStorage.setItem(storageKey, JSON.stringify(fallback));
    return fallback ? [...fallback] : [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback ? [...fallback] : [];
  } catch {
    return fallback ? [...fallback] : [];
  }
}

function saveStoredArray(storageKey, rows) {
  localStorage.setItem(storageKey, JSON.stringify(rows));
}

function ensureMockSeed() {
  if (!localStorage.getItem(USER_STORAGE_KEY)) {
    saveStoredArray(USER_STORAGE_KEY, ACTIVE_DEMO_USERS);
  } else {
    const storedUsers = getStoredArray(USER_STORAGE_KEY, ACTIVE_DEMO_USERS);
    const syncedUsers = ACTIVE_DEMO_USERS.map((demoUser) => {
      const existingUser = storedUsers.find((user) => user.username === demoUser.username);
      return existingUser ? { ...existingUser, ...demoUser } : demoUser;
    });
    saveStoredArray(USER_STORAGE_KEY, syncedUsers);
  }
  if (!localStorage.getItem(PROJECT_STORAGE_KEY)) saveStoredArray(PROJECT_STORAGE_KEY, []);
  if (!localStorage.getItem(LEDGER_STORAGE_KEY)) saveStoredArray(LEDGER_STORAGE_KEY, []);
  if (!localStorage.getItem(SESSION_TABLE_STORAGE_KEY)) saveStoredArray(SESSION_TABLE_STORAGE_KEY, []);
}

function findMockUser(username) {
  ensureMockSeed();
  return getStoredArray(USER_STORAGE_KEY, ACTIVE_DEMO_USERS).find((user) => user.username === username) || null;
}

function expireMockSessions() {
  const sessions = getStoredArray(SESSION_TABLE_STORAGE_KEY, []);
  const now = Date.now();
  const updated = sessions.map((session) => {
    if (session.active !== "DA") return session;
    const expiresAt = new Date(session.expiresAt).getTime();
    if (!expiresAt || expiresAt >= now) return session;
    return { ...session, active: "NU" };
  });
  saveStoredArray(SESSION_TABLE_STORAGE_KEY, updated);
  return updated;
}

function createMockSession(username) {
  const sessions = expireMockSessions();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TIMEOUT_MS).toISOString();
  const sessionToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  sessions.push({ username, sessionToken, expiresAt, lastSeenAt: now.toISOString(), active: "DA" });
  saveStoredArray(SESSION_TABLE_STORAGE_KEY, sessions);
  return { sessionToken, sessionExpiresAt: expiresAt };
}

function touchMockSession(sessionToken) {
  const sessions = expireMockSessions();
  const index = sessions.findIndex((session) => session.sessionToken === sessionToken && session.active === "DA");
  if (index < 0) return null;
  const expiresAt = new Date(Date.now() + SESSION_TIMEOUT_MS).toISOString();
  sessions[index] = { ...sessions[index], expiresAt, lastSeenAt: new Date().toISOString() };
  saveStoredArray(SESSION_TABLE_STORAGE_KEY, sessions);
  return { ...sessions[index] };
}

function deactivateMockSession(sessionToken) {
  const sessions = getStoredArray(SESSION_TABLE_STORAGE_KEY, []);
  const index = sessions.findIndex((session) => session.sessionToken === sessionToken && session.active === "DA");
  if (index < 0) return false;
  sessions[index] = { ...sessions[index], active: "NU" };
  saveStoredArray(SESSION_TABLE_STORAGE_KEY, sessions);
  return true;
}

function getMockProjectsForAuth(auth) {
  const rows = getStoredArray(PROJECT_STORAGE_KEY, []);
  const visible = auth.role === "admin" ? rows : rows.filter((row) => row.createdBy === auth.username);
  return visible
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .map((row) => ({ ...row, canEdit: auth.role === "admin" || row.createdBy === auth.username }));
}

function getMockLedgerForAuth(auth) {
  const rows = getStoredArray(LEDGER_STORAGE_KEY, []);
  const visible = auth.role === "admin" ? rows : rows.filter((row) => row.createdBy === auth.username);
  return visible
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .map((row) => ({ ...row, canEdit: auth.role === "admin" || row.createdBy === auth.username }));
}

async function mockApiGet(params) {
  ensureMockSeed();
  const action = normalizeText(params.action).toLowerCase();

  if (action === "login") {
    const user = findMockUser(normalizeText(params.username));
    if (!user || user.password !== normalizeText(params.password) || user.active !== "DA") {
      return { ok: false, message: "Login invalid" };
    }
    const existing = expireMockSessions().find((session) => session.username === user.username && session.active === "DA");
    if (existing) return { ok: false, message: "Acest utilizator este deja logat in alta sesiune." };
    const session = createMockSession(user.username);
    return {
      ok: true,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      sessionToken: session.sessionToken,
      sessionExpiresAt: session.sessionExpiresAt
    };
  }

  const activeSession = touchMockSession(params.sessionToken);
  if (!activeSession) return { ok: false, message: "Sesiune expirata sau invalida." };
  const user = findMockUser(activeSession.username);
  if (!user) return { ok: false, message: "Utilizatorul sesiunii nu mai exista." };
  const auth = { username: user.username, fullName: user.fullName, role: user.role };

  if (action === "projects") return { ok: true, rows: getMockProjectsForAuth(auth), sessionExpiresAt: activeSession.expiresAt };
  if (action === "ledgerentries") return { ok: true, rows: getMockLedgerForAuth(auth), sessionExpiresAt: activeSession.expiresAt };
  if (action === "ping") return { ok: true, sessionExpiresAt: activeSession.expiresAt };
  return { ok: false, message: "Actiune necunoscuta." };
}

async function mockApiPost(payload) {
  ensureMockSeed();
  const action = normalizeText(payload.action).toLowerCase();
  if (action === "logout") {
    deactivateMockSession(payload.sessionToken);
    return { ok: true, message: "Logout realizat." };
  }

  const activeSession = touchMockSession(payload.sessionToken);
  if (!activeSession) return { ok: false, message: "Sesiune expirata sau invalida." };
  const user = findMockUser(activeSession.username);
  if (!user) return { ok: false, message: "Utilizatorul sesiunii nu mai exista." };
  const auth = { username: user.username, fullName: user.fullName, role: user.role };

  if (action === "saveproject") {
    const rows = getStoredArray(PROJECT_STORAGE_KEY, []);
    const nextRowIndex = rows.length + 2;
    const now = new Date().toISOString();
    rows.push({
      rowIndex: nextRowIndex,
      createdAt: now,
      createdBy: auth.username,
      ownerName: auth.fullName,
      projectCode: payload.projectCode || "",
      projectName: payload.projectName || "",
      beneficiary: payload.beneficiary || "",
      county: payload.county || "",
      locality: payload.locality || "",
      category: payload.category || "",
      stage: payload.stage || "",
      status: payload.status || "",
      progressPercent: clampProgress(payload.progressPercent),
      registrationNo: payload.registrationNo || "",
      receivedDate: payload.receivedDate || "",
      deadline: payload.deadline || "",
      notes: payload.notes || "",
      updatedAt: now,
      lastEditedBy: auth.fullName
    });
    saveStoredArray(PROJECT_STORAGE_KEY, rows);
    return { ok: true, message: "Proiect salvat cu succes." };
  }

  if (action === "updateproject") {
    const rows = getStoredArray(PROJECT_STORAGE_KEY, []);
    const rowIndex = Number(payload.rowIndex || 0);
    const index = rows.findIndex((row) => row.rowIndex === rowIndex);
    if (index < 0) return { ok: false, message: "Proiectul selectat nu mai exista." };
    if (auth.role !== "admin" && rows[index].createdBy !== auth.username) {
      return { ok: false, message: "Nu ai dreptul sa modifici acest proiect." };
    }
    rows[index] = {
      ...rows[index],
      projectCode: payload.projectCode || "",
      projectName: payload.projectName || "",
      beneficiary: payload.beneficiary || "",
      county: payload.county || "",
      locality: payload.locality || "",
      category: payload.category || "",
      stage: payload.stage || "",
      status: payload.status || "",
      progressPercent: clampProgress(payload.progressPercent),
      registrationNo: payload.registrationNo || "",
      receivedDate: payload.receivedDate || "",
      deadline: payload.deadline || "",
      notes: payload.notes || "",
      updatedAt: new Date().toISOString(),
      lastEditedBy: auth.fullName
    };
    saveStoredArray(PROJECT_STORAGE_KEY, rows);
    return { ok: true, message: "Proiect actualizat cu succes." };
  }

  if (action === "saveledger") {
    const rows = getStoredArray(LEDGER_STORAGE_KEY, []);
    const nextRowIndex = rows.length + 2;
    const now = new Date().toISOString();
    rows.push({
      rowIndex: nextRowIndex,
      createdAt: now,
      createdBy: auth.username,
      ownerName: auth.fullName,
      direction: payload.direction || LEDGER_DIRECTIONS[0],
      registrationNo: payload.registrationNo || "",
      registrationDate: payload.registrationDate || todayIso(),
      documentNoDate: payload.documentNoDate || "",
      documentSource: payload.documentSource || "",
      documentSummary: payload.documentSummary || "",
      notes: payload.notes || "",
      updatedAt: now,
      lastEditedBy: auth.fullName
    });
    saveStoredArray(LEDGER_STORAGE_KEY, rows);
    return { ok: true, message: "Inregistrarea a fost salvata." };
  }

  if (action === "updateledger") {
    const rows = getStoredArray(LEDGER_STORAGE_KEY, []);
    const rowIndex = Number(payload.rowIndex || 0);
    const index = rows.findIndex((row) => row.rowIndex === rowIndex);
    if (index < 0) return { ok: false, message: "Inregistrarea selectata nu mai exista." };
    if (auth.role !== "admin" && rows[index].createdBy !== auth.username) {
      return { ok: false, message: "Nu ai dreptul sa modifici aceasta inregistrare." };
    }
    rows[index] = {
      ...rows[index],
      direction: payload.direction || LEDGER_DIRECTIONS[0],
      registrationNo: payload.registrationNo || "",
      registrationDate: payload.registrationDate || todayIso(),
      documentNoDate: payload.documentNoDate || "",
      documentSource: payload.documentSource || "",
      documentSummary: payload.documentSummary || "",
      notes: payload.notes || "",
      updatedAt: new Date().toISOString(),
      lastEditedBy: auth.fullName
    };
    saveStoredArray(LEDGER_STORAGE_KEY, rows);
    return { ok: true, message: "Inregistrarea a fost actualizata." };
  }

  return { ok: false, message: "Actiune necunoscuta." };
}

async function callApiGet(params) {
  if (state.mockMode) return mockApiGet(params);
  return callApiJsonp(params);
}

async function callApiPost(payload) {
  if (state.mockMode) return mockApiPost(payload);
  return callApiJsonp(payload);
}

function buildApiUrl(params) {
  const url = new URL(GOOGLE_SCRIPT_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function callApiJsonp(params) {
  return new Promise((resolve, reject) => {
    const callbackName = `projectRegistryJsonp_${Date.now()}_${jsonpCounter++}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Cererea catre Apps Script a expirat."));
    }, 20000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      if (script.parentNode) script.parentNode.removeChild(script);
      delete window[callbackName];
    }

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Nu s-a putut contacta Apps Script."));
    };

    script.src = buildApiUrl({ ...params, callback: callbackName, _: Date.now() });
    document.body.appendChild(script);
  });
}

function projectMatchesFilters(project) {
  const search = normalizeText(el("searchInput").value).toLowerCase();
  const county = normalizeText(el("filterCountySelect").value);
  const status = normalizeText(el("filterStatusSelect").value);
  if (county && project.county !== county) return false;
  if (status && project.status !== status) return false;
  if (!search) return true;
  const haystack = [
    project.projectCode, project.projectName, project.beneficiary, project.locality, project.ownerName, project.registrationNo
  ].join(" ").toLowerCase();
  return haystack.includes(search);
}

function ledgerMatchesFilters(row) {
  const direction = normalizeText(el("filterLedgerDirectionSelect").value);
  const search = normalizeText(el("filterLedgerSearchInput").value).toLowerCase();
  if (direction && row.direction !== direction) return false;
  if (!search) return true;
  const haystack = [
    row.registrationNo, row.registrationDate, row.documentNoDate, row.documentSource, row.documentSummary, row.notes, row.ownerName
  ].join(" ").toLowerCase();
  return haystack.includes(search);
}

function renderProjectStats(rows) {
  const total = rows.length;
  const active = rows.filter((row) => ["In lucru", "Urgent"].includes(row.status)).length;
  const soon = rows.filter((row) => {
    const distance = daysUntil(row.deadline);
    return distance !== null && distance >= 0 && distance <= 14 && !["Finalizat", "Arhivat"].includes(row.status);
  }).length;
  const late = rows.filter((row) => {
    const distance = daysUntil(row.deadline);
    return distance !== null && distance < 0 && !["Finalizat", "Arhivat"].includes(row.status);
  }).length;
  const avgProgress = total ? Math.round(rows.reduce((sum, row) => sum + clampProgress(row.progressPercent), 0) / total) : 0;

  el("totalProjectsStat").textContent = String(total);
  el("activeProjectsStat").textContent = String(active);
  el("soonProjectsStat").textContent = String(soon);
  el("lateProjectsStat").textContent = String(late);
  el("avgProgressStat").textContent = `${avgProgress}%`;
}

function renderProgressChart(rows) {
  const chart = el("progressChart");
  if (!rows.length) {
    chart.className = "progress-chart-empty";
    chart.textContent = "Nu exista proiecte pentru grafic.";
    return;
  }
  const sorted = rows.slice().sort((a, b) => clampProgress(b.progressPercent) - clampProgress(a.progressPercent));
  chart.className = "progress-chart-list";
  chart.innerHTML = sorted.map((row) => {
    const progress = clampProgress(row.progressPercent);
    return `
      <div class="chart-row">
        <div class="chart-row-label">${escapeHtml(row.projectCode || row.projectName || "Proiect")}</div>
        <div class="chart-bar"><div class="chart-bar-fill" style="width:${progress}%"></div></div>
        <div class="chart-row-value">${progress}%</div>
      </div>
    `;
  }).join("");
}

function buildStatusMarkup(status) {
  const slug = slugifyStatus(status);
  return `<span class="status-pill status-${escapeHtml(slug)}">${escapeHtml(status || "Fara status")}</span>`;
}

function buildProgressMarkup(progress) {
  const value = clampProgress(progress);
  return `
    <div class="table-progress">
      <div class="table-progress-bar"><div class="table-progress-fill" style="width:${value}%"></div></div>
      <strong>${value}%</strong>
    </div>
  `;
}

function buildDeadlineCell(project) {
  const distance = daysUntil(project.deadline);
  let cssClass = "deadline-cell";
  let detail = "";
  if (distance !== null && distance < 0 && !["Finalizat", "Arhivat"].includes(project.status)) {
    cssClass += " is-late";
    detail = `<div class="project-meta">Intarziat cu ${Math.abs(distance)} zile</div>`;
  } else if (distance !== null && distance <= 14 && !["Finalizat", "Arhivat"].includes(project.status)) {
    cssClass += " is-soon";
    detail = `<div class="project-meta">Scadent in ${distance} zile</div>`;
  }
  return `<td class="${cssClass}">${escapeHtml(formatDisplayDate(project.deadline))}${detail}</td>`;
}

function renderProjects() {
  const body = el("projectsBody");
  const visibleRows = state.projects.filter(projectMatchesFilters);
  body.innerHTML = "";
  renderProjectStats(visibleRows);
  renderProgressChart(visibleRows);
  if (!visibleRows.length) {
    el("emptyState").classList.remove("hidden");
    return;
  }
  el("emptyState").classList.add("hidden");

  visibleRows.forEach((project) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(project.projectCode || "-")}</td>
      <td class="row-project">
        <span class="project-title">${escapeHtml(project.projectName || "-")}</span>
        <div class="project-meta">${escapeHtml(project.category || "Fara categorie")} | ${escapeHtml(project.locality || "-")}</div>
      </td>
      <td>${escapeHtml(project.beneficiary || "-")}</td>
      <td>${escapeHtml(project.county || "-")}</td>
      <td>${escapeHtml(project.stage || "-")}</td>
      <td>${buildStatusMarkup(project.status)}</td>
      <td>${buildProgressMarkup(project.progressPercent)}</td>
      ${buildDeadlineCell(project)}
      <td><strong>${escapeHtml(project.ownerName || "-")}</strong><div class="project-meta">${escapeHtml(project.lastEditedBy || "-")}</div></td>
      <td>${escapeHtml(formatDisplayDateTime(project.updatedAt || project.createdAt))}</td>
      <td class="actions-cell"></td>
    `;
    const actionsCell = tr.querySelector(".actions-cell");
    if (project.canEdit) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-secondary btn-sm";
      editBtn.textContent = "Editeaza";
      editBtn.addEventListener("click", () => populateProjectForm(project));
      actionsCell.appendChild(editBtn);
    }
    body.appendChild(tr);
  });
}

function getDayMonthFromIso(dateIso) {
  if (!dateIso) return { day: "-", month: "-" };
  const parts = String(dateIso).split("-");
  if (parts.length !== 3) return { day: "-", month: "-" };
  return { day: parts[2], month: parts[1] };
}

function updateLedgerHeading() {
  const direction = normalizeText(el("filterLedgerDirectionSelect").value || el("ledgerDirectionSelect").value || LEDGER_DIRECTIONS[0]).toUpperCase();
  el("ledgerPaperHeading").textContent = direction;
}

function renderLedgerRows() {
  const body = el("ledgerBody");
  const adminBody = el("ledgerAdminBody");
  const visibleRows = state.ledgerRows.filter(ledgerMatchesFilters);
  body.innerHTML = "";
  adminBody.innerHTML = "";
  updateLedgerHeading();
  if (!visibleRows.length) {
    el("ledgerEmptyState").classList.remove("hidden");
    return;
  }
  el("ledgerEmptyState").classList.add("hidden");

  visibleRows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.registrationNo || row.documentNo || "-")}</td>
      <td>${escapeHtml(formatDisplayDate(row.registrationDate || row.entryDate))}</td>
      <td>${escapeHtml(row.documentNoDate || row.documentNo || "-")}</td>
      <td>${escapeHtml(row.documentSource || row.partner || "-")}</td>
      <td>${escapeHtml(row.documentSummary || row.summary || "-")}</td>
    `;
    body.appendChild(tr);

    const adminTr = document.createElement("tr");
    adminTr.innerHTML = `
      <td>${escapeHtml(row.direction || "-")}</td>
      <td>${escapeHtml(row.registrationNo || row.documentNo || "-")}</td>
      <td>${escapeHtml(formatDisplayDate(row.registrationDate || row.entryDate))}</td>
      <td><strong>${escapeHtml(row.ownerName || "-")}</strong></td>
      <td>${escapeHtml(formatDisplayDateTime(row.updatedAt || row.createdAt))}</td>
      <td class="actions-cell"></td>
    `;
    const actionsCell = adminTr.querySelector(".actions-cell");
    if (row.canEdit) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-secondary btn-sm";
      editBtn.textContent = "Editeaza";
      editBtn.addEventListener("click", () => populateLedgerForm(row));
      actionsCell.appendChild(editBtn);
    }
    adminBody.appendChild(adminTr);
  });
}

async function loadProjects() {
  if (!(await requireActiveSession())) return;
  try {
    const data = await callApiGet({
      action: "projects",
      username: state.session.username,
      password: state.session.password,
      sessionToken: state.session.sessionToken
    });
    if (!data.ok) {
      setInlineStatus("formStatus", data.message || data.error || "Nu am putut incarca proiectele.", "error");
      if ((data.message || "").toLowerCase().includes("sesiune")) await logout(true);
      return;
    }
    state.projects = Array.isArray(data.rows) ? data.rows : [];
    if (data.sessionExpiresAt) {
      state.session.expiresAt = data.sessionExpiresAt;
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state.session));
    }
    renderProjects();
    setInlineStatus("formStatus", `Registrul proiectelor a fost actualizat. (${state.projects.length} proiecte)`, "success");
  } catch (error) {
    setInlineStatus("formStatus", `Eroare la incarcare: ${error.message}`, "error");
  }
}

async function loadLedgerRows() {
  if (!(await requireActiveSession())) return;
  try {
    const data = await callApiGet({
      action: "ledgerentries",
      username: state.session.username,
      password: state.session.password,
      sessionToken: state.session.sessionToken
    });
    if (!data.ok) {
      setInlineStatus("ledgerStatus", data.message || data.error || "Nu am putut incarca registrul.", "error");
      if ((data.message || "").toLowerCase().includes("sesiune")) await logout(true);
      return;
    }
    state.ledgerRows = Array.isArray(data.rows) ? data.rows : [];
    if (data.sessionExpiresAt) {
      state.session.expiresAt = data.sessionExpiresAt;
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state.session));
    }
    renderLedgerRows();
    setInlineStatus("ledgerStatus", `Registrul de intrari - iesiri a fost actualizat. (${state.ledgerRows.length} inregistrari)`, "success");
  } catch (error) {
    setInlineStatus("ledgerStatus", `Eroare la incarcare: ${error.message}`, "error");
  }
}

async function requireActiveSession() {
  if (!state.session.username || !state.session.password || !state.session.sessionToken) return false;
  try {
    const data = await callApiGet({
      action: "ping",
      username: state.session.username,
      password: state.session.password,
      sessionToken: state.session.sessionToken
    });
    if (!data.ok) {
      await logout(true);
      return false;
    }
    if (data.sessionExpiresAt) {
      state.session.expiresAt = data.sessionExpiresAt;
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state.session));
    }
    setupInactivityTimer();
    return true;
  } catch {
    await logout(true);
    return false;
  }
}

function setupInactivityTimer() {
  clearTimeout(state.inactivityTimer);
  if (!state.session.sessionToken) return;
  state.inactivityTimer = window.setTimeout(() => logout(true), SESSION_TIMEOUT_MS);
}

function bindActivityEvents() {
  ["click", "keydown", "mousemove", "touchstart", "input", "change"].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (state.session.sessionToken) setupInactivityTimer();
    }, true);
  });
}

async function login() {
  const username = normalizeText(el("loginUsername").value);
  const password = normalizeText(el("loginPassword").value);
  if (!username || !password) {
    setInlineStatus("loginStatus", "Completeaza utilizatorul si parola.", "error");
    return;
  }
  setInlineStatus("loginStatus", "Se verifica datele de autentificare...", "info");
  try {
    const data = await callApiGet({ action: "login", username, password });
    if (!data.ok) {
      setInlineStatus("loginStatus", data.message || data.error || "Login invalid.", "error");
      return;
    }
    data.password = password;
    setSession(data);
    saveRememberedCredentials(el("rememberLogin").checked);
    showApp();
    resetProjectForm();
    resetLedgerForm();
    await Promise.all([loadProjects(), loadLedgerRows()]);
    setInlineStatus("loginStatus", "", "info");
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    setInlineStatus("loginStatus", `Nu s-a putut realiza loginul: ${message}`, "error");
  }
}

async function logout(isAutomatic) {
  const sessionToken = state.session.sessionToken;
  if (sessionToken) {
    try {
      await callApiPost({
        action: "logout",
        username: state.session.username,
        password: state.session.password,
        sessionToken
      });
    } catch {
      // ignore logout errors
    }
  }
  clearSession();
  state.projects = [];
  state.ledgerRows = [];
  renderProjects();
  renderLedgerRows();
  resetProjectForm();
  resetLedgerForm();
  showLogin();
  setInlineStatus("formStatus", "", "info");
  setInlineStatus("ledgerStatus", "", "info");
  setInlineStatus("loginStatus", isAutomatic ? "Sesiunea s-a inchis automat. Logheaza-te din nou." : "Ai fost delogat cu succes.", isAutomatic ? "info" : "success");
}

function sendLogoutBeacon() {
  if (!state.session.username || !state.session.sessionToken) return;
  if (state.mockMode) {
    deactivateMockSession(state.session.sessionToken);
    clearSession();
    return;
  }
  const image = new Image();
  image.src = buildApiUrl({
    action: "logout",
    username: state.session.username,
    sessionToken: state.session.sessionToken,
    _: Date.now()
  });
  clearSession();
}

async function saveProject() {
  if (state.isSavingProject) return;
  if (!(await requireActiveSession())) return;
  const payload = collectProjectPayload();
  const validationMessage = validateProjectPayload(payload);
  if (validationMessage) {
    setInlineStatus("formStatus", validationMessage, "error");
    return;
  }

  state.isSavingProject = true;
  el("saveProjectBtn").disabled = true;
  try {
    const response = await callApiPost({
      action: state.editProjectRowIndex ? "updateproject" : "saveproject",
      username: state.session.username,
      password: state.session.password,
      sessionToken: state.session.sessionToken,
      rowIndex: state.editProjectRowIndex,
      ...payload
    });
    if (!response.ok) {
      setInlineStatus("formStatus", response.message || response.error || "Nu am putut salva proiectul.", "error");
      if ((response.message || "").toLowerCase().includes("sesiune")) await logout(true);
      return;
    }
    setInlineStatus("formStatus", response.message || "Proiect salvat.", "success");
    resetProjectForm();
    await loadProjects();
  } catch (error) {
    setInlineStatus("formStatus", `Eroare la salvare: ${error.message}`, "error");
  } finally {
    state.isSavingProject = false;
    el("saveProjectBtn").disabled = false;
  }
}

async function saveLedgerRow() {
  if (state.isSavingLedger) return;
  if (!(await requireActiveSession())) return;
  const payload = collectLedgerPayload();
  const validationMessage = validateLedgerPayload(payload);
  if (validationMessage) {
    setInlineStatus("ledgerStatus", validationMessage, "error");
    return;
  }

  state.isSavingLedger = true;
  el("saveLedgerBtn").disabled = true;
  try {
    const response = await callApiPost({
      action: state.editLedgerRowIndex ? "updateledger" : "saveledger",
      username: state.session.username,
      password: state.session.password,
      sessionToken: state.session.sessionToken,
      rowIndex: state.editLedgerRowIndex,
      ...payload
    });
    if (!response.ok) {
      setInlineStatus("ledgerStatus", response.message || response.error || "Nu am putut salva inregistrarea.", "error");
      if ((response.message || "").toLowerCase().includes("sesiune")) await logout(true);
      return;
    }
    setInlineStatus("ledgerStatus", response.message || "Inregistrare salvata.", "success");
    resetLedgerForm();
    await loadLedgerRows();
  } catch (error) {
    setInlineStatus("ledgerStatus", `Eroare la salvare: ${error.message}`, "error");
  } finally {
    state.isSavingLedger = false;
    el("saveLedgerBtn").disabled = false;
  }
}

function restoreSession() {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return;
  try {
    const session = JSON.parse(raw);
    if (!session || !session.sessionToken) return;
    setSession(session);
    showApp();
    resetProjectForm();
    resetLedgerForm();
    loadProjects();
    loadLedgerRows();
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

function renderModeHints() {
  state.mockMode = isMockBackend();
  el("demoBanner").classList.toggle("hidden", !state.mockMode);
  el("demoCredentials").classList.toggle("hidden", !state.mockMode);
  el("demoCredentials").innerHTML = "Cont demo admin: <strong>admin / Pr0iectSimleu!2026</strong><br />Cont demo operator: <strong>operator / Op3ratorTehnic!2026</strong>";
}

function bindEvents() {
  el("loginBtn").addEventListener("click", login);
  el("showPasswordCheck").addEventListener("change", (event) => {
    el("loginPassword").type = event.target.checked ? "text" : "password";
  });
  el("logoutBtn").addEventListener("click", () => logout(false));
  el("tabProjectsBtn").addEventListener("click", () => switchTab("projects"));
  el("tabLedgerBtn").addEventListener("click", () => switchTab("ledger"));
  el("saveProjectBtn").addEventListener("click", saveProject);
  el("saveLedgerBtn").addEventListener("click", saveLedgerRow);
  el("cancelEditBtn").addEventListener("click", () => {
    resetProjectForm();
    setInlineStatus("formStatus", "Editarea a fost anulata.", "info");
  });
  el("cancelLedgerEditBtn").addEventListener("click", () => {
    resetLedgerForm();
    setInlineStatus("ledgerStatus", "Editarea a fost anulata.", "info");
  });
  el("refreshBtn").addEventListener("click", loadProjects);
  el("refreshLedgerBtn").addEventListener("click", loadLedgerRows);
  el("searchInput").addEventListener("input", renderProjects);
  el("filterCountySelect").addEventListener("change", renderProjects);
  el("filterStatusSelect").addEventListener("change", renderProjects);
  el("filterLedgerDirectionSelect").addEventListener("change", renderLedgerRows);
  el("filterLedgerSearchInput").addEventListener("input", renderLedgerRows);
  el("ledgerDirectionSelect").addEventListener("change", updateLedgerHeading);
  el("progressInput").addEventListener("input", (event) => updateProgressPreview(event.target.value));
}

function initializeSelects() {
  fillSelect("countySelect", "Alege judetul", COUNTIES);
  fillSelect("filterCountySelect", "Toate judetele", COUNTIES);
  fillSelect("categorySelect", "Alege categoria", PROJECT_CATEGORIES);
  fillSelect("stageSelect", "Alege stadiul", PROJECT_STAGES);
  fillSimpleSelect("statusSelect", PROJECT_STATUSES, PROJECT_STATUSES[0]);
  fillSelect("filterStatusSelect", "Toate statusurile", PROJECT_STATUSES);
  fillSimpleSelect("ledgerDirectionSelect", LEDGER_DIRECTIONS, LEDGER_DIRECTIONS[0]);
  fillSelect("filterLedgerDirectionSelect", "Toate", LEDGER_DIRECTIONS);
}

function initialize() {
  state.mockMode = isMockBackend();
  renderModeHints();
  initializeSelects();
  loadRememberedCredentials();
  bindEvents();
  bindActivityEvents();
  updateSessionLabels();
  resetProjectForm();
  resetLedgerForm();
  updateLedgerHeading();
  renderProjects();
  renderLedgerRows();
  switchTab("projects");
  restoreSession();
  window.addEventListener("beforeunload", sendLogoutBeacon);
  window.addEventListener("pagehide", sendLogoutBeacon);
  window.setInterval(async () => {
    if (!state.session.sessionToken) return;
    try {
      const result = await callApiGet({
        action: "ping",
        username: state.session.username,
        password: state.session.password,
        sessionToken: state.session.sessionToken
      });
      if (!result.ok) await logout(true);
    } catch {
      // ignore transient errors
    }
  }, 60000);
}

initialize();
