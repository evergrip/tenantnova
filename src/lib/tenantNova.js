import { base44 } from "@/api/base44Client";

export const ADMIN_ROLES = ["Admin", "ReadOnlyAdmin"];
export const COMMAND_CENTER_ROLES = ["Admin", "Staff"];
export const activeOnly = (record) => !record?.deleted_at;
export const tenantLeaseAccess = ["Full Lease Access", "Limited Occupant Access", "Historical Access"];

export async function createAuditLog({ organizationId, user, role, action, entityType, entityId, beforeValues, afterValues, reason }) {
  await base44.entities.AuditLog.create({
    organization_id: organizationId,
    actor_user_id: user?.id || "system",
    actor_role: role || user?.role || "Unknown",
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_values_json: beforeValues || {},
    after_values_json: afterValues || {},
    timestamp: new Date().toISOString(),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    notes: "TenantNova Phase 1A application-enforced audit event.",
    reason: reason || "Phase 1A record change"
  });
}

export async function resolveTenantNovaAccess() {
  const user = await base44.auth.me();
  let memberships = await base44.entities.OrganizationMembership.filter({ user_id: user.id, is_active: true });
  memberships = memberships.filter(activeOnly);

  if (memberships.length === 0 && user.role === "admin") {
    let orgs = await base44.entities.Organization.list("-created_date", 1);
    orgs = orgs.filter(activeOnly);
    let org = orgs[0];
    if (!org) {
      org = await base44.entities.Organization.create({
        name: "Get Real Management",
        primary_color: "#0f766e",
        support_email: user.email,
        default_province: "NS",
        rent_due_day_default: 1,
        is_active: true
      });
    }
    const membership = await base44.entities.OrganizationMembership.create({
      organization_id: org.id,
      user_id: user.id,
      role: "Admin",
      is_active: true
    });
    memberships = [membership];
    await createAuditLog({ organizationId: org.id, user, role: "Admin", action: "OrganizationMembership created", entityType: "OrganizationMembership", entityId: membership.id, afterValues: membership, reason: "Initial admin membership bootstrap" });
  }

  if (memberships.length === 0) return { user, status: "no_membership" };
  const membership = memberships.find(m => m.role === "Admin") || memberships.find(m => m.role === "Tenant") || memberships.find(m => m.role === "Applicant") || memberships[0];
  const organization = await base44.entities.Organization.get(membership.organization_id);
  const isAdmin = memberships.some(m => m.organization_id === membership.organization_id && m.role === "Admin");
  const isCommandCenterUser = memberships.some(m => m.organization_id === membership.organization_id && COMMAND_CENTER_ROLES.includes(m.role));
  const isTenant = memberships.some(m => m.organization_id === membership.organization_id && m.role === "Tenant");
  const isApplicant = memberships.some(m => m.organization_id === membership.organization_id && m.role === "Applicant");
  const tenantProfiles = isTenant
    ? (await base44.entities.Tenant.filter({ organization_id: membership.organization_id, auth_user_id: user.id })).filter(activeOnly)
    : [];

  return { user, membership, organization, tenant: tenantProfiles[0] || null, status: "ready", isAdmin, isCommandCenterUser, isTenant, isApplicant };
}

export function canTenantUseParticipant(participant) {
  if (!participant || participant.deleted_at) return false;
  if (participant.access_level === "No Portal Access") return false;
  if (participant.is_active) return tenantLeaseAccess.includes(participant.access_level);
  return participant.access_level === "Historical Access";
}

export async function getTenantLeases(organizationId, tenantId) {
  const participants = (await base44.entities.LeaseParticipant.filter({ organization_id: organizationId, tenant_id: tenantId })).filter(canTenantUseParticipant);
  const leases = [];
  for (const participant of participants) {
    const lease = await base44.entities.Lease.get(participant.lease_id);
    if (lease && activeOnly(lease)) leases.push({ lease, participant });
  }
  return leases;
}

export async function softArchive(entityName, record, access, reason) {
  const archived = await base44.entities[entityName].update(record.id, { deleted_at: new Date().toISOString() });
  await createAuditLog({ organizationId: record.organization_id || access.organization?.id, user: access.user, role: access.membership?.role, action: `${entityName} archived`, entityType: entityName, entityId: record.id, beforeValues: record, afterValues: archived, reason });
  return archived;
}