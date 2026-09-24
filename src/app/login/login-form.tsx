"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { InlineError, Input, Field, FormActions, Button, Spinner, SectionCard, Text } from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";
import { loginAction } from "./actions";

const INITIAL_STATE: ActionResult<{ redirectTo: string; appTitle?: string }> | null = null;

export function LoginForm({ appTitle }: { appTitle?: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);

  useEffect(() => {
    if (state?.ok) router.replace(state.data.redirectTo);
  }, [state, router]);

  return (
    <SectionCard className="w-full max-w-[420px]">
      <form action={formAction} noValidate>
        <Text as="p" tone="secondary" className="mb-4">
          {appTitle ? `Sign in to ${appTitle}.` : "Sign in to continue."}
        </Text>
        <Field id="login-email" label="Email">
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            placeholder="name@example.com"
            aria-invalid={state?.ok === false ? true : undefined}
          />
        </Field>
        <Field id="login-password" label="Password">
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={state?.ok === false ? true : undefined}
          />
        </Field>
        {state?.ok === false ? (
          <div role="alert" className="mb-3">
            <InlineError>{state.error.safeMessage}</InlineError>
          </div>
        ) : null}
        <FormActions className="w-full">
          <Button type="submit" variant="primary" disabled={pending} className="w-full">
            {pending ? <Spinner aria-hidden="true" /> : null}
            <span>{pending ? "Signing in…" : "Sign in"}</span>
          </Button>
        </FormActions>
      </form>
    </SectionCard>
  );
}
