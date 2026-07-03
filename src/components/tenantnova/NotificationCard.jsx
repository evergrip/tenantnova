import React from "react";
import { Link } from "react-router-dom";

const tone = { Info: "bg-slate-100 text-slate-700", Warning: "bg-amber-100 text-amber-800", Urgent: "bg-orange-100 text-orange-800", Critical: "bg-red-100 text-red-800" };
const safeUrl = (url) => url && url.startsWith("/admin") ? url : null;

export default function NotificationCard({ event, onRead, onDismiss, onSnooze, onTask }) {
  return <article className="rounded-2xl border bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone[event.severity] || tone.Info}`}>{event.severity}</span><p className="mt-2 font-bold">{event.event_title}</p><p className="mt-1 text-sm text-slate-600">{event.event_message}</p></div><span className="text-xs text-slate-500">{event.is_read ? "Read" : "Unread"}</span></div>
    <div className="mt-4 flex flex-wrap gap-2 text-sm">
      <button onClick={() => onRead(event, !event.is_read)} className="rounded-xl border px-3 py-2">Mark {event.is_read ? "unread" : "read"}</button>
      <button onClick={() => onDismiss(event)} className="rounded-xl border px-3 py-2 text-red-700">Dismiss</button>
      <button onClick={() => onSnooze(event)} className="rounded-xl border px-3 py-2">Snooze 3 days</button>
      <button onClick={() => onTask(event)} className="rounded-xl bg-teal-700 px-3 py-2 text-white">Create task</button>
      {safeUrl(event.action_url_nullable) && <Link to={event.action_url_nullable} className="rounded-xl border px-3 py-2">Open admin link</Link>}
    </div>
  </article>;
}