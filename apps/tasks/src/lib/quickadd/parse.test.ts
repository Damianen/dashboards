import { describe, expect, it } from "vitest";

import { dueAtToInputValues } from "@/lib/dates";

import { parse, type ParseResult } from "./parse";

const TZ = "Europe/Amsterdam";
// A Tuesday, 08:00 CEST. Fixed so every relative date is deterministic.
const NOW = new Date("2026-06-16T08:00:00+02:00");
const ctx = { now: NOW, timezone: TZ } as const;

interface Case {
  name: string;
  text: string;
  content: string;
  priority?: 1 | 2 | 3 | 4;
  projectName?: string;
  sectionName?: string;
  labels?: string[];
  /** Expected Amsterdam calendar day "YYYY-MM-DD", or null for no due date. */
  date?: string | null;
  /** Expected wall-clock "HH:MM" when timed, else null/all-day. */
  time?: string | null;
  recurrenceRaw?: string;
}

const cases: Case[] = [
  { name: "plain title", text: "Buy milk", content: "Buy milk", date: null },
  { name: "priority p1", text: "Ship it p1", content: "Ship it", priority: 1 },
  { name: "priority p2", text: "Ship it p2", content: "Ship it", priority: 2 },
  { name: "priority p3", text: "Ship it p3", content: "Ship it", priority: 3 },
  { name: "priority p4", text: "Ship it p4", content: "Ship it", priority: 4 },
  { name: "no false priority mid-word", text: "Pizza party", content: "Pizza party" },
  { name: "project bare", text: "Review #Work", content: "Review", projectName: "Work" },
  { name: "project quoted", text: 'Review #"My Project"', content: "Review", projectName: "My Project" },
  { name: "section bare", text: "Plan /Backlog", content: "Plan", sectionName: "Backlog" },
  { name: "section quoted", text: 'Plan /"Q3 Goals"', content: "Plan", sectionName: "Q3 Goals" },
  { name: "single label", text: "Email @admin", content: "Email", labels: ["admin"] },
  { name: "label quoted", text: 'Email @"two words"', content: "Email", labels: ["two words"] },
  { name: "multiple labels", text: "Email @admin @urgent", content: "Email", labels: ["admin", "urgent"] },
  { name: "labels deduped case-insensitively", text: "Email @admin @Admin", content: "Email", labels: ["admin"] },
  { name: "tomorrow all-day", text: "Submit tomorrow", content: "Submit", date: "2026-06-17", time: null },
  { name: "tomorrow timed", text: "Submit tomorrow 9am", content: "Submit", date: "2026-06-17", time: "09:00" },
  { name: "this friday forward-dates", text: "Call friday", content: "Call", date: "2026-06-19", time: null },
  { name: "next friday is next week", text: "Call next friday", content: "Call", date: "2026-06-26", time: null },
  { name: "weekday forward-dates", text: "Standup monday", content: "Standup", date: "2026-06-22", time: null },
  { name: "in N days", text: "Ship in 3 days", content: "Ship", date: "2026-06-19", time: null },
  { name: "explicit date", text: "Pay jun 20", content: "Pay", date: "2026-06-20", time: null },
  {
    name: "acceptance line",
    text: "pay rent tomorrow 9am p2 #Finance @admin",
    content: "pay rent",
    priority: 2,
    projectName: "Finance",
    labels: ["admin"],
    date: "2026-06-17",
    time: "09:00",
  },
  { name: "leading recurrence", text: "every day water plants", content: "water plants", recurrenceRaw: "every day", date: null },
  { name: "leading recurrence with !", text: "every! monday standup", content: "standup", recurrenceRaw: "every! monday", date: null },
  { name: "trailing recurrence", text: "water plants every day", content: "water plants", recurrenceRaw: "every day", date: null },
  { name: "recurrence acceptance line", text: "water plants every! 3 days 18:00", content: "water plants", recurrenceRaw: "every! 3 days 18:00", date: null },
  { name: "recurrence with weekday + time", text: "standup every monday 9am", content: "standup", recurrenceRaw: "every monday 9am", date: null },
  { name: "ordinal recurrence", text: "rent every 3rd friday", content: "rent", recurrenceRaw: "every 3rd friday", date: null },
  { name: "recurrence keeps tokens", text: "pay rent every month p2 #Finance", content: "pay rent", recurrenceRaw: "every month", priority: 2, projectName: "Finance", date: null },
  { name: "whitespace collapses", text: "  Review   #Work   @admin   p1  ", content: "Review", projectName: "Work", labels: ["admin"], priority: 1 },
  { name: "dutch date", text: "Bel morgen 10:00", content: "Bel", date: "2026-06-17", time: "10:00" },
  { name: "project + section + priority", text: "Draft spec #Docs /Drafts p3", content: "Draft spec", projectName: "Docs", sectionName: "Drafts", priority: 3 },
];

describe("parse", () => {
  it.each(cases)("$name", (c) => {
    const r: ParseResult = parse(c.text, ctx);

    expect(r.content).toBe(c.content);
    expect(r.priority).toBe(c.priority);
    expect(r.projectName).toBe(c.projectName);
    expect(r.sectionName).toBe(c.sectionName);
    expect(r.labelNames).toEqual(c.labels ?? []);
    expect(r.recurrenceRaw).toBe(c.recurrenceRaw);

    if (c.date == null || c.recurrenceRaw) {
      expect(r.dueAt).toBeUndefined();
      expect(r.hasDueTime).toBe(false);
    } else {
      expect(r.dueAt).toBeInstanceOf(Date);
      const values = dueAtToInputValues(r.dueAt!, r.hasDueTime, TZ);
      expect(values.date).toBe(c.date);
      expect(values.time).toBe(c.time ?? null);
      expect(r.hasDueTime).toBe(c.time != null);
    }
  });

  it("recurrence echoes into dueString and leaves rrule unset", () => {
    const r = parse("every day water plants", ctx);
    expect(r.dueString).toBe("every day");
    expect("rrule" in r).toBe(false);
  });

  it("uses the chrono match text as dueString", () => {
    const r = parse("Submit tomorrow 9am", ctx);
    expect(r.dueString).toBe("tomorrow 9am");
  });

  it("defaults timezone and now when context is omitted", () => {
    const r = parse("Buy milk");
    expect(r.content).toBe("Buy milk");
    expect(r.labelNames).toEqual([]);
    expect(r.hasDueTime).toBe(false);
  });
});
