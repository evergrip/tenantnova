import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import InternalCommunicationWarning from "@/components/tenantnova/InternalCommunicationWarning";
import ManualTaskForm from "@/components/tenantnova/ManualTaskForm";
import TaskCard from "@/components/tenantnova/TaskCard";
import TaskFilters from "@/components/tenantnova/TaskFilters";
import AuditActivity from "@/components/tenantnova/AuditActivity";
import { createAuditLog } from "@/lib/tenantNova";
import { filterTasks } from "@/lib/internalCommandCenter";

export default function AdminTaskQueue() {
  const access = useOutletContext();
  const org = access.organization.id;
  const [tasks, setTasks] = useState([]), [properties, setProperties] = useState([]), [logs, setLogs] = useState([]), [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "", priority: "", task_type: "", assigned_to_user_id_nullable: "", property_id_nullable: "", due: "" });
  useEffect(() => { load(); }, [org]);
  async function load() { const [t, p, a] = await Promise.all([base44.entities.AdminTask.filter({ organization_id: org }), base44.entities.Property.filter({ organization_id: org }), base44.entities.AuditLog.filter({ organization_id: org }, "-timestamp", 8)]); setTasks(t); setProperties(p.filter(r => !r.deleted_at)); setLogs(a); setLoading(false); }
  async function createTask(form) { const task = await base44.entities.AdminTask.create({ organization_id: org, ...form, created_by_user_id_nullable: access.user.id, is_active: true, created_at: new Date().toISOString() }); await createAuditLog({ organizationId: org, user: access.user, role: access.membership?.role, action: "AdminTask created", entityType: "AdminTask", entityId: task.id, afterValues: { title: task.title, task_type: task.task_type }, reason: "Phase 1I manual internal task only" }); await load(); }
  async function updateTask(task, patch) { const updated = await base44.entities.AdminTask.update(task.id, patch); const action = patch.status === "Completed" ? "AdminTask completed" : patch.status === "Dismissed" ? "AdminTask dismissed" : patch.status === "Archived" || patch.deleted_at ? "AdminTask archived" : patch.assigned_to_user_id_nullable !== undefined && patch.assigned_to_user_id_nullable !== task.assigned_to_user_id_nullable ? "AdminTask assigned" : patch.status && patch.status !== task.status ? "AdminTask status changed" : "AdminTask updated"; if (action !== "AdminTask updated") await createAuditLog({ organizationId: org, user: access.user, role: access.membership?.role, action, entityType: "AdminTask", entityId: task.id, beforeValues: { status: task.status, assigned_to_user_id_nullable: task.assigned_to_user_id_nullable }, afterValues: patch, reason: "Phase 1I internal task workflow only" }); setTasks(prev => prev.map(t => t.id === task.id ? updated : t)); }
  if (loading) return <div className="grid min-h-96 place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-700" /></div>;
  const visible = filterTasks(tasks, filters);
  return <section className="space-y-6"><div><p className="text-sm font-semibold uppercase text-teal-700">Phase 1I Internal Command Center</p><h1 className="mt-2 text-3xl font-bold">Admin Task Queue</h1><p className="mt-2 max-w-4xl text-slate-600">Internal admin/staff task workflow. Assignments are placeholders and do not message users.</p></div><InternalCommunicationWarning type="Tasks" /><ManualTaskForm onCreate={createTask} /><TaskFilters filters={filters} setFilters={setFilters} properties={properties} /><div className="grid gap-4">{visible.map(task => <TaskCard key={task.id} task={task} onUpdate={updateTask} />)}{visible.length === 0 && <div className="rounded-2xl border bg-white p-6 text-slate-500">No active internal tasks match these filters.</div>}</div><AuditActivity logs={logs} title="Recent task audit activity" /></section>;
}