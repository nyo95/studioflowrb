import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Owner 2026-10-14: type a real contractor BOQ ("test/BOQ TEST.xlsx", not committed) into the BQ screens, one sheet
 * per part, to see where the screens get in the way. Sheets → Sections, lettered groups → Subsections, numbered rows →
 * Work Items with a direct price; "By Owner" → By Owner, an empty rate → TBC. Every problem is collected (not thrown)
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

/** Excel units → the studio's unit codes. */
const UNIT_MAP: Record<string, string> = { "ls": "ls", "m2": "m2", "m'": "m", "m": "m", "titik": "point", "unit": "unit", "pcs": "pcs", "set": "set" };

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

async function addRow(page: Page, part: string, box: Locator, row: Row) {
  const where = `Excel row ${row.excelRow} "${row.name}"`;
  await box.getByRole("button", { name: /^Work Item di / }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah Work Item" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nama Work Item").fill(row.name);
  await dialog.getByLabel("Jumlah").fill(String(row.qty));
  const wanted = UNIT_MAP[row.unit.toLowerCase()] ?? row.unit.toLowerCase();
  const options = await dialog.getByLabel("Satuan Work Item").locator("option").allTextContents();
  if (options.includes(wanted)) await dialog.getByLabel("Satuan Work Item").selectOption(wanted);
  else note(part, where, `Excel unit "${row.unit}" has no matching unit (looked for "${wanted}"); kept "${await dialog.getByLabel("Satuan Work Item").inputValue()}".`);
  await dialog.getByRole("button", { name: "Tambah Work Item" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  if (row.spec) note(part, where, `Specification has no place on a Work Item and is left out: "${row.spec.slice(0, 80)}".`);

  // The new row is the last one with this name in its Subsection; open it in the side panel.
  const tableRow = box.locator('tr[id^="bq-row-"]').filter({ has: page.getByRole("button", { name: `Nama Work Item: ${row.name}`, exact: true }) }).last();
  await expect(tableRow).toBeVisible();
  await tableRow.locator("td").nth(2).click();
  // By role and name: a name may hold quotes (e.g. 8" for inches), which would break a CSS attribute selector.
  const panel = page.getByRole("complementary", { name: `Work Item ${row.name}`, exact: true });
  await expect(panel).toBeVisible();
  if (row.rate.mode === "PRICED") {
    const amount = row.rate.amount;
    await panel.getByRole("button", { name: /^Harga satuan/ }).click();
    await page.keyboard.type(String(amount));
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("button", { name: new RegExp(`^Harga satuan: ${row.rate.amount}(\\.0+)?$`) })).toBeVisible({ timeout: 15_000 })
      .catch(() => note(part, where, `Unit price ${amount} did not show as saved in the panel.`));
    expectedSoFar += Math.round(row.qty * amount * 100) / 100;
  } else {
    await panel.getByLabel(`Status harga ${row.name}`).selectOption(row.rate.mode);
    await expect(panel.getByLabel(`Status harga ${row.name}`)).toHaveValue(row.rate.mode, { timeout: 15_000 })
      .catch(() => note(part, where, `Price status ${row.rate.mode} did not stay selected.`));
  }
  await panel.getByRole("button", { name: "Tutup panel" }).click();
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
      for (const row of group.rows) {
        try {
          await addRow(page, part, box, row);
        } catch (error) {
          note(part, `Excel row ${row.excelRow} "${row.name}"`, `Stopped: ${(error as Error).message.split("\n")[0]}`);
          await page.keyboard.press("Escape").catch(() => undefined);
        }
      }
    }

    const shown = await grandTotal(page);
    const expected = Math.round(expectedSoFar);
    if (shown !== expected) note(part, "Total keseluruhan", `Screen shows ${shown ?? "no total"}, the Excel rows add up to ${expected} so far.`);
    const rowsSum = sheet!.groups.flatMap((group) => group.rows).reduce((sum, row) => sum + (row.rate.mode === "PRICED" ? row.qty * row.rate.amount : 0), 0);
    if (sheet!.stated !== null && Math.abs(rowsSum - sheet!.stated) > 1) note(part, "Excel TOTAL row", `The sheet states ${sheet!.stated} but its rows add up to ${Math.round(rowsSum)}.`);
    expect.soft(shown, `${part}: grand total on screen`).toBe(expected);
  });
}
