"use client";

import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SettingHandle } from "@/lib/hooks/use-setting";

/**
 * The shared shell for the settings cards: card chrome + the three load states
 * of a useSetting handle.
 *
 * A failed load must NOT render as an editable form of defaults — saving over
 * it would silently overwrite the real value — so it gets an explicit Retry
 * state. Loaded, the form renders inside a fragment keyed on the data's JSON:
 * the children seed their inputs via lazy useState and remount whenever a save
 * lands the server-normalized value — no state-syncing effects.
 */
export function SettingCard<T>(props: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  /** Fills "Couldn't load {label}." — e.g. "the current factor". */
  loadErrorLabel: string;
  setting: SettingHandle<T>;
  children: (data: T, setting: SettingHandle<T>) => ReactNode;
}): ReactNode {
  const { icon: Icon, setting } = props;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" /> {props.title}
        </CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {setting.isError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Couldn&apos;t load {props.loadErrorLabel}.
            </p>
            <Button variant="outline" onClick={setting.refetch}>
              Retry
            </Button>
          </div>
        ) : setting.isPending || setting.data === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <Fragment key={JSON.stringify(setting.data)}>
            {props.children(setting.data, setting)}
          </Fragment>
        )}
      </CardContent>
    </Card>
  );
}
