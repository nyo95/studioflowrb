"use client";

import { useState } from "react";

import { CreatableSearch } from "@/platform/ui_engine";

import { saveClientAction } from "../actions";

type ClientOption = { id: string; name: string };

/** Pick an existing client or create a real one on the spot and select it. Shared by New and Edit project. */
export function ClientSelect({ clients, value, onChange }: { clients: ClientOption[]; value: string; onChange: (clientId: string) => void }) {
  const [created, setCreated] = useState<ClientOption[]>([]);
  const known = [...clients, ...created.filter((c) => !clients.some((existing) => existing.id === c.id))];
  const options = [{ id: "", label: "No client yet" }, ...known.map((c) => ({ id: c.id, label: c.name }))];

  return (
    <CreatableSearch
      label="Client"
      options={options}
      value={value}
      onValueChange={onChange}
      placeholder="Search or select client"
      searchPlaceholder="Search clients…"
      emptyLabel="No client matches this search."
      createLabel={(name) => `Add “${name}” as a new client`}
      onCreate={async (name) => {
        const result = await saveClientAction({ name });
        if (!result.ok) throw new Error(result.error.safeMessage);
        setCreated((current) => [...current, { id: result.data.clientId, name: name.trim() }]);
        return result.data.clientId;
      }}
      className="w-full"
    />
  );
}
