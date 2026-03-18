import { ReactNode } from 'react';

type Props = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function Card({ title, children, className = '' }: Props) {
  return (
    <section className={`rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/20 ${className}`}>
      {title ? <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3> : null}
      {children}
    </section>
  );
}
