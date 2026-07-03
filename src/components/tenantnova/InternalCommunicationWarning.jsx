import React from "react";

export default function InternalCommunicationWarning({ type = "Notifications" }) {
  return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>{type} are internal workflow items only.</b> They do not send messages, notices, legal communications, payment reminders, emails, SMS, push notifications, or collections communications.</div>;
}