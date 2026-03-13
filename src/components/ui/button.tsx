import * as React from "react";
import type { ButtonHTMLAttributes, CSSProperties, ReactElement } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "icon" | "lg";
  style?: CSSProperties;
};

export function Button({
  asChild = false,
  className = "",
  variant = "default",
  size = "default",
  style,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "ghost"
      ? "bg-transparent hover:bg-slate-100"
      : variant === "outline"
        ? "border border-slate-300 bg-white hover:bg-slate-50"
        : "bg-slate-900 text-white hover:bg-slate-800";

  const sizeClass =
    size === "icon"
      ? "h-10 w-10 p-0"
      : size === "lg"
        ? "h-12 px-5"
        : "h-10 px-4";

  const classes = `inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variantClass} ${sizeClass} ${className}`;

  if (asChild) {
    const child = props.children as ReactElement;
    if (React.isValidElement(child)) {
      return React.cloneElement(child, {
        className: `${classes} ${(child.props as { className?: string }).className ?? ""}`.trim(),
        style,
      });
    }
  }

  return <button className={classes} style={style} {...props} />;
}
