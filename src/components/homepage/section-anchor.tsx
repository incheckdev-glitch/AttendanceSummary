import type { ReactNode } from "react";

type SectionAnchorProps = {
  id: string;
  className?: string;
  children: ReactNode;
};

export default function SectionAnchor({
  id,
  className = "",
  children,
}: SectionAnchorProps) {
  return (
    <section id={id} className={`scroll-mt-28 ${className}`}>
      {children}
    </section>
  );
}
