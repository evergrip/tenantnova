import React from "react";

export default function NotificationFilters({ filters, setFilters, properties = [] }) {
  const update = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  return <div className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-6">
    <select value={filters.severity} onChange={e => update("severity", e.target.value)} className="rounded-xl border p-2"><option value="">All severity</option>{["Info","Warning","Urgent","Critical"].map(v => <option key={v}>{v}</option>)}</select>
    <select value={filters.event_type} onChange={e => update("event_type", e.target.value)} className="rounded-xl border p-2"><option value="">All types</option>{["Maintenance","Arrears","Lease","Document","Application","Inspection","Compliance","Forms","InvestorReport","System","Other"].map(v => <option key={v}>{v}</option>)}</select>
    <select value={filters.property_id_nullable} onChange={e => update("property_id_nullable", e.target.value)} className="rounded-xl border p-2"><option value="">All properties</option>{properties.map(p => <option key={p.id} value={p.id}>{p.property_name}</option>)}</select>
    <input value={filters.assigned_to_user_id_nullable} onChange={e => update("assigned_to_user_id_nullable", e.target.value)} placeholder="Assigned user ID" className="rounded-xl border p-2" />
    <select value={filters.readState} onChange={e => update("readState", e.target.value)} className="rounded-xl border p-2"><option value="">Read + unread</option><option value="unread">Unread</option><option value="read">Read</option></select>
    <select value={filters.snoozedState} onChange={e => update("snoozedState", e.target.value)} className="rounded-xl border p-2"><option value="visible">Visible only</option><option value="snoozed">Snoozed</option><option value="all">All active</option></select>
  </div>;
}