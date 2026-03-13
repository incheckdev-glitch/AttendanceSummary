import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export default function SurfaceCard({
  children,
  className = "",
  contentClassName = "",
}: SurfaceCardProps) {
  return (
    <Card
      className={`rounded-[1.75rem] border-[#DCE7FF] bg-white shadow-sm shadow-[#1463FF]/5 ${className}`}
    >
      <CardContent className={`p-7 ${contentClassName}`}>
        {children}
      </CardContent>
    </Card>
  );
}
