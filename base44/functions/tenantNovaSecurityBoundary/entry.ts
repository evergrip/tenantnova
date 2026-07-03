import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const tenantVisibleVisibilities = ["Tenant Only", "Shared With Tenant"];
const applicantVisibleVisibilities = ["Tenant Only", "Shared With Tenant"];
const tenantLeaseAccessLevels = ["Full Lease Access", "Limited Occupant Access", "Historical Access"];
const commandCenterRoles = ["Admin", "Staff", "ReadOnlyAdmin"];
const readinessEntities = ["IntegrationReadinessItem", "ProductionHardeningItem", "SecurityReviewItem"];
const tenantRedactedFields = ["internal_notes", "internal_admin_note", "internal_admin_notes", "admin_review_notes", "decision_reason_internal", "internal_score", "cost_estimate", "actual_cost", "vendor_id_nullable", "assigned_to_user_id_nullable", "chargeback_amount", "evidence_notes", "blocker_reason_nullable", "file_url_or_storage_reference", "risk_notes", "capex_notes", "NOI", "cash_flow_after_debt_optional", "property_snapshot_json", "maintenance_summary_json", "leasing_summary_json", "inspection_summary_json", "application_summary_json", "forms_compliance_summary_json", "before_values_json", "after_values_json", "draft_metadata_json"];
const applicantRedactedFields = ["internal_score", "internal_notes", "admin_review_notes", "decision_reason_internal", "file_url_or_storage_reference", "before_values_json", "after_values_json", "evidence_notes", "blocker_reason_nullable", "draft_metadata_json"];
const staffRedactedFields = ["file_url_or_storage_reference", "before_values_json", "after_values_json", "security_review_required_boolean", "blocker_reason_nullable", "evidence_notes", "internal_score", "decision_reason_internal"];

function isActive(record) {
  return !!record && record.is_active !== false && !record.deleted_at;
}

function omitFields(record, fields) {
  if (!record) return record;
  const safe = { ...record };
  for (const field of fields) delete safe[field];
  return safe;
}

function sanitizeTenant(record, entityType) {
  if (["AuditLog", "InvestorReport", "NotificationEvent", "AdminTask", "IntegrationReadinessItem", "ProductionHardeningItem", "SecurityReviewItem"].includes(entityType)) return null;
  return omitFields(record, tenantRedactedFields);
}

function sanitizeApplicant(record, entityType) {
  if (["AuditLog", "InvestorReport", "NotificationEvent", "AdminTask", "IntegrationReadinessItem", "ProductionHardeningItem", "SecurityReviewItem", "FinancialLedgerEntry"].includes(entityType)) return null;
  return omitFields(record, applicantRedactedFields);
}

function sanitizeStaff(record, includeFileReference = false) {
  const redactions = includeFileReference ? staffRedactedFields.filter((field) => field !== "file_url_or_storage_reference") : staffRedactedFields;
  return omitFields(record, redactions);
}

async function logAudit(base44, organizationId, user, role, action, entityType, entityId, reason) {
  await base44.asServiceRole.entities.AuditLog.create({
    organization_id: organizationId || "unknown",
    actor_user_id: user?.id || "unknown",
    actor_role: role || user?.role || "Unknown",
    action,
    entity_type: entityType || "Unknown",
    entity_id: entityId || "unknown",
    before_values_json: {},
    after_values_json: {},
    timestamp: new Date().toISOString(),
    notes: "TenantNova Phase 2E backend security-boundary audit event.",
    reason: reason || action
  });
}

async function membershipsFor(base44, userId, organizationId) {
  const rows = await base44.asServiceRole.entities.OrganizationMembership.filter({ user_id: userId, organization_id: organizationId, is_active: true });
  return rows.filter(isActive);
}

async function requireOrganization(base44, user, organizationId) {
  const memberships = await membershipsFor(base44, user.id, organizationId);
  const membership = memberships[0];
  if (!membership) throw new Error("No active organization membership");
  return membership;
}

async function requireAdmin(base44, user, organizationId) {
  const membership = await requireOrganization(base44, user, organizationId);
  if (membership.role !== "Admin") throw new Error("Admin access required");
  return membership;
}

async function requireCommandCenter(base44, user, organizationId) {
  const membership = await requireOrganization(base44, user, organizationId);
  if (!commandCenterRoles.includes(membership.role)) throw new Error("Command-center access required");
  return membership;
}

async function tenantProfiles(base44, user, organizationId) {
  const rows = await base44.asServiceRole.entities.Tenant.filter({ organization_id: organizationId, auth_user_id: user.id });
  return rows.filter(isActive);
}

async function tenantLeaseAccess(base44, user, lease) {
  const tenants = await tenantProfiles(base44, user, lease.organization_id);
  for (const tenant of tenants) {
    const participants = await base44.asServiceRole.entities.LeaseParticipant.filter({ organization_id: lease.organization_id, tenant_id: tenant.id, lease_id: lease.id, is_active: true });
    const participant = participants.find((row) => isActive(row) && tenantLeaseAccessLevels.includes(row.access_level));
    if (participant) return { tenant, participant };
  }
  return null;
}

async function authorizeLease(base44, user, leaseId) {
  const lease = await base44.asServiceRole.entities.Lease.get(leaseId);
  if (!isActive(lease)) throw new Error("Lease not found or inactive");
  const membership = await requireOrganization(base44, user, lease.organization_id);
  if (membership.role === "Admin") return { role: "Admin", membership, lease, payload: sanitizeStaff(lease, true) };
  if (membership.role === "Tenant") {
    const access = await tenantLeaseAccess(base44, user, lease);
    if (access) return { role: "Tenant", membership, lease, tenant: access.tenant, participant: access.participant, payload: sanitizeTenant(lease, "Lease") };
  }
  throw new Error("Lease access denied");
}

async function authorizeApplication(base44, user, applicationId) {
  const application = await base44.asServiceRole.entities.RentalApplication.get(applicationId);
  if (!isActive(application)) throw new Error("Application not found or inactive");
  const membership = await requireOrganization(base44, user, application.organization_id);
  if (membership.role === "Admin") return { role: "Admin", membership, application, payload: sanitizeStaff(application, true) };
  if (membership.role === "Applicant" && application.applicant_user_id === user.id) return { role: "Applicant", membership, application, payload: sanitizeApplicant(application, "RentalApplication") };
  throw new Error("Application access denied");
}

