import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getTenantLeases } from "@/lib/tenantNova";

export default function TenantDashboard() {
  const access = useOutletContext();
  const [leases, setLeases] = useState([]);
  useEffect(() => { if (access.tenant) getTenantLeases(access.organization_id, access.tenant.id).then(setLeases); }, [access]);
  return <section><p className="text-sm font-semibold uppercase text-teal-700">Tenant portal</p><h1 className="mt-2 text-3xl font-bold">Welcome{access.tenant ? `, ${access.tenant.first_name}` : ""}</h1>{!access.tenant && <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Your OrganizationMembership is Tenant, but no Tenant profile is linked to your user account yet.</div>}<div className="mt-6 grid gap-4 md:grid-cols-2">{leases.map(({ lease, participant }) => <div key={lease.id} className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Authorized through LeaseParticipant</p><h2 className="mt-1 font-bold">{lease.lease_status} lease</h2><p className="mt-2 text-slate-600">{lease.lease_type} · {lease.start_date} to {lease.end_date || "ongoing"}</p><p className="mt-2 text-sm text-slate-500">Access: {participant.access_level}</p></div>)}{leases.length === 0 && access.tenant && <div className="rounded-2xl border bg-white p-5 text-slate-500">No lease is available for your account unless an active LeaseParticipant grants access.</div>}</div></section>;
}