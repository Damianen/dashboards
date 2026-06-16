import { describe, expect, it } from "vitest";

import {
  describeRRule,
  formatRRule,
  parseRRule,
  RecurrenceParseError,
  toRRule,
  type TimeOfDay,
} from "./rrule";

interface ToRRuleCase {
  name: string;
  input: string;
  rrule: string;
  recursFromCompletion?: boolean;
  time?: TimeOfDay | null;
}

const toRRuleCases: ToRRuleCase[] = [
  { name: "every day", input: "every day", rrule: "FREQ=DAILY" },
  {
    name: "every weekday",
    input: "every weekday",
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  },
  { name: "every weekend", input: "every weekend", rrule: "FREQ=WEEKLY;BYDAY=SA,SU" },
  { name: "every week", input: "every week", rrule: "FREQ=WEEKLY" },
  { name: "every month", input: "every month", rrule: "FREQ=MONTHLY" },
  { name: "every year", input: "every year", rrule: "FREQ=YEARLY" },
  { name: "every monday", input: "every monday", rrule: "FREQ=WEEKLY;BYDAY=MO" },
  { name: "abbreviated weekday", input: "every sun", rrule: "FREQ=WEEKLY;BYDAY=SU" },
  { name: "plural weekday", input: "every mondays", rrule: "FREQ=WEEKLY;BYDAY=MO" },
  { name: "every 3 days", input: "every 3 days", rrule: "FREQ=DAILY;INTERVAL=3" },
  { name: "every 2 weeks", input: "every 2 weeks", rrule: "FREQ=WEEKLY;INTERVAL=2" },
  { name: "every 6 months", input: "every 6 months", rrule: "FREQ=MONTHLY;INTERVAL=6" },
  { name: "every 3 years", input: "every 3 years", rrule: "FREQ=YEARLY;INTERVAL=3" },
  { name: "every other day", input: "every other day", rrule: "FREQ=DAILY;INTERVAL=2" },
  { name: "every other week", input: "every other week", rrule: "FREQ=WEEKLY;INTERVAL=2" },
  { name: "every 3rd friday", input: "every 3rd friday", rrule: "FREQ=MONTHLY;BYDAY=3FR" },
  {
    name: "every first monday",
    input: "every first monday",
    rrule: "FREQ=MONTHLY;BYDAY=1MO",
  },
  {
    name: "every last friday",
    input: "every last friday",
    rrule: "FREQ=MONTHLY;BYDAY=-1FR",
  },
  {
    name: "every monday 9am (time)",
    input: "every monday 9am",
    rrule: "FREQ=WEEKLY;BYDAY=MO",
    time: { hour: 9, minute: 0 },
  },
  {
    name: "every 3 days 18:00 (time)",
    input: "every 3 days 18:00",
    rrule: "FREQ=DAILY;INTERVAL=3",
    time: { hour: 18, minute: 0 },
  },
  {
    name: "every! 3 days 18:00 (bang + time)",
    input: "every! 3 days 18:00",
    rrule: "FREQ=DAILY;INTERVAL=3",
    recursFromCompletion: true,
    time: { hour: 18, minute: 0 },
  },
  {
    name: "every! day (bang only)",
    input: "every! day",
    rrule: "FREQ=DAILY",
    recursFromCompletion: true,
  },
  {
    name: "every day at 14:30 (at-prefixed time)",
    input: "every day at 14:30",
    rrule: "FREQ=DAILY",
    time: { hour: 14, minute: 30 },
  },
  {
    name: "pm time converts to 24h",
    input: "every tuesday 9pm",
    rrule: "FREQ=WEEKLY;BYDAY=TU",
    time: { hour: 21, minute: 0 },
  },
];

describe("toRRule", () => {
  it.each(toRRuleCases)("$name", (c) => {
    const r = toRRule(c.input);
    expect(r.rrule).toBe(c.rrule);
    expect(r.recursFromCompletion).toBe(c.recursFromCompletion ?? false);
    expect(r.time).toEqual(c.time ?? null);
    expect(r.hasDueTime).toBe((c.time ?? null) !== null);
  });

  it.each([
    "tomorrow",
    "every",
    "every fortnight",
    "every 3",
    "daily",
  ])("rejects %s", (input) => {
    expect(() => toRRule(input)).toThrow(RecurrenceParseError);
  });

  it("round-trips through parseRRule + formatRRule", () => {
    for (const c of toRRuleCases)
      expect(formatRRule(parseRRule(c.rrule))).toBe(c.rrule);
  });
});

interface DescribeCase {
  rrule: string;
  time?: TimeOfDay | null;
  expected: string;
}

const describeCases: DescribeCase[] = [
  { rrule: "FREQ=DAILY", expected: "Every day" },
  { rrule: "FREQ=DAILY;INTERVAL=2", expected: "Every other day" },
  { rrule: "FREQ=DAILY;INTERVAL=3", time: { hour: 18, minute: 0 }, expected: "Every 3 days at 18:00" },
  { rrule: "FREQ=WEEKLY", expected: "Every week" },
  { rrule: "FREQ=WEEKLY;INTERVAL=2", expected: "Every other week" },
  { rrule: "FREQ=WEEKLY;INTERVAL=3", expected: "Every 3 weeks" },
  { rrule: "FREQ=WEEKLY;BYDAY=MO", expected: "Every Monday" },
  { rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", expected: "Every weekday" },
  { rrule: "FREQ=WEEKLY;BYDAY=SA,SU", expected: "Every weekend" },
  { rrule: "FREQ=MONTHLY", expected: "Every month" },
  { rrule: "FREQ=MONTHLY;BYDAY=3FR", expected: "Every 3rd Friday" },
  { rrule: "FREQ=MONTHLY;BYDAY=-1FR", expected: "Every last Friday" },
  { rrule: "FREQ=YEARLY", expected: "Every year" },
];

describe("describeRRule", () => {
  it.each(describeCases)("$rrule -> $expected", (c) => {
    expect(describeRRule(c.rrule, c.time)).toBe(c.expected);
  });
});
