"use client";

import { Button, ErrorState } from "@/platform/ui_engine";

export default function MomError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState title="MOM unavailable" description="The meeting record could not be loaded." action={<Button onClick={retry}>Try again</Button>} />;
}
