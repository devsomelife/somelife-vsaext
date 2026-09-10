// CRA - Initialiser import VSA Ext
//
// Run once (safe to rerun). On every tab whose table starts with
// Date / Projet / Tâche / Heures, including the hidden _Modele, adds the Source
// column at the end of the table and prepares the paste cell I23 and the
// status cell I24. The "⬇ Importer VSA Ext" button itself is placed by hand
// (script buttons cannot be created from a script), anchored on I22.
// Shared logic below is generated from tools/cra-import/logic.ts.

function main(workbook: ExcelScript.Workbook) {
  const lines: string[] = [];
  for (const sheet of workbook.getWorksheets()) {
    const tables = sheet.getTables();
    if (tables.length !== 1) continue;
    const table = tables[0];
    const headers = table.getHeaderRowRange().getValues()[0].map((v) => String(v));
    if (!isEntrySheet(headers)) continue;

    let note = "déjà à jour";
    if (columnIndexes(headers).source < 0) {
      table.addColumn(-1, undefined, "Source");
      note = "colonne Source ajoutée";
    }

    const paste = sheet.getRange(PASTE_CELL);
    paste.setNumberFormat("@");
    paste.setValue(PASTE_PROMPT);
    paste.getFormat().getFill().setColor("#FFF2CC");
    paste.getFormat().getFont().setColor("#808080");
    paste.getFormat().setWrapText(false);

    const status = sheet.getRange(STATUS_CELL);
    status.setNumberFormat("@");
    status.setValue("");
    status.getFormat().getFont().setColor("#808080");
    status.getFormat().getFont().setSize(9);
    status.getFormat().setWrapText(false);

    lines.push(`${sheet.getName()} : ${note}`);
  }
  console.log(lines.length ? lines.join("\n") : "Aucun onglet de saisie trouvé.");
}

// ---- Shared logic, generated from logic.ts by build.mjs: edit there, not here ----

// Shared core of the two CRA Office Scripts. No ExcelScript call here: this
// file is unit-tested with Node (`node --test`) and inlined into the scripts by
// build.mjs, which strips the `export` keywords (Office Scripts accept neither
// import nor export). It lives next to the extension so the exchange contract
// (src/shared/cra.js) evolves in one place.

const CRA_CONTRACT_VERSION = 1;
const CRA_SOURCE = "vsa-ext";
const SOURCE_MARK = "VSA Ext";
const PASTE_CELL = "I23";
const STATUS_CELL = "I24";
const PASTE_PROMPT = "← Coller ici le bloc VSA Ext";
const REF_TABLE = "T_Projets";
const HOURS_NAME = "HeuresParJour";
const DEFAULT_HOURS_PER_DAY = 8;

type CellValue = string | number | boolean;

interface CraRow { date: string; client: string; project: string; days: number; task: string; }
interface CraPayload { v: number; source: string; month: string; person: string; rows: CraRow[]; }
interface RefProject { client: string; numero: string; projet: string; libelle: string; }
interface PlannedRow { serial: number; libelle: string; task: string; hours: number; }
interface ImportPlan { rows: PlannedRow[]; problems: string[]; }
interface EntryColumns {
  date: number; projet: number; tache: number; heures: number; jours: number;
  mois: number; semaine: number; commentaire: number; source: number;
}
interface Placement { reuse: number[]; clear: number[]; append: number; replaced: number; }
interface CalcFormulas { jours: string; mois: string; semaine: string; }

const BS_CODE_RE = /\bBS-\d{2}-\d{6}\b/i;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
// Combining diacritical marks (U+0300..U+036F), spelled by code point so the
// range never turns into invisible characters in this file.
const DIACRITICS_RE = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;
const UNREADABLE = "Bloc illisible : ce n'est pas le bloc copié depuis VSA Ext (collez-le tel quel, dans la seule cellule I23).";

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }
function isWhole(n: number): boolean { return Math.abs(n - Math.round(n)) < 1e-9; }
function isBlank(v: CellValue | undefined | null): boolean { return v === undefined || v === null || String(v).trim() === ""; }
function unique(list: string[]): string[] {
  const seen: { [key: string]: boolean } = {};
  return list.filter((s) => (seen[s] ? false : (seen[s] = true)));
}

// ---- Block ------------------------------------------------------------------

