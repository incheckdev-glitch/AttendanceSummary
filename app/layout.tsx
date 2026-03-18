import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pro Support Command Centre',
  description: 'Internal support dashboard for issue tracking and analytics.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-white antialiased">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <header className="mb-8 flex flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Incheck360</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pro Support Command Centre</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                A command dashboard for support operations, escalations, and performance analytics.
              </p>
            </div>
            <nav className="flex flex-wrap gap-3 text-sm">
              <Link href="/" className="rounded-2xl border border-slate-700 px-4 py-2.5 hover:bg-slate-800">Dashboard</Link>
              <Link href="/issues" className="rounded-2xl border border-slate-700 px-4 py-2.5 hover:bg-slate-800">Issues</Link>
              <Link href="/analytics" className="rounded-2xl border border-slate-700 px-4 py-2.5 hover:bg-slate-800">Analytics</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
