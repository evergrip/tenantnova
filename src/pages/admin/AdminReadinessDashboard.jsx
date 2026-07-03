import React, { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import MetricCard from "@/components/tenantnova/MetricCard";
import OperationalSection from "@/components/tenantnova/OperationalSection";
import PrototypeSafetyBanner from "@/components/tenantnova/PrototypeSafetyBanner";
import { buildReadinessSummary, ensureReadinessSeedData } from "@/lib/readiness";

export default function AdminReadinessDashboard() {
  const access = useOutletContext();
  const [summary, setSummary] = useState(null);
  useEffect(() => { load(); }, [access.organization.id]);
  async function load() { await ensureReadinessSeedData(access); const org = access.organization.id; const [integrations, hardening, security] = await Promise.all([base44.entities.IntegrationReadinessItem.filter({ organization_id: org }), base44.entities.ProductionHardeningItem.filter({ organization_id: org }), base44.entities.SecurityReviewItem.filter({ organization_id: org })]); setSummary(buildReadinessSummary(integrations, hardening, security)); }
  if (!summary) return <div className="grid min-h-96 place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-700" /></div>;
  const b = summary.launchBlockers;
  return <section className="space-y-6"><div><p className="text-sm font-semibold uppercase text-teal-700">Phase 1J Pre-Production Control Room</p><h1 className="mt-2 text-3xl font-bold">Admin Readiness Dashboard</h1><p className="mt-2 max-w-4xl text-slate-600">Tracks integration readiness, hardening blockers, and security review items. No real integrations or production launch controls are enabled.</p></div><PrototypeSafetyBanner />
    <OperationalSection title="Launch Blockers"><div className="grid gap-3 md:grid-cols-4"><MetricCard label="Critical hardening not verified" value={b.criticalHardeningNotVerified} tone="red" /><MetricCard label="Critical security open/in review" value={b.criticalSecurityOpen} tone="red" /><MetricCard label="Blocked integrations" value={b.blockedIntegrations} tone="amber" /><MetricCard label="Blocks real tenant data" value={b.blocksRealTenantData} tone="red" /><MetricCard label="Blocks payments" value={b.blocksPayments} tone="red" /><MetricCard label="Blocks communications" value={b.blocksCommunications} tone="red" /><MetricCard label="Blocks legal notices" value={b.blocksLegalNotices} tone="red" /></div></OperationalSection>
    <OperationalSection title="Prototype Safety Status"><div className="grid gap-3 md:grid-cols-6">{Object.entries(summary.safety).map(([k,v]) => <MetricCard key={k} label={k.replace(/([A-Z])/g, " $1")} value={v} tone="red" />)}</div></OperationalSection>
    <OperationalSection title="Readiness Summary"><div className="grid gap-4 md:grid-cols-3"><Summary title="Integrations" data={summary.integrationByStatus} /><Summary title="Production Hardening" data={summary.hardeningByStatus} /><Summary title="Security Review" data={summary.securityByStatus} /></div></OperationalSection>
    <OperationalSection title="Next Recommended Review"><p className="rounded-xl bg-slate-50 p-4 font-semibold text-slate-700">{summary.nextReview}</p><div className="mt-4 flex flex-wrap gap-2"><Link to="/admin/integration-readiness" className="rounded-xl bg-teal-700 px-4 py-2 text-white">Integration Readiness</Link><Link to="/admin/production-hardening" className="rounded-xl border bg-white px-4 py-2">Production Hardening</Link><Link to="/admin/security-review" className="rounded-xl border bg-white px-4 py-2">Security Review</Link></div></OperationalSection>
  </section>;
}
function Summary({ title, data }) { return <div className="rounded-2xl border bg-white p-4"><h3 className="font-bold">{title}</h3>{Object.entries(data).map(([k,v]) => <div key={k} className="mt-2 flex justify-between text-sm"><span>{k}</span><b>{v}</b></div>)}</div>; }