function parsePayload(text: string): { payload: CraPayload | null; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { payload: null, error: UNREADABLE };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { payload: null, error: UNREADABLE };
  const d = data as { [key: string]: unknown };
  if (d["source"] !== CRA_SOURCE) return { payload: null, error: "Bloc illisible : source inconnue, ce n'est pas un bloc VSA Ext." };
  if (d["v"] !== CRA_CONTRACT_VERSION) {
    return {
      payload: null,
      error: `Bloc en version ${String(d["v"])} : ce script attend la version ${CRA_CONTRACT_VERSION}. Mettez à jour l'extension ou le script.`,
    };
  }
  const month = d["month"];
  if (typeof month !== "string" || !MONTH_RE.test(month)) return { payload: null, error: "Bloc illisible : mois absent ou mal formé." };
  const rawRows = d["rows"];
  if (!Array.isArray(rawRows) || rawRows.length === 0) return { payload: null, error: "Bloc vide : aucune ligne à importer." };
  const rows: CraRow[] = [];
  for (const r of rawRows as unknown[]) {
    if (typeof r !== "object" || r === null) return { payload: null, error: "Bloc illisible : ligne mal formée." };
    const o = r as { [key: string]: unknown };
    rows.push({
      date: String(o["date"] ?? "").trim(),
      client: String(o["client"] ?? "").trim(),
      project: String(o["project"] ?? "").trim(),
      days: Number(o["days"]),
      task: String(o["task"] ?? "").trim(),
    });
  }
  return {
    payload: { v: CRA_CONTRACT_VERSION, source: CRA_SOURCE, month, person: String(d["person"] ?? "").trim(), rows },
    error: "",
  };
}

// ---- Referential ------------------------------------------------------------

