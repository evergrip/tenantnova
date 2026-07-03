import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import InternalCommunicationWarning from "@/components/tenantnova/InternalCommunicationWarning";
import NotificationCard from "@/components/tenantnova/NotificationCard";
import NotificationFilters from "@/components/tenantnova/NotificationFilters";
import AuditActivity from "@/components/tenantnova/AuditActivity";
import { createAuditLog } from "@/lib/tenantNova";
import { createTaskFromNotification, filterVisibleNotifications, generateInternalReminders } from "@/lib/internalCommandCenter";

export default function AdminNotificationCenter() {
  const access = useOutletContext();
  const org = access.organization.id;
  const [events, setEvents] = useState([]), [properties, setProperties] = useState([]), [logs, setLogs] = useState([]), [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ severity: "", event_type: "", property_id_nullable: "", assigned_to_user_id_nullable: "", readState: "", snoozedState: "visible" });
  useEffect(() => { load(); }, [org]);
  async function load() { const [e, p, a] = await Promise.all([base44.entities.NotificationEvent.filter({ organization_id: org }), base44.entities.Property.filter({ organization_id: org }), base44.entities.AuditLog.filter({ organization_id: org }, "-timestamp", 8)]); setEvents(e); setProperties(p.filter(r => !r.deleted_at)); setLogs(a); setLoading(false); }
  async function updateEvent(event, patch, action) { const updated = await base44.entities.NotificationEvent.update(event.id, patch); await createAuditLog({ organizationId: org, user: access.user, role: access.membership?.role, action, entityType: "NotificationEvent", entityId: event.id, beforeValues: { is_read: event.is_read, snoozed_until_nullable: event.snoozed_until_nullable }, afterValues: patch, reason: "Phase 1I internal notification workflow only" }); setEvents(prev => prev.map(e => e.id === event.id ? updated : e)); }
  const markRead = (event, read) => updateEvent(event, { is_read: read, read_at_nullable: read ? new Date().toISOString() : "" }, read ? "NotificationEvent marked read" : "NotificationEvent marked unread");
  const dismiss = (event) => updateEvent(event, { dismissed_at_nullable: new Date().toISOString(), is_active: false }, "NotificationEvent dismissed");
  const snooze = (event) => updateEvent(event, { snoozed_until_nullable: new Date(Date.now() + 3 * 86400000).toISOString() }, "NotificationEvent snoozed");
  async function createTask(event) { await createTaskFromNotification(access, event); await load(); }
  async function generate() { setLoading(true); await generateInternalReminders(access); await load(); }
  async function bulkRead() { for (const event of filterVisibleNotifications(events, filters).filter(e => !e.is_read)) await markRead(event, true); }
  if (loading) return <div className="grid min-h-96 place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-700" /></div>;
  const visible = filterVisibleNotifications(events, filters);
  return <section className="space-y-6"><div><p className="text-sm font-semibold uppercase text-teal-700">Phase 1I Internal Command Center</p><h1 className="mt-2 text-3xl font-bold">Admin Notification Center</h1><p className="mt-2 max-w-4xl text-slate-600">Internal admin/staff reminders using dummy/test workflows only. No external delivery is implemented.</p></div><InternalCommunicationWarning /><div className="flex flex-wrap gap-2"><button onClick={generate} className="rounded-xl bg-teal-700 px-4 py-2 text-white">Generate internal reminders</button><button onClick={bulkRead} className="rounded-xl border bg-white px-4 py-2">Bulk mark visible read</button></div><NotificationFilters filters={filters} setFilters={setFilters} properties={properties} /><div className="grid gap-4">{visible.map(event => <NotificationCard key={event.id} event={event} onRead={markRead} onDismiss={dismiss} onSnooze={snooze} onTask={createTask} />)}{visible.length === 0 && <div className="rounded-2xl border bg-white p-6 text-slate-500">No active internal notifications match these filters.</div>}</div><AuditActivity logs={logs} title="Recent notification/task audit activity" /></section>;
}