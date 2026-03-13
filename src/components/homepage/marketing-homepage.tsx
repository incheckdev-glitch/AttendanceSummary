import {
  CheckCircle2,
  ChevronRight,
  Phone,
  MessageSquareMore,
  MapPin,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Header from "@/components/homepage/header";
import Hero from "@/components/homepage/hero";
import TrustBar from "@/components/homepage/trust-bar";
import SectionAnchor from "@/components/homepage/section-anchor";
import SectionHeading from "@/components/homepage/section-heading";
import SurfaceCard from "@/components/homepage/surface-card";
import ContactForm from "@/components/homepage/contact-form";
import NavLink from "@/components/homepage/nav-link";
import {
  addOns,
  brand,
  contactCard,
  faqs,
  footer,
  industries,
  modules,
  outcomes,
  platformPillars,
  pricingBundles,
  roadmap,
  secondaryProof,
  stats,
} from "@/content/homepage";

export default function MarketingHomepage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Header />

      <main>
        <Hero />
        <TrustBar />

        <section className="border-y border-[#DCE7FF] bg-[#F8FBFF]">
          <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-[#DCE7FF] bg-white p-5 shadow-sm shadow-[#1463FF]/5"
                >
                  <div className="text-2xl font-semibold tracking-tight text-slate-950">
                    {stat.value}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionAnchor
          id="platform"
          className="mx-auto max-w-7xl px-6 py-24 lg:px-8"
        >
          <SectionHeading
            badge="Platform"
            title="Everything operators need to run consistent, compliant locations."
            description="InCheck360 brings frontline execution, SOP access, follow-up workflows, and operational visibility into one structured system."
          />

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {platformPillars.map((item) => {
              const Icon = item.icon;

              return (
                <SurfaceCard
                  key={item.title}
                  className="transition-transform duration-200 hover:-translate-y-1"
                >
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF1FF]">
                    <Icon className="h-6 w-6 text-[#1463FF]" />
                  </div>

                  <h3 className="text-xl font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {item.text}
                  </p>
                </SurfaceCard>
              );
            })}
          </div>
        </SectionAnchor>

        <section className="bg-[linear-gradient(180deg,#08152E_0%,#0C1E46_100%)] text-white">
          <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
            <SectionHeading
              badge="Why teams choose InCheck360"
              title="Replace paper, patchwork tools, and inconsistent execution."
              description="Give managers, operators, and compliance teams one place to monitor routines, support stores, and keep standards aligned across every shift."
              light
            />

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {[
                {
                  title: "Operational control",
                  text: "Standardize recurring routines, proofs of execution, and issue follow-up without relying on paper checklists or disconnected spreadsheets.",
                },
                {
                  title: "Compliance confidence",
                  text: "Support food safety, hygiene, store standards, and audit readiness with structured daily workflows and accessible records.",
                },
                {
                  title: "Faster decisions",
                  text: "See what is overdue, where support is needed, and how execution is performing across locations in real time.",
                },
              ].map((item) => (
                <SurfaceCard
                  key={item.title}
                  className="border-white/10 bg-white/5 text-white shadow-none backdrop-blur"
                >
                  <h3 className="text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/75">
                    {item.text}
                  </p>
                </SurfaceCard>
              ))}
            </div>
          </div>
        </section>

        <SectionAnchor
          id="modules"
          className="mx-auto max-w-7xl px-6 py-24 lg:px-8"
        >
          <SectionHeading
            badge="Modules"
            title="Three modules built for daily execution, SOP access, and compliance control."
            description="Start with core execution and reference materials today, then extend into a dedicated compliance layer as your operational model evolves."
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {modules.map((module) => {
              const Icon = module.icon;
              const isLive = module.status === "Live";

              return (
                <SurfaceCard key={module.title} className="rounded-[1.8rem]">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF1FF]">
                      <Icon className="h-6 w-6 text-[#1463FF]" />
                    </div>

                    <Badge
                      className={`rounded-full ${
                        isLive
                          ? "bg-[#EAF1FF] text-[#1463FF] hover:bg-[#EAF1FF]"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {module.status}
                    </Badge>
                  </div>

                  <h3 className="text-2xl font-semibold tracking-tight">
                    {module.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {module.text}
                  </p>

                  <div className="mt-6 space-y-3">
                    {module.bullets.map((bullet) => (
                      <div
                        key={bullet}
                        className="flex items-start gap-3 rounded-2xl bg-[#F8FBFF] px-4 py-3"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1463FF]" />
                        <p className="text-sm leading-6 text-slate-700">
                          {bullet}
                        </p>
                      </div>
                    ))}
                  </div>

                  <a
                    href="#contact"
                    className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#1463FF]"
                  >
                    Book a demo <ChevronRight className="h-4 w-4" />
                  </a>
                </SurfaceCard>
              );
            })}
          </div>
        </SectionAnchor>

        <section className="bg-[#F8FBFF]">
          <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
              <SectionHeading
                badge="Outcomes"
                title="Why teams switch from paper, spreadsheets, and disconnected tools."
                description="The value of InCheck360 is not only task digitization. It is the ability to scale one operating standard with stronger visibility, faster follow-up, and clearer accountability."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                {outcomes.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-[#DCE7FF] bg-white p-5 shadow-sm shadow-[#1463FF]/5"
                    >
                      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EAF1FF]">
                        <Icon className="h-5 w-5 text-[#1463FF]" />
                      </div>

                      <h4 className="text-lg font-semibold">{item.title}</h4>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {item.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <SectionAnchor
          id="industries"
          className="mx-auto max-w-7xl px-6 py-24 lg:px-8"
        >
          <SectionHeading
            badge="Industries"
            title="Built for businesses with structured frontline operations."
            description="InCheck360 is designed for teams that need daily routines, SOP visibility, compliance workflows, and store-level accountability across multiple locations."
          />

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {industries.map((item) => {
              const Icon = item.icon;

              return (
                <SurfaceCard key={item.title}>
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF1FF]">
                    <Icon className="h-6 w-6 text-[#1463FF]" />
                  </div>

                  <h3 className="text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {item.text}
                  </p>
                </SurfaceCard>
              );
            })}
          </div>
        </SectionAnchor>

        <SectionAnchor
          id="pricing"
          className="mx-auto max-w-7xl px-6 py-24 lg:px-8"
        >
          <SectionHeading
            badge="Pricing"
            title="Flexible rollout options for growing operations."
            description="Choose a package that fits your current rollout size, then expand modules, capacity, and users as your operating model scales."
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1fr_0.9fr]">
            {pricingBundles.map((bundle) => (
              <SurfaceCard
                key={bundle.name}
                className={`rounded-[1.9rem] ${
                  bundle.featured
                    ? "border-transparent bg-[linear-gradient(180deg,#1463FF_0%,#0E46B8_100%)] text-white"
                    : ""
                }`}
              >
                <Badge
                  className={`rounded-full px-3 py-1 text-xs ${
                    bundle.featured
                      ? "bg-white/10 text-white hover:bg-white/10"
                      : "bg-[#EAF1FF] text-[#1463FF] hover:bg-[#EAF1FF]"
                  }`}
                >
                  {bundle.badge}
                </Badge>

                <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                  {bundle.name}
                </h3>

                <p
                  className={`mt-4 text-sm leading-7 ${
                    bundle.featured ? "text-white/80" : "text-slate-600"
                  }`}
                >
                  {bundle.description}
                </p>

                <div className="mt-6 space-y-3">
                  {bundle.includes.map((item) => (
                    <div
                      key={item}
                      className={`flex items-start gap-3 rounded-2xl px-4 py-3 ${
                        bundle.featured ? "bg-white/10" : "bg-[#F8FBFF]"
                      }`}
                    >
                      <CheckCircle2
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          bundle.featured ? "text-white" : "text-[#1463FF]"
                        }`}
                      />
                      <p
                        className={`text-sm leading-6 ${
                          bundle.featured ? "text-white/85" : "text-slate-700"
                        }`}
                      >
                        {item}
                      </p>
                    </div>
                  ))}
                </div>

                <a
                  href="#contact"
                  className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-medium transition ${
                    bundle.featured
                      ? "bg-white text-[#1463FF] hover:bg-white/90"
                      : "bg-[#1463FF] text-white hover:bg-[#0E46B8]"
                  }`}
                >
                  {bundle.cta}
                </a>
              </SurfaceCard>
            ))}

            <SurfaceCard className="rounded-[1.9rem] bg-[#F8FBFF]">
              <Badge className="rounded-full bg-[#EAF1FF] px-3 py-1 text-xs text-[#1463FF] hover:bg-[#EAF1FF]">
                Add-ons
              </Badge>

              <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                Expand your package as your rollout grows.
              </h3>

              <p className="mt-4 text-sm leading-7 text-slate-600">
                Start with the package that fits today, then add more capacity,
                users, and functionality as your needs evolve.
              </p>

              <div className="mt-6 space-y-3">
                {addOns.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3"
                  >
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#1463FF]" />
                    <p className="text-sm leading-6 text-slate-700">{item}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-[#DCE7FF] bg-white p-4">
                <p className="text-sm font-medium text-slate-950">
                  Commercial model
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Pricing can be tailored to rollout size, module selection, and
                  team structure.
                </p>
              </div>
            </SurfaceCard>
          </div>
        </SectionAnchor>

        <section className="bg-[linear-gradient(180deg,#ffffff_0%,#f7faff_100%)]">
          <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
              <div className="rounded-[2rem] border border-[#DCE7FF] bg-white p-8 shadow-sm shadow-[#1463FF]/5">
                <Badge className="rounded-full bg-[#EAF1FF] px-3 py-1 text-xs text-[#1463FF] hover:bg-[#EAF1FF]">
                  Roadmap
                </Badge>

                <h3 className="mt-5 text-3xl font-semibold tracking-tight">
                  Built to extend operational control over time.
                </h3>

                <p className="mt-4 text-base leading-8 text-slate-600">
                  InCheck360 can evolve beyond daily task execution into a
                  broader operational intelligence layer that connects frontline
                  workflows, environmental data, and smarter decision support.
                </p>

                <div className="mt-8 space-y-3">
                  {roadmap.map((item) => (
                    <div
                      key={item}
                      className="flex gap-3 rounded-2xl bg-[#F8FBFF] px-4 py-3"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1463FF]" />
                      <p className="text-sm leading-6 text-slate-700">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4">
                {secondaryProof.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-[#DCE7FF] bg-white p-5 shadow-sm shadow-[#1463FF]/5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-[#EAF1FF] p-3">
                          <Icon className="h-5 w-5 text-[#1463FF]" />
                        </div>

                        <div>
                          <h4 className="text-lg font-semibold">{item.title}</h4>
                          <p className="mt-2 text-sm leading-7 text-slate-600">
                            {item.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="rounded-[2rem] border border-[#DCE7FF] bg-[linear-gradient(135deg,#1463FF_0%,#0E46B8_100%)] p-8 text-white shadow-xl shadow-[#1463FF]/20">
                  <Badge className="rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/10">
                    Proof point
                  </Badge>

                  <h3 className="mt-5 text-3xl font-semibold tracking-tight">
                    A platform built to improve consistency at store level.
                  </h3>

                  <p className="mt-4 text-base leading-8 text-white/80">
                    InCheck360 is positioned around measurable operational
                    improvement, stronger routine adherence, and better
                    visibility into what is happening across locations.
                  </p>

                  <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                      <div className="text-3xl font-semibold">72%</div>
                      <p className="mt-2 text-sm text-white/75">
                        reported reduction in checklist violations
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                      <div className="text-3xl font-semibold">5–500</div>
                      <p className="mt-2 text-sm text-white/75">
                        locations supported under one operating model
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <SectionAnchor id="faq" className="bg-[#F8FBFF]">
          <div className="mx-auto max-w-4xl px-6 py-24 lg:px-8">
            <SectionHeading
              badge="FAQ"
              title="Questions teams ask before they book a demo."
              description="These are the questions buyers usually want answered before exploring rollout options, workflows, and implementation details."
              align="center"
            />

            <Accordion type="single" collapsible className="mt-10 space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={faq.q}
                  value={`item-${index}`}
                  className="rounded-2xl border border-[#DCE7FF] bg-white px-6 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="text-left text-base font-medium hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-sm leading-7 text-slate-600">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </SectionAnchor>

        <SectionAnchor
          id="contact"
          className="mx-auto max-w-7xl px-6 py-24 lg:px-8"
        >
          <div className="overflow-hidden rounded-[2rem] border border-[#DCE7FF] bg-[linear-gradient(135deg,#08152E_0%,#0E46B8_100%)] p-8 text-white shadow-xl shadow-[#1463FF]/20 sm:p-12">
            <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
              <div>
                <Badge className="rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/10">
                  {contactCard.badge}
                </Badge>

                <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {contactCard.title}
                </h2>

                <p className="mt-4 max-w-2xl text-base leading-8 text-white/80">
                  {contactCard.description}
                </p>

                <div className="mt-8 grid gap-4">
                  {contactCard.details.map((detail) => {
                    const Icon = detail.icon;

                    return (
                      <div
                        key={detail.label}
                        className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur"
                      >
                        <div className="flex items-start gap-4">
                          <div className="rounded-2xl bg-white/10 p-3">
                            <Icon className="h-5 w-5" />
                          </div>

                          <div>
                            <p className="text-sm text-white/70">
                              {detail.label}
                            </p>
                            <p className="mt-1 text-lg font-semibold tracking-tight">
                              {detail.href ? (
                                <a href={detail.href} className="hover:underline">
                                  {detail.value}
                                </a>
                              ) : (
                                detail.value
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <ContactForm />
            </div>
          </div>
        </SectionAnchor>
      </main>

      <footer className="border-t border-[#DCE7FF] bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.9fr] lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-white"
                style={{
                  background: `linear-gradient(135deg, ${brand.blue}, ${brand.blueDark})`,
                }}
              >
                <CheckCircle2 className="h-5 w-5" />
              </div>

              <div>
                <div className="text-lg font-semibold">{footer.companyName}</div>
                <div className="text-sm text-slate-500">{footer.tagline}</div>
              </div>
            </div>

            <p className="mt-4 max-w-md text-sm leading-7 text-slate-600">
              {footer.description}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Platform
            </h4>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <NavLink href="#platform">Platform</NavLink>
              <NavLink href="#modules">Modules</NavLink>
              <NavLink href="#pricing">Pricing</NavLink>
              <NavLink href="#faq">FAQ</NavLink>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Solutions
            </h4>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <NavLink href="#industries">F&amp;B and QSR</NavLink>
              <NavLink href="#industries">Retail chains</NavLink>
              <NavLink href="#industries">Franchise networks</NavLink>
              <NavLink href="#contact">Book a demo</NavLink>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Company
            </h4>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{footer.location}</span>
              </div>
              <a
                href={`mailto:${footer.email}`}
                className="flex items-start gap-2 hover:text-[#1463FF]"
              >
                <MessageSquareMore className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{footer.email}</span>
              </a>
              <a
                href="tel:+3197010280855"
                className="flex items-start gap-2 hover:text-[#1463FF]"
              >
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{footer.phone}</span>
              </a>
              <p>{footer.legalName}</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