// Lowercase, no accents, single spaces: "NORTHWIND  Tráding" and "northwind trading" match.
function normalizeKey(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function extractCode(label: string): string {
  const m = BS_CODE_RE.exec(label);
  return m ? m[0].toUpperCase() : "";
}

// Active rows of T_Projets. Columns are located by header so the table may gain
// columns; Libellé is read as calculated by the workbook, never recomposed.
// The headers are French on purpose: they belong to the team's workbook, which
// is French whatever language each user's VSA runs in. Only the VSA side of the
// contract is locale-independent.
function readReferential(headers: string[], body: CellValue[][]): { projects: RefProject[]; error: string } {
  const idx = (name: string): number => headers.findIndex((h) => normalizeKey(h) === normalizeKey(name));
  const iClient = idx("Client");
  const iNumero = idx("Numéro");
  const iProjet = idx("Projet");
  const iActif = idx("Actif");
  const iLibelle = idx("Libellé");
  const required: { name: string; index: number }[] = [
    { name: "Client", index: iClient },
    { name: "Numéro", index: iNumero },
    { name: "Actif", index: iActif },
    { name: "Libellé", index: iLibelle },
  ];
  const missing = required.filter((c) => c.index < 0).map((c) => c.name);
  if (missing.length) return { projects: [], error: `Colonnes ${missing.join(", ")} introuvables dans ${REF_TABLE}.` };
  const projects: RefProject[] = [];
  for (const r of body) {
    const actif = r[iActif];
    if (actif !== true && normalizeKey(String(actif ?? "")) !== "oui") continue;
    const libelle = String(r[iLibelle] ?? "").trim();
    if (!libelle) continue;
    projects.push({
      client: String(r[iClient] ?? "").trim(),
      numero: String(r[iNumero] ?? "").trim().toUpperCase(),
      projet: iProjet >= 0 ? String(r[iProjet] ?? "").trim() : "",
      libelle,
    });
  }
  return { projects, error: "" };
}

// 1) BS number in the VSA label equals Numéro. 2) Otherwise the client has
// exactly one active project that does not carry a *different* BS number.
// 3) Otherwise unknown. Every refusal names what to add in Admin.
function resolveProject(row: CraRow, ref: RefProject[]): { libelle: string; error: string } {
  const code = extractCode(row.project);
  if (code) {
    const byCode = ref.filter((p) => p.numero === code);
    if (byCode.length === 1) return { libelle: byCode[0].libelle, error: "" };
    if (byCode.length > 1) return { libelle: "", error: `Numéro ${code} présent ${byCode.length} fois dans le référentiel Admin` };
  }
  const client = normalizeKey(row.client);
  const byClient = client ? ref.filter((p) => normalizeKey(p.client) === client) : [];
  const compatible = byClient.filter((p) => !(code && BS_CODE_RE.test(p.numero) && p.numero !== code));
  if (compatible.length === 1) return { libelle: compatible[0].libelle, error: "" };
  if (compatible.length > 1) {
    const why = code
      ? `aucun ne porte le numéro ${code} ; ajoutez le numéro dans Admin`
      : `et le libellé VSA « ${row.project} » n'a pas de numéro BS ; précisez le numéro dans Admin`;
    return { libelle: "", error: `Client « ${row.client} » : ${compatible.length} projets dans le référentiel, ${why}` };
  }
  const ident = code ? `numéro ${code}` : "sans numéro BS";
  return { libelle: "", error: `Projet inconnu « ${row.project} » : ajoutez-le dans Admin (Client « ${row.client} », ${ident})` };
}

// ---- Dates ------------------------------------------------------------------

function excelSerial(iso: string): number {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN;
  return (ms - EXCEL_EPOCH_MS) / DAY_MS;
}

function monthOfSerial(serial: number): string {
  const dt = new Date(EXCEL_EPOCH_MS + Math.floor(serial) * DAY_MS);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
}

// ---- Plan -------------------------------------------------------------------

function planImport(payload: CraPayload, ref: RefProject[], hoursPerDay: number): ImportPlan {
  const problems: string[] = [];
  const rows: PlannedRow[] = [];
  payload.rows.forEach((r, i) => {
    const where = r.date || `ligne ${i + 1}`;
    const serial = excelSerial(r.date);
    if (isNaN(serial)) problems.push(`${where} : date invalide`);
    else if (r.date.slice(0, 7) !== payload.month) problems.push(`${where} : hors du mois ${payload.month}`);
    const hours = r.days * hoursPerDay;
    const hoursOk = r.days > 0 && isWhole(hours) && hours >= 1;
    if (!hoursOk) {
      problems.push(`${where} ${r.project} : ${r.days} jour(s) = ${hours} h, il faut un nombre entier d'heures (${hoursPerDay} h/jour)`);
    }
    let libelle = "";
    if (!r.client) problems.push(`${where} : client manquant`);
    if (!r.project) {
      problems.push(`${where} : projet manquant`);
    } else {
      const res = resolveProject(r, ref);
      if (res.error) problems.push(res.error);
      libelle = res.libelle;
    }
    if (!isNaN(serial) && hoursOk && libelle && r.client) rows.push({ serial, libelle, task: r.task, hours: Math.round(hours) });
  });
  rows.sort((a, b) => a.serial - b.serial || (a.libelle < b.libelle ? -1 : a.libelle > b.libelle ? 1 : 0));
  return { rows, problems: unique(problems) };
}

function columnIndexes(headers: string[]): EntryColumns {
  const find = (name: string): number => headers.findIndex((h) => normalizeKey(h) === normalizeKey(name));
  return {
    date: find("Date"),
    projet: find("Projet"),
    tache: find("Tâche"),
    heures: find("Heures"),
    jours: find("Jours"),
    mois: find("Mois"),
    semaine: find("Semaine"),
    commentaire: find("Commentaire"),
    source: find("Source"),
  };
}

function isEntrySheet(headers: string[]): boolean {
  const c = columnIndexes(headers);
  return c.date === 0 && c.projet === 1 && c.tache === 2 && c.heures === 3;
}

// Slots are the rows this import owns (marked, same month) plus blank rows, in
// sheet order. Owned rows left over are cleared, blank ones stay blank; what
// does not fit is appended. A row is blank only when every typed column is:
// a hand-written task or comment without a date is still someone's row.
function planPlacement(body: CellValue[][], col: EntryColumns, month: string, needed: number): Placement {
  const marked: number[] = [];
  const empty: number[] = [];
  const typed = [col.date, col.projet, col.tache, col.heures, col.commentaire].filter((c) => c >= 0);
  body.forEach((r, i) => {
    const d = r[col.date];
    if (typed.every((c) => isBlank(r[c]))) {
      empty.push(i);
      return;
    }
    if (String(r[col.source] ?? "").trim() === SOURCE_MARK && typeof d === "number" && monthOfSerial(d) === month) marked.push(i);
  });
  const slots = marked.concat(empty).sort((a, b) => a - b);
  const reuse = slots.slice(0, needed);
  const reused: { [key: number]: boolean } = {};
  for (const i of reuse) reused[i] = true;
  return { reuse, clear: marked.filter((i) => !reused[i]), append: Math.max(0, needed - slots.length), replaced: marked.length };
}

// Same formulas as the template's calculated columns, with the real table name.
function calcFormulas(tableName: string): CalcFormulas {
  const T = tableName;
  return {
    jours: `=IF(${T}[[#This Row],[Heures]]="","",${T}[[#This Row],[Heures]]/${HOURS_NAME})`,
    mois: `=IF(${T}[[#This Row],[Date]]="","",TEXT(YEAR(${T}[[#This Row],[Date]]),"0000")&"-"&TEXT(MONTH(${T}[[#This Row],[Date]]),"00"))`,
    semaine: `=IF(${T}[[#This Row],[Date]]="","",TEXT(YEAR(${T}[[#This Row],[Date]]),"0000")&"-S"&TEXT(ISOWEEKNUM(${T}[[#This Row],[Date]]),"00"))`,
  };
}

// ---- Messages ---------------------------------------------------------------

function formatReport(count: number, hours: number, month: string, replaced: number, now: Date): string {
  const stamp = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  return `✔ ${count} ligne(s) importée(s) pour ${month} (${hours} h) · ${replaced} remplacée(s) · le ${stamp}`;
}

function formatRefusal(problems: string[]): string {
  return `✖ Import refusé (${problems.length} problème(s)) : ${problems.join(" · ")}`;
}
