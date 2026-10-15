"use client";

import { useActionState } from "react";
import { Button, Field, InlineError, Input, SectionCard, Text, Textarea } from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";
import { updateDocumentLetterheadAction } from "./actions";

export function DocumentLetterheadForm({ settings, logoUrl, organizationName }: { settings: { companyName: string | null; companyAddress: string | null; companyEmail: string | null }; logoUrl: string | null; organizationName: string }) {
  const [state, action, pending] = useActionState(updateDocumentLetterheadAction, null as ActionResult<{ saved: true }> | null);
  return <form action={action} className="grid max-w-3xl gap-4"><SectionCard title="Document letterhead" description="This identity is used on StudioFlow documents. Empty values use the platform organisation name and Brand mark."><div className="grid gap-4 md:grid-cols-2"><Field id="sf-company-name" label="Company name"><Input id="sf-company-name" name="companyName" maxLength={120} defaultValue={settings.companyName ?? ""} placeholder={organizationName} /></Field><Field id="sf-logo" label="Logo" description="PNG up to 2 MB."><div className="grid gap-2">{logoUrl ? <>
    {/* Signed storage URLs must not be sent through the image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={logoUrl} alt="Current logo" className="h-12 w-auto justify-self-start rounded-control border border-line bg-white object-contain p-1" />
  </> : null}<input id="sf-logo" name="logoFile" type="file" accept="image/png,.png" className="text-sm" />{logoUrl ? <label className="flex items-center gap-2 text-sm"><input name="removeLogo" type="checkbox" /> Remove the current logo</label> : null}</div></Field><Field id="sf-company-address" label="Address" description="One line per row, as printed."><Textarea id="sf-company-address" name="companyAddress" rows={3} maxLength={2000} defaultValue={settings.companyAddress ?? ""} /></Field><Field id="sf-company-email" label="E-mail"><Input id="sf-company-email" name="companyEmail" type="email" maxLength={254} defaultValue={settings.companyEmail ?? ""} placeholder="info@…" /></Field></div></SectionCard><div className="flex items-center gap-3"><Button type="submit" variant="primary" pending={pending}>Save</Button>{state && !state.ok ? <InlineError>{state.error.safeMessage}</InlineError> : null}{state?.ok ? <Text size="sm" tone="secondary">Saved.</Text> : null}</div></form>;
}
