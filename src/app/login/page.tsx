"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/login", { json: { email, password } });
      const next = params.get("next");
      router.replace(next && next.startsWith("/admin") ? next : "/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen grid lg:grid-cols-[minmax(0,1fr)_440px]">
      <section className="hidden lg:flex flex-col justify-between bg-ink-800 text-ink-200 p-10">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 items-center justify-center rounded bg-teal-600 text-white font-semibold">P</span>
          <span className="text-white font-semibold">PDF Link Manager</span>
        </div>
        <div className="max-w-md">
          <p className="address inline-block mb-5 !bg-ink-950">
            <span className="host">https://files.example.com</span>
            <span className="dim">/</span>brochures<span className="dim">/</span>
            <span className="text-white">summer-2025.pdf</span>
          </p>
          <h1 className="text-white text-2xl font-semibold leading-snug">One address per file. Opens, downloads, done.</h1>
          <p className="mt-3 text-ink-300 leading-relaxed">
            Attach as many domains and subdomains as you need, create links under them, and drop PDFs onto those links.
            Anyone who opens the address gets the file immediately.
          </p>
        </div>
        <p className="text-[12px] text-ink-300">Vercel · Supabase · Cloudflare R2</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10 bg-paper">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <span className="inline-flex size-8 items-center justify-center rounded bg-teal-600 text-white font-semibold">P</span>
            <span className="font-semibold">PDF Link Manager</span>
          </div>
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="text-text-muted text-sm mt-1 mb-6">Use the account the super admin gave you.</p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
