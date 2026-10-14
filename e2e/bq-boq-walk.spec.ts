import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Owner 2026-10-14: type a real contractor BOQ ("test/BOQ TEST.xlsx", not committed) into the BQ screens, one sheet
 * per part, to see where the screens get in the way. Sheets → Sections, lettered groups → Subsections, numbered rows →
 * Work Items with a direct price and their specification, typed in the quick entry row (the last sheet is pasted
 * through "Tempel dari Excel"); "By Owner" → By Owner from the right-click menu, an empty rate → TBC. Every problem is collected (not thrown)
 * into e2e/.tmp/boq-walk-findings.json, and each part compares the screen's grand total with the Excel rows.
 */
const WORKBOOK = "test/BOQ TEST.xlsx";
const FINDINGS = "e2e/.tmp/boq-walk-findings.json";

type Rate = { mode: "PRICED"; amount: number } | { mode: "BY_OWNER" } | { mode: "TBC" };
type Row = { excelRow: number; name: string; qty: number; unit: string; spec: string; rate: Rate };
type Group = { name: string; rows: Row[] };
type Sheet = { name: string; section: string; groups: Group[]; stated: number | null };
type Finding = { part: string; where: string; problem: string };

const findings: Finding[] = [];
let projectUrl = "";
let expectedSoFar = 0;

/** A cell's plain value: formula results, rich text and hyperlinks flattened. */
function cellValue(value: ExcelJS.CellValue): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "object" && "result" in value) return (value.result as number | string | undefined) ?? null;
  if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("");
  if (typeof value === "object" && "text" in value) return String(value.text);
  return String(value);
}

async function readWorkbook(): Promise<Sheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK);
  const sheets: Sheet[] = [];
  for (const ws of workbook.worksheets) {
    if (ws.name.trim().toUpperCase() === "SUMMARY") continue;
    let header: Record<string, number> | null = null;
    const groups: Group[] = [];
    let stated: number | null = null;
    ws.eachRow((row, index) => {
      const cells = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue);
      const first = String(cells[0] ?? "").trim();
      if (!header) {
        if (first.toUpperCase().startsWith("NO")) header = Object.fromEntries(cells.map((cell, at) => [String(cell ?? "").trim().toUpperCase(), at]));
        return;
      }
      const at = (name: string) => header![name];
      const desc = String(cells[at("DESCRIPTION")] ?? "").trim();
      if (/^[A-Z]$/.test(first) && desc) { groups.push({ name: desc, rows: [] }); return; }
      if (desc.toUpperCase() === "TOTAL") { const total = cells[at("TOTAL RATE")]; stated = typeof total === "number" ? total : null; return; }
      if (!/^\d+$/.test(first) || !desc) return;
      const rawRate = cells[at("RATE")];
      const rate: Rate = typeof rawRate === "number" ? { mode: "PRICED", amount: rawRate }
        : String(rawRate ?? "").trim().toLowerCase() === "by owner" ? { mode: "BY_OWNER" } : { mode: "TBC" };
      if (groups.length === 0) groups.push({ name: "General", rows: [] });
      groups[groups.length - 1]!.rows.push({
        excelRow: index, name: desc, qty: Number(cells[at("VOL")] ?? 1) || 1, unit: String(cells[at("SAT")] ?? "").trim(),
        spec: at("SPECIFICATION") === undefined ? "" : String(cells[at("SPECIFICATION")] ?? "").trim(), rate,
      });
    });
    sheets.push({ name: ws.name.trim(), section: ws.name.replace(/^[A-Z]\.\s*/, "").trim().toUpperCase(), groups, stated });
  }
  return sheets;
}


function rupiah(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function note(part: string, where: string, problem: string) {
  findings.push({ part, where, problem });
  mkdirSync("e2e/.tmp", { recursive: true });
  writeFileSync(FINDINGS, JSON.stringify(findings, null, 2));
}

async function openProject(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(projectUrl);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("navigation", { name: "Struktur dokumen" })).toBeVisible();
}

const subsectionBox = (page: Page, name: string) =>
  page.locator('[id^="bq-subsection-"]').filter({ has: page.getByRole("button", { name: `Nama Subsection: ${name}`, exact: true }) }).last();

/** Types one Excel row into the quick entry row under the Subsection's table (Enter saves); By Owner by right-click. */
async function addRow(page: Page, part: string, box: Locator, row: Row) {
  const where = `Excel row ${row.excelRow} "${row.name}"`;
  const entry = box.getByRole("group", { name: /^Isi cepat di / });
  const before = await box.locator('tr[id^="bq-row-"]').count();
  await entry.getByLabel("Nama pekerjaan baru", { exact: true }).fill(row.name);
  if (row.spec) await entry.getByLabel("Spesifikasi pekerjaan baru", { exact: true }).fill(row.spec.slice(0, 1000));
  await entry.getByLabel("Jumlah pekerjaan baru", { exact: true }).fill(String(row.qty));
  await entry.getByLabel("Satuan pekerjaan baru", { exact: true }).fill(row.unit);
  await entry.getByLabel("Harga satuan pekerjaan baru", { exact: true }).fill(row.rate.mode === "PRICED" ? String(row.rate.amount) : "");
  await entry.getByLabel("Harga satuan pekerjaan baru", { exact: true }).press("Enter");
  await expect(box.locator('tr[id^="bq-row-"]')).toHaveCount(before + 1, { timeout: 15_000 });
  await expect(entry.getByLabel("Nama pekerjaan baru", { exact: true })).toHaveValue("");
  if (row.rate.mode === "PRICED") expectedSoFar += Math.round(row.qty * row.rate.amount * 100) / 100;
  if (row.rate.mode === "BY_OWNER") {
    const tableRow = box.locator('tr[id^="bq-row-"]').last();
    await tableRow.locator("td").nth(2).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Tandai By Owner" }).click();
    await expect(tableRow).toContainText("By Owner", { timeout: 15_000 }).catch(() => note(part, where, "By Owner from the right-click menu did not show."));
  }
}

