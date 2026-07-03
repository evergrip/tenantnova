import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { activeOnly } from "@/lib/tenantNova";

export default function AdminDashboard() {
  const access = useOutletContext();
  const [counts, setCounts] = useState({ properties: 0, units: 0, tenants: 0, leases: 0, participants: 0 });

  useEffect(() => {
    async function load() {
      const org = access.organization.id;
      const [properties, units, tenants, leases, participants] = await Promise.all([
        base44.entities.Property.filter({ organization_id: org }), base44.entities.Unit.filter({ organization_id: org }),
        base44.entities.Tenant.filter({ organization_id: org }), base44.entities.Lease.filter({ organization_id: org }),
        base44.entities.LeaseParticipant.filter({ organization_id: org })
      ]);
      setCounts({ properties: properties.filter(activeOnly).length, units: units.filter(activeOnly).length, tenants: tenants.filter(activeOnly).length, leases: leases.filter(activeOnly).length, participants: participants.filter(activeOnly).length });
    }
    load();
  }, [access.organization.id]);

  return <section><p className="text-sm font-semibold uppercase text-teal-700">Admin dashboard</p><h1 className="mt-2 text-3xl font-bold">Phase 1A foundation</h1><p className="mt-2 max-w-3xl text-slate-600">Identity, organization scoping, property/unit/lease relationships, LeaseParticipant access, and read-only audit logging are the only active modules.</p><div className="mt-8 grid gap-4 md:grid-cols-5">{Object.entries(counts).map(([label, value]) => <div key={label} className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-3xl font-bold">{value}</p><p className="mt-1 capitalize text-slate-500">{label}</p></div>)}</div><div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><b>Security note:</b> Phase 1A uses OrganizationMembership and LeaseParticipant for access decisions. TenantNova remains internal/prototype-only for real tenant data until database-level row and field isolation is confirmed.</div></section>;
}