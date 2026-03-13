import { Badge } from "@/components/ui/badge";

type SectionHeadingProps = {
  badge: string;
  title: string;
  description: string;
  light?: boolean;
  align?: "left" | "center";
};

export default function SectionHeading({
  badge,
  title,
  description,
  light = false,
  align = "left",
}: SectionHeadingProps) {
  const isCenter = align === "center";

  return (
    <div className={`max-w-3xl ${isCenter ? "mx-auto text-center" : ""}`}>
      <Badge
        className={`mb-4 rounded-full px-3 py-1 text-xs ${
          light
            ? "bg-white/10 text-white hover:bg-white/10"
            : "bg-[#EAF1FF] text-[#1463FF] hover:bg-[#EAF1FF]"
        }`}
      >
        {badge}
      </Badge>

      <h2
        className={`text-3xl font-semibold tracking-tight sm:text-4xl ${
          light ? "text-white" : "text-slate-950"
        }`}
      >
        {title}
      </h2>

      <p
        className={`mt-4 text-base leading-7 sm:text-lg ${
          light ? "text-white/75" : "text-slate-600"
        }`}
      >
        {description}
      </p>
    </div>
  );
}
