import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 p-4">
      <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4" aria-hidden />
        {title}
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

export function Stat({
  value,
  label,
  className,
}: {
  value: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

export function Progress({ percent }: { percent: number }) {
  return (
    <div
      className="bg-secondary h-2.5 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("bg-primary h-full rounded-full transition-[width]")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
