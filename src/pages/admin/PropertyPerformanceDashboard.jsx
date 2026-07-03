import React, { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import MetricCard from "@/components/tenantnova/MetricCard";
import OperationalSection from "@/components/tenantnova/OperationalSection";
import RiskFlagList from "@/components/tenantnova/RiskFlagList";
import { buildOperationalSummary, money, OPERATIONAL_WARNING, pct } from "@/lib/operationalReports";

export default function PropertyPerformanceDashboard() {
  const { propertyId } = useParams();
  const access = useOutletContext();
  const [summary, setSummary] = useState(null);
  useEffect(() => { load(); }, [access.organization.id, propertyId]);
  async function load() {
    const org = access.organization.id;
    const [properties, units, tenants, leases, participants, ledger, documents, maintenance, inspections, applications, forms, compliance, workflows, investorReports] = await Promise.all([
      base44.entities.Property.filter({ organization_id: org }), base44.entities.Unit.filter({ organization_id: org }), base44.entities.Tenant.filter({ organization_id: org }), base44.entities.Lease.filter({ organization_id: org }), base44.entities.LeaseParticipant.filter({ organization_id: org }), base44.entities.FinancialLedgerEntry.filter({ organization_id: org }), base44.entities.Document.filter({ organization_id: org }), base44.entities.MaintenanceRequest.filter({ organization_id: org }), base44.entities.InspectionReport.filter({ organization_id: org }), base44.entities.RentalApplication.filter({ organization_id: org }), base44.entities.FormsLibrary.filter({ organization_id: org }), base44.entities.ComplianceRule.filter({ organization_id: org }), base44.entities.FormWorkflowRule.filter({ organization_id: org }), base44.entities.InvestorReport.filter({ organization_id: org })
    ]);
    setSummary(buildOperationalSummary({ properties, units, tenants, leases, participants, ledger, documents, maintenance, inspections, applications, forms, compliance, workflows, investorReports }, { propertyId }));
  }
  if (!summary) return <div className="grid min-h-96 place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-700" /></div>;
  const property = summary.properties[0];
  if (!property) return <section><Link className="text-teal-700 underline" to="/admin">Back to dashboard</Link><h1 className="mt-4 text-3xl font-bold">Property not found</h1></section>;
  const p = summary.portfolio, a = summary.arrears, m = summary.maintenanceSummary, i = summary.inspectionSummary, apps = summary.applicationSummary, d = summary.documentCompliance;
  return <section className="space-y-6"><div><Link className="text-sm text-teal-700 underline" to="/admin">Back to Operational Dashboard</Link><h1 className="mt-3 text-3xl font-bold">{property.property_name}</h1><p className="mt-2 text-slate-600">{[property.street_address, property.city, property.province, property.postal_code].filter(Boolean).join(", ") || "Property performance dashboard"}</p></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Prototype warning:</b> {OPERATIONAL_WARNING}</div>
    <OperationalSection title="Property Snapshot"><div className="grid gap-3 md:grid-cols-5"><MetricCard label="Units" value={p.total_units} /><MetricCard label="Occupied" value={p.occupied_units} tone="teal" /><MetricCard label="Vacant" value={p.vacant_units} tone="amber" /><MetricCard label="Occupancy" value={pct(p.occupancy_rate)} /><MetricCard label="Active leases" value={p.active_leases} /></div></OperationalSection>
    <OperationalSection title="Financial Operations"><div className="grid gap-3 md:grid-cols-4"><MetricCard label="Rent charged" value={money(a.rent_charged)} /><MetricCard label="Rent collected" value={money(a.rent_collected)} tone="teal" /><MetricCard label="Outstanding" value={money(a.outstanding_rent)} tone={a.outstanding_rent > 0 ? "red" : "slate"} /><MetricCard label="Leases with arrears" value={a.leases_with_arrears} tone="amber" /></div></OperationalSection>
    <OperationalSection title="Operations"><div className="grid gap-3 md:grid-cols-5"><MetricCard label="Open maintenance" value={m.open} /><MetricCard label="Emergency maintenance" value={m.emergency} tone="red" /><MetricCard label="Recent inspections" value={i.completed_period} /><MetricCard label="Applications" value={Object.values(apps).reduce((sum, value) => sum + Number(value || 0), 0)} /><MetricCard label="Compliance/document flags" value={Object.values(d).reduce((sum, value) => sum + Number(value || 0), 0)} tone="amber" /></div></OperationalSection>
    <OperationalSection title="Property Risk Flags"><RiskFlagList flags={summary.risks} /></OperationalSection>
  </section>;
}