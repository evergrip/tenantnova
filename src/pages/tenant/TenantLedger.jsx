import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import LedgerTable from "@/components/tenantnova/LedgerTable";
import { calculateLeaseBalance, getTenantLedgerEntries } from "@/lib/ledger";

export default function TenantLedger() {
  const access = useOutletContext();
  const [entries, setEntries] = useState([]);
  useEffect(() => { getTenantLedgerEntries(access).then(setEntries); }, [access]);
  const balance = useMemo(() => calculateLeaseBalance(entries), [entries]);
  const pending = entries.filter(e => e.status === "Pending" && e.entry_type === "Rent Charge");
  const payments = entries.filter(e => e.entry_type === "Payment");
  return <section><h1 className="text-3xl font-bold">Rent Ledger & Payments</h1><p className="mt-2 text-slate-600">Only ledger entries tied to leases you can access through LeaseParticipant are shown.</p><div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No payment processing is active. Payment entries and methods are manual/prototype placeholders only; no bank, PAD, credit card, Stripe, or Plaid integration is connected.</div><div className="mt-6 grid gap-4 md:grid-cols-3"><div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Current calculated balance</p><p className="mt-1 text-3xl font-bold">${balance.toFixed(2)}</p></div><div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Upcoming/pending rent charges</p><p className="mt-1 text-3xl font-bold">{pending.length}</p></div><div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Payment history entries</p><p className="mt-1 text-3xl font-bold">{payments.length}</p></div></div><div className="mt-6"><LedgerTable entries={entries} /></div><p className="mt-4 text-sm text-slate-500">Internal admin notes, portfolio financials, arrears views, and payment settings are not available in the tenant portal.</p></section>;
}