"use client";

import { useActionState } from "react";

import {
  Button,
  Field,
  FormActions,
  FormSection,
  InlineError,
  Input,
  Notice,
  SectionCard,
  Spinner,
} from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";
import { changePasswordAction, updateDisplayNameAction } from "./actions";

const INITIAL: ActionResult<{ changed: boolean }> | null = null;

export function AccountForms({ displayName, email }: { displayName: string; email: string }) {
  const [nameState, nameAction, namePending] = useActionState(updateDisplayNameAction, INITIAL);
  const [passwordState, passwordAction, passwordPending] = useActionState(changePasswordAction, INITIAL);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionCard>
        <FormSection title="Display name" description={`Signed in as ${email}`}>
          <form action={nameAction}>
            <Field id="account-display-name" label="Display name">
              <Input
                id="account-display-name"
                name="displayName"
                key={nameState ? `${nameState.ok}-${displayName}` : "initial"}
                defaultValue={nameState?.ok ? displayName : undefined}
                placeholder={nameState?.ok ? undefined : displayName}
                required
                maxLength={120}
              />
            </Field>
            {nameState && !nameState.ok ? (
              <div role="alert" style={{ marginTop: 8 }}>
                <InlineError>{nameState.error.safeMessage}</InlineError>
              </div>
            ) : null}
            {nameState?.ok ? (
              <div role="status" style={{ marginTop: 8 }}>
                <Notice tone="success" title="Display name updated" />
              </div>
            ) : null}
            <FormActions>
              <Button type="submit" variant="primary" disabled={namePending}>
                {namePending ? <Spinner aria-hidden="true" /> : null}
                <span>{namePending ? "Saving…" : "Save"}</span>
              </Button>
            </FormActions>
          </form>
        </FormSection>
      </SectionCard>

      <SectionCard>
        <FormSection
          title="Change password"
          description="Changing your password signs out every other device."
        >
          <form action={passwordAction}>
            <Field id="account-current-password" label="Current password">
              <Input id="account-current-password" name="currentPassword" type="password" autoComplete="current-password" required />
            </Field>
            <Field id="account-new-password" label="New password" description="12–128 characters.">
              <Input id="account-new-password" name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
            </Field>
            {passwordState && !passwordState.ok ? (
              <div role="alert" style={{ marginTop: 8 }}>
                <InlineError>{passwordState.error.safeMessage}</InlineError>
              </div>
            ) : null}
            {passwordState?.ok ? (
              <div role="status" style={{ marginTop: 8 }}>
                <Notice tone="success" title="Password changed" />
              </div>
            ) : null}
            <FormActions>
              <Button type="submit" variant="primary" disabled={passwordPending}>
                {passwordPending ? <Spinner aria-hidden="true" /> : null}
                <span>{passwordPending ? "Updating…" : "Update password"}</span>
              </Button>
            </FormActions>
          </form>
        </FormSection>
      </SectionCard>
    </div>
  );
}
