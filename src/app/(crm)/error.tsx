"use client";

import { Alert, Button } from "@/components/ui";

export default function CrmError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-10">
      <Alert title="Something went wrong loading this page">
        <p>Try again. If it keeps happening, share this code with your admin: {error.digest ?? "n/a"}</p>
      </Alert>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
