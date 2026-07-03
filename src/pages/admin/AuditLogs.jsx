import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";

export default function AuditLogs() {
  const access = useOutletContext();
  const [logs, setLogs] = useState([]);
  useEffect(() => { base44.entities.AuditLog.filter({ organization_id: access.organization.id }, "-timestamp", 100).then(setLogs); }, [access.organization.id]);
  return <section><p className="text-sm font-semibold uppercase text-teal-700">Read-only</p><h1 className="mt-2 text-3xl font-bold">Audit Logs</h1><div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">AuditLog is application-enforced and read-only in the UI, but not guaranteed tamper-proof at the database level.</div><div className="mt-6 overflow-hidden rounded-2xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-3">Time</th><th>Action</th><th>Entity</th><th>Actor</th><th>Reason</th></tr></thead><tbody>{logs.map(log => <tr key={log.id} className="border-t"><td className="p-3 text-slate-500">{new Date(log.timestamp || log.created_date).toLocaleString()}</td><td>{log.action}</td><td>{log.entity_type} · {log.entity_id}</td><td>{log.actor_role}</td><td>{log.reason}</td></tr>)}{logs.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-500">No audit events yet.</td></tr>}</tbody></table></div></section>;
}