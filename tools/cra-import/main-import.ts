// CRA - Importer VSA Ext
//
// Reads the block pasted in I23 of the active tab, checks it against the
// Admin referential and writes the rows into the tab's table, all or nothing.
// Rows it wrote earlier for the same month (Source = "VSA Ext") are replaced;
// rows typed by hand are never touched. Result in I24. Shared logic below is
// generated from tools/cra-import/logic.ts.

function main(workbook: ExcelScript.Workbook) {
  const sheet = workbook.getActiveWorksheet();
  const pasteCell = sheet.getRange(PASTE_CELL);
  const statusCell = sheet.getRange(STATUS_CELL);
  const refuse = (message: string): void => {
    statusCell.setValue(message.indexOf("✖") === 0 ? message : `✖ ${message}`);
    console.log(message);
  };

  const text = String(pasteCell.getValue() ?? "").trim();
  if (!text || text === PASTE_PROMPT) {
    refuse(`Collez d'abord le bloc VSA Ext en ${PASTE_CELL}.`);
    return;
  }

  const parsed = parsePayload(text);
  if (!parsed.payload) {
    refuse(parsed.error);
    return;
  }
  const payload = parsed.payload;
  if (payload.person && payload.person !== sheet.getName()) {
    refuse(`Ce bloc est destiné à l'onglet « ${payload.person} », pas à « ${sheet.getName()} ».`);
    return;
  }

  const tables = sheet.getTables();
  if (tables.length !== 1) {
    refuse("Cet onglet n'a pas un tableau de saisie unique.");
    return;
  }
  const table = tables[0];
  const headers = table.getHeaderRowRange().getValues()[0].map((v) => String(v));
  if (!isEntrySheet(headers)) {
    refuse("En-têtes Date / Projet / Tâche / Heures introuvables : est-ce bien votre onglet ?");
    return;
  }
  const col = columnIndexes(headers);
  if (col.source < 0) {
    refuse("Colonne Source absente : lancez d'abord « CRA - Initialiser import VSA Ext ».");
    return;
  }

  const refTable = workbook.getTable(REF_TABLE);
  if (!refTable) {
    refuse(`Tableau ${REF_TABLE} introuvable (onglet Admin).`);
    return;
  }
  const ref = readReferential(
    refTable.getHeaderRowRange().getValues()[0].map((v) => String(v)),
    refTable.getRangeBetweenHeaderAndTotal().getValues()
  );
  if (ref.error) {
    refuse(ref.error);
    return;
  }

  const plan = planImport(payload, ref.projects, readHoursPerDay(workbook));
  if (plan.problems.length) {
    refuse(formatRefusal(plan.problems));
    return;
  }

  let body = table.getRangeBetweenHeaderAndTotal();
  const values = body.getValues();
  const placement = planPlacement(values, col, payload.month, plan.rows.length);
  const dateFormat = DATE_FORMAT;
  const formulas = calcFormulas(table.getName());

  placement.reuse.forEach((rowIndex, k) => writeRow(body.getRow(rowIndex), plan.rows[k], col, dateFormat, formulas));
  placement.clear.forEach((rowIndex) => clearRow(body.getRow(rowIndex), col));

  if (placement.append > 0) {
    const first = body.getRowCount();
    const extra = plan.rows.slice(placement.reuse.length);
    table.addRows(-1, extra.map(() => headers.map((): CellValue => "")));
    body = table.getRangeBetweenHeaderAndTotal();
    extra.forEach((row, k) => writeRow(body.getRow(first + k), row, col, dateFormat, formulas));
  }

  const hours = plan.rows.reduce((s, r) => s + r.hours, 0);
  const report = formatReport(plan.rows.length, hours, payload.month, placement.replaced, new Date());
  statusCell.setValue(report);
  pasteCell.setValue(PASTE_PROMPT);
  console.log(report);
}

function readHoursPerDay(workbook: ExcelScript.Workbook): number {
  const item = workbook.getNamedItem(HOURS_NAME);
  const v = item ? Number(item.getRange().getValue()) : NaN;
  return v > 0 ? v : DEFAULT_HOURS_PER_DAY;
}

// Text columns are typed as text first so a task starting with "=" stays text.
// Calculated columns get the template's formulas back explicitly.
function writeRow(row: ExcelScript.Range, r: PlannedRow, col: EntryColumns, dateFormat: string, f: CalcFormulas): void {
  for (const c of [col.projet, col.tache, col.commentaire, col.source]) {
    if (c >= 0) row.getCell(0, c).setNumberFormat("@");
  }
  const dateCell = row.getCell(0, col.date);
  dateCell.setNumberFormat(dateFormat);
  dateCell.setValue(r.serial);
  row.getCell(0, col.projet).setValue(r.libelle);
  row.getCell(0, col.tache).setValue(r.task);
  row.getCell(0, col.heures).setValue(r.hours);
  if (col.commentaire >= 0) row.getCell(0, col.commentaire).setValue("");
  row.getCell(0, col.source).setValue(SOURCE_MARK);
  if (col.jours >= 0) row.getCell(0, col.jours).setFormula(f.jours);
  if (col.mois >= 0) row.getCell(0, col.mois).setFormula(f.mois);
  if (col.semaine >= 0) row.getCell(0, col.semaine).setFormula(f.semaine);
}

function clearRow(row: ExcelScript.Range, col: EntryColumns): void {
  for (const c of [col.date, col.projet, col.tache, col.heures, col.commentaire, col.source]) {
    if (c >= 0) row.getCell(0, c).setValue("");
  }
}
