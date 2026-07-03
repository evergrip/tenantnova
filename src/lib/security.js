import { base44 } from "@/api/base44Client";

export const TENANTNOVA_ROLES = ["Admin", "Tenant", "Applicant", "Vendor", "Investor", "Staff", "ReadOnlyAdmin"];
export const ADMIN_ONLY_ROLES = ["Admin"];
export const COMMAND_CENTER_ROLES = ["Admin", "Staff", "ReadOnlyAdmin"];
export const TENANT_VISIBLE_DOCUMENT_VISIBILITIES = ["Tenant Only", "Shared With Tenant"];
export const APPLICANT_VISIBLE_DOCUMENT_VISIBILITIES = ["Tenant Only", "Shared With Tenant"];
export const tenantLeaseAccessLevels = ["Full Lease Access", "Limited Occupant Access", "Historical Access"];

const adminOnly = { read: { user_condition: { role: "admin" } }, write: { user_condition: { role: "admin" } } };
export const PHASE_2D_ENTITY_RLS_TEMPLATE = { delete: false };
export const PHASE_2D_ADMIN_FIELD_RLS = adminOnly;

export class UnauthorizedAccessError extends Error {
  constructor(reason, entityType, entityId) {
    super(reason || "Unauthorized access");
    this.name = "UnauthorizedAccessError";
    this.entityType = entityType || "Unknown";
    this.entityId = entityId || "unknown";
  }
}

export function isActiveRecord(record) {
  return !!record && record.is_active !== false && !record.deleted_at;
}

export function isTenantParticipantActive(participant) {
  if (!isActiveRecord(participant)) return false;
  return tenantLeaseAccessLevels.includes(participant.access_level);
}

export function hasRole(accessOrMembership, roles) {
  const role = accessOrMembership?.membership?.role || accessOrMembership?.role;
  return roles.includes(role);
}

export async function denyUnauthorizedAccess(reason, entityType, entityId, context = {}) {
  const access = context.access || {};
  const user = context.user || access.user || {};
  const organizationId = context.organizationId || access.organization_id || access.organization?.id || "unknown";
  try {
    await base44.entities.AuditLog.create({
      organization_id: organizationId,
      actor_user_id: user.id || "unknown",
      actor_role: access.membership?.role || user.role || "Unknown",
      action: "Unauthorized access denied",
      entity_type: entityType || "Unknown",
      entity_id: entityId || "unknown",
      before_values_json: {},
      after_values_json: {},
      timestamp: new Date().toISOString(),
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      notes: "TenantNova Phase 2D helper-enforced denial. Database/entity-layer denial may still require separate verification.",
      reason: reason || "Unauthorized direct-ID or scoped data access attempt"
    });
  } catch {
    // Audit write failures must not disclose protected records.
  }
  throw new UnauthorizedAccessError(reason, entityType, entityId);
}

export async function requireOrganizationAccess(user, organizationId) {
  if (!user?.id || !organizationId) throw new UnauthorizedAccessError("Missing user or organization", "Organization", organizationId);
  const memberships = await base44.entities.OrganizationMembership.filter({ user_id: user.id, organization_id: organizationId, is_active: true });
  const membership = memberships.find(m => isActiveRecord(m) && TENANTNOVA_ROLES.includes(m.role));
  if (!membership) throw new UnauthorizedAccessError("No active organization membership", "Organization", organizationId);
  return membership;
}

export async function requireAdminAccess(user, organizationId) {
  const membership = await requireOrganizationAccess(user, organizationId);
  if (membership.role !== "Admin") throw new UnauthorizedAccessError("Admin access required", "Organization", organizationId);
  return membership;
}

export async function requireCommandCenterAccess(user, organizationId) {
  const membership = await requireOrganizationAccess(user, organizationId);
  if (!COMMAND_CENTER_ROLES.includes(membership.role)) throw new UnauthorizedAccessError("Command-center access required", "Organization", organizationId);
  return membership;
}

