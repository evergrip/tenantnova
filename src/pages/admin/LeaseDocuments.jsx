import React, { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import DocumentForm from "@/components/tenantnova/DocumentForm";
import DocumentList from "@/components/tenantnova/DocumentList";
import { activeOnly } from "@/lib/tenantNova";
import { createDocument, tenantVisibleDocumentVisibilities } from "@/lib/documentCenter";

export default function LeaseDocuments() {
  const access = useOutletContext(), { leaseId } = useParams(), org = access.organization.id;
  const [docs, setDocs] = useState([]), [lookups, setLookups] = useState({ tenants: [], leases: [], properties: [], units: [], ledgerEntries: [] });
  const [form, setForm] = useState({ lease_id_nullable: leaseId, category: "Lease", visibility: "Shared With Tenant", signature_status: "Not Required", version: 1 });
  async function load() { const [documents, tenants, leases, properties, units, ledgerEntries] = await Promise.all([base44.entities.Document.filter({ organization_id: org, lease_id_nullable: leaseId }, "-created_date", 100), base44.entities.Tenant.filter({ organization_id: org }), base44.entities.Lease.filter({ organization_id: org }), base44.entities.Property.filter({ organization_id: org }), base44.entities.Unit.filter({ organization_id: org }), base44.entities.FinancialLedgerEntry.filter({ organization_id: org, lease_id: leaseId })]); setDocs(documents.filter(activeOnly)); setLookups({ tenants: tenants.filter(activeOnly), leases: leases.filter(activeOnly), properties: properties.filter(activeOnly), units: units.filter(activeOnly), ledgerEntries: ledgerEntries.filter(activeOnly) }); }
  useEffect(() => { load(); }, [leaseId]);
  async function submit(e) { e.preventDefault(); await createDocument(access, { ...form, lease_id_nullable: leaseId }, "Admin uploaded lease document"); load(); }
  return <section><h1 className="text-3xl font-bold">Lease Documents</h1><div className="mt-6"><DocumentForm form={form} setForm={setForm} onSubmit={submit} {...lookups} /></div><div className="mt-6"><DocumentList documents={docs} showInternal /></div><div className="mt-4 rounded-2xl border bg-white p-5"><h2 className="font-bold">Tenant visibility</h2>{docs.map(d => <p key={d.id} className="mt-2 text-sm">{d.title}: {tenantVisibleDocumentVisibilities.includes(d.visibility) ? "Tenant can view if linked through LeaseParticipant" : "Admin only"}</p>)}</div></section>;
}