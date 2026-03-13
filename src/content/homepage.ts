import {
  BadgeCheck,
  BellRing,
  BookOpen,
  Building2,
  ClipboardList,
  Factory,
  FileCheck,
  Globe2,
  LayoutDashboard,
  Lock,
  MapPin,
  MessageSquareMore,
  Phone,
  ShieldCheck,
  Sparkles,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
};

export type StatItem = {
  value: string;
  label: string;
};

export type ServiceItem = {
  icon: LucideIcon;
  title: string;
  text: string;
};

export type ModuleItem = {
  icon: LucideIcon;
  title: string;
  status: "Live" | "Coming soon";
  text: string;
  bullets: string[];
};

export type OutcomeItem = {
  icon: LucideIcon;
  title: string;
  text: string;
};

export type IndustryItem = {
  icon: LucideIcon;
  title: string;
  text: string;
};

export type BundleItem = {
  name: string;
  badge: string;
  featured: boolean;
  description: string;
  includes: string[];
  cta: string;
};

export type FaqItem = {
  q: string;
  a: string;
};

export const brand = {
  blue: "#1463FF",
  blueDark: "#0E46B8",
  blueLight: "#EAF1FF",
  navy: "#08152E",
};

export const navItems: NavItem[] = [
  { href: "#platform", label: "Platform" },
  { href: "#modules", label: "Modules" },
  { href: "#industries", label: "Industries" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: "#contact", label: "Book a demo" },
];

export const hero = {
  eyebrow: "Built for F&B, retail, QSR, franchise, and multi-location operators",
  title: "Run every location with the same standard, visibility, and accountability.",
  description:
    "InCheck360 helps operations teams replace paper checklists, scattered spreadsheets, and disconnected tools with one platform for daily execution, SOP access, compliance workflows, and real-time oversight.",
  primaryCta: {
    label: "Book a demo",
    href: "#contact",
  },
  secondaryCta: {
    label: "Explore modules",
    href: "#modules",
  },
  highlights: [
    "Standardize routines by role, shift, and location",
    "Keep SOPs, policies, and task evidence in one place",
    "See missed tasks, risks, and compliance gaps in real time",
    "Scale operations consistently from 5 to 500 locations",
  ],
};

export const trustBar = {
  title: "Built for structured frontline operations",
  items: [
    "Multi-location F&B teams",
    "QSR and franchise operators",
    "Retail and store operations leaders",
    "Compliance and quality teams",
  ],
};

export const stats: StatItem[] = [
  {
    value: "72%",
    label: "Reported reduction in checklist violations within 30 days",
  },
  {
    value: "5–500",
    label: "Locations supported under one operating standard",
  },
  {
    value: "Real-time",
    label: "Visibility into task completion, compliance status, and escalations",
  },
  {
    value: "Secure cloud",
    label: "Encrypted storage, role-based access, and full audit trails",
  },
];

export const platformPillars: ServiceItem[] = [
  {
    icon: ClipboardList,
    title: "Daily execution management",
    text: "Digitize recurring routines like opening checks, closing procedures, hygiene tasks, and temperature logs so every shift follows the same standard.",
  },
  {
    icon: BookOpen,
    title: "SOP and policy distribution",
    text: "Give teams instant access to the latest procedures, guides, and reference materials based on role, department, shift, or location.",
  },
  {
    icon: BellRing,
    title: "Automated follow-up",
    text: "Trigger reminders, escalations, and confirmations automatically when tasks are overdue, incomplete, or missed during shift handovers.",
  },
  {
    icon: LayoutDashboard,
    title: "Operational visibility",
    text: "Track completion rates, missed checklists, recurring issues, and store-level compliance from one centralized dashboard.",
  },
  {
    icon: Globe2,
    title: "Rollout consistency",
    text: "Launch procedural updates, campaigns, equipment changes, and new standards across locations with better coordination and accountability.",
  },
  {
    icon: MessageSquareMore,
    title: "Incident communication",
    text: "Improve response times with structured alerts, manager notifications, and follow-up workflows connected to frontline execution.",
  },
];

