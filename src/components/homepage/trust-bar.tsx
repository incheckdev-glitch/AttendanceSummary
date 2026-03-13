import { trustBar } from "@/content/homepage";

export default function TrustBar() {
  return (
    <section className="border-y border-[#DCE7FF] bg-[#F8FBFF]">
      <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm font-medium text-slate-500">
            {trustBar.title}
          </p>

          <div className="flex flex-wrap gap-3">
            {trustBar.items.map((item) => (
              <div
                key={item}
                className="rounded-full border border-[#DCE7FF] bg-white px-4 py-2 text-sm text-slate-700 shadow-sm shadow-[#1463FF]/5"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
