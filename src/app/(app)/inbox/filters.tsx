"use client";

import { useState } from "react";

const OPTIONS = [
  { key: "all", label: "Todas", css: "" },
  { key: "mine", label: "Minhas", css: ".conversation-item:not([data-mine=true]){display:none}" },
  { key: "unassigned", label: "Sem responsável", css: ".conversation-item:not([data-unassigned=true]){display:none}" },
];

// Filters the list in the browser so the shared layout stays a plain server component.
export function InboxFilters() {
  const [active, setActive] = useState("all");
  return (
    <div className="mt-2 flex gap-1">
      <style>{OPTIONS.find((o) => o.key === active)?.css}</style>
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => setActive(o.key)}
          className={`rounded px-2 py-1 text-xs ${active === o.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
