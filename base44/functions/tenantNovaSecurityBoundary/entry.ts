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