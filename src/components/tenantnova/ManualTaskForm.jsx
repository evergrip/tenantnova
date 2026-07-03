import React, { useState } from "react";

const initial = { task_type: "Other", title: "", description: "", priority: "Normal", status: "Open", assigned_to_user_id_nullable: "", due_date_nullable: "" };

export default function ManualTaskForm({ onCreate }) {
  const [form, setForm] = useState(initial);
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  return <form onSubmit={e => { e.preventDefault(); onCreate(form); setForm(initial); }} className="rounded-2xl border bg-white p-4">
    <h2 className="font-bold">Create manual internal task</h2>
    <div className="mt-3 grid gap-3 md:grid-cols-3"><input required value={form.title} onChange={e => update("title", e.target.value)} placeholder="Task title" className="rounded-xl border p-2" /><select value={form.task_type} onChange={e => update("task_type", e.target.value)} className="rounded-xl border p-2">{["Maintenance Follow-Up","Arrears Review","Lease Review","Document Review","Application Review","Inspection Review","Compliance Review","Form Draft Review","Investor Report Review","System","Other"].map(v => <option key={v}>{v}</option>)}</select><select value={form.priority} onChange={e => update("priority", e.target.value)} className="rounded-xl border p-2">{["Low","Normal","High","Urgent"].map(v => <option key={v}>{v}</option>)}</select><input value={form.assigned_to_user_id_nullable} onChange={e => update("assigned_to_user_id_nullable", e.target.value)} placeholder="Assigned user ID placeholder" className="rounded-xl border p-2" /><input type="date" value={form.due_date_nullable} onChange={e => update("due_date_nullable", e.target.value)} className="rounded-xl border p-2" /></div>
    <textarea value={form.description} onChange={e => update("description", e.target.value)} placeholder="Internal description only" className="mt-3 min-h-20 w-full rounded-xl border p-2" />
    <button className="mt-3 rounded-xl bg-teal-700 px-4 py-2 text-white">Create task</button>
  </form>;
}