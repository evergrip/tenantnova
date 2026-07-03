import { base44 } from "@/api/base44Client";
import { activeOnly, createAuditLog, getTenantLeases } from "@/lib/tenantNova";

export const contactCategories = ["General", "Rent/Payments", "Lease", "Documents", "Notices/Forms", "Maintenance Follow-up", "Renewal/Move-Out", "Emergency Contact Update", "Other"];
export const contactPriorities = ["Low", "Normal", "High", "Urgent"];
export const contactStatuses = ["New", "Under Review", "Responded", "Closed", "Archived"];
export const contactMethods = ["Portal", "Email", "Phone", "Text"];

export async function getTenantContactMessages(access) {
  if (!access.tenant) return [];
  const records = await base44.entities.ContactMessage.filter({ organization_id: access.organization_id, tenant_id: access.tenant.id }, "-created_date", 100);
  return records.filter(activeOnly).filter(m => m.status !== "Archived").map(({ internal_admin_note, ...safe }) => safe);
}

export async function createContactMessage(access, data) {
  const leases = access.tenant ? await getTenantLeases(access.organization_id, access.tenant.id) : [];
  const lease = leases[0]?.lease;
  const saved = await base44.entities.ContactMessage.create({ ...data, organization_id: access.organization_id, tenant_id: access.tenant.id, submitted_by_user_id: access.user.id, lease_id_nullable: lease?.id || "", property_id_nullable: lease?.property_id || "", unit_id_nullable: lease?.unit_id || "" });
  await createAuditLog({ organizationId: access.organization_id, user: access.user, role: access.membership.role, action: "Contact message submitted", entityType: "ContactMessage", entityId: saved.id, afterValues: saved, reason: "Tenant submitted contact message" });
  return saved;
}

export async function updateContactMessage(access, before, updates, action = "Contact message updated") {
  const saved = await base44.entities.ContactMessage.update(before.id, updates);
  await createAuditLog({ organizationId: before.organization_id, user: access.user, role: access.membership.role, action, entityType: "ContactMessage", entityId: before.id, beforeValues: before, afterValues: saved, reason: action });
  return saved;
}

export async function respondToContactMessage(access, before, response) {
  const saved = await updateContactMessage(access, before, { status: "Responded", admin_response: response, responded_by_user_id: access.user.id, responded_at: new Date().toISOString() }, "Contact message responded");
  return saved;
}

export async function archiveContactMessage(access, before) {
  const saved = await updateContactMessage(access, before, { status: "Archived", deleted_at: new Date().toISOString() }, "Contact message archived");
  return saved;
}