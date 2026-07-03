import React, { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createAuditLog } from "@/lib/tenantNova";

export default function Profile() {
  const access = useOutletContext();
  const [form, setForm] = useState(access.tenant || {});
  if (!access.tenant) return <div className="rounded-2xl border bg-white p-6">No Tenant profile is linked to your user account.</div>;
  const allowed = ["phone", "emergency_contact_name", "emergency_contact_phone"];
  async function save(e) { e.preventDefault(); const update = Object.fromEntries(allowed.map(k => [k, form[k] || ""])); const saved = await base44.entities.Tenant.update(access.tenant.id, update); await createAuditLog({ organizationId: access.organization.id, user: access.user, role: access.membership.role, action: "Tenant updated", entityType: "Tenant", entityId: access.tenant.id, beforeValues: access.tenant, afterValues: saved, reason: "Tenant updated own limited profile" }); }
  return <section><h1 className="text-3xl font-bold">Profile</h1><p className="mt-2 text-slate-600">Phase 1A keeps tenant profile data intentionally limited. Date of birth is not stored here.</p><form onSubmit={save} className="mt-6 max-w-2xl rounded-2xl border bg-white p-6"><div className="grid gap-3 md:grid-cols-2"><input className="rounded-xl border bg-slate-50 p-3" value={form.first_name || ""} disabled /><input className="rounded-xl border bg-slate-50 p-3" value={form.last_name || ""} disabled /><input className="rounded-xl border bg-slate-50 p-3 md:col-span-2" value={form.email || ""} disabled />{allowed.map(f => <input key={f} className="rounded-xl border p-3" value={form[f] || ""} onChange={e => setForm({...form, [f]: e.target.value})} placeholder={f.replaceAll("_", " ")} />)}</div><button className="mt-4 rounded-xl bg-teal-700 px-4 py-2 text-white">Save profile</button></form></section>;
}