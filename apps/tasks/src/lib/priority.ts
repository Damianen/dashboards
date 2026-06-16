// Priority presentation: 1 = p1 (highest) … 4 = p4 (default). The color
// tokens --priority-1/2/3 live in globals.css; p4 stays in the neutral
// muted tone.

export const PRIORITIES = [1, 2, 3, 4] as const;
export type Priority = (typeof PRIORITIES)[number];

export function priorityLabel(priority: number): string {
  return `P${priority}`;
}

/** Text color class driving currentColor accents (checkbox ring, flags). */
export function priorityTextClass(priority: number): string {
  switch (priority) {
    case 1:
      return "text-priority-1";
    case 2:
      return "text-priority-2";
    case 3:
      return "text-priority-3";
    default:
      return "text-muted-foreground";
  }
}
