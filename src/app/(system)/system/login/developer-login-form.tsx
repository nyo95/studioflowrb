"use client";

import { useActionState, useState } from "react";

import { Button, Field, FormActions, InlineError, Input, SectionCard, Spinner, Text } from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";

import { developerSignInAction } from "../actions";

const INITIAL_STATE: ActionResult<{ signedIn: true }> | null = null;

export function DeveloperLoginForm() {
  const [recovery, setRecovery] = useState(false);
  const [state, action, pending] = useActionState(developerSignInAction, INITIAL_STATE);
  return (
    <SectionCard className="w-full max-w-[440px]">
      <form action={action} className="grid gap-4" noValidate>
        <input type="hidden" name="method" value={recovery ? "recovery" : "totp"} />
        <Text as="p" tone="secondary">
          {recovery ? "Enter one unused recovery code." : "Enter the current six-digit code from your authenticator app."}
        </Text>
        <Field id="developer-code" label={recovery ? "Recovery code" : "Authenticator code"} required>
          <Input
            id="developer-code"
            name="code"
            type="text"
            inputMode={recovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            minLength={recovery ? 10 : 6}
            maxLength={recovery ? 12 : 6}
            pattern={recovery ? undefined : "[0-9]{6}"}
            required
            autoFocus
            aria-invalid={state?.ok === false ? true : undefined}
          />
        </Field>
        {state?.ok === false ? <InlineError>{state.error.safeMessage}</InlineError> : null}
        <FormActions align="between">
          <Button type="button" variant="ghost" onClick={() => setRecovery((value) => !value)} disabled={pending}>
            {recovery ? "Use authenticator code" : "Use a recovery code"}
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Spinner aria-hidden="true" /> : null}
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </FormActions>
      </form>
    </SectionCard>
  );
}