export async function requireTenantLeaseAccess(user, leaseId) {
  const lease = await base44.entities.Lease.get(leaseId).catch(() => null);
  if (!isActiveRecord(lease)) throw new UnauthorizedAccessError("Lease not found or inactive", "Lease", leaseId);
  await requireOrganizationAccess(user, lease.organization_id);
  const tenants = (await base44.entities.Tenant.filter({ organization_id: lease.organization_id, auth_user_id: user.id })).filter(isActiveRecord);
  for (const tenant of tenants) {
    const participants = await base44.entities.LeaseParticipant.filter({ organization_id: lease.organization_id, tenant_id: tenant.id, lease_id: lease.id, is_active: true });
    const participant = participants.find(isTenantParticipantActive);
    if (participant) return { lease, tenant, participant, organizationId: lease.organization_id };
  }
  throw new UnauthorizedAccessError("Tenant lease access denied", "Lease", leaseId);
}

export async function requireApplicantApplicationAccess(user, applicationId) {
  const application = await base44.entities.RentalApplication.get(applicationId).catch(() => null);
  if (!isActiveRecord(application) || application.applicant_user_id !== user?.id) {
    throw new UnauthorizedAccessError("Applicant application access denied", "RentalApplication", applicationId);
  }
  await requireOrganizationAccess(user, application.organization_id);
  return application;
}

export async function canAccessDocument(user, documentId) {
  const document = await base44.entities.Document.get(documentId).catch(() => null);
  if (!isActiveRecord(document) || document.is_active === false) return { allowed: false, reason: "Document not found or inactive" };
  const memberships = (await base44.entities.OrganizationMembership.filter({ user_id: user.id, organization_id: document.organization_id, is_active: true })).filter(isActiveRecord);
  const adminMembership = memberships.find(m => m.role === "Admin");
  if (adminMembership) return { allowed: true, role: "Admin", document: sanitizeStaffPayload(document, "Document", { includeFileReference: true }) };

  const applicantMembership = memberships.find(m => m.role === "Applicant");
  if (applicantMembership && document.application_id_nullable && APPLICANT_VISIBLE_DOCUMENT_VISIBILITIES.includes(document.visibility)) {
    const application = await base44.entities.RentalApplication.get(document.application_id_nullable).catch(() => null);
    if (isActiveRecord(application) && application.applicant_user_id === user.id) return { allowed: true, role: "Applicant", document: sanitizeApplicantPayload(document, "Document") };
  }

  const tenantMembership = memberships.find(m => m.role === "Tenant");
  if (tenantMembership && TENANT_VISIBLE_DOCUMENT_VISIBILITIES.includes(document.visibility)) {
    const tenants = (await base44.entities.Tenant.filter({ organization_id: document.organization_id, auth_user_id: user.id })).filter(isActiveRecord);
    for (const tenant of tenants) {
      if (document.tenant_id_nullable === tenant.id) return { allowed: true, role: "Tenant", document: sanitizeTenantPayload(document, "Document") };
      if (document.lease_id_nullable) {
        const participants = await base44.entities.LeaseParticipant.filter({ organization_id: document.organization_id, tenant_id: tenant.id, lease_id: document.lease_id_nullable, is_active: true });
        if (participants.some(isTenantParticipantActive)) return { allowed: true, role: "Tenant", document: sanitizeTenantPayload(document, "Document") };
      }
    }
  }

  return { allowed: false, reason: "Document authorization denied" };
}

const tenantRedactedFields = [
  "internal_notes", "internal_admin_note", "admin_review_notes", "decision_reason_internal", "internal_score", "cost_estimate", "actual_cost", "vendor_id_nullable", "assigned_to_user_id_nullable", "chargeback_amount", "evidence_notes", "blocker_reason_nullable", "file_url_or_storage_reference", "risk_notes", "capex_notes", "NOI", "cash_flow_after_debt_optional", "property_snapshot_json", "maintenance_summary_json", "leasing_summary_json", "inspection_summary_json", "application_summary_json", "forms_compliance_summary_json", "before_values_json", "after_values_json", "draft_metadata_json"
];

