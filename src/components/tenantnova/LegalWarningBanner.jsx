import React from "react";
import { LEGAL_WARNING } from "@/lib/formsCompliance";

export default function LegalWarningBanner() {
  return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><b>Legal safety notice:</b> {LEGAL_WARNING}</div>;
}