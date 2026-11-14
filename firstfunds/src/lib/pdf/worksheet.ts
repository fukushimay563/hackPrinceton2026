"use client";
// Generates a Form 1040 *review worksheet* PDF in the browser (no data leaves the
// device). It's clearly marked as a draft for review, NOT the official IRS form.
// TODO (Developer 2): to fill the official 2025 Form 1040, load the fillable PDF from
// irs.gov with pdf-lib's getForm() and map these values to the field names. Check the
// 2025 line numbers first, since OBBBA changed some deduction lines.
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { FILING_STATUS_LABEL, TAX_YEAR, type TaxInputs, type TaxResult } from "../finance/tax2025";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export async function buildWorksheetPdf(inputs: TaxInputs, r: TaxResult, name: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.055, 0.1, 0.14);
  const muted = rgb(0.42, 0.48, 0.53);

  // Watermark
  page.drawText("DRAFT — FOR REVIEW — NOT FOR FILING", {
    x: 60,
    y: 200,
    size: 28,
    font: bold,
    color: rgb(0.85, 0.27, 0.23),
    opacity: 0.12,
    rotate: degrees(35),
  });

  let y = 740;
  page.drawText(`Form 1040 Review Worksheet — Tax Year ${TAX_YEAR}`, { x: 50, y, size: 18, font: bold, color: ink });
  y -= 20;
  page.drawText("Prepared with FirstFunds (educational estimate). Not an official IRS form. Do not mail or e-file this page.", {
    x: 50,
    y,
    size: 9,
    font,
    color: muted,
  });
  y -= 30;

  const row = (label: string, value: string, strong = false) => {
    page.drawText(label, { x: 50, y, size: 11, font: strong ? bold : font, color: ink });
    const w = (strong ? bold : font).widthOfTextAtSize(value, 11);
    page.drawText(value, { x: 562 - w, y, size: 11, font: strong ? bold : font, color: ink });
    y -= 6;
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color: rgb(0.89, 0.91, 0.89) });
    y -= 16;
  };
  const heading = (t: string) => {
    y -= 6;
    page.drawText(t.toUpperCase(), { x: 50, y, size: 9, font: bold, color: muted });
    y -= 18;
  };

  heading("Taxpayer");
  row("Name (as entered)", name || "—");
  row("Filing status", FILING_STATUS_LABEL[inputs.filingStatus]);
  row("Can be claimed as a dependent", inputs.canBeClaimedAsDependent ? "Yes" : "No");

  heading("Income");
  row("Wages, salaries, tips (W-2 box 1)", money(r.grossIncome));
  row("Total income / adjusted gross income", money(r.grossIncome), true);

  heading("Deductions");
  row("Standard deduction", money(r.standardDeduction));
  row("Taxable income", money(r.taxableIncome), true);

  heading("Tax and payments");
  row(`Tax (${r.method})`, money(r.tax));
  row("Credits included", "None (not supported in this estimate)");
  row("Federal income tax withheld (W-2 box 2)", money(r.withholding));
  row(r.refund >= 0 ? "Estimated refund" : "Estimated amount you owe", money(Math.abs(r.refund)), true);

  if (r.flags.length) {
    heading("Review notes");
    for (const f of r.flags.slice(0, 5)) {
      const words = `• ${f.message}`.split(" ");
      let line = "";
      for (const w of words) {
        if (font.widthOfTextAtSize(line + w + " ", 9) > 510) {
          page.drawText(line, { x: 50, y, size: 9, font, color: ink });
          y -= 12;
          line = "";
        }
        line += w + " ";
      }
      page.drawText(line, { x: 50, y, size: 9, font, color: ink });
      y -= 16;
    }
  }

  y = Math.min(y, 120);
  page.drawText("Next steps", { x: 50, y, size: 11, font: bold, color: ink });
  y -= 16;
  for (const l of [
    "1. Compare every number with your W-2 and the official Form 1040 instructions.",
    "2. File through IRS Free File (irs.gov/freefile) or another authorized provider.",
    "3. Questions about your situation? Use IRS resources or a qualified tax professional.",
  ]) {
    page.drawText(l, { x: 50, y, size: 9, font, color: ink });
    y -= 13;
  }

  return doc.save();
}

export async function downloadWorksheet(inputs: TaxInputs, r: TaxResult, name: string) {
  const bytes = await buildWorksheetPdf(inputs, r, name);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `1040-review-worksheet-${TAX_YEAR}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
