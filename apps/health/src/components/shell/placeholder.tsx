import type { LucideIcon } from "lucide-react";

export function Placeholder({
  title,
  icon: Icon,
}: {
  title: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
      <div className="bg-card flex size-14 items-center justify-center rounded-2xl border">
        <Icon className="text-muted-foreground size-7" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">Coming soon.</p>
    </div>
  );
}
