"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { contactFormFields } from "@/content/homepage";

type FormState = {
  name: string;
  email: string;
  company: string;
  locations: string;
  industry: string;
  message: string;
};

const initialState: FormState = {
  name: "",
  email: "",
  company: "",
  locations: "",
  industry: "",
  message: "",
};

export default function ContactForm() {
  const [form, setForm] = React.useState<FormState>(initialState);
  const [submitted, setSubmitted] = React.useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Replace this with your backend call or API route later.
    // Example target: /api/demo-request
    setSubmitted(true);
  }

  return (
    <div className="rounded-[2rem] border border-[#DCE7FF] bg-white p-6 shadow-sm shadow-[#1463FF]/5 sm:p-8">
      <div className="mb-6">
        <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
          Request your demo
        </h3>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Share a few details and the team can tailor the conversation to your
          operation, rollout size, and priorities.
        </p>
      </div>

      {submitted ? (
        <div className="rounded-2xl border border-[#DCE7FF] bg-[#F8FBFF] p-5">
          <p className="text-base font-semibold text-slate-950">
            Thanks — your request is ready to be connected.
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Hook this form up to your API route or CRM workflow to start
            receiving demo requests directly.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            {contactFormFields.map((field) => (
              <div key={field.name} className="space-y-2">
                <label
                  htmlFor={field.name}
                  className="text-sm font-medium text-slate-900"
                >
                  {field.label}
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type={field.type}
                  value={form[field.name as keyof FormState]}
                  onChange={(event) =>
                    updateField(
                      field.name as keyof FormState,
                      event.target.value as never,
                    )
                  }
                  placeholder={field.placeholder}
                  className="h-12 w-full rounded-xl border border-[#DCE7FF] bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-[#1463FF] focus:ring-4 focus:ring-[#1463FF]/10"
                  required
                />
              </div>
            ))}

            <div className="space-y-2">
              <label
                htmlFor="industry"
                className="text-sm font-medium text-slate-900"
              >
                Industry
              </label>
              <select
                id="industry"
                name="industry"
                value={form.industry}
                onChange={(event) => updateField("industry", event.target.value)}
                className="h-12 w-full rounded-xl border border-[#DCE7FF] bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-[#1463FF] focus:ring-4 focus:ring-[#1463FF]/10"
                required
              >
                <option value="" disabled>
                  Select your industry
                </option>
                <option value="fnb-qsr">F&amp;B / QSR</option>
                <option value="retail">Retail</option>
                <option value="franchise">Franchise</option>
                <option value="multi-unit">Multi-unit operations</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="message"
                className="text-sm font-medium text-slate-900"
              >
                What do you want to improve?
              </label>
              <textarea
                id="message"
                name="message"
                value={form.message}
                onChange={(event) => updateField("message", event.target.value)}
                placeholder="Tell us about your workflows, compliance needs, or rollout goals."
                rows={5}
                className="w-full rounded-xl border border-[#DCE7FF] bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-[#1463FF] focus:ring-4 focus:ring-[#1463FF]/10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs leading-6 text-slate-500">
              This form is designed to replace mailto links with a proper lead
              capture experience. Connect it to your API, CRM, or automation
              flow in the next step.
            </p>

            <Button
              type="submit"
              className="rounded-xl bg-[#1463FF] px-6 text-white hover:bg-[#0E46B8]"
            >
              Book a demo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
