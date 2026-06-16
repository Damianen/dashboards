import { describe, expect, it } from "vitest";

import type { FilterContext, FilterTask } from "./ast";
import { FilterParseError } from "./errors";
import { compileFilter } from "./index";

const TZ = "Europe/Amsterdam";
// Tuesday 16 June 2026, 10:00 CEST (+02:00).
const now = new Date("2026-06-16T10:00:00+02:00");
const ctx: FilterContext = { now, timeZone: TZ };

const d = (iso: string) => new Date(iso);

function task(over: Partial<FilterTask> & { title: string }): FilterTask {
  return {
    title: over.title,
    description: over.description ?? null,
    priority: over.priority ?? 4,
    dueAt: over.dueAt ?? null,
    hasDueTime: over.hasDueTime ?? false,
    timezone: over.timezone ?? TZ,
    labels: over.labels ?? [],
    projectName: over.projectName ?? "Inbox",
    sectionName: over.sectionName ?? null,
  };
}

// All-day dueAt is stored as local midnight (CEST = +02:00 in June).
const t = {
  todaySchool: task({
    title: "today-school",
    dueAt: d("2026-06-16T00:00:00+02:00"),
    projectName: "School",
    priority: 1,
  }),
  todaySchoolWaiting: task({
    title: "today-school-waiting",
    dueAt: d("2026-06-16T00:00:00+02:00"),
    projectName: "School",
    labels: ["Waiting"],
  }),
  overdueSchool: task({
    title: "overdue-school",
    dueAt: d("2026-06-14T00:00:00+02:00"),
    projectName: "School",
  }),
  timedOverdue: task({
    title: "timed-overdue",
    dueAt: d("2026-06-16T09:00:00+02:00"),
    hasDueTime: true,
    projectName: "Work",
  }),
  todayPersonal: task({
    title: "today-personal",
    dueAt: d("2026-06-16T00:00:00+02:00"),
    projectName: "Personal",
  }),
  tomorrowSchool: task({
    title: "tomorrow-school",
    dueAt: d("2026-06-17T00:00:00+02:00"),
    projectName: "School",
  }),
  noDate: task({ title: "no-date", projectName: "School", labels: ["Reading"] }),
  inThreeDays: task({
    title: "in-three-days",
    dueAt: d("2026-06-19T00:00:00+02:00"),
    projectName: "Work",
  }),
  rent: task({
    title: "Pay rent",
    description: "transfer to landlord",
    projectName: "Finance",
    sectionName: "Bills",
  }),
};

interface MatchCase {
  name: string;
  filter: string;
  task: FilterTask;
  expected: boolean;
}

const matchCases: MatchCase[] = [
  { name: "today matches all-day due today", filter: "today", task: t.todaySchool, expected: true },
  { name: "today excludes tomorrow", filter: "today", task: t.tomorrowSchool, expected: false },
  { name: "today excludes no-date", filter: "today", task: t.noDate, expected: false },
  { name: "tomorrow matches tomorrow", filter: "tomorrow", task: t.tomorrowSchool, expected: true },
  { name: "tomorrow excludes today", filter: "tomorrow", task: t.todaySchool, expected: false },
  { name: "overdue matches all-day past", filter: "overdue", task: t.overdueSchool, expected: true },
  { name: "overdue matches timed earlier today", filter: "overdue", task: t.timedOverdue, expected: true },
  { name: "overdue excludes today all-day", filter: "overdue", task: t.todaySchool, expected: false },
  { name: "no date matches null due", filter: "no date", task: t.noDate, expected: true },
  { name: "no date excludes dated", filter: "no date", task: t.todaySchool, expected: false },
  { name: "no label matches unlabeled", filter: "no label", task: t.todaySchool, expected: true },
  { name: "no label excludes labeled", filter: "no label", task: t.todaySchoolWaiting, expected: false },
  { name: "p1 matches priority 1", filter: "p1", task: t.todaySchool, expected: true },
  { name: "p1 excludes priority 4", filter: "p1", task: t.todayPersonal, expected: false },
  { name: "#project case-insensitive", filter: "#school", task: t.todaySchool, expected: true },
  { name: "#project excludes other", filter: "#School", task: t.todayPersonal, expected: false },
  { name: "@label case-insensitive", filter: "@waiting", task: t.todaySchoolWaiting, expected: true },
  { name: "@label excludes unlabeled", filter: "@waiting", task: t.todaySchool, expected: false },
  { name: "/section matches", filter: "/Bills", task: t.rent, expected: true },
  { name: "/section excludes null section", filter: "/Bills", task: t.todaySchool, expected: false },
  { name: "search matches title", filter: "search: rent", task: t.rent, expected: true },
  { name: "search matches description, case-insensitive", filter: "search: LANDLORD", task: t.rent, expected: true },
  { name: "search excludes a miss", filter: "search: groceries", task: t.rent, expected: false },
  { name: "date before (absolute) includes earlier day", filter: "date before: 2026-06-16", task: t.overdueSchool, expected: true },
  { name: "date before excludes same day", filter: "date before: 2026-06-16", task: t.todaySchool, expected: false },
  { name: "date after (absolute) includes later day", filter: "date after: 2026-06-16", task: t.tomorrowSchool, expected: true },
  { name: "date after excludes same day", filter: "date after: 2026-06-16", task: t.todaySchool, expected: false },
  { name: "next 1 days = today only (today matches)", filter: "next 1 days", task: t.todaySchool, expected: true },
  { name: "next 1 days excludes tomorrow", filter: "next 1 days", task: t.tomorrowSchool, expected: false },
  { name: "next 7 days includes a day 3 out", filter: "next 7 days", task: t.inThreeDays, expected: true },
  { name: "next 3 days excludes the day-3 boundary", filter: "next 3 days", task: t.inThreeDays, expected: false },
  { name: "not negates", filter: "!@waiting", task: t.todaySchool, expected: true },
  { name: "and combines", filter: "today & #School", task: t.todaySchool, expected: true },
  { name: "or combines", filter: "tomorrow | overdue", task: t.overdueSchool, expected: true },
  { name: "& binds tighter than | (true via right)", filter: "today & overdue | #School", task: t.noDate, expected: true },
  { name: "& binds tighter than | (false)", filter: "tomorrow & overdue | @missing", task: t.todaySchool, expected: false },
];

describe("compileFilter — single-task matching", () => {
  it.each(matchCases)("$name", (c) => {
    expect(compileFilter(c.filter, ctx)(c.task)).toBe(c.expected);
  });
});

describe("compileFilter — acceptance over a task set", () => {
  it("(today | overdue) & #School & !@waiting selects the right tasks", () => {
    const all = Object.values(t);
    const predicate = compileFilter("(today | overdue) & #School & !@waiting", ctx);
    const matched = all.filter(predicate).map((task) => task.title);
    expect(matched).toEqual(["today-school", "overdue-school"]);
  });
});

describe("compileFilter — date resolution failure", () => {
  it("throws FilterParseError for an unparseable date phrase", () => {
    expect(() => compileFilter("date before: asdfqwer", ctx)).toThrow(
      FilterParseError,
    );
  });
});
