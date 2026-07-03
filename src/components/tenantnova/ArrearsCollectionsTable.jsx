import React from "react";
import { Link } from "react-router-dom";
import { money, tenantLabel } from "@/lib/operationalReports";

export default function ArrearsCollectionsTable({ rows = [] }) {
  if (!rows.length) return <p className="text-sm text-slate-500">No arrears in the current dummy/test data.</p>;
  return <div className="overflow-x-auto rounded-2xl border">
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="p-3">Property</th><th>Unit</th><th>Lease</th><th>Tenant label</th><th>Outstanding</th><th>Oldest unpaid</th><th>Aging</th><th>Admin links</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.lease.id} className="border-t"><td className="p-3">{row.property?.property_name || "—"}</td><td>{row.unit?.unit_number || "—"}</td><td>{row.lease.lease_status}</td><td>{tenantLabel(row.tenant)}</td><td className="font-semibold text-red-700">{money(row.balance)}</td><td>{row.oldest || "—"}</td><td><span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">{row.aging}</span></td><td><Link className="text-teal-700 underline" to={`/admin/ledger/lease/${row.lease.id}`}>Ledger</Link><p className="mt-1 text-xs text-amber-700">Form D draft placeholder requires admin action and legal review.</p></td></tr>)}</tbody>
    </table>
  </div>;
}