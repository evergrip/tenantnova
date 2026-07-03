import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import NoticeList from "@/components/tenantnova/NoticeList";
import { acknowledgeNotice, getTenantNotices, noticeStatuses, noticeTypes } from "@/lib/notices";

export default function Notices() {
  const access = useOutletContext();
  const [notices, setNotices] = useState([]), [properties, setProperties] = useState([]), [filters, setFilters] = useState({ q: "", type: "", status: "" });
  async function load() { if (!access.tenant) return; const rows = await getTenantNotices(access); setNotices(rows); const propertyIds = [...new Set(rows.map(n => n.property_id_nullable).filter(Boolean))]; const propertyRows = await Promise.all(propertyIds.map(id => base44.entities.Property.get(id))); setProperties(propertyRows.filter(Boolean)); }
  useEffect(() => { load(); }, [access]);
  async function acknowledge(n) { await acknowledgeNotice(access, n); load(); }
  const lookupMap = useMemo(() => ({ properties: Object.fromEntries(properties.map(p => [p.id, p])) }), [properties]);
  const filtered = useMemo(() => notices.filter(n => (!filters.q || n.title.toLowerCase().includes(filters.q.toLowerCase()) || n.body.toLowerCase().includes(filters.q.toLowerCase())) && (!filters.type || n.notice_type === filters.type) && (!filters.status || n.status === filters.status)), [notices, filters]);
  if (!access.tenant) return <div className="rounded-2xl border bg-white p-6">No tenant profile is linked to this account.</div>;
  return <section><h1 className="text-3xl font-bold">Notices & Forms</h1><p className="mt-2 text-slate-600">View served notices and acknowledge forms connected to your authorized lease.</p><div className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-3"><input className="rounded-xl border p-3" placeholder="Search" value={filters.q} onChange={e => setFilters({...filters, q: e.target.value})} /><select className="rounded-xl border p-3" value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}><option value="">All types</option>{noticeTypes.map(v => <option key={v}>{v}</option>)}</select><select className="rounded-xl border p-3" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}><option value="">All status</option>{noticeStatuses.filter(v => ["Served", "Acknowledged"].includes(v)).map(v => <option key={v}>{v}</option>)}</select></div><div className="mt-6"><NoticeList notices={filtered} lookups={lookupMap} onAcknowledge={acknowledge} /></div></section>;
}