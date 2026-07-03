import React from "react";
import { useOutletContext } from "react-router-dom";

export default function ContactManager() {
  const { organization } = useOutletContext();
  return <section><h1 className="text-3xl font-bold">Contact Property Manager</h1><div className="mt-6 max-w-xl rounded-2xl border bg-white p-6"><p className="text-slate-600">Messaging is intentionally not included in Phase 1C. Use the support contact below.</p><dl className="mt-5 space-y-3"><div><dt className="text-sm text-slate-500">Organization</dt><dd className="font-semibold">{organization.organization_name}</dd></div><div><dt className="text-sm text-slate-500">Support email</dt><dd className="font-semibold">{organization.support_email || "Not configured"}</dd></div><div><dt className="text-sm text-slate-500">Support phone</dt><dd className="font-semibold">{organization.support_phone || "Not configured"}</dd></div></dl></div></section>;
}