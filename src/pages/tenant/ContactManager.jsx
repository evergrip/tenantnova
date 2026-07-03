import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ContactMessageForm from "@/components/tenantnova/ContactMessageForm";
import ContactMessageList from "@/components/tenantnova/ContactMessageList";
import { createContactMessage, getTenantContactMessages } from "@/lib/contactMessages";

const blank = { category: "General", priority: "Normal", preferred_contact_method: "Portal", status: "New" };
export default function ContactManager() {
  const access = useOutletContext();
  const [form, setForm] = useState(blank), [messages, setMessages] = useState([]), [properties, setProperties] = useState([]), [units, setUnits] = useState([]);
  async function load() { if (!access.tenant) return; const rows = await getTenantContactMessages(access); setMessages(rows); const props = await Promise.all([...new Set(rows.map(m => m.property_id_nullable).filter(Boolean))].map(id => base44.entities.Property.get(id))); const unitRows = await Promise.all([...new Set(rows.map(m => m.unit_id_nullable).filter(Boolean))].map(id => base44.entities.Unit.get(id))); setProperties(props.filter(Boolean)); setUnits(unitRows.filter(Boolean)); }
  useEffect(() => { load(); }, [access]);
  async function submit(e) { e.preventDefault(); await createContactMessage(access, form); setForm(blank); load(); }
  const lookupMap = useMemo(() => ({ properties: Object.fromEntries(properties.map(p => [p.id, p])), units: Object.fromEntries(units.map(u => [u.id, u])) }), [properties, units]);
  if (!access.tenant) return <div className="rounded-2xl border bg-white p-6">No tenant profile is linked to this account.</div>;
  return <section><h1 className="text-3xl font-bold">Contact Manager</h1><p className="mt-2 text-slate-600">Send non-emergency messages to your property management team and view portal responses.</p><div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">For emergencies or urgent safety issues, use your property manager’s emergency instructions instead of this portal message form.</div><div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]"><ContactMessageForm form={form} setForm={setForm} onSubmit={submit} /><ContactMessageList messages={messages} lookups={lookupMap} /></div></section>;
}