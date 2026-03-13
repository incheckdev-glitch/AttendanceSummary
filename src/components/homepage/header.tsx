"use client";

import * as React from "react";
import { Menu, Radar, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { brand, navItems } from "@/content/homepage";
import NavLink from "@/components/homepage/nav-link";

export default function Header() {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const closeMobile = React.useCallback(() => {
    setMobileOpen(false);
  }, []);

  React.useEffect(() => {
    if (!mobileOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <a href="#" className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${brand.blue}, ${brand.blueDark})`,
            }}
          >
            <Radar className="h-5 w-5" />
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1463FF]">
              InCheck360
            </div>
            <div className="text-base font-semibold tracking-tight">
              Operational Excellence Platform
            </div>
          </div>
        </a>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            asChild
            className="hidden text-slate-700 md:inline-flex"
          >
            <a href="https://app.incheck360.com" target="_blank" rel="noreferrer">
              Log in
            </a>
          </Button>

          <Button
            asChild
            className="hidden rounded-xl px-5 text-white hover:opacity-95 md:inline-flex"
            style={{ backgroundColor: brand.blue }}
          >
            <a href="#contact">Book a demo</a>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div
          id="mobile-navigation"
          className="border-t border-slate-200 bg-white px-6 py-4 lg:hidden"
        >
          <nav className="flex flex-col gap-4" aria-label="Mobile">
            {navItems.map((item) => (
              <NavLink key={item.href} href={item.href} onNavigate={closeMobile}>
                {item.label}
              </NavLink>
            ))}

            <div className="flex flex-col gap-3 pt-2">
              <Button asChild variant="outline" className="justify-center">
                <a
                  href="https://app.incheck360.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Log in
                </a>
              </Button>

              <Button
                asChild
                className="justify-center text-white hover:opacity-95"
                style={{ backgroundColor: brand.blue }}
              >
                <a href="#contact" onClick={closeMobile}>
                  Book a demo
                </a>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