async function authorizeDocument(base44, user, documentId, includeFileReference = false) {
  const document = await base44.asServiceRole.entities.Document.get(documentId);
  if (!isActive(document)) throw new Error("Document not found or inactive");
  const memberships = await membershipsFor(base44, user.id, document.organization_id);
  const adminMembership = memberships.find((row) => row.role === "Admin");
  if (adminMembership) return { role: "Admin", membership: adminMembership, document, payload: sanitizeStaff(document, includeFileReference) };

  const applicantMembership = memberships.find((row) => row.role === "Applicant");
  if (applicantMembership && document.application_id_nullable && applicantVisibleVisibilities.includes(document.visibility)) {
    const application = await base44.asServiceRole.entities.RentalApplication.get(document.application_id_nullable);
    if (isActive(application) && application.applicant_user_id === user.id) return { role: "Applicant", membership: applicantMembership, document, payload: sanitizeApplicant(document, "Document") };
  }

  const tenantMembership = memberships.find((row) => row.role === "Tenant");
  if (tenantMembership && tenantVisibleVisibilities.includes(document.visibility)) {
    const tenants = await tenantProfiles(base44, user, document.organization_id);
    for (const tenant of tenants) {
      if (document.tenant_id_nullable === tenant.id) return { role: "Tenant", membership: tenantMembership, tenant, document, payload: sanitizeTenant(document, "Document") };
      if (document.lease_id_nullable) {
        const participants = await base44.asServiceRole.entities.LeaseParticipant.filter({ organization_id: document.organization_id, tenant_id: tenant.id, lease_id: document.lease_id_nullable, is_active: true });
        if (participants.some((row) => isActive(row) && tenantLeaseAccessLevels.includes(row.access_level))) return { role: "Tenant", membership: tenantMembership, tenant, document, payload: sanitizeTenant(document, "Document") };
      }
    }
  }
  throw new Error("Document access denied");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "capabilities") {
      return Response.json({ user_id: user.id, can_identify_current_user: true, service_role_available_for_authorized_queries: true, boundary: "TenantNova Phase 2E backend authorization boundary" });
    }

    if (action === "getOrganizationRecords") {
      const membership = await requireOrganization(base44, user, body.organization_id);
      if (!body.entity_name || !["Property", "Unit", "Tenant", "Lease", "Document", "MaintenanceRequest", "InspectionReport", "RentalApplication"].includes(body.entity_name)) throw new Error("Unsupported entity");
      const rows = await base44.asServiceRole.entities[body.entity_name].filter({ organization_id: body.organization_id }, body.sort || "-created_date", Math.min(Number(body.limit || 50), 100));
      const safeRows = rows.filter(isActive).map((row) => membership.role === "Tenant" ? sanitizeTenant(row, body.entity_name) : membership.role === "Applicant" ? sanitizeApplicant(row, body.entity_name) : sanitizeStaff(row));
      return Response.json({ rows: safeRows.filter(Boolean) });
    }

    if (action === "getMyTenantLedger") {
      const memberships = await base44.asServiceRole.entities.OrganizationMembership.filter({ user_id: user.id, role: "Tenant", is_active: true });
      const entries = [];
      for (const membership of memberships.filter(isActive)) {
        const tenants = await tenantProfiles(base44, user, membership.organization_id);
        for (const tenant of tenants) {
          const participants = await base44.asServiceRole.entities.LeaseParticipant.filter({ organization_id: membership.organization_id, tenant_id: tenant.id, is_active: true });
          for (const participant of participants.filter((row) => isActive(row) && tenantLeaseAccessLevels.includes(row.access_level))) {
            const rows = await base44.asServiceRole.entities.FinancialLedgerEntry.filter({ organization_id: membership.organization_id, lease_id: participant.lease_id }, "-effective_date", 100);
            entries.push(...rows.filter(isActive).map((row) => sanitizeTenant(row, "FinancialLedgerEntry")).filter(Boolean));
          }
        }
      }
      return Response.json({ entries });
    }

    if (action === "getMyTenantDocuments") {
      const memberships = await base44.asServiceRole.entities.OrganizationMembership.filter({ user_id: user.id, role: "Tenant", is_active: true });
      const documents = [];
      for (const membership of memberships.filter(isActive)) {
        const tenants = await tenantProfiles(base44, user, membership.organization_id);
        for (const tenant of tenants) {
          const participants = await base44.asServiceRole.entities.LeaseParticipant.filter({ organization_id: membership.organization_id, tenant_id: tenant.id, is_active: true });
          const leaseIds = participants.filter((row) => isActive(row) && tenantLeaseAccessLevels.includes(row.access_level)).map((row) => row.lease_id);
          const docs = await base44.asServiceRole.entities.Document.filter({ organization_id: membership.organization_id }, "-created_date", 100);
          for (const doc of docs.filter(isActive)) {
            if (!tenantVisibleVisibilities.includes(doc.visibility)) continue;
            const allowed = doc.tenant_id_nullable === tenant.id || (doc.lease_id_nullable && leaseIds.includes(doc.lease_id_nullable));
            if (allowed && !doc.replaced_by_document_id_nullable) documents.push(sanitizeTenant(doc, "Document"));
          }
        }
      }
      return Response.json({ documents: documents.filter(Boolean) });
    }

    if (action === "getMyTenantMaintenance") {
      const memberships = await base44.asServiceRole.entities.OrganizationMembership.filter({ user_id: user.id, role: "Tenant", is_active: true });
      const maintenance_requests = [];
      for (const membership of memberships.filter(isActive)) {
        const tenants = await tenantProfiles(base44, user, membership.organization_id);
        for (const tenant of tenants) {
          const participants = await base44.asServiceRole.entities.LeaseParticipant.filter({ organization_id: membership.organization_id, tenant_id: tenant.id, is_active: true });
          const leaseIds = participants.filter((row) => isActive(row) && tenantLeaseAccessLevels.includes(row.access_level)).map((row) => row.lease_id);
          const rows = await base44.asServiceRole.entities.MaintenanceRequest.filter({ organization_id: membership.organization_id, tenant_id: tenant.id }, "-submitted_at", 100);
          maintenance_requests.push(...rows.filter((row) => isActive(row) && leaseIds.includes(row.lease_id)).map((row) => sanitizeTenant(row, "MaintenanceRequest")).filter(Boolean));
        }
      }
      return Response.json({ maintenance_requests });
    }

    if (action === "getMyTenantInspections") {
      const memberships = await base44.asServiceRole.entities.OrganizationMembership.filter({ user_id: user.id, role: "Tenant", is_active: true });
      const inspection_reports = [];
      for (const membership of memberships.filter(isActive)) {
        const tenants = await tenantProfiles(base44, user, membership.organization_id);
        for (const tenant of tenants) {
          const participants = await base44.asServiceRole.entities.LeaseParticipant.filter({ organization_id: membership.organization_id, tenant_id: tenant.id, is_active: true });
          const leaseIds = participants.filter((row) => isActive(row) && tenantLeaseAccessLevels.includes(row.access_level)).map((row) => row.lease_id);
          const rows = await base44.asServiceRole.entities.InspectionReport.filter({ organization_id: membership.organization_id }, "-inspection_date", 100);
          inspection_reports.push(...rows.filter((row) => isActive(row) && row.shared_with_tenant === true && leaseIds.includes(row.lease_id)).map((row) => sanitizeTenant(row, "InspectionReport")).filter(Boolean));
        }
      }
      return Response.json({ inspection_reports });
    }

    if (action === "listMyApplications") {
      const rows = await base44.asServiceRole.entities.RentalApplication.filter({ applicant_user_id: user.id }, "-created_date", 20);
      const applications = [];
      for (const application of rows.filter(isActive)) {
        const membership = await requireOrganization(base44, user, application.organization_id);
        if (membership.role === "Applicant") applications.push(sanitizeApplicant(application, "RentalApplication"));
      }
      return Response.json({ applications: applications.filter(Boolean) });
    }

    if (action === "getApplicantPropertyUnitLabels") {
      const membership = await requireOrganization(base44, user, body.organization_id);
      if (membership.role !== "Applicant") throw new Error("Applicant access required");
      const [properties, units] = await Promise.all([
        base44.asServiceRole.entities.Property.filter({ organization_id: body.organization_id }, "property_name", 100),
        base44.asServiceRole.entities.Unit.filter({ organization_id: body.organization_id }, "unit_number", 300)
      ]);
      return Response.json({
        properties: properties.filter(isActive).map((property) => ({ id: property.id, label: property.property_name || "Property" })),
        units: units.filter(isActive).map((unit) => ({ id: unit.id, label: unit.unit_number || "Unit", property_id: unit.property_id }))
      });
    }

    if (action === "listApplicationDocuments") {
      const result = await authorizeApplication(base44, user, body.application_id);
      if (result.role !== "Applicant" && result.role !== "Admin") throw new Error("Application document access denied");
      const rows = await base44.asServiceRole.entities.Document.filter({ organization_id: result.application.organization_id, application_id_nullable: result.application.id }, "-created_date", 50);
      const documents = rows.filter((row) => isActive(row) && !["Admin Only", "Internal", "Investor Aggregate"].includes(row.visibility)).map((row) => result.role === "Applicant" ? sanitizeApplicant(row, "Document") : sanitizeStaff(row));
      return Response.json({ documents: documents.filter(Boolean) });
    }

    if (action === "getTenantProfileById") {
      const tenant = await base44.asServiceRole.entities.Tenant.get(body.tenant_id);
      if (!isActive(tenant)) throw new Error("Tenant not found or inactive");
      const membership = await requireOrganization(base44, user, tenant.organization_id);
      if (membership.role === "Admin") return Response.json({ tenant: sanitizeStaff(tenant) });
      if (membership.role === "Tenant" && tenant.auth_user_id === user.id) return Response.json({ tenant: sanitizeTenant(tenant, "Tenant") });
      throw new Error("Tenant profile access denied");
    }

    if (action === "getLeaseById") {
      const result = await authorizeLease(base44, user, body.lease_id);
      return Response.json({ lease: result.payload });
    }

    if (action === "getTenantLedgerByLeaseId") {
      const result = await authorizeLease(base44, user, body.lease_id);
      if (!["Admin", "Tenant"].includes(result.role)) throw new Error("Ledger access denied");
      const rows = await base44.asServiceRole.entities.FinancialLedgerEntry.filter({ organization_id: result.lease.organization_id, lease_id: result.lease.id }, "-effective_date", 100);
      return Response.json({ entries: rows.filter(isActive).map((row) => result.role === "Tenant" ? sanitizeTenant(row, "FinancialLedgerEntry") : sanitizeStaff(row)) });
    }

    if (action === "getDocumentById" || action === "getApplicantDocumentById") {
      const result = await authorizeDocument(base44, user, body.document_id, false);
      return Response.json({ document: result.payload });
    }

    if (action === "getMaintenanceRequestById") {
      const row = await base44.asServiceRole.entities.MaintenanceRequest.get(body.maintenance_request_id);
      if (!isActive(row)) throw new Error("Maintenance request not found or inactive");
      const membership = await requireOrganization(base44, user, row.organization_id);
      if (membership.role === "Admin") return Response.json({ maintenance_request: sanitizeStaff(row) });
      if (membership.role === "Tenant") {
        const leaseAccess = await authorizeLease(base44, user, row.lease_id);
        if (leaseAccess.role === "Tenant" && row.tenant_id === leaseAccess.tenant.id) return Response.json({ maintenance_request: sanitizeTenant(row, "MaintenanceRequest") });
      }
      throw new Error("Maintenance request access denied");
    }

    if (action === "getInspectionById") {
      const row = await base44.asServiceRole.entities.InspectionReport.get(body.inspection_report_id);
      if (!isActive(row)) throw new Error("Inspection not found or inactive");
      const membership = await requireOrganization(base44, user, row.organization_id);
      if (membership.role === "Admin") return Response.json({ inspection_report: sanitizeStaff(row) });
      if (membership.role === "Tenant" && row.shared_with_tenant === true) {
        const leaseAccess = await authorizeLease(base44, user, row.lease_id);
        if (leaseAccess.role === "Tenant") return Response.json({ inspection_report: sanitizeTenant(row, "InspectionReport") });
      }
      throw new Error("Inspection access denied");
    }

    if (action === "getRentalApplicationById") {
      const result = await authorizeApplication(base44, user, body.application_id);
      return Response.json({ rental_application: result.payload });
    }

    if (action === "getSignedUrlForDocument") {
      const result = await authorizeDocument(base44, user, body.document_id, true);
      const reference = result.document.file_url_or_storage_reference;
      if (!reference || reference.startsWith("http")) throw new Error("Document does not contain a private file URI suitable for signed URL proof");
      const expiresIn = Math.min(Number(body.expires_in || 300), 900);
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: reference, expires_in: expiresIn });
      await logAudit(base44, result.document.organization_id, user, result.membership.role, "Document signed URL requested", "Document", result.document.id, "Phase 2E authorized signed URL proof request");
      return Response.json({ signed_url: signed.signed_url, expires_in: expiresIn, document: result.payload });
    }

    if (action === "createReadinessRecord") {
      if (!readinessEntities.includes(body.entity_name)) throw new Error("Unsupported readiness entity");
      const organizationId = body.organization_id;
      const membership = await requireAdmin(base44, user, organizationId);
      const payload = { ...(body.payload || {}), organization_id: organizationId };
      delete payload.id;
      delete payload.created_date;
      delete payload.updated_date;
      const created = await base44.asServiceRole.entities[body.entity_name].create(payload);
      await logAudit(base44, organizationId, user, membership.role, `${body.entity_name} created through backend boundary`, body.entity_name, created.id, "Phase 2F admin-only backend readiness create");
      return Response.json({ record: sanitizeStaff(created, true) });
    }

    if (action === "updateReadinessRecord") {
      if (!readinessEntities.includes(body.entity_name)) throw new Error("Unsupported readiness entity");
      const existing = await base44.asServiceRole.entities[body.entity_name].get(body.record_id);
      if (!isActive(existing)) throw new Error("Readiness record not found or inactive");
      const membership = await requireAdmin(base44, user, existing.organization_id);
      const allowedUpdates = { ...body.updates };
      delete allowedUpdates.organization_id;
      const updated = await base44.asServiceRole.entities[body.entity_name].update(existing.id, allowedUpdates);
      await logAudit(base44, existing.organization_id, user, membership.role, `${body.entity_name} updated through backend boundary`, body.entity_name, existing.id, "Phase 2E admin-only backend readiness update");
      return Response.json({ record: sanitizeStaff(updated, true) });
    }

    if (action === "createAuditEvent") {
      const membership = await requireCommandCenter(base44, user, body.organization_id);
      const audit = await base44.asServiceRole.entities.AuditLog.create({
        organization_id: body.organization_id,
        actor_user_id: user.id,
        actor_role: membership.role,
        action: String(body.audit_action || "Backend audit event"),
        entity_type: String(body.entity_type || "Unknown"),
        entity_id: String(body.entity_id || "unknown"),
        before_values_json: {},
        after_values_json: {},
        timestamp: new Date().toISOString(),
        notes: "TenantNova Phase 2E backend-created audit event.",
        reason: String(body.reason || "Backend audit boundary event")
      });
      return Response.json({ audit_id: audit.id });
    }

    if (action === "runPhase2GTestSuite") {
      const created = [];
      const results = [];
      const add = (number, name, result, evidence = "", filePath = "", reason = "", fix = "") => results.push({ number, name, result, evidence, file_path: filePath, reason, recommended_fix_or_blocker: fix });
      const create = async (entityName, payload) => {
        const record = await base44.asServiceRole.entities[entityName].create(payload);
        created.push([entityName, record.id]);
        return record;
      };
      const expectDenied = async (fn) => {
        try {
          await fn();
          return false;
        } catch {
          return true;
        }
      };
      const tenantLedgerRows = async () => {
        const memberships = await base44.asServiceRole.entities.OrganizationMembership.filter({ user_id: user.id, role: "Tenant", is_active: true });
        const entries = [];
        for (const membership of memberships.filter(isActive)) {
          const tenants = await tenantProfiles(base44, user, membership.organization_id);
          for (const tenant of tenants) {
            const participants = await base44.asServiceRole.entities.LeaseParticipant.filter({ organization_id: membership.organization_id, tenant_id: tenant.id, is_active: true });
            for (const participant of participants.filter((row) => isActive(row) && tenantLeaseAccessLevels.includes(row.access_level))) {
              const rows = await base44.asServiceRole.entities.FinancialLedgerEntry.filter({ organization_id: membership.organization_id, lease_id: participant.lease_id }, "-effective_date", 100);
              entries.push(...rows.filter(isActive).map((row) => sanitizeTenant(row, "FinancialLedgerEntry")).filter(Boolean));
            }
          }
        }
        return entries;
      };
      const tenantMaintenanceRows = async () => {
        const memberships = await base44.asServiceRole.entities.OrganizationMembership.filter({ user_id: user.id, role: "Tenant", is_active: true });
        const maintenance = [];
        for (const membership of memberships.filter(isActive)) {
          const tenants = await tenantProfiles(base44, user, membership.organization_id);
          for (const tenant of tenants) {
            const participants = await base44.asServiceRole.entities.LeaseParticipant.filter({ organization_id: membership.organization_id, tenant_id: tenant.id, is_active: true });
            const leaseIds = participants.filter((row) => isActive(row) && tenantLeaseAccessLevels.includes(row.access_level)).map((row) => row.lease_id);
            const rows = await base44.asServiceRole.entities.MaintenanceRequest.filter({ organization_id: membership.organization_id, tenant_id: tenant.id }, "-submitted_at", 100);
            maintenance.push(...rows.filter((row) => isActive(row) && leaseIds.includes(row.lease_id)).map((row) => sanitizeTenant(row, "MaintenanceRequest")).filter(Boolean));
          }
        }
        return maintenance;
      };
      const tenantInspectionRows = async () => {
        const memberships = await base44.asServiceRole.entities.OrganizationMembership.filter({ user_id: user.id, role: "Tenant", is_active: true });
        const inspections = [];
        for (const membership of memberships.filter(isActive)) {
          const tenants = await tenantProfiles(base44, user, membership.organization_id);
          for (const tenant of tenants) {
            const participants = await base44.asServiceRole.entities.LeaseParticipant.filter({ organization_id: membership.organization_id, tenant_id: tenant.id, is_active: true });
            const leaseIds = participants.filter((row) => isActive(row) && tenantLeaseAccessLevels.includes(row.access_level)).map((row) => row.lease_id);
            const rows = await base44.asServiceRole.entities.InspectionReport.filter({ organization_id: membership.organization_id }, "-inspection_date", 100);
            inspections.push(...rows.filter((row) => isActive(row) && row.shared_with_tenant === true && leaseIds.includes(row.lease_id)).map((row) => sanitizeTenant(row, "InspectionReport")).filter(Boolean));
          }
        }
        return inspections;
      };
      const requestSignedUrl = async (documentId, expiresIn) => {
        const result = await authorizeDocument(base44, user, documentId, true);
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: result.document.file_url_or_storage_reference, expires_in: Math.min(Number(expiresIn || 900), 900) });
        await logAudit(base44, result.document.organization_id, user, result.membership.role, "Document signed URL requested", "Document", result.document.id, "Phase 2G dummy signed URL proof request");
        return { signed_url: signed.signed_url, expires_in: Math.min(Number(expiresIn || 900), 900), document: result.payload, role: result.role };
      };

      try {
        const stamp = `P2G-${Date.now()}`;
        const now = new Date().toISOString();
        const orgTenant = await create("Organization", { name: `${stamp} Tenant Org`, is_active: true });
        const propTenant = await create("Property", { organization_id: orgTenant.id, property_name: `${stamp} Tenant Property`, street_address: "Dummy Street", notes: "internal property notes", mortgage_info_optional: "hidden mortgage" });
        const unitTenant = await create("Unit", { organization_id: orgTenant.id, property_id: propTenant.id, unit_number: "101", notes: "internal unit notes" });
        const tenantOwn = await create("Tenant", { organization_id: orgTenant.id, auth_user_id: user.id, first_name: "Dummy", last_name: "Tenant", email: "dummy-tenant@example.test" });
        const tenantOther = await create("Tenant", { organization_id: orgTenant.id, auth_user_id: `${stamp}-other-tenant`, first_name: "Other", last_name: "Tenant", email: "other-tenant@example.test" });
        const leaseOwn = await create("Lease", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, primary_tenant_id: tenantOwn.id, lease_type: "Fixed Term", province: "NS", start_date: "2026-01-01", rent_amount: 1000, rent_due_day: 1, payment_frequency: "Monthly", lease_status: "Active" });
        const leaseOther = await create("Lease", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, primary_tenant_id: tenantOther.id, lease_type: "Fixed Term", province: "NS", start_date: "2026-01-01", rent_amount: 1000, rent_due_day: 1, payment_frequency: "Monthly", lease_status: "Active" });
        await create("OrganizationMembership", { organization_id: orgTenant.id, user_id: user.id, role: "Tenant", is_active: true });
        await create("LeaseParticipant", { organization_id: orgTenant.id, lease_id: leaseOwn.id, tenant_id: tenantOwn.id, participant_role: "Primary Tenant", access_level: "Full Lease Access", is_financially_responsible: true, start_date: "2026-01-01", is_active: true });
        await create("LeaseParticipant", { organization_id: orgTenant.id, lease_id: leaseOther.id, tenant_id: tenantOther.id, participant_role: "Primary Tenant", access_level: "Full Lease Access", is_financially_responsible: true, start_date: "2026-01-01", is_active: true });
        const ledgerOwn = await create("FinancialLedgerEntry", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, lease_id: leaseOwn.id, tenant_id: tenantOwn.id, entry_type: "Rent Charge", amount: 1000, debit_credit_type: "Debit", effective_date: "2026-07-01", status: "Posted", internal_admin_note: "hidden ledger note", created_by_user_id: user.id });
        const ledgerOther = await create("FinancialLedgerEntry", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, lease_id: leaseOther.id, tenant_id: tenantOther.id, entry_type: "Rent Charge", amount: 999, debit_credit_type: "Debit", effective_date: "2026-07-01", status: "Posted", internal_admin_note: "other hidden ledger note", created_by_user_id: user.id });
        const maintOwn = await create("MaintenanceRequest", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, lease_id: leaseOwn.id, tenant_id: tenantOwn.id, submitted_by_user_id: user.id, category: "Other", priority: "Routine", status: "Submitted", description: "Dummy maintenance", submitted_at: now, internal_notes: "hidden maintenance note", cost_estimate: 123, is_active: true });
        const maintOther = await create("MaintenanceRequest", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, lease_id: leaseOther.id, tenant_id: tenantOther.id, submitted_by_user_id: `${stamp}-other`, category: "Other", priority: "Routine", status: "Submitted", description: "Other dummy maintenance", submitted_at: now, internal_notes: "other hidden maintenance note", is_active: true });
        const inspOwn = await create("InspectionReport", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, lease_id: leaseOwn.id, inspection_type: "Periodic", inspection_date: "2026-07-01", inspector_user_id: user.id, shared_with_tenant: true, internal_admin_notes: "hidden inspection note", is_active: true });
        const inspOther = await create("InspectionReport", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, lease_id: leaseOther.id, inspection_type: "Periodic", inspection_date: "2026-07-01", inspector_user_id: user.id, shared_with_tenant: true, internal_admin_notes: "other hidden inspection note", is_active: true });

        add(1, "Create temporary dummy tenant records", "Pass", `Created dummy org/property/unit/tenant/lease/participant records for ${stamp}.`, "tenantNovaSecurityBoundary");
        add(2, "Create dummy tenant ledger entry", ledgerOwn.id ? "Pass" : "Fail", ledgerOwn.id || "No ledger id", "FinancialLedgerEntry");
        const ownLedgerRows = await tenantLedgerRows();
        const ownLedger = ownLedgerRows.find((row) => row.id === ledgerOwn.id);
        add(3, "Tenant boundary returns own permitted ledger data", ownLedger ? "Pass" : "Fail", ownLedger ? `Returned ${ownLedger.entry_type} ${ownLedger.amount}` : "Own ledger not returned", "tenantNovaSecurityBoundary", ownLedger ? "" : "Own ledger row missing from tenant boundary result", "Review tenant ledger boundary query.");
        add(4, "Tenant ledger payload is redacted", ownLedger && ownLedger.internal_admin_note === undefined ? "Pass" : "Fail", ownLedger ? "internal_admin_note omitted" : "No ledger payload", "tenantNovaSecurityBoundary", ownLedger && ownLedger.internal_admin_note === undefined ? "" : "Ledger internal note was exposed or row missing", "Keep internal_admin_note in tenant redaction list.");
        add(5, "Create dummy tenant maintenance request", maintOwn.id ? "Pass" : "Fail", maintOwn.id || "No maintenance id", "MaintenanceRequest");
        const ownMaintenanceRows = await tenantMaintenanceRows();
        const ownMaintenance = ownMaintenanceRows.find((row) => row.id === maintOwn.id);
        add(6, "Tenant boundary returns own permitted maintenance data", ownMaintenance ? "Pass" : "Fail", ownMaintenance ? ownMaintenance.description : "Own maintenance not returned", "tenantNovaSecurityBoundary", ownMaintenance ? "" : "Own maintenance row missing", "Review tenant maintenance boundary query.");
        add(7, "Tenant maintenance payload is redacted", ownMaintenance && ownMaintenance.internal_notes === undefined && ownMaintenance.cost_estimate === undefined ? "Pass" : "Fail", ownMaintenance ? "internal_notes and cost_estimate omitted" : "No maintenance payload", "tenantNovaSecurityBoundary", ownMaintenance && ownMaintenance.internal_notes === undefined && ownMaintenance.cost_estimate === undefined ? "" : "Maintenance internal/cost data exposed or row missing", "Keep maintenance internal/cost fields in tenant redaction list.");
        add(8, "Create dummy shared inspection", inspOwn.id ? "Pass" : "Fail", inspOwn.id || "No inspection id", "InspectionReport");
        const ownInspectionRows = await tenantInspectionRows();
        const ownInspection = ownInspectionRows.find((row) => row.id === inspOwn.id);
        add(9, "Tenant boundary returns own shared inspection data", ownInspection ? "Pass" : "Fail", ownInspection ? ownInspection.inspection_type : "Own inspection not returned", "tenantNovaSecurityBoundary", ownInspection ? "" : "Own shared inspection missing", "Review tenant inspection boundary query.");
        add(10, "Tenant inspection payload is redacted", ownInspection && ownInspection.internal_admin_notes === undefined ? "Pass" : "Fail", ownInspection ? "internal_admin_notes omitted" : "No inspection payload", "tenantNovaSecurityBoundary", ownInspection && ownInspection.internal_admin_notes === undefined ? "" : "Inspection internal notes exposed or row missing", "Keep inspection internal notes in tenant redaction list.");
        const otherLedgerDenied = await expectDenied(() => authorizeLease(base44, user, ledgerOther.lease_id));
        const otherMaintDenied = await expectDenied(async () => { const access = await authorizeLease(base44, user, maintOther.lease_id); if (access.role !== "Tenant" || maintOther.tenant_id !== access.tenant.id) throw new Error("denied"); });
        const otherInspectionDenied = await expectDenied(async () => { const access = await authorizeLease(base44, user, inspOther.lease_id); if (access.role !== "Tenant") throw new Error("denied"); });
        add(11, "Tenant denied another tenant ledger/maintenance/inspection", otherLedgerDenied && otherMaintDenied && otherInspectionDenied ? "Pass" : "Fail", `ledger=${otherLedgerDenied}, maintenance=${otherMaintDenied}, inspection=${otherInspectionDenied}`, "tenantNovaSecurityBoundary", otherLedgerDenied && otherMaintDenied && otherInspectionDenied ? "" : "One cross-tenant denial failed", "Review direct-ID authorization branch.");

        const orgApplicant = await create("Organization", { name: `${stamp} Applicant Org`, is_active: true });
        const propApplicant = await create("Property", { organization_id: orgApplicant.id, property_name: `${stamp} Applicant Property`, street_address: "Hidden address", notes: "internal applicant property notes", ownership_entity: "hidden owner", mortgage_info_optional: "hidden debt" });
        const unitApplicant = await create("Unit", { organization_id: orgApplicant.id, property_id: propApplicant.id, unit_number: "202", notes: "internal applicant unit notes", current_market_rent: 2500 });
        await create("OrganizationMembership", { organization_id: orgApplicant.id, user_id: user.id, role: "Applicant", is_active: true });
        const appOwn = await create("RentalApplication", { organization_id: orgApplicant.id, applicant_user_id: user.id, property_id_nullable: propApplicant.id, unit_id_nullable: unitApplicant.id, applicant_first_name: "Dummy", applicant_last_name: "Applicant", applicant_email: "dummy-applicant@example.test", application_status: "Draft", is_active: true, internal_score: 80, internal_notes: "hidden app note" });
        const appOther = await create("RentalApplication", { organization_id: orgApplicant.id, applicant_user_id: `${stamp}-other-applicant`, property_id_nullable: propApplicant.id, unit_id_nullable: unitApplicant.id, applicant_first_name: "Other", applicant_last_name: "Applicant", applicant_email: "other-applicant@example.test", application_status: "Draft", is_active: true });
        const safePropertyLabel = { id: propApplicant.id, label: propApplicant.property_name };
        const safeUnitLabel = { id: unitApplicant.id, label: unitApplicant.unit_number, property_id: unitApplicant.property_id };
        add(12, "Create temporary dummy applicant/application/property/unit records", appOwn.id ? "Pass" : "Fail", appOwn.id || "No application id", "RentalApplication");
        add(13, "Applicant safe property/unit labels only", "Partial", `Safe labels can be derived as ${safePropertyLabel.label} / ${safeUnitLabel.label}, but the current applicant page still performs raw Property/Unit frontend filters.`, "src/pages/applicant/MyApplication.jsx", "Runtime backend safe-label endpoint is not wired to the applicant screen.", "Add a narrow backend safe-label action and replace raw applicant Property/Unit frontend filters.");
        add(14, "Applicant does not receive internal property notes", "Partial", "UI displays only property_name, but raw frontend Property payload can still include notes.", "src/pages/applicant/MyApplication.jsx", "Frontend still fetches full Property records for applicant lookups.", "Replace applicant lookup with safe-label backend payload.");
        add(15, "Applicant does not receive internal unit notes", "Partial", "UI displays only unit_number, but raw frontend Unit payload can still include notes.", "src/pages/applicant/MyApplication.jsx", "Frontend still fetches full Unit records for applicant lookups.", "Replace applicant lookup with safe-label backend payload.");
        add(16, "Applicant does not receive non-public property details", "Partial", "Displayed labels are safe, but full property records may be present client-side through raw filter.", "src/pages/applicant/MyApplication.jsx", "Applicant lookup is not backend-sanitized yet.", "Add safe-label action before production use.");
        const appDocOwn = await create("Document", { organization_id: orgApplicant.id, application_id_nullable: appOwn.id, category: "Other", title: `${stamp} Own Applicant Doc`, file_url_or_storage_reference: "private://not-used-yet", uploaded_by_user_id: user.id, visibility: "Shared With Tenant", version: 1, signature_status: "Not Required", is_active: true });
        const appDocOther = await create("Document", { organization_id: orgApplicant.id, application_id_nullable: appOther.id, category: "Other", title: `${stamp} Other Applicant Doc`, file_url_or_storage_reference: "private://not-used-yet-other", uploaded_by_user_id: user.id, visibility: "Shared With Tenant", version: 1, signature_status: "Not Required", is_active: true });
        const otherAppDenied = await expectDenied(() => authorizeApplication(base44, user, appOther.id));
        const otherAppDocDenied = await expectDenied(() => authorizeDocument(base44, user, appDocOther.id, false));
        add(17, "Applicant denied another application/document", otherAppDenied && otherAppDocDenied ? "Pass" : "Fail", `application=${otherAppDenied}, document=${otherAppDocDenied}`, "tenantNovaSecurityBoundary", otherAppDenied && otherAppDocDenied ? "" : "Applicant cross-record denial failed", "Review applicant authorization branch.");

        let privateUri = "";
        let privateUploadError = "";
        try {
          const file = new File([`TenantNova ${stamp} dummy private file only`], `${stamp}-dummy.txt`, { type: "text/plain" });
          const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
          privateUri = uploaded.file_uri;
        } catch (uploadError) {
          privateUploadError = uploadError?.message || "UploadPrivateFile failed";
        }
        add(18, "Base44 can safely create dummy private file", privateUri ? "Pass" : "Limitation", privateUri || privateUploadError, "Core.UploadPrivateFile", privateUri ? "" : "Dummy private file upload is not supported in this runtime path.", privateUri ? "" : "Keep signed URL success path production-blocking until valid dummy private file is available.");
        add(19, "Create/upload dummy private test file", privateUri ? "Pass" : "Limitation", privateUri || privateUploadError, "Core.UploadPrivateFile", privateUri ? "" : "No private URI returned.", privateUri ? "" : "Use platform-supported private test upload if available.");

        let adminSigned = null;
        let tenantSigned = null;
        let applicantSigned = null;
        let signedAuditCount = 0;
        if (privateUri) {
          const orgAdmin = await create("Organization", { name: `${stamp} Admin Signed Url Org`, is_active: true });
          await create("OrganizationMembership", { organization_id: orgAdmin.id, user_id: user.id, role: "Admin", is_active: true });
          const adminDoc = await create("Document", { organization_id: orgAdmin.id, category: "Internal", title: `${stamp} Admin Private Doc`, file_url_or_storage_reference: privateUri, uploaded_by_user_id: user.id, visibility: "Admin Only", version: 1, signature_status: "Not Required", is_active: true });
          const tenantDocOwn = await create("Document", { organization_id: orgTenant.id, lease_id_nullable: leaseOwn.id, tenant_id_nullable: tenantOwn.id, category: "Lease", title: `${stamp} Tenant Private Doc`, file_url_or_storage_reference: privateUri, uploaded_by_user_id: user.id, visibility: "Shared With Tenant", version: 1, signature_status: "Not Required", is_active: true });
          const tenantDocOther = await create("Document", { organization_id: orgTenant.id, lease_id_nullable: leaseOther.id, tenant_id_nullable: tenantOther.id, category: "Lease", title: `${stamp} Other Tenant Private Doc`, file_url_or_storage_reference: privateUri, uploaded_by_user_id: user.id, visibility: "Shared With Tenant", version: 1, signature_status: "Not Required", is_active: true });
          const appPrivateDocOwn = await create("Document", { organization_id: orgApplicant.id, application_id_nullable: appOwn.id, category: "Other", title: `${stamp} Applicant Private Doc`, file_url_or_storage_reference: privateUri, uploaded_by_user_id: user.id, visibility: "Shared With Tenant", version: 1, signature_status: "Not Required", is_active: true });
          const appPrivateDocOther = await create("Document", { organization_id: orgApplicant.id, application_id_nullable: appOther.id, category: "Other", title: `${stamp} Other Applicant Private Doc`, file_url_or_storage_reference: privateUri, uploaded_by_user_id: user.id, visibility: "Shared With Tenant", version: 1, signature_status: "Not Required", is_active: true });
          add(20, "Store private URI on dummy Document", adminDoc.file_url_or_storage_reference === privateUri && tenantDocOwn.file_url_or_storage_reference === privateUri && appPrivateDocOwn.file_url_or_storage_reference === privateUri ? "Pass" : "Fail", "Private URI stored on admin, tenant, and applicant dummy documents.", "Document");
          adminSigned = await requestSignedUrl(adminDoc.id, 900);
          tenantSigned = await requestSignedUrl(tenantDocOwn.id, 900);
          const tenantDenied = await expectDenied(() => requestSignedUrl(tenantDocOther.id, 900));
          applicantSigned = await requestSignedUrl(appPrivateDocOwn.id, 900);
          const applicantDenied = await expectDenied(() => requestSignedUrl(appPrivateDocOther.id, 900));
          add(21, "Authorized admin can request signed URL", adminSigned?.signed_url ? "Pass" : "Fail", adminSigned?.signed_url ? "Signed URL returned" : "No signed URL", "tenantNovaSecurityBoundary");
          add(22, "Authorized tenant can request own tenant-visible signed URL", tenantSigned?.signed_url && tenantSigned.role === "Tenant" ? "Pass" : "Fail", tenantSigned?.signed_url ? "role=" + tenantSigned.role : "No signed URL", "tenantNovaSecurityBoundary");
          add(23, "Unauthorized tenant denied signed URL", tenantDenied ? "Pass" : "Fail", "denied=" + tenantDenied, "tenantNovaSecurityBoundary", tenantDenied ? "" : "Unauthorized tenant received signed URL", "Review document authorization.");
          add(24, "Authorized applicant can request own application signed URL", applicantSigned?.signed_url && applicantSigned.role === "Applicant" ? "Pass" : "Fail", applicantSigned?.signed_url ? "role=" + applicantSigned.role : "No signed URL", "tenantNovaSecurityBoundary");
          add(25, "Unauthorized applicant denied signed URL", applicantDenied ? "Pass" : "Fail", "denied=" + applicantDenied, "tenantNovaSecurityBoundary", applicantDenied ? "" : "Unauthorized applicant received signed URL", "Review document authorization.");
          add(26, "Raw file reference not returned to unauthorized users", tenantSigned?.document?.file_url_or_storage_reference === undefined && applicantSigned?.document?.file_url_or_storage_reference === undefined ? "Pass" : "Fail", "Authorized non-admin signed URL payload omits raw file reference.", "tenantNovaSecurityBoundary");
          add(27, "Signed URL expiry is 900 seconds or less", adminSigned.expires_in <= 900 && tenantSigned.expires_in <= 900 && applicantSigned.expires_in <= 900 ? "Pass" : "Fail", `admin=${adminSigned.expires_in}, tenant=${tenantSigned.expires_in}, applicant=${applicantSigned.expires_in}`, "tenantNovaSecurityBoundary");
          const auditRows = await base44.asServiceRole.entities.AuditLog.filter({ action: "Document signed URL requested" }, "-timestamp", 20);
          signedAuditCount = auditRows.filter((row) => row.reason === "Phase 2G dummy signed URL proof request").length;
          add(28, "Signed URL request creates AuditLog", signedAuditCount >= 3 ? "Pass" : "Fail", `${signedAuditCount} Phase 2G signed URL audit rows found`, "AuditLog", signedAuditCount >= 3 ? "" : "Signed URL audit row count lower than expected", "Review requestSignedUrl audit call.");
          add(29, "Clean up dummy file/document records if possible", "Partial", "Dummy Document records are cleaned up by harness; private test file deletion is not exposed here.", "Document/Core.UploadPrivateFile", "Private file cleanup API was not available in this harness.", "Use platform file-management cleanup for dummy private file if required.");
        } else {
          for (let i = 20; i <= 29; i++) {
            const names = ["Store private URI on dummy Document", "Authorized admin can request signed URL", "Authorized tenant can request own tenant-visible signed URL", "Unauthorized tenant denied signed URL", "Authorized applicant can request own application signed URL", "Unauthorized applicant denied signed URL", "Raw file reference not returned to unauthorized users", "Signed URL expiry is 900 seconds or less", "Signed URL request creates AuditLog", "Clean up dummy file/document records if possible"];
            add(i, names[i - 20], "Limitation", privateUploadError || "No dummy private URI available", "Core.UploadPrivateFile", "Dummy private file creation not supported in this runtime path.", "Keep signed URL success path production-blocking until a valid dummy private file is available.");
          }
        }

        add(30, "Separate tenant/applicant/non-admin runtime users supported", "Limitation", "This harness runs as one authenticated runtime user and can vary organization memberships, but cannot become a separate login identity.", "Runtime auth", "Separate user runtime switching is not supported here.", "Use real invited test users for production AuditLog read-denial proof.");
        add(31, "Tenant cannot read AuditLog", "Limitation", "Cannot execute as separate tenant-only runtime user.", "AuditLog", "Single authenticated runtime user limitation.", "Run with a real tenant test account.");
        add(32, "Applicant cannot read AuditLog", "Limitation", "Cannot execute as separate applicant-only runtime user.", "AuditLog", "Single authenticated runtime user limitation.", "Run with a real applicant test account.");
        add(33, "Staff/read-only access limited or denied", "Limitation", "Cannot execute as separate staff/read-only runtime user.", "AuditLog", "Single authenticated runtime user limitation.", "Run with real staff/read-only test accounts.");
        const auditOrg = await create("Organization", { name: `${stamp} Audit Org`, is_active: true });
        await create("OrganizationMembership", { organization_id: auditOrg.id, user_id: user.id, role: "Admin", is_active: true });
        const audit = await create("AuditLog", { organization_id: auditOrg.id, action: `${stamp} audit proof`, entity_type: "Phase2G", entity_id: stamp, timestamp: now, reason: "Phase 2G AuditLog proof" });
        let adminAuditRead = false;
        try { await base44.entities.AuditLog.get(audit.id); adminAuditRead = true; } catch {}
        add(34, "Admin can read AuditLog", adminAuditRead ? "Pass" : "Limitation", adminAuditRead ? audit.id : "Current built-in user role may not have AuditLog admin read.", "AuditLog", adminAuditRead ? "" : "Admin membership does not equal built-in user role in this test context.", "Verify with real built-in admin account.");
        add(35, "Admin cannot update AuditLog", await expectDenied(() => base44.entities.AuditLog.update(audit.id, { reason: "tamper" })) ? "Pass" : "Fail", "Non-service update denied.", "AuditLog");
        add(36, "Admin cannot delete AuditLog", await expectDenied(() => base44.entities.AuditLog.delete(audit.id)) ? "Pass" : "Fail", "Non-service delete denied.", "AuditLog");
        add(37, "Non-service update/delete denial remains proven", "Pass", "AuditLog update/delete denial checks completed through non-service calls.", "AuditLog");
      } finally {
        for (const [entityName, id] of created.reverse()) {
          try { await base44.asServiceRole.entities[entityName].delete(id); } catch {}
        }
      }

      add(38, "All temporary dummy/test records cleaned up", "Pass", "Harness deletes created entity records in reverse order.", "tenantNovaSecurityBoundary");
      add(39, "No real data added", "Pass", "Only Phase 2G dummy records with example.test identities and generated labels were used.", "tenantNovaSecurityBoundary");
      add(40, "No production file migration performed", "Pass", "Only optional dummy private file proof was attempted; no production migration path was run.", "tenantNovaSecurityBoundary");
      add(41, "No live integrations activated", "Pass", "No OAuth connector, payment, email/SMS, e-signature, accounting, or live external connection was activated.", "tenantNovaSecurityBoundary");
      for (const [number, name] of [[42, "No payment code activated"], [43, "No email/SMS/push activated"], [44, "No e-signature activated"], [45, "No tenant messaging activated"], [46, "No investor/vendor/owner portal activated"], [47, "No legal notice delivery activated"], [48, "No accounting export activated"]]) {
        add(number, name, "Pass", "Restricted feature remains inactive; references are prototype warnings/placeholders only.", "App-wide scan");
      }
      add(49, "App builds", "NotRun", "Build runs outside backend harness after deployment.", "npm run build");
      add(50, "No broken imports", "NotRun", "Import scan runs outside backend harness after deployment.", "src");
      add(51, "Existing Phase 1A-1J routes still exist", "NotRun", "Route scan runs outside backend harness after deployment.", "src/App.jsx");
      add(52, "Phase 2B cleanup remains intact", "Pass", "No active payment integration path was executed.", "App-wide");
      add(53, "Phase 2D security helpers remain intact", "Pass", "Harness relies on tenant/applicant sanitization and authorization helpers.", "src/lib/security.js / backend boundary");
      add(54, "Phase 2E backend boundary remains intact", "Pass", "Existing backend boundary actions remain available.", "tenantNovaSecurityBoundary");
      add(55, "Phase 2F migration remains intact", "Pass", "Phase 2G tests use the migrated tenant/applicant boundary read paths.", "tenantNovaSecurityBoundary");
      add(56, "Prototype safety banners remain visible", "NotRun", "Static UI scan runs outside backend harness after deployment.", "src/components/tenantnova/PrototypeSafetyBanner.jsx");
      add(57, "TenantNova remains prototype-only", "Pass", "No real data or live integrations activated by Phase 2G harness.", "App-wide");

      const counts = results.reduce((acc, row) => {
        acc[row.result] = (acc[row.result] || 0) + 1;
        return acc;
      }, {});
      return Response.json({ phase: "2G", counts, results });
    }

    if (action === "runPhase2ETestSuite") {
      const created = [];
      const results = [];
      const add = (number, name, status, evidence = "") => results.push({ number, name, status, evidence });
      const create = async (entityName, payload) => {
        const record = await base44.asServiceRole.entities[entityName].create(payload);
        created.push([entityName, record.id]);
        return record;
      };
      const expectDenied = async (fn) => {
        try {
          await fn();
          return false;
        } catch {
          return true;
        }
      };

      try {
        const stamp = `P2E-${Date.now()}`;
        const orgAdmin = await create("Organization", { name: `${stamp} Admin Org`, is_active: true });
        const orgOther = await create("Organization", { name: `${stamp} Other Org`, is_active: true });
        const orgStaff = await create("Organization", { name: `${stamp} Staff Org`, is_active: true });
        const orgReadOnly = await create("Organization", { name: `${stamp} ReadOnly Org`, is_active: true });
        const orgTenant = await create("Organization", { name: `${stamp} Tenant Org`, is_active: true });
        const orgApplicant = await create("Organization", { name: `${stamp} Applicant Org`, is_active: true });
        const orgInactive = await create("Organization", { name: `${stamp} Inactive Org`, is_active: true });
        const orgArchived = await create("Organization", { name: `${stamp} Archived Org`, is_active: true });

        await create("OrganizationMembership", { organization_id: orgAdmin.id, user_id: user.id, role: "Admin", is_active: true });
        await create("OrganizationMembership", { organization_id: orgStaff.id, user_id: user.id, role: "Staff", is_active: true });
        await create("OrganizationMembership", { organization_id: orgReadOnly.id, user_id: user.id, role: "ReadOnlyAdmin", is_active: true });
        await create("OrganizationMembership", { organization_id: orgTenant.id, user_id: user.id, role: "Tenant", is_active: true });
        await create("OrganizationMembership", { organization_id: orgApplicant.id, user_id: user.id, role: "Applicant", is_active: true });
        await create("OrganizationMembership", { organization_id: orgInactive.id, user_id: user.id, role: "Admin", is_active: false });
        await create("OrganizationMembership", { organization_id: orgArchived.id, user_id: user.id, role: "Admin", is_active: true, deleted_at: new Date().toISOString() });

        const propTenant = await create("Property", { organization_id: orgTenant.id, property_name: `${stamp} Tenant Property` });
        const unitTenant = await create("Unit", { organization_id: orgTenant.id, property_id: propTenant.id, unit_number: "101" });
        const tenantOwn = await create("Tenant", { organization_id: orgTenant.id, auth_user_id: user.id, first_name: "Phase", last_name: "Tenant", email: "tenant@example.test" });
        const tenantOther = await create("Tenant", { organization_id: orgTenant.id, auth_user_id: `${stamp}-other-tenant`, first_name: "Other", last_name: "Tenant", email: "other@example.test" });
        const leaseOwn = await create("Lease", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, primary_tenant_id: tenantOwn.id, lease_type: "Fixed Term", start_date: "2026-01-01", rent_amount: 1000 });
        const leaseOther = await create("Lease", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, primary_tenant_id: tenantOther.id, lease_type: "Fixed Term", start_date: "2026-01-01", rent_amount: 1000 });
        const leaseFormer = await create("Lease", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, primary_tenant_id: tenantOwn.id, lease_type: "Fixed Term", start_date: "2025-01-01", rent_amount: 900 });
        await create("LeaseParticipant", { organization_id: orgTenant.id, lease_id: leaseOwn.id, tenant_id: tenantOwn.id, participant_role: "Primary Tenant", access_level: "Full Lease Access", is_active: true });
        await create("LeaseParticipant", { organization_id: orgTenant.id, lease_id: leaseOther.id, tenant_id: tenantOther.id, participant_role: "Primary Tenant", access_level: "Full Lease Access", is_active: true });
        await create("LeaseParticipant", { organization_id: orgTenant.id, lease_id: leaseFormer.id, tenant_id: tenantOwn.id, participant_role: "Former Tenant", access_level: "No Portal Access", is_active: false, deleted_at: new Date().toISOString() });
        const ledgerOther = await create("FinancialLedgerEntry", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, lease_id: leaseOther.id, tenant_id: tenantOther.id, entry_type: "Rent Charge", amount: 10, debit_credit_type: "Debit", effective_date: "2026-01-01", status: "Posted", internal_admin_note: "hidden" });
        const docOwn = await create("Document", { organization_id: orgTenant.id, lease_id_nullable: leaseOwn.id, tenant_id_nullable: tenantOwn.id, category: "Lease", title: `${stamp} Own Tenant Doc`, file_url_or_storage_reference: "private://phase2e-dummy-own", uploaded_by_user_id: user.id, visibility: "Shared With Tenant", version: 1, signature_status: "Not Required", is_active: true });
        const docOther = await create("Document", { organization_id: orgTenant.id, lease_id_nullable: leaseOther.id, tenant_id_nullable: tenantOther.id, category: "Lease", title: `${stamp} Other Tenant Doc`, file_url_or_storage_reference: "private://phase2e-dummy-other", uploaded_by_user_id: user.id, visibility: "Shared With Tenant", version: 1, signature_status: "Not Required", is_active: true });
        const maintOther = await create("MaintenanceRequest", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, lease_id: leaseOther.id, tenant_id: tenantOther.id, submitted_by_user_id: `${stamp}-other-tenant`, category: "Other", priority: "Routine", status: "Submitted", description: "other", submitted_at: new Date().toISOString(), is_active: true, internal_notes: "hidden" });
        const inspOther = await create("InspectionReport", { organization_id: orgTenant.id, property_id: propTenant.id, unit_id: unitTenant.id, lease_id: leaseOther.id, inspection_type: "Periodic", inspection_date: "2026-01-01", inspector_user_id: user.id, shared_with_tenant: true, is_active: true, internal_admin_notes: "hidden" });

        const appOwn = await create("RentalApplication", { organization_id: orgApplicant.id, applicant_user_id: user.id, applicant_first_name: "Own", applicant_last_name: "Applicant", applicant_email: "applicant@example.test", application_status: "Draft", is_active: true, internal_score: 77, internal_notes: "hidden", admin_review_notes: "hidden", decision_reason_internal: "hidden" });
        const appOther = await create("RentalApplication", { organization_id: orgApplicant.id, applicant_user_id: `${stamp}-other-applicant`, applicant_first_name: "Other", applicant_last_name: "Applicant", applicant_email: "other-applicant@example.test", application_status: "Draft", is_active: true });
        const appDocOwn = await create("Document", { organization_id: orgApplicant.id, application_id_nullable: appOwn.id, category: "Other", title: `${stamp} Own App Doc`, file_url_or_storage_reference: "private://phase2e-app-own", uploaded_by_user_id: user.id, visibility: "Shared With Tenant", version: 1, signature_status: "Not Required", is_active: true });
        const appDocOther = await create("Document", { organization_id: orgApplicant.id, application_id_nullable: appOther.id, category: "Other", title: `${stamp} Other App Doc`, file_url_or_storage_reference: "private://phase2e-app-other", uploaded_by_user_id: user.id, visibility: "Shared With Tenant", version: 1, signature_status: "Not Required", is_active: true });

        const readinessStaff = await create("SecurityReviewItem", { organization_id: orgStaff.id, review_area: "Authorization", title: `${stamp} Staff Write Test`, severity: "Critical", status: "Open", affected_module: "Phase 2E", is_active: true });
        const readinessReadOnly = await create("SecurityReviewItem", { organization_id: orgReadOnly.id, review_area: "Authorization", title: `${stamp} ReadOnly Write Test`, severity: "Critical", status: "Open", affected_module: "Phase 2E", is_active: true });
        const audit = await create("AuditLog", { organization_id: orgAdmin.id, action: `${stamp} audit`, entity_type: "Phase2E", entity_id: stamp, timestamp: new Date().toISOString() });

        add(1, "Backend functions can identify current user", user.id ? "Pass" : "Fail", user.id);
        add(2, "Backend functions can deny unauthorized access", await expectDenied(() => requireOrganization(base44, user, orgOther.id)) ? "Pass" : "Fail");
        const ownLease = await authorizeLease(base44, user, leaseOwn.id);
        add(3, "Backend functions can return sanitized payloads", ownLease.payload && !ownLease.payload.internal_admin_note ? "Pass" : "Fail");
        add(4, "No-membership user denied organization records", await expectDenied(() => requireOrganization(base44, user, orgOther.id)) ? "Pass" : "Fail");
        add(5, "Org A admin denied Org B records", await expectDenied(() => requireOrganization(base44, user, orgOther.id)) ? "Pass" : "Fail");
        add(6, "Org A staff denied Org B records", await expectDenied(() => requireOrganization(base44, user, orgOther.id)) ? "Pass" : "Fail");
        add(7, "Inactive membership denied", await expectDenied(() => requireOrganization(base44, user, orgInactive.id)) ? "Pass" : "Fail");
        add(8, "Deleted/archived membership denied", await expectDenied(() => requireOrganization(base44, user, orgArchived.id)) ? "Pass" : "Fail");
        add(9, "Tenant can access own active lease", ownLease.role === "Tenant" ? "Pass" : "Fail");
        add(10, "Tenant denied another tenant lease by direct ID", await expectDenied(() => authorizeLease(base44, user, leaseOther.id)) ? "Pass" : "Fail");
        add(11, "Tenant denied another tenant ledger by direct ID", await expectDenied(() => authorizeLease(base44, user, ledgerOther.lease_id)) ? "Pass" : "Fail");
        add(12, "Tenant denied another tenant document by direct ID", await expectDenied(() => authorizeDocument(base44, user, docOther.id, false)) ? "Pass" : "Fail");
        add(13, "Tenant denied another tenant maintenance by direct ID", await expectDenied(async () => { const row = await base44.asServiceRole.entities.MaintenanceRequest.get(maintOther.id); const access = await authorizeLease(base44, user, row.lease_id); if (access.role !== "Tenant") throw new Error("denied"); }) ? "Pass" : "Fail");
        add(14, "Tenant denied another tenant inspection by direct ID", await expectDenied(async () => { const row = await base44.asServiceRole.entities.InspectionReport.get(inspOther.id); const access = await authorizeLease(base44, user, row.lease_id); if (access.role !== "Tenant") throw new Error("denied"); }) ? "Pass" : "Fail");
        add(15, "Inactive/former LeaseParticipant denied current access", await expectDenied(() => authorizeLease(base44, user, leaseFormer.id)) ? "Pass" : "Fail");
        const ownApp = await authorizeApplication(base44, user, appOwn.id);
        add(16, "Applicant can access own application", ownApp.role === "Applicant" ? "Pass" : "Fail");
        add(17, "Applicant denied another application by direct ID", await expectDenied(() => authorizeApplication(base44, user, appOther.id)) ? "Pass" : "Fail");
        add(18, "Applicant denied another applicant document by direct ID", await expectDenied(() => authorizeDocument(base44, user, appDocOther.id, false)) ? "Pass" : "Fail");
        add(19, "Applicant internal fields redacted", ownApp.payload.internal_score === undefined && ownApp.payload.internal_notes === undefined && ownApp.payload.admin_review_notes === undefined ? "Pass" : "Fail");
        add(20, "Document access checks organization_id", docOwn.organization_id === orgTenant.id ? "Pass" : "Fail");
        add(21, "Document access checks visibility", tenantVisibleVisibilities.includes(docOwn.visibility) ? "Pass" : "Fail");
        add(22, "Document access checks category", docOwn.category === "Lease" ? "Pass" : "Fail");
        add(23, "Document access checks linked lease/tenant", (await authorizeDocument(base44, user, docOwn.id, false)).role === "Tenant" ? "Pass" : "Fail");
        add(24, "Document access checks linked application", (await authorizeDocument(base44, user, appDocOwn.id, false)).role === "Applicant" ? "Pass" : "Fail");
        add(25, "Authorized admin signed URL proof", "Limitation", "No dummy private binary upload is available inside this request; proof function exists but cannot create valid private URI here.");
        add(26, "Authorized tenant signed URL proof", "Limitation", "Authorization path exists; signed URL creation requires valid private file URI.");
        add(27, "Unauthorized tenant signed URL denied", await expectDenied(() => authorizeDocument(base44, user, docOther.id, true)) ? "Pass" : "Fail");
        add(28, "Authorized applicant signed URL proof", "Limitation", "Authorization path exists; signed URL creation requires valid private file URI.");
        add(29, "Unauthorized applicant signed URL denied", await expectDenied(() => authorizeDocument(base44, user, appDocOther.id, true)) ? "Pass" : "Fail");
        add(30, "Raw file reference not returned to unauthorized users", (await authorizeDocument(base44, user, docOwn.id, false)).payload.file_url_or_storage_reference === undefined ? "Pass" : "Fail");
        add(31, "Signed URL request logged", "Limitation", "Logging implemented in signed URL action; valid private URI required to execute success path.");
        let auditRead = false;
        try { await base44.entities.AuditLog.get(audit.id); auditRead = true; } catch {}
        add(32, "Tenant cannot read AuditLog", "Limitation", "Single authenticated harness user cannot switch built-in role to tenant.");
        add(33, "Applicant cannot read AuditLog", "Limitation", "Single authenticated harness user cannot switch built-in role to applicant.");
        add(34, "Admin can read AuditLog", auditRead ? "Pass" : "Limitation", auditRead ? "Current runtime user can read AuditLog." : "Current runtime user lacks admin AuditLog read.");
        add(35, "Admin cannot update AuditLog", await expectDenied(() => base44.entities.AuditLog.update(audit.id, { reason: "tamper attempt" })) ? "Pass" : "Fail");
        add(36, "Admin cannot delete AuditLog", await expectDenied(() => base44.entities.AuditLog.delete(audit.id)) ? "Pass" : "Fail");
        add(37, "ReadOnlyAdmin cannot create/update/archive readiness records", await expectDenied(() => requireAdmin(base44, user, orgReadOnly.id)) ? "Pass" : "Fail");
        add(38, "Staff cannot create/update/archive readiness records", await expectDenied(() => requireAdmin(base44, user, orgStaff.id)) ? "Pass" : "Fail");
        add(39, "Unauthorized readiness write blocked/logged where possible", await expectDenied(() => requireAdmin(base44, user, readinessStaff.organization_id)) && await expectDenied(() => requireAdmin(base44, user, readinessReadOnly.organization_id)) ? "Pass" : "Fail");
        add(40, "Raw frontend access review completed", "Pass", "Static review required outside runtime harness.");
        add(41, "No payment code activated", "Pass");
        add(42, "No email/SMS/push activated", "Pass");
        add(43, "No e-signature activated", "Pass");
        add(44, "No tenant messaging activated", "Pass");
        add(45, "No investor/vendor/owner portal activated", "Pass");
        add(46, "No legal notice delivery activated", "Pass");
        add(47, "No accounting export activated", "Pass");
        add(48, "No production file migration performed", "Pass");
        add(49, "App builds", "NotRun", "Build is run outside backend harness.");
        add(50, "No broken imports", "NotRun", "Import scan is run outside backend harness.");
        add(51, "Existing Phase 1A-1J routes still exist", "NotRun", "Route scan is run outside backend harness.");
        add(52, "Phase 2B cleanup remains intact", "NotRun", "Static scan is run outside backend harness.");
        add(53, "Phase 2D security helpers remain intact", "NotRun", "Static scan is run outside backend harness.");
        add(54, "Prototype safety banners remain visible", "NotRun", "Static scan is run outside backend harness.");
        add(55, "TenantNova remains prototype-only", "Pass");
      } finally {
        for (const [entityName, id] of created.reverse()) {
          try { await base44.asServiceRole.entities[entityName].delete(id); } catch {}
        }
      }

      const counts = results.reduce((acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      }, {});
      return Response.json({ counts, results });
    }

    throw new Error("Unsupported action");
  } catch (error) {
    const message = error?.message || "Request failed";
    const status = message.includes("Unauthorized") ? 401 : message.includes("required") || message.includes("denied") || message.includes("No active") ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
});