export const modules: ModuleItem[] = [
  {
    icon: ClipboardList,
    title: "Checklist",
    status: "Live",
    text: "Create dynamic routines that guide teams through the right tasks at the right time based on role, shift, and location.",
    bullets: [
      "Recurring checklists by role, shift, department, or store",
      "Conditional logic, photo uploads, and validation steps",
      "Timestamps, completion status, and missed-item visibility",
    ],
  },
  {
    icon: BookOpen,
    title: "Reference Materials",
    status: "Live",
    text: "Centralize SOPs, training guides, policies, and operational documents so teams always work from the latest version.",
    bullets: [
      "Support for PDFs, videos, and image-based guides",
      "Visibility controls by job title, location, department, or shift",
      "Instant updates across every store and team",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Compliance",
    status: "Coming soon",
    text: "Extend execution data into a dedicated compliance layer for stronger visibility into risk, repeat issues, and procedural gaps.",
    bullets: [
      "Centralized compliance monitoring and alerts",
      "Better visibility into violations and recurring issues",
      "Stronger accountability across stores and teams",
    ],
  },
];

export const outcomes: OutcomeItem[] = [
  {
    icon: BadgeCheck,
    title: "Safer, more consistent execution",
    text: "Deliver the right task, checklist, or procedure at the right time for every team member and every location.",
  },
  {
    icon: LayoutDashboard,
    title: "Real-time operational insight",
    text: "See what is complete, what is overdue, and where support is needed before issues become bigger problems.",
  },
  {
    icon: BellRing,
    title: "Faster corrective action",
    text: "Turn exceptions, missed tasks, and shift issues into immediate follow-up instead of delayed manual reporting.",
  },
  {
    icon: Sparkles,
    title: "Scalable operating standards",
    text: "Roll out one structured operating model across multiple stores without losing local visibility or control.",
  },
];

export const industries: IndustryItem[] = [
  {
    icon: UtensilsCrossed,
    title: "F&B and QSR",
    text: "Standardize food safety checks, temperature logs, opening and closing routines, and daily store execution.",
  },
  {
    icon: Store,
    title: "Retail chains",
    text: "Keep store standards, recurring tasks, issue resolution, and team accountability aligned across branches.",
  },
  {
    icon: Factory,
    title: "Multi-unit operators",
    text: "Maintain one operating framework while preserving visibility by region, department, site, and shift.",
  },
  {
    icon: Building2,
    title: "Franchise networks",
    text: "Roll out standards, updates, campaigns, and procedures consistently while keeping local teams coordinated.",
  },
];

export const pricingBundles: BundleItem[] = [
  {
    name: "InCheck Full",
    badge: "Best for full rollout",
    featured: true,
    description:
      "For operators who want the complete InCheck360 operating stack across execution, SOP access, and daily oversight.",
    includes: [
      "Checklist module included",
      "Reference Materials module included",
      "Journal module included",
      "Unlimited checklist usage",
      "Unlimited app users",
      "Unlimited web app users",
    ],
    cta: "Book a demo",
  },
  {
    name: "InCheck Lite",
    badge: "Flexible starting point",
    featured: false,
    description:
      "For teams that want a lower-friction entry into digital checklists and SOP distribution, with room to expand over time.",
    includes: [
      "Checklist module included",
      "Reference Materials module included",
      "Journal optional",
      "4 app users included",
      "Unlimited web app users",
      "Optional paid add-ons as you scale",
    ],
    cta: "Book a demo",
  },
];

export const addOns = [
  "Journal can be added to InCheck Lite",
  "Additional checklist capacity can be added",
  "Additional app users can be added",
  "Commercial terms can scale with rollout size and team structure",
];

export const roadmap = [
  "Smart sensor integration for real-time environmental monitoring",
  "Digital labeling to improve traceability and food safety",
  "AI-driven analytics for workflow patterns and operational insights",
  "AIoT infrastructure that combines device data with machine learning",
];

export const secondaryProof = [
  {
    icon: FileCheck,
    title: "Inspection readiness",
    text: "Keep audit evidence, task history, and operational records organized and easy to review.",
  },
  {
    icon: Lock,
    title: "Security and control",
    text: "Protect operational data with secure cloud infrastructure, encrypted storage, permissions, and audit trails.",
  },
  {
    icon: ShieldCheck,
    title: "Operational accountability",
    text: "Create clear ownership for what must be done, when it must be done, and who is responsible.",
  },
];

export const faqs: FaqItem[] = [
  {
    q: "What is InCheck360?",
    a: "InCheck360 is an operations management platform for multi-location teams. It helps businesses digitize recurring routines, centralize SOPs, and monitor execution and compliance in real time.",
  },
  {
    q: "Who is InCheck360 built for?",
    a: "It is designed for F&B, QSR, retail, franchise, and other multi-location operators that need more consistent frontline execution across stores and shifts.",
  },
  {
    q: "Can tasks and SOPs be customized by location or role?",
    a: "Yes. Workflows, checklists, reference materials, and visibility rules can be configured by role, shift, department, and location.",
  },
  {
    q: "Does the platform support compliance workflows?",
    a: "Yes. Teams can use structured task execution, proof of completion, and centralized records to strengthen compliance and day-to-day operational control.",
  },
  {
    q: "Is operational data secure?",
    a: "Yes. The platform is positioned around secure cloud infrastructure, encrypted storage, role-based access, and audit trails.",
  },
  {
    q: "How do teams get started?",
    a: "The best first step is to book a demo. From there, the rollout can be planned around locations, roles, operational priorities, and onboarding needs.",
  },
];

export const contactCard = {
  badge: "Book a demo",
  title: "See how InCheck360 can fit your operation.",
  description:
    "Tell us about your business, your number of locations, and the workflows you want to improve. We’ll tailor the conversation to your rollout needs.",
  details: [
    {
      icon: Phone,
      label: "Call us",
      value: "+31 970 102 80855",
      href: "tel:+3197010280855",
    },
    {
      icon: MessageSquareMore,
      label: "Email us",
      value: "info@incheck360.nl",
      href: "mailto:info@incheck360.nl",
    },
    {
      icon: MapPin,
      label: "Location",
      value: "Enschede, The Netherlands",
    },
  ],
};

export const contactFormFields = [
  {
    name: "name",
    label: "Full name",
    type: "text",
    placeholder: "Jane Smith",
  },
  {
    name: "email",
    label: "Work email",
    type: "email",
    placeholder: "jane@company.com",
  },
  {
    name: "company",
    label: "Company",
    type: "text",
    placeholder: "Your company",
  },
  {
    name: "locations",
    label: "Number of locations",
    type: "text",
    placeholder: "e.g. 12",
  },
];

export const footer = {
  companyName: "InCheck360",
  tagline: "Operational Excellence Platform",
  description:
    "Built for brands that need sharper execution, stronger compliance, and clearer visibility across every location.",
  legalName: "InCheck360 Holding B.V.",
  email: "info@incheck360.nl",
  phone: "+31 970 102 80855",
  location: "Enschede, The Netherlands",
};
