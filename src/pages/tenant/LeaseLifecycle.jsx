import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import LifecycleList from "@/components/tenantnova/LifecycleList";
import { getTenantLifecycleActions, lifecycleActionTypes, lifecycleStatuses, respondToLifecycleAction } from "@/lib/leaseLifecycle";

export default function LeaseLifecycle() {
  const access = useOutletContext();
  const [actions, setActions] = useState([]), [properties, setProperties] = useState([]), [units, setUnits] = useState([]), [filters, setFilters] = useState({ q: "", type: "", status: "" });
  async function load() { if (!access.tenant) return; const rows = await getTenantLifecycleActions(access); setActions(rows); const props = await Promise.all([...new Set(rows.map(a => a.property_id))].map(id => base44.entities.Property.get(id))); const unitRows = await Promise.all([...new Set(rows.map(a => a.unit_id))].map(id => base44.entities.Unit.get(id))); setProperties(props.filter(Boolean)); setUnits(unitRows.filter(Boolean)); }
  useEffect(() => { load(); }, [access]);
  async function respond(a, response) { await respondToLifecycleAction(access, a, response); load(); }
  const lookupMap = useMemo(() => ({ properties: Object.fromEntries(properties.map(p => [p.id, p])), units: Object.fromEntries(units.map(u => [u.id, u])) }), [properties, units]);
  const filtered = useMemo(() => actions.filter(a => (!filters.q || a.title.toLowerCase().includes(filters.q.toLowerCase()) || (a.description || "").toLowerCase().includes(filters.q.toLowerCase())) && (!filters.type || a.action_type === filters.type) && (!filters.status || a.status === filters.status)), [actions, filters]);
  if (!access.tenant) return <div className="rounded-2xl border bg-white p-6">No tenant profile is linked to this account.</div>;
  return <section><h1 className="text-3xl font-bold">Renewal & Move-Out</h1><p className="mt-2 text-slate-600">Review renewal offers, move-out actions, inspections, and tenant-visible updates for your lease.</p><div className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-3"><input className="rounded-xl border p-3" placeholder="Search" value={filters.q} onChange={e => setFilters({...filters, q: e.target.value})} /><select className="rounded-xl border p-3" value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}><option value="">All types</option>{lifecycleActionTypes.map(v => <option key={v}>{v}</option>)}</select><select className="rounded-xl border p-3" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}><option value="">All status</option>{lifecycleStatuses.filter(v => v !== "Draft" && v !== "Archived").map(v => <option key={v}>{v}</option>)}</select></div><div className="mt-6"><LifecycleList actions={filtered} lookups={lookupMap} onRespond={respond} /></div></section>;
}