const applicantRedactedFields = [
  "internal_score", "internal_notes", "admin_review_notes", "decision_reason_internal", "file_url_or_storage_reference", "before_values_json", "after_values_json", "evidence_notes", "blocker_reason_nullable", "draft_metadata_json"
];

const staffRedactedFields = [
  "file_url_or_storage_reference", "before_values_json", "after_values_json", "security_review_required_boolean", "blocker_reason_nullable", "evidence_notes", "internal_score", "decision_reason_internal"
];

function omitFields(record, fields) {
  if (!record) return record;
  const safe = { ...record };
  fields.forEach(field => delete safe[field]);
  return safe;
}

export function sanitizeTenantPayload(record, entityType) {
  if (!record) return record;
  if (["AuditLog", "InvestorReport", "NotificationEvent", "AdminTask", "IntegrationReadinessItem", "ProductionHardeningItem", "SecurityReviewItem"].includes(entityType)) return null;
  return omitFields(record, tenantRedactedFields);
}

export function sanitizeApplicantPayload(record, entityType) {
  if (!record) return record;
  if (["AuditLog", "InvestorReport", "NotificationEvent", "AdminTask", "IntegrationReadinessItem", "ProductionHardeningItem", "SecurityReviewItem", "FinancialLedgerEntry"].includes(entityType)) return null;
  return omitFields(record, applicantRedactedFields);
}

export function sanitizeStaffPayload(record, entityType, options = {}) {
  if (!record) return record;
  const redactions = options.includeFileReference ? staffRedactedFields.filter(f => f !== "file_url_or_storage_reference") : staffRedactedFields;
  return omitFields(record, redactions);
}

export const PHASE_2D_ENTITY_SECURITY_COVERAGE = {
  Organization: "Organization access helper + delete-deny RLS recommended; relationship isolation helper-enforced.",
  OrganizationMembership: "Organization access helper + role checks; membership relationship is helper-enforced.",
  Property: "Organization helper for direct-ID, staff redaction for notes/financial ownership context.",
  Unit: "Organization helper for direct-ID, tenant/applicant safe-label usage only.",
  Tenant: "Tenant self-access via auth_user_id and LeaseParticipant context; helper-enforced.",
  Lease: "Tenant access via active LeaseParticipant; helper-enforced.",
  LeaseParticipant: "Tenant access source of truth; helper-enforced.",
  AuditLog: "Read restricted; update/delete must be denied by RLS where possible; immutability remains production-blocking until proven.",
  FinancialLedgerEntry: "Tenant lease-scoped reads with internal note redaction; helper-enforced.",
  Document: "Category/visibility-aware helper plus file reference redaction; signed URL authorization remains future blocker.",
  MaintenanceRequest: "Tenant lease/tenant-scoped reads with cost/vendor/internal redaction; helper-enforced.",
  InspectionReport: "Tenant reads shared inspections only with internal notes redacted; helper-enforced.",
  RentalApplication: "Applicant self-access and internal review redaction; helper-enforced.",
  FormsLibrary: "Legal workflow remains prototype-only; tenant/applicant access only to safe drafted metadata.",
  ComplianceRule: "Legal rules remain unverified; public/tenant safe guidance only with warnings.",
  FormWorkflowRule: "Tenant/applicant access only through safe forms workflow, admin review required.",
  InvestorReport: "Admin-only; tenant/applicant redaction returns null.",
  NotificationEvent: "Command-center only; tenant/applicant redaction returns null.",
  AdminTask: "Command-center only; tenant/applicant redaction returns null.",
  IntegrationReadinessItem: "Command-center read, admin write; sensitive details redacted from staff.",
  ProductionHardeningItem: "Command-center read, admin write; evidence details controlled.",
  SecurityReviewItem: "Admin/security only for vulnerability details; staff redaction required."
};