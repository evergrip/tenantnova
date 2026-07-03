import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ApplicationCard from "@/components/tenantnova/ApplicationCard";
import { activeOnly } from "@/lib/tenantNova";
import { applicationStatuses } from "@/lib/applications";

export default function AdminApplications() {
  const access = useOutletContext(), org = access.organization.id;
  const [apps, setApps] = useState([]), [filters, setFilters] = useState({ q: "", status: "", property: "", unit: "", date: "" });
  async function load() { const rows = await base44.entities.RentalApplication.filter({ organization_id: org }, "-created_date", 200); setApps(rows.filter(activeOnly).filter(a => a.is_active !== false)); }
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => apps.filter(a => { const name = `${a.applicant_first_name || ""} ${a.applicant_last_name || ""}`.toLowerCase(); return (!filters.q || name.includes(filters.q.toLowerCase()) || a.applicant_email?.toLowerCase().includes(filters.q.toLowerCase())) && (!filters.status || a.application_status === filters.status) && (!filters.property || a.property_id_nullable === filters.property) && (!filters.unit || a.unit_id_nullable === filters.unit) && (!filters.date || a.submitted_at?.slice(0,10) === filters.date); }), [apps, filters]);
  return <section><h1 className="text-3xl font-bold">Applications Queue</h1><p className="mt-2 text-slate-600">Dummy/test rental application review queue.</p><div className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-5"><input className="rounded-xl border p-3" placeholder="Search applicant" value={filters.q} onChange={e => setFilters({...filters, q: e.target.value})} /><select className="rounded-xl border p-3" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}><option value="">All statuses</option>{applicationStatuses.map(v => <option key={v}>{v}</option>)}</select><input className="rounded-xl border p-3" placeholder="Property ID" value={filters.property} onChange={e => setFilters({...filters, property: e.target.value})} /><input className="rounded-xl border p-3" placeholder="Unit ID" value={filters.unit} onChange={e => setFilters({...filters, unit: e.target.value})} /><input type="date" className="rounded-xl border p-3" value={filters.date} onChange={e => setFilters({...filters, date: e.target.value})} /></div><div className="mt-6 grid gap-4">{filtered.map(app => <ApplicationCard key={app.id} app={app} admin />)}{filtered.length === 0 && <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">No applications found.</div>}</div></section>;
}