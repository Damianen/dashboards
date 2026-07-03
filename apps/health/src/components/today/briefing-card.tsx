"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Moon, Sun } from "lucide-react";

import { TemplatePreviewSheet } from "@/components/lifting/template-preview-sheet";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ObservationSection,
  RecapSection,
  SleepSection,
  SuggestedSessionSection,
  SupplementsSection,
  TargetsSection,
  TomorrowSection,
  UnfinishedSection,
  WeightTrendSection,
} from "@/lib/briefing";
import { dateLabel, formatHm, formatKg, formatNumber } from "@/lib/format";
import { useBriefing, type Briefing } from "@/lib/hooks/use-briefing";
import { useTemplates } from "@/lib/hooks/use-templates";
import { briefingModeSchema, type BriefingMode } from "@/lib/schemas/briefing";
import { SUPPLEMENT_TIME_GROUP_LABELS } from "@/lib/schemas/supplement";
import { cn } from "@/lib/utils";

/** Local litres formatter — lib/notifications' formatLiters is server-side. */
function liters(ml: number): string {
  return `${(ml / 1000).toFixed(1)} L`;
}

function signedKg(deltaKg: number): string {
  const sign = deltaKg < 0 ? "−" : "+";
  return `${sign}${Math.abs(deltaKg).toFixed(1)} kg`;
}

/** Inert collapsed lookalike served as the Suspense fallback (QuickLogFab pattern). */
export function BriefingCardFallback() {
  return (
    <Card className="gap-0 p-0" aria-hidden>
      <div className="flex min-h-11 w-full items-center gap-2 p-4">
        <Sun className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="text-sm font-medium">Daily briefing</span>
        <ChevronDown className="text-muted-foreground ml-auto size-4 shrink-0" aria-hidden />
      </div>
    </Card>
  );
}

/**
 * The Daily Briefing: a collapsible overview card at the top of Today. The
 * collapsed row is the briefing headline; expanding shows the sectioned
 * morning/evening view. `/?briefing=morning|evening` (the push deep link)
 * opens it expanded in that mode; the param is consumed on mount so a refresh
 * doesn't re-expand. Sections absent from the payload simply don't render.
 */
export function BriefingCard() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const paramParse = briefingModeSchema.safeParse(searchParams.get("briefing"));
  const briefingParam = paramParse.success ? paramParse.data : undefined;

  const [expanded, setExpanded] = useState(briefingParam !== undefined);
  const [modeOverride, setModeOverride] = useState<BriefingMode | undefined>(
    briefingParam,
  );

  // Consume the deep-link param (URL cleanup only — no state updates, so the
  // setState-in-effect rule holds). Mirrors quick-log-fab.tsx; the guard means
  // this never eats a different component's params.
  useEffect(() => {
    if (briefingParam !== undefined) {
      window.history.replaceState(null, "", pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on mount
  }, []);

  const { data, isLoading, isError } = useBriefing(modeOverride);
  const mode = modeOverride ?? data?.mode ?? "morning";

  return (
    <Card className="gap-0 p-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 p-4 text-left"
      >
        {mode === "evening" ? (
          <Moon className="text-muted-foreground size-4 shrink-0" aria-hidden />
        ) : (
          <Sun className="text-muted-foreground size-4 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {data?.headline ? data.headline : "Daily briefing"}
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="space-y-4 px-4 pb-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ) : isError || !data ? (
            <p className="text-muted-foreground text-sm">
              Couldn&apos;t load the briefing.
            </p>
          ) : (
            <>
              <Segmented<BriefingMode>
                value={data.mode}
                onChange={setModeOverride}
                options={[
                  { value: "morning", label: "Morning" },
                  { value: "evening", label: "Evening" },
                ]}
                ariaLabel="Briefing mode"
                size="sm"
              />
              <BriefingBody briefing={data} />
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function BriefingBody({ briefing }: { briefing: Briefing }) {
  const s = briefing.sections;
  return (
    <div className="space-y-4">
      {s.sleep && <SleepBlock section={s.sleep} />}
      {s.targets && <TargetsBlock section={s.targets} />}
      {s.session && <SessionBlock title="Today's session" section={s.session} />}
      {s.supplements && <SupplementsBlock section={s.supplements} />}
      {s.weightTrend && <WeightTrendBlock section={s.weightTrend} />}
      {s.observation && <ObservationBlock section={s.observation} />}
      {s.recap && <RecapBlock section={s.recap} />}
      {s.unfinished && <UnfinishedBlock section={s.unfinished} />}
      {s.tomorrow && <TomorrowBlock section={s.tomorrow} />}
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

const RECOVERY_LABELS: Record<string, string> = {
  normal: "normal",
  elevated: "slightly off baseline",
  high: "well off baseline",
  insufficient: "not enough baseline data",
};

function SleepBlock({ section }: { section: SleepSection }) {
  // Stale data is labeled with its day — never presented as fresh.
  const title = section.isStale
    ? `Sleep & recovery — ${dateLabel(section.day)}`
    : "Sleep & recovery";
  return (
    <Block title={title}>
      <Row
        label="Sleep score"
        value={section.sleepScore != null ? formatNumber(section.sleepScore) : "—"}
      />
      <Row
        label="Time asleep"
        value={
          section.totalSleepMin != null ? formatHm(section.totalSleepMin) : "—"
        }
      />
      <Row
        label="Readiness"
        value={
          section.readinessScore != null
            ? formatNumber(section.readinessScore)
            : "—"
        }
      />
      {section.recoveryStatus != null && (
        <p className="text-muted-foreground text-xs">
          Recovery: {RECOVERY_LABELS[section.recoveryStatus] ?? section.recoveryStatus}.{" "}
          {section.caveat}
        </p>
      )}
    </Block>
  );
}

function TargetsBlock({ section }: { section: TargetsSection }) {
  return (
    <Block title="Today's targets">
      <Row
        label="Water"
        value={
          section.caffeineMg != null && section.caffeineMg > 0
            ? `${liters(section.waterTargetMl)} (incl. ${formatNumber(section.caffeineMg)} mg caffeine)`
            : liters(section.waterTargetMl)
        }
      />
      {section.proteinTargetG != null && (
        <Row label="Protein" value={`${formatNumber(section.proteinTargetG)} g`} />
      )}
      {section.intakeKcalTarget != null && (
        <Row label="Calories" value={`${formatNumber(section.intakeKcalTarget)} kcal`} />
      )}
      {section.tdeeKcal != null && (
        <p className="text-muted-foreground text-xs">
          TDEE estimate ~{formatNumber(section.tdeeKcal)} kcal
          {section.tdeeConfidence != null && ` (${section.tdeeConfidence} confidence)`}
          .
        </p>
      )}
    </Block>
  );
}

const KIND_LABELS = {
  PLANNED: "Planned",
  LIGHTER: "Go lighter",
  REST: "Rest",
} as const;

/**
 * The advisory session chip. Tapping a startable template opens the normal
 * start-from-template preview sheet — the suggestion itself never starts,
 * blocks, or modifies anything.
 */
function SessionBlock({
  title,
  section,
  prepLine,
}: {
  title: string;
  section: SuggestedSessionSection;
  prepLine?: string | null;
}) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const { data: templates } = useTemplates(false);

  const suggestion = section.suggestion;
  if (suggestion === null) {
    return (
      <Block title={title}>
        <p className="text-sm">
          <Link href="/settings" className="underline underline-offset-4">
            Set up your workout split in Settings
          </Link>{" "}
          to get a session suggestion here.
        </p>
      </Block>
    );
  }

  const template =
    suggestion.templateId != null
      ? templates?.find((t) => t.id === suggestion.templateId)
      : undefined;
  const startable = template != null && !template.archived;
  const name =
    suggestion.templateName ?? (suggestion.kind === "REST" ? "Rest day" : "—");

  return (
    <Block title={title}>
      <button
        type="button"
        disabled={!startable}
        onClick={() => setPreviewOpen(true)}
        className={cn(
          "border-input flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left",
          startable && "hover:bg-accent transition-colors",
        )}
      >
        <span className="bg-secondary text-secondary-foreground shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
          {KIND_LABELS[suggestion.kind]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        {startable && (
          <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
        )}
      </button>
      <p className="text-muted-foreground text-sm">{suggestion.reason}</p>
      {suggestion.templateArchived && (
        <p className="text-muted-foreground text-xs">
          This template is archived —{" "}
          <Link href="/lifting" className="underline underline-offset-4">
            manage it in Lifting
          </Link>
          .
        </p>
      )}
      {prepLine != null && <p className="text-sm">{prepLine}</p>}
      <p className="text-muted-foreground text-xs">{section.caveat}</p>
      {template && (
        <TemplatePreviewSheet
          template={template}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          onEdit={() => router.push("/lifting")}
        />
      )}
    </Block>
  );
}

function SupplementsBlock({ section }: { section: SupplementsSection }) {
  return (
    <Block title="Supplements">
      <Row
        label={`${SUPPLEMENT_TIME_GROUP_LABELS[section.timeGroup]} checked`}
        value={`${section.doneCount}/${section.total}`}
      />
    </Block>
  );
}

function WeightTrendBlock({ section }: { section: WeightTrendSection }) {
  return (
    <Block title="Weight trend">
      <Row
        label="Latest"
        value={section.latestKg != null ? formatKg(section.latestKg) : "—"}
      />
      <Row
        label="7-day avg"
        value={section.avg7dKg != null ? formatKg(section.avg7dKg) : "—"}
      />
      {section.delta7dKg != null && (
        <Row label="vs last week" value={signedKg(section.delta7dKg)} />
      )}
    </Block>
  );
}

function ObservationBlock({ section }: { section: ObservationSection }) {
  return (
    <Block title="New observation">
      <p className="text-sm font-medium">{section.title}</p>
      <p className="text-muted-foreground text-sm">{section.finding}</p>
    </Block>
  );
}

function RecapBlock({ section }: { section: RecapSection }) {
  return (
    <Block title="Today vs targets">
      <Row
        label="Water"
        value={`${(section.water.ml / 1000).toFixed(1)} / ${liters(section.water.targetMl)}`}
      />
      <Row
        label="Protein"
        value={
          section.protein.targetG != null
            ? `${formatNumber(section.protein.actualG)} / ${formatNumber(section.protein.targetG)} g`
            : `${formatNumber(section.protein.actualG)} g`
        }
      />
      <Row
        label="Calories"
        value={
          section.calories.targetKcal != null
            ? `${formatNumber(section.calories.actualKcal)} / ${formatNumber(section.calories.targetKcal)} kcal`
            : `${formatNumber(section.calories.actualKcal)} kcal`
        }
      />
      <Row
        label="Training"
        value={
          section.training.done
            ? `✓${section.training.volumeKg != null ? ` ${formatKg(section.training.volumeKg)}` : ""}${section.training.workingSets != null ? ` · ${section.training.workingSets} sets` : ""}`
            : "No session"
        }
      />
    </Block>
  );
}

function UnfinishedBlock({ section }: { section: UnfinishedSection }) {
  return (
    <Block title="Still open">
      {section.supplementGroups.map((g) => (
        <Row
          key={g.timeGroup}
          label={`${SUPPLEMENT_TIME_GROUP_LABELS[g.timeGroup]} supplements`}
          value={`${g.remaining} unchecked`}
        />
      ))}
      {section.waterShortfallMl != null && (
        <Row label="Water" value={`${liters(section.waterShortfallMl)} to go`} />
      )}
    </Block>
  );
}

function TomorrowBlock({ section }: { section: TomorrowSection }) {
  return (
    <SessionBlock
      title={`Tomorrow — ${dateLabel(section.day)}`}
      section={section}
      prepLine={section.prepLine}
    />
  );
}
