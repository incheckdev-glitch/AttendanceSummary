"use client";

import type { ReactNode } from "react";

type NavLinkProps = {
  href: string;
  children: ReactNode;
  light?: boolean;
  onNavigate?: () => void;
  className?: string;
};

function scrollToHash(hash: string) {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const target = document.querySelector(hash);
  if (!target) return;

  const y = target.getBoundingClientRect().top + window.scrollY - 96;
  window.scrollTo({ top: y, behavior: "smooth" });
}

export default function NavLink({
  href,
  children,
  light = false,
  onNavigate,
  className = "",
}: NavLinkProps) {
  return (
    <a
      href={href}
      onClick={(e) => {
        if (href.startsWith("#")) {
          e.preventDefault();
          scrollToHash(href);
          onNavigate?.();
        }
      }}
      className={`cursor-pointer text-sm transition-colors ${
        light
          ? "text-white/75 hover:text-white"
          : "text-slate-600 hover:text-slate-950"
      } ${className}`}
    >
      {children}
    </a>
  );
}
