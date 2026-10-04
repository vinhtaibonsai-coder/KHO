"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then((response) => {
      if (response.ok) router.replace("/");
    }).catch(() => undefined);
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể đăng nhập");
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể đăng nhập");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 flex items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-emerald-400">
          <LockKeyhole className="h-7 w-7" />
        </div>
        <h1 className="text-center text-xl font-extrabold text-slate-900">Đăng nhập hệ thống kho</h1>
        <p className="mt-2 text-center text-sm text-slate-500">Nhập mã PIN nội bộ để tiếp tục</p>
        <label className="mt-6 block text-sm font-bold text-slate-700" htmlFor="pin">Mã PIN</label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-xl tracking-[0.35em] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200"
          required
          autoFocus
        />
        {error && <p role="alert" className="mt-3 text-center text-sm font-semibold text-rose-700">{error}</p>}
        <button disabled={loading || !pin} className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          {loading ? "Đang kiểm tra…" : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}
