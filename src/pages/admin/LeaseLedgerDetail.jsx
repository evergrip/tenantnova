import React, { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import LedgerEntryForm from "@/components/tenantnova/LedgerEntryForm";
import LedgerTable from "@/components/tenantnova/LedgerTable";
import { activeOnly } from "@/lib/tenantNova";
import { calculateLeaseBalance, createLedgerEntry, reverseLedgerEntry } from "@/lib/ledger";

export default function LeaseLedgerDetail() {
  const access = useOutletContext(), { leaseId } = useParams(), org = access.organization.id;
  const [data, setData] = useState({ entries: [], lease: null, tenants: [], leases: [], properties: [], units: [], logs: [] });
  const [form, setForm] = useState({ lease_id: leaseId, entry_type: "Payment", debit_credit_type: "Credit", amount: 0, effective_date: new Date().toISOString().slice(0,10), payment_method: "Manual", status: "Posted" });
  async function load() { const [lease, entries, tenants, leases, properties, units, logs] = await Promise.all([base44.entities.Lease.get(leaseId), base44.entities.FinancialLedgerEntry.filter({ organization_id: org, lease_id: leaseId }, "-effective_date", 100), base44.entities.Tenant.filter({ organization_id: org }), base44.entities.Lease.filter({ organization_id: org }), base44.entities.Property.filter({ organization_id: org }), base44.entities.Unit.filter({ organization_id: org }), base44.entities.AuditLog.filter({ organization_id: org, entity_type: "FinancialLedgerEntry" }, "-timestamp", 50)]); setData({ lease, entries: entries.filter(activeOnly), tenants: tenants.filter(activeOnly), leases: leases.filter(activeOnly), properties: properties.filter(activeOnly), units: units.filter(activeOnly), logs }); }
  useEffect(() => { load(); }, [leaseId]);
  async function submit(e) { e.preventDefault(); await createLedgerEntry(access, form, "Admin posted lease ledger entry"); load(); }
  async function reverse(entry) { const reason = window.prompt("Reason for reversal"); if (!reason) return; await reverseLedgerEntry(access, entry, reason); load(); }
  const balance = calculateLeaseBalance(data.entries);
  return <section><h1 className="text-3xl font-bold">Lease Ledger Detail</h1><div className="mt-4 rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Calculated lease balance</p><p className="mt-1 text-4xl font-bold">${balance.toFixed(2)}</p></div><div className="mt-6"><LedgerEntryForm form={form} setForm={setForm} leases={data.leases} tenants={data.tenants} properties={data.properties} units={data.units} onSubmit={submit} title="Add entry to this lease" /></div><div className="mt-6"><LedgerTable entries={data.entries} showInternal onReverse={reverse} /></div><div className="mt-6 rounded-2xl border bg-white p-5"><h2 className="font-bold">Related audit activity</h2>{data.logs.filter(l => data.entries.some(e => e.id === l.entity_id)).map(l => <div key={l.id} className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><b>{l.action}</b><p className="text-slate-500">{new Date(l.timestamp || l.created_date).toLocaleString()} · {l.reason}</p></div>)} </div></section>;
}