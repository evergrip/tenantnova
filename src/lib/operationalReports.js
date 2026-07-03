export const OPERATIONAL_WARNING = "Prototype operational dashboard for internal admin decision-making only. Uses dummy/test data and application-enforced access controls. Not legal, financial, collection, or external reporting advice.";

export function activeOnly(record) { return record && !record.deleted_at && record.is_active !== false; }
export function todayISO() { return new Date().toISOString().slice(0, 10); }
export function startOfMonthISO(date = new Date()) { return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10); }
export function inRange(value, start, end) { const d = (value || "").slice(0, 10); return !!d && (!start || d >= start) && (!end || d <= end); }
export function daysUntil(value) { return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000); }
export function daysSince(value) { return Math.floor((Date.now() - new Date(value).getTime()) / 86400000); }
export function money(value) { return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
export function pct(value) { return `${Math.round(Number(value || 0) * 100)}%`; }
export function byId(rows) { return Object.fromEntries(rows.map(r => [r.id, r])); }
export function countBy(rows, field) { return rows.reduce((acc, row) => { const key = row[field] || "Unspecified"; acc[key] = (acc[key] || 0) + 1; return acc; }, {}); }

export function leaseBalance(entries) {
  return entries.filter(e => activeOnly(e) && ["Posted", "Reversed"].includes(e.status)).reduce((sum, e) => sum + (e.debit_credit_type === "Debit" ? Number(e.amount || 0) : -Number(e.amount || 0)), 0);
}

export function agingBucket(days) {
  if (days <= 7) return "0–7 days";
  if (days <= 14) return "8–14 days";
  if (days <= 30) return "15–30 days";
  return "31+ days";
}

export function isActiveLease(lease) { return activeOnly(lease) && ["Active", "Ending"].includes(lease.lease_status); }
export function isDraftLike(text = "") { return text.toLowerCase().includes("draft") || text.toLowerCase().includes("review"); }
export function isAdminSafeDocument(document) {
  if (["ID", "Income Proof", "Credit Background Check"].includes(document.category)) return false;
  if (["Tenant Only"].includes(document.visibility)) return false;
  return true;
}

export function buildOperationalSummary(data, options = {}) {
  const periodStart = options.periodStart || startOfMonthISO();
  const periodEnd = options.periodEnd || todayISO();
  const propertyScope = options.propertyId || null;
  const properties = data.properties.filter(activeOnly).filter(p => !propertyScope || p.id === propertyScope);
  const propertyIds = new Set(properties.map(p => p.id));
  const units = data.units.filter(activeOnly).filter(u => propertyIds.has(u.property_id));
  const leases = data.leases.filter(activeOnly).filter(l => propertyIds.has(l.property_id));
  const ledger = data.ledger.filter(activeOnly).filter(e => propertyIds.has(e.property_id));
  const maintenance = data.maintenance.filter(activeOnly).filter(m => propertyIds.has(m.property_id));
  const inspections = data.inspections.filter(activeOnly).filter(i => propertyIds.has(i.property_id));
  const applications = data.applications.filter(activeOnly).filter(a => !a.property_id_nullable || propertyIds.has(a.property_id_nullable));
  const documents = data.documents.filter(activeOnly).filter(d => (!d.property_id_nullable || propertyIds.has(d.property_id_nullable)) && isAdminSafeDocument(d));
  const participants = data.participants.filter(activeOnly);
  const activeLeases = leases.filter(isActiveLease);
  const activeUnitIds = new Set(activeLeases.map(l => l.unit_id));
  const unitById = byId(data.units);
  const propertyById = byId(data.properties);
  const tenantById = byId(data.tenants);
  const leaseDocs = documents.filter(d => d.category === "Lease");
  const periodLedger = ledger.filter(e => inRange(e.effective_date, periodStart, periodEnd));
  const rentCharged = periodLedger.filter(e => e.entry_type === "Rent Charge" && e.debit_credit_type === "Debit").reduce((s, e) => s + Number(e.amount || 0), 0);
  const rentCollected = periodLedger.filter(e => e.entry_type === "Payment" && e.debit_credit_type === "Credit").reduce((s, e) => s + Number(e.amount || 0), 0);
  const arrearsRows = leases.map(lease => {
    const leaseEntries = ledger.filter(e => e.lease_id === lease.id);
    const balance = leaseBalance(leaseEntries);
    const oldest = leaseEntries.filter(e => e.debit_credit_type === "Debit" && ["Posted", "Reversed"].includes(e.status)).map(e => e.due_date_optional || e.effective_date).filter(Boolean).sort()[0];
    const days = oldest ? Math.max(0, daysSince(oldest)) : 0;
    return { lease, property: propertyById[lease.property_id], unit: unitById[lease.unit_id], tenant: tenantById[lease.primary_tenant_id], balance, oldest, aging: agingBucket(days) };
  }).filter(r => r.balance > 0).sort((a, b) => b.balance - a.balance);
  const now = todayISO();
  const ending = leases.filter(l => l.end_date && daysUntil(l.end_date) >= 0 && daysUntil(l.end_date) <= 90);
  const openMaintenance = maintenance.filter(m => !["Completed", "Closed"].includes(m.status));
  const staleMaintenance = openMaintenance.filter(m => daysSince(m.submitted_at || m.created_date) > 7);
  const completedMaintenance = maintenance.filter(m => ["Completed", "Closed"].includes(m.status) && inRange(m.completed_at || m.closed_at || m.updated_date, periodStart, periodEnd));
  const inspectionsPeriod = inspections.filter(i => inRange(i.inspection_date, periodStart, periodEnd));
  const expiringDocuments = documents.filter(d => d.expiry_date_nullable && daysUntil(d.expiry_date_nullable) >= 0 && daysUntil(d.expiry_date_nullable) <= 30);
  const expiredDocuments = documents.filter(d => d.expiry_date_nullable && d.expiry_date_nullable < now);
  const unsignedDocuments = documents.filter(d => d.requires_signature && d.signature_status !== "Signed");
  const draftDocuments = documents.filter(d => d.visibility === "Admin Only" && ["Notice", "Form", "Investor Report"].includes(d.category) && isDraftLike(`${d.title} ${d.internal_admin_note || ""}`));
  const sharedDrafts = documents.filter(d => d.visibility === "Shared With Tenant" && isDraftLike(`${d.title} ${d.tenant_visible_note || ""}`));
  const missingParticipants = leases.filter(l => !participants.some(p => p.lease_id === l.id));
  const missingLeaseDocs = leases.filter(l => !leaseDocs.some(d => d.lease_id_nullable === l.id));
  const applicationCounts = countBy(applications, "application_status");
  const risks = buildRiskFlags({ properties, units, leases, arrearsRows, openMaintenance, applications, documents, inspections, missingParticipants, data });
  return {
    periodStart, periodEnd, properties, units, leases, ledger, maintenance, inspections, applications, documents,
    portfolio: { total_properties: properties.length, total_units: units.length, occupied_units: activeUnitIds.size, vacant_units: Math.max(0, units.length - activeUnitIds.size), occupancy_rate: units.length ? activeUnitIds.size / units.length : 0, active_leases: leases.filter(l => l.lease_status === "Active").length, draft_leases: leases.filter(l => l.lease_status === "Draft").length, leases_ending_soon: ending.length, month_to_month_leases: leases.filter(l => l.lease_type === "Month-to-Month").length, fixed_term_leases: leases.filter(l => l.lease_type === "Fixed Term").length },
    arrears: { rent_charged: rentCharged, rent_collected: rentCollected, outstanding_rent: rentCharged - rentCollected, leases_with_arrears: arrearsRows.length, highest: arrearsRows.slice(0, 5), buckets: { "0–7 days": arrearsRows.filter(r => r.aging === "0–7 days").length, "8–14 days": arrearsRows.filter(r => r.aging === "8–14 days").length, "15–30 days": arrearsRows.filter(r => r.aging === "15–30 days").length, "31+ days": arrearsRows.filter(r => r.aging === "31+ days").length } },
    vacancy: { vacant_units: units.filter(u => !activeUnitIds.has(u.id)), units_with_no_active_lease: units.filter(u => !activeUnitIds.has(u.id)), draft_leases: leases.filter(l => l.lease_status === "Draft"), ending_30: leases.filter(l => l.end_date && daysUntil(l.end_date) >= 0 && daysUntil(l.end_date) <= 30), ending_60: leases.filter(l => l.end_date && daysUntil(l.end_date) >= 0 && daysUntil(l.end_date) <= 60), ending_90: ending, missing_participants: missingParticipants, missing_documents: missingLeaseDocs },
    maintenanceSummary: { open: openMaintenance.length, emergency: openMaintenance.filter(m => m.priority === "Emergency").length, stale: staleMaintenance.length, completed_period: completedMaintenance.length },
    inspectionSummary: { completed_period: inspectionsPeriod.length, move_in: inspectionsPeriod.filter(i => i.inspection_type === "Move-In").length, move_out: inspectionsPeriod.filter(i => i.inspection_type === "Move-Out").length, periodic: inspectionsPeriod.filter(i => i.inspection_type === "Periodic").length, unshared: inspections.filter(i => !i.shared_with_tenant).length, missing_photos_or_notes: inspections.filter(i => !i.photos_array?.length || !i.tenant_visible_notes).length },
    applicationSummary: { Draft: applicationCounts.Draft || 0, Submitted: applicationCounts.Submitted || 0, "Under Review": applicationCounts["Under Review"] || 0, "More Info Requested": applicationCounts["More Info Requested"] || 0, Approved: applicationCounts.Approved || 0, Declined: applicationCounts.Declined || 0, Withdrawn: applicationCounts.Withdrawn || 0, approved_not_converted: applications.filter(a => a.application_status === "Approved" && !a.linked_lease_id_nullable).length, missing_documents: applications.filter(a => !a.uploaded_document_ids_array?.length).length },
    documentCompliance: { expiring_soon: expiringDocuments.length, expired: expiredDocuments.length, unsigned: unsignedDocuments.length, admin_only_drafts: draftDocuments.length, shared_drafts: sharedDrafts.length, unverified_forms: data.forms.filter(f => activeOnly(f) && f.verification_status !== "Verified").length, unverified_compliance_rules: data.compliance.filter(r => activeOnly(r) && r.verification_status !== "Verified").length, unverified_workflows: data.workflows.filter(w => activeOnly(w) && w.verification_status !== "Verified").length, draft_legal_notices: documents.filter(d => d.category === "Notice" && d.visibility === "Admin Only" && isDraftLike(d.title)).length },
    risks
  };
}

function buildRiskFlags({ units, leases, arrearsRows, openMaintenance, applications, documents, inspections, missingParticipants, data }) {
  const flags = [];
  openMaintenance.filter(m => m.priority === "Emergency").forEach(m => flags.push({ severity: "High", label: "Emergency maintenance open", detail: `Request ${m.id.slice(0, 8)} needs admin follow-up.` }));
  arrearsRows.slice(0, 5).forEach(r => flags.push({ severity: "High", label: "Lease has arrears", detail: `${r.property?.property_name || "Property"} · Unit ${r.unit?.unit_number || "—"} · ${money(r.balance)}` }));
  missingParticipants.forEach(l => flags.push({ severity: "Medium", label: "Lease missing participant", detail: `Lease ${l.id.slice(0, 8)} needs participant review.` }));
  units.filter(u => !leases.some(l => isActiveLease(l) && l.unit_id === u.id)).slice(0, 10).forEach(u => flags.push({ severity: "Medium", label: "Unit vacant", detail: `Unit ${u.unit_number} has no active lease.` }));
  applications.filter(a => a.application_status === "Approved" && !a.linked_lease_id_nullable).forEach(a => flags.push({ severity: "Medium", label: "Application approved but not converted", detail: `Application ${a.id.slice(0, 8)} needs lease conversion review.` }));
  data.compliance.filter(r => activeOnly(r) && r.verification_status !== "Verified").slice(0, 5).forEach(r => flags.push({ severity: "Medium", label: "Compliance rule unverified", detail: r.rule_name || "Compliance rule needs review." }));
  documents.filter(d => d.category === "Notice" && d.visibility === "Admin Only" && isDraftLike(d.title)).forEach(d => flags.push({ severity: "Medium", label: "Draft notice awaiting review", detail: d.title }));
  documents.filter(d => d.expiry_date_nullable && d.expiry_date_nullable < todayISO()).forEach(d => flags.push({ severity: "Medium", label: "Document expired", detail: d.title }));
  inspections.filter(i => !i.shared_with_tenant).slice(0, 10).forEach(i => flags.push({ severity: "Low", label: "Inspection unshared", detail: `${i.inspection_type} inspection ${i.inspection_date || ""}` }));
  flags.push({ severity: "Low", label: "Security deposit workflow needs review", detail: "Prototype reminder only; no automatic legal or collection action occurs." });
  return flags;
}

export function tenantLabel(tenant) { return tenant ? `${tenant.first_name || "Tenant"} ${tenant.last_name || ""}`.trim() : "Tenant not linked"; }