import React from "react";

export default function TaskFilters({ filters, setFilters, properties = [] }) {
  const update = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  return <div className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-6">
    <select value={filters.status} onChange={e => update("status", e.target.value)} className="rounded-xl border p-2"><option value="">All status</option>{["Open","In Progress","Waiting","Completed","Dismissed","Archived"].map(v => <option key={v}>{v}</option>)}</select>
    <select value={filters.priority} onChange={e => update("priority", e.target.value)} className="rounded-xl border p-2"><option value="">All priority</option>{["Low","Normal","High","Urgent"].map(v => <option key={v}>{v}</option>)}</select>
    <select value={filters.task_type} onChange={e => update("task_type", e.target.value)} className="rounded-xl border p-2"><option value="">All types</option>{["Maintenance Follow-Up","Arrears Review","Lease Review","Document Review","Application Review","Inspection Review","Compliance Review","Form Draft Review","Investor Report Review","System","Other"].map(v => <option key={v}>{v}</option>)}</select>
    <input value={filters.assigned_to_user_id_nullable} onChange={e => update("assigned_to_user_id_nullable", e.target.value)} placeholder="Assigned user ID" className="rounded-xl border p-2" />
    <select value={filters.property_id_nullable} onChange={e => update("property_id_nullable", e.target.value)} className="rounded-xl border p-2"><option value="">All properties</option>{properties.map(p => <option key={p.id} value={p.id}>{p.property_name}</option>)}</select>
    <select value={filters.due} onChange={e => update("due", e.target.value)} className="rounded-xl border p-2"><option value="">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="future">Future</option></select>
  </div>;
}