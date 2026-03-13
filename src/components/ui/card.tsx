import type { HTMLAttributes } from "react";

type DivProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: DivProps) {
  return (
    <div
      className={`rounded-lg border bg-white text-slate-950 shadow-sm ${className}`}
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }: DivProps) {
  return <div className={className} {...props} />;
}
