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

    // Room for the button placed by hand on this row, so it does not cover I23.
    const buttonRow = sheet.getRange(BUTTON_ROW).getFormat();
    if (buttonRow.getRowHeight() < BUTTON_ROW_HEIGHT) buttonRow.setRowHeight(BUTTON_ROW_HEIGHT);

    lines.push(`${sheet.getName()} : ${note}`);
  }
  console.log(lines.length ? lines.join("\n") : "Aucun onglet de saisie trouvé.");
}
