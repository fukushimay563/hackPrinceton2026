import Link from "next/link";
import { CORPUS } from "@/lib/tutor/corpus";

export const metadata = { title: "How FirstFunds calculates" };

export default function Methodology() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-ink-3 hover:text-ink">
        ← FirstFunds
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">How we calculate</h1>
      <p className="mt-3 text-ink-2">
        FirstFunds is an educational tool. Every number is an estimate, and we show our work so you can check it.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Credit card simulator</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-2">
        <li>Interest each month = balance carried × APR ÷ 12. Real issuers use a daily rate on your average daily balance, which comes out close to this.</li>
        <li>Minimum payment defaults to 1% of the balance plus that month&apos;s interest, with a $25 floor. Issuers vary, so you can change this.</li>
        <li>New monthly spending is added after the payment. A plan is &ldquo;paid off&rdquo; when nothing carries over.</li>
        <li>Utilization = balance ÷ limit. We explain it as one credit-score factor and never predict a score.</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">Paycheck</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-2">
        <li>Social Security 6.2% and Medicare 1.45% of gross wages.</li>
        <li>Federal withholding is estimated by annualizing pay, subtracting the standard deduction, and applying 2025 brackets. Real withholding follows your W-4 and IRS Publication 15-T.</li>
        <li>State tax is a flat percentage you choose.</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">Tax return estimate (tax year 2025)</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-2">
        <li>Supports W-2 wages only, with the standard deduction: $15,750 single or married filing separately, $31,500 married filing jointly, $23,625 head of household.</li>
        <li>Dependents: greater of $1,350 or earned income + $450, capped at the regular amount.</li>
        <li>Taxable income under $100,000 uses the IRS Tax Table method (midpoint of each $50 row); at $100,000 and up we use exact bracket math.</li>
        <li>Not included: credits (EITC, education, child), tips and overtime deductions, other income, and state returns. The app flags these when they apply.</li>
        <li>FirstFunds does not file returns. Use IRS Free File or another authorized provider.</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">FinPilot sources</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {CORPUS.filter((d) => d.url.startsWith("http") && !d.id.startsWith("lesson-") && !d.id.startsWith("help-")).map((d) => (
          <li key={d.id}>
            <a href={d.url} target="_blank" rel="noreferrer" className="text-info hover:underline">
              {d.title}
            </a>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-semibold">Privacy</h2>
      <p className="mt-3 text-ink-2">
        Tax progress stays in this browser tab and is gone when you close it, unless you sign in, which saves your answers and document
        numbers to your account (never files, SSNs or full employer IDs). FinPilot receives only computed numbers. Uploaded W-2s are
        read in memory and never saved. You can delete saved data from the Account page.
      </p>
    </main>
  );
}
