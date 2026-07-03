import { base44 } from "@/api/base44Client";
import { activeOnly, createAuditLog, getTenantLeases } from "@/lib/tenantNova";

export const noticeTypes = ["General Notice", "Entry Notice", "Rent Increase", "Lease Renewal", "Lease Termination", "Inspection", "Hearing/Dispute", "Form", "Other"];
export const noticeStatuses = ["Draft", "Served", "Acknowledged", "Withdrawn", "Archived"];
export const deliveryMethods = ["Portal", "Email", "Hand Delivery", "Registered Mail", "Other"];

export async function getTenantNoticeContext(access) {
  if (!access.tenant) return { leaseIds: [], propertyIds: [], unitIds: [] };
  const rows = await getTenantLeases(access.organization_id, access.tenant.id);
  return { leaseIds: rows.map(r => r.lease.id), propertyIds: rows.map(r => r.lease.property_id), unitIds: rows.map(r => r.lease.unit_id) };
}

export async function getTenantNotices(access) {
  const ctx = await getTenantNoticeContext(access);
  const records = await base44.entities.Notice.filter({ organization_id: access.organization_id }, "-served_date", 100);
  return records.filter(activeOnly).filter(n => ["Served", "Acknowledged"].includes(n.status)).filter(n => n.tenant_id_nullable === access.tenant?.id || ctx.leaseIds.includes(n.lease_id_nullable) || ctx.unitIds.includes(n.unit_id_nullable) || ctx.propertyIds.includes(n.property_id_nullable)).map(({ internal_admin_note, ...safe }) => safe);
}

export async function createNotice(access, data) {
  const saved = await base44.entities.Notice.create(data);
  await createAuditLog({ organizationId: data.organization_id, user: access.user, role: access.membership.role, action: "Notice/Form created", entityType: "Notice", entityId: saved.id, afterValues: saved, reason: "Admin created notice/form" });
  return saved;
}

export async function updateNotice(access, before, updates, action = "Notice/Form updated") {
  const saved = await base44.entities.Notice.update(before.id, updates);
  await createAuditLog({ organizationId: before.organization_id, user: access.user, role: access.membership.role, action, entityType: "Notice", entityId: before.id, beforeValues: before, afterValues: saved, reason: action });
  return saved;
}

export async function acknowledgeNotice(access, before) {
  const saved = await base44.entities.Notice.update(before.id, { status: "Acknowledged", acknowledged_at: new Date().toISOString(), acknowledged_by_user_id: access.user.id });
  await createAuditLog({ organizationId: before.organization_id, user: access.user, role: access.membership.role, action: "Notice/Form acknowledged", entityType: "Notice", entityId: before.id, beforeValues: before, afterValues: saved, reason: "Tenant acknowledged notice/form" });
  return saved;
}

export async function archiveNotice(access, before) {
  const saved = await base44.entities.Notice.update(before.id, { status: "Archived", deleted_at: new Date().toISOString() });
  await createAuditLog({ organizationId: before.organization_id, user: access.user, role: access.membership.role, action: "Notice/Form archived", entityType: "Notice", entityId: before.id, beforeValues: before, afterValues: saved, reason: "Admin archived notice/form" });
  return saved;
}