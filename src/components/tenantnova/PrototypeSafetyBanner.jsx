import React from "react";

export const PROTOTYPE_SAFETY_TEXT = "TenantNova is currently a prototype using dummy/test data only. Do not enter real tenant, applicant, financial, legal, document, payment, or communications data until production hardening, security verification, legal/privacy review, and launch approval are complete. Vendor and Investor roles are inactive placeholders only; no vendor or investor portal is active.";

export default function PrototypeSafetyBanner() {
  return <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 text-red-950 shadow-sm"><p className="text-sm font-black uppercase tracking-wide">Prototype / Data Safety Lock</p><p className="mt-2 text-lg font-bold">{PROTOTYPE_SAFETY_TEXT}</p></div>;
}