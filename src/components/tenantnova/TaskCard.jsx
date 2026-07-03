import React, { useState } from "react";
import { Link } from "react-router-dom";

const taskUrl = (task) => {
  if (task.related_entity_type_nullable === "MaintenanceRequest") return "/admin/maintenance";
  if (task.related_entity_type_nullable === "Lease") return task.lease_id_nullable ? `/admin/ledger/lease/${task.lease_id_nullable}` : "/admin/tenants-leases";
  if (task.related_entity_type_nullable === "Document") return "/admin/documents";
  if (task.related_entity_type_nullable === "RentalApplication") return task.related_entity_id_nullable ? `/admin/applications/${task.related_entity_id_nullable}` : "/admin/applications";
  if (task.related_entity_type_nullable === "InspectionReport") return "/admin/inspections";
  if (task.related_entity_type_nullable === "ComplianceRule") return "/admin/compliance-rules";
  if (task.related_entity_type_nullable === "FormsLibrary") return "/admin/forms-library";
  if (task.related_entity_type_nullable === "FormWorkflowRule") return "/admin/form-workflows";
  if (task.related_entity_type_nullable === "InvestorReport") return task.related_entity_id_nullable ? `/admin/investor-reports/${task.related_entity_id_nullable}` : "/admin/investor-reports";
  return null;
};

export default function TaskCard({ task, onUpdate }) {
  const [note, setNote] = useState(task.internal_admin_note || "");
  const link = taskUrl(task);
  return <article className="rounded-2xl border bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{task.title}</p><p className="mt-1 text-sm text-slate-600">{task.description}</p><p className="mt-2 text-xs text-slate-500">{task.task_type} · {task.priority} · Due {task.due_date_nullable || "—"}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{task.status}</span></div>
    <div className="mt-4 grid gap-2 md:grid-cols-3"><input value={task.assigned_to_user_id_nullable || ""} onChange={e => onUpdate(task, { assigned_to_user_id_nullable: e.target.value })} placeholder="Assigned user ID" className="rounded-xl border p-2 text-sm" /><select value={task.status} onChange={e => onUpdate(task, { status: e.target.value })} className="rounded-xl border p-2 text-sm">{["Open","In Progress","Waiting","Completed","Dismissed","Archived"].map(v => <option key={v}>{v}</option>)}</select><input type="date" value={task.due_date_nullable || ""} onChange={e => onUpdate(task, { due_date_nullable: e.target.value })} className="rounded-xl border p-2 text-sm" /></div>
    <textarea value={note} onChange={e => setNote(e.target.value)} onBlur={() => onUpdate(task, { internal_admin_note: note })} placeholder="Internal admin note" className="mt-3 min-h-20 w-full rounded-xl border p-2 text-sm" />
    <div className="mt-3 flex flex-wrap gap-2 text-sm"><button onClick={() => onUpdate(task, { snoozed_until_nullable: new Date(Date.now() + 3 * 86400000).toISOString() })} className="rounded-xl border px-3 py-2">Snooze 3 days</button><button onClick={() => onUpdate(task, { status: "Completed", completed_at_nullable: new Date().toISOString() })} className="rounded-xl bg-teal-700 px-3 py-2 text-white">Complete</button><button onClick={() => onUpdate(task, { status: "Dismissed", dismissed_at_nullable: new Date().toISOString() })} className="rounded-xl border px-3 py-2 text-red-700">Dismiss</button><button onClick={() => onUpdate(task, { status: "Archived", deleted_at: new Date().toISOString() })} className="rounded-xl border px-3 py-2">Archive</button>{link && <Link to={link} className="rounded-xl border px-3 py-2">Open admin link</Link>}</div>
  </article>;
}