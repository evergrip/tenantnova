import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import DocumentList from "@/components/tenantnova/DocumentList";
import { documentCategories, expiryStatus, getTenantDocuments } from "@/lib/documentCenter";

export default function Documents() {
  const access = useOutletContext();
  const [docs, setDocs] = useState([]), [leases, setLeases] = useState([]);
  const [filters, setFilters] = useState({ q: "", category: "", lease: "", expiry: "" });
  async function load() { const visible = await getTenantDocuments(access); const leaseIds = Array.from(new Set(visible.map(d => d.lease_id_nullable).filter(Boolean))); setDocs(visible); setLeases(leaseIds.map((id, index) => ({ id, label: `Lease ${index + 1}` }))); }
  useEffect(() => { if (access.isTenant) load(); }, [access.isTenant]);
  const filtered = useMemo(() => docs.filter(d => (!filters.q || d.title.toLowerCase().includes(filters.q.toLowerCase())) && (!filters.category || d.category === filters.category) && (!filters.lease || d.lease_id_nullable === filters.lease) && (!filters.expiry || expiryStatus(d) === filters.expiry)), [docs, filters]);
  if (!access.tenant) return <div className="rounded-2xl border bg-white p-6">No tenant profile is linked to this account.</div>;
  return <section><h1 className="text-3xl font-bold">Documents</h1><div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Phase 1C tenant documents are view-only. Use dummy/test files only. Document file access is application-enforced until secure file storage permissions or signed URL controls are confirmed.</div><div className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-4"><input className="rounded-xl border p-3" placeholder="Search title" value={filters.q} onChange={e => setFilters({...filters, q: e.target.value})} /><select className="rounded-xl border p-3" value={filters.category} onChange={e => setFilters({...filters, category: e.target.value})}><option value="">All categories</option>{documentCategories.map(v => <option key={v}>{v}</option>)}</select><select className="rounded-xl border p-3" value={filters.lease} onChange={e => setFilters({...filters, lease: e.target.value})}><option value="">All leases</option>{leases.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select><select className="rounded-xl border p-3" value={filters.expiry} onChange={e => setFilters({...filters, expiry: e.target.value})}><option value="">All expiry</option>{["No expiry","Current","Expiring soon","Expired"].map(v => <option key={v}>{v}</option>)}</select></div><div className="mt-6"><DocumentList documents={filtered} /></div></section>;
}