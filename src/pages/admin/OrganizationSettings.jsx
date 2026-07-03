import React, { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createAuditLog } from "@/lib/tenantNova";

export default function OrganizationSettings() {
  const access = useOutletContext();
  const [form, setForm] = useState(access.organization);
  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  async function save(e) {
    e.preventDefault();
    const before = access.organization;
    const saved = await base44.entities.Organization.update(before.id, form);
    await createAuditLog({ organizationId: before.id, user: access.user, role: access.membership.role, action: "Organization updated", entityType: "Organization", entityId: before.id, beforeValues: before, afterValues: saved, reason: "Admin updated organization settings" });
  }
  return <section><p className="text-sm font-semibold uppercase text-teal-700">Admin only</p><h1 className="mt-2 text-3xl font-bold">Organization Settings</h1><form onSubmit={save} className="mt-6 grid max-w-2xl gap-4 rounded-2xl border bg-white p-6"><input className="rounded-xl border p-3" value={form.name || ""} onChange={e => update("name", e.target.value)} placeholder="Organization name" /><input className="rounded-xl border p-3" value={form.support_email || ""} onChange={e => update("support_email", e.target.value)} placeholder="Support email" /><input className="rounded-xl border p-3" value={form.support_phone || ""} onChange={e => update("support_phone", e.target.value)} placeholder="Support phone" /><input className="rounded-xl border p-3" value={form.default_province || "NS"} onChange={e => update("default_province", e.target.value)} placeholder="Default province" /><button className="rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white">Save settings</button><p className="text-sm text-slate-500">Payment, e-signature, SMS, and email settings are intentionally excluded from Phase 1A.</p></form></section>;
}