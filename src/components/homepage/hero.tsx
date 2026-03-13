"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, LayoutDashboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brand, hero } from "@/content/homepage";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f7faff_0%,#ffffff_100%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-28 top-20 h-72 w-72 rounded-full bg-[#1463FF]/10 blur-3xl" />
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-[#3A8BFF]/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1.06fr_0.94fr] lg:px-8 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <Badge className="mb-5 rounded-full bg-[#EAF1FF] px-3 py-1 text-xs text-[#1463FF] hover:bg-[#EAF1FF]">
            {hero.eyebrow}
          </Badge>

          <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
            {hero.title}
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            {hero.description}
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Button
              asChild
              size="lg"
              className="rounded-xl px-6 text-white hover:opacity-95"
              style={{ backgroundColor: brand.blue }}
            >
              <a href={hero.primaryCta.href}>
                {hero.primaryCta.label}
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>

            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-xl border-[#CFE0FF] px-6 text-[#1463FF] hover:bg-[#F5F9FF] hover:text-[#1463FF]"
            >
              <a href={hero.secondaryCta.href}>{hero.secondaryCta.label}</a>
            </Button>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {hero.highlights.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-2xl border border-[#DCE7FF] bg-white p-4 shadow-sm shadow-[#1463FF]/5"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1463FF]" />
                <p className="text-sm leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="relative"
        >
          <div className="rounded-[2rem] border border-[#CFE0FF] bg-[linear-gradient(180deg,#0C1630_0%,#0E46B8_100%)] p-4 shadow-2xl shadow-[#1463FF]/20">
            <div className="rounded-[1.6rem] bg-white p-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Live operations view
                  </p>
                  <h3 className="mt-1 text-xl font-semibold">
                    One system for frontline execution
                  </h3>
                </div>

                <Badge className="rounded-full bg-[#EAF1FF] text-[#1463FF] hover:bg-[#EAF1FF]">
                  Real-time
                </Badge>
              </div>

              <div className="mt-5 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["Dynamic checklists", "By role, shift, and location"],
                    ["SOP access", "Guides and policies in one place"],
                    ["Automations", "Alerts, reminders, and escalations"],
                    ["Visibility", "Tasks, issues, and compliance status"],
                  ].map(([title, subtitle]) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-slate-200 bg-[#F8FBFF] p-4"
                    >
                      <p className="text-sm font-semibold text-slate-950">
                        {title}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">
                        What teams can monitor
                      </p>
                      <p className="text-lg font-semibold">
                        Daily control across every store
                      </p>
                    </div>
                    <LayoutDashboard className="h-5 w-5 text-[#1463FF]" />
                  </div>

                  <div className="space-y-3">
                    {[
                      [
                        "Opening and closing routines",
                        "Keep every shift consistent",
                      ],
                      [
                        "Food safety and hygiene checks",
                        "Maintain proof of execution",
                      ],
                      [
                        "SOP deployment",
                        "Publish updates across locations",
                      ],
                      [
                        "Alerts and escalations",
                        "Surface exceptions faster",
                      ],
                    ].map(([title, subtitle]) => (
                      <div
                        key={title}
                        className="flex items-start justify-between rounded-2xl bg-slate-50 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium text-slate-950">{title}</p>
                          <p className="text-sm text-slate-500">{subtitle}</p>
                        </div>

                        <span className="rounded-full bg-[#EAF1FF] px-3 py-1 text-xs font-medium text-[#1463FF]">
                          Active
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
