"use client";
import Link from "next/link";
import { FilingFlow } from "@/components/filing/FilingFlow";

export default function TaxesPage() {
  return (
    <div>
      <FilingFlow />
      <p className="mx-auto mt-10 max-w-xl text-center text-xs text-ink-3">
        Prefer to enter everything yourself?{" "}
        <Link href="/taxes/classic" className="underline">
          Use the classic tax calculator
        </Link>
      </p>
    </div>
  );
}
