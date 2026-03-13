"use client";

import * as React from "react";

type AccordionContextValue = {
  value: string | null;
  setValue: (next: string | null) => void;
  collapsible: boolean;
};

const AccordionContext = React.createContext<AccordionContextValue | null>(null);
const ItemContext = React.createContext<{ value: string } | null>(null);

type AccordionProps = {
  type?: "single";
  collapsible?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Accordion({
  collapsible = false,
  className = "",
  children,
}: AccordionProps) {
  const [value, setValue] = React.useState<string | null>(null);

  return (
    <AccordionContext.Provider value={{ value, setValue, collapsible }}>
      <div className={className}>{children}</div>
    </AccordionContext.Provider>
  );
}

type AccordionItemProps = {
  value: string;
  className?: string;
  children: React.ReactNode;
};

export function AccordionItem({ value, className = "", children }: AccordionItemProps) {
  return (
    <ItemContext.Provider value={{ value }}>
      <div className={className}>{children}</div>
    </ItemContext.Provider>
  );
}

type AccordionTriggerProps = {
  className?: string;
  children: React.ReactNode;
};

export function AccordionTrigger({ className = "", children }: AccordionTriggerProps) {
  const accordion = React.useContext(AccordionContext);
  const item = React.useContext(ItemContext);
  if (!accordion || !item) return <button className={className}>{children}</button>;

  const isOpen = accordion.value === item.value;

  const onClick = () => {
    if (isOpen && accordion.collapsible) {
      accordion.setValue(null);
      return;
    }
    accordion.setValue(item.value);
  };

  return (
    <button type="button" className={`flex w-full items-center justify-between py-4 ${className}`} onClick={onClick}>
      {children}
      <span className="ml-4 text-slate-400">{isOpen ? "−" : "+"}</span>
    </button>
  );
}

type AccordionContentProps = {
  className?: string;
  children: React.ReactNode;
};

export function AccordionContent({ className = "", children }: AccordionContentProps) {
  const accordion = React.useContext(AccordionContext);
  const item = React.useContext(ItemContext);
  if (!accordion || !item) return null;

  const isOpen = accordion.value === item.value;
  if (!isOpen) return null;

  return <div className={className}>{children}</div>;
}