/** The whole group at once through "Tempel dari Excel", the way an estimator copies it out of the sheet. */
async function pasteGroup(page: Page, part: string, box: Locator, group: Group) {
  const before = await box.locator('tr[id^="bq-row-"]').count();
  const cell = (text: string) => (/[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  const lines = ["DESCRIPTION\tSPECIFICATION\tVOL\tSAT\tRATE", ...group.rows.map((row) =>
    [row.name, row.spec, String(row.qty), row.unit, row.rate.mode === "PRICED" ? String(row.rate.amount) : row.rate.mode === "BY_OWNER" ? "By Owner" : ""].map(cell).join("\t"))];
  await box.getByRole("button", { name: "Tempel dari Excel" }).click();
  const dialog = page.getByRole("dialog", { name: "Tempel dari Excel" });
  await dialog.getByLabel("Kotak tempel").fill(lines.join("\n"));
  await expect(dialog.getByText(`${group.rows.length} pekerjaan terbaca`)).toBeVisible()
    .catch(async () => note(part, group.name, `Paste read ${(await dialog.getByText(/pekerjaan terbaca/).textContent()) ?? "nothing"}, expected ${group.rows.length}.`));
  await dialog.getByRole("button", { name: /^Masukkan/ }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(box.locator('tr[id^="bq-row-"]')).toHaveCount(before + group.rows.length, { timeout: 15_000 })
    .catch(() => note(part, group.name, "Not every pasted row arrived."));
  for (const row of group.rows) if (row.rate.mode === "PRICED") expectedSoFar += Math.round(row.qty * row.rate.amount * 100) / 100;
}

async function grandTotal(page: Page): Promise<number | null> {
  const footer = page.getByText("Total keseluruhan").locator("..");
  return rupiah((await footer.textContent()) ?? "");
}

test.describe.configure({ mode: "serial" });
test.skip(!existsSync(WORKBOOK), `${WORKBOOK} is the owner's local file and is not committed.`);

let sheets: Sheet[] = [];

test("part 0: read the workbook and create the project", async ({ page }) => {
  sheets = await readWorkbook();
  expect(sheets.length).toBeGreaterThan(0);
  writeFileSync(FINDINGS, "[]");
  await page.goto("/bq");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "Buat Project BQ" });
  await dialog.getByLabel("Judul project").fill("NEW STORE (BOQ TEST)");
  await dialog.getByLabel("Klien").fill("NEW STORE");
  await dialog.getByRole("button", { name: "Buat project" }).click();
  await page.waitForURL(/\/bq\/[^/]+$/);
  projectUrl = new URL(page.url()).pathname;
});

for (const index of [0, 1, 2, 3]) {
  test(`part ${index + 1}: one sheet of the workbook`, async ({ page }) => {
    test.setTimeout(15 * 60_000);
    const sheet = sheets[index];
    test.skip(!sheet, "The workbook has fewer sheets.");
    const part = sheet!.name;
    await openProject(page);
    const started = Date.now();
    const outline = page.getByRole("navigation", { name: "Struktur dokumen" });

    await outline.getByRole("button", { name: "Section", exact: true }).click();
    const sectionDialog = page.getByRole("dialog", { name: "Tambah Section" });
    await sectionDialog.getByLabel("Nama Section").fill(sheet!.section);
    await sectionDialog.getByRole("button", { name: "Tambah Section" }).click();
    await expect(sectionDialog).toBeHidden({ timeout: 15_000 });
    const sectionBlock = outline.locator("div.grid").filter({ has: page.getByRole("link", { name: new RegExp(`^${sheet!.section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }) }).first();

    for (const group of sheet!.groups) {
      await sectionBlock.getByRole("button", { name: "Subsection", exact: true }).last().click();
      await page.getByPlaceholder("Nama Subsection").fill(group.name);
      await page.keyboard.press("Enter");
      const box = subsectionBox(page, group.name);
      await expect(box).toBeVisible({ timeout: 15_000 });
      // The last sheet goes in by pasting, the others row by row.
      if (index === 3) {
        await pasteGroup(page, part, box, group).catch((error: Error) => note(part, group.name, `Paste stopped: ${error.message.split("\n")[0]}`));
        continue;
      }
      for (const row of group.rows) {
        try {
          await addRow(page, part, box, row);
        } catch (error) {
          note(part, `Excel row ${row.excelRow} "${row.name}"`, `Stopped: ${(error as Error).message.split("\n")[0]}`);
          await page.keyboard.press("Escape").catch(() => undefined);
        }
      }
    }

    note(part, "Waktu", `${sheet!.groups.reduce((sum, group) => sum + group.rows.length, 0)} rows in ${Math.round((Date.now() - started) / 1000)} s (${index === 3 ? "paste" : "quick entry"}).`);
    const shown = await grandTotal(page);
    const expected = Math.round(expectedSoFar);
    if (shown !== expected) note(part, "Total keseluruhan", `Screen shows ${shown ?? "no total"}, the Excel rows add up to ${expected} so far.`);
    const rowsSum = sheet!.groups.flatMap((group) => group.rows).reduce((sum, row) => sum + (row.rate.mode === "PRICED" ? row.qty * row.rate.amount : 0), 0);
    if (sheet!.stated !== null && Math.abs(rowsSum - sheet!.stated) > 1) note(part, "Excel TOTAL row", `The sheet states ${sheet!.stated} but its rows add up to ${Math.round(rowsSum)}.`);
    expect.soft(shown, `${part}: grand total on screen`).toBe(expected);
  });
}
