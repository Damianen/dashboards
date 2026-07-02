// The AI-vision confidence badge, shared by the label-scan and meal-estimate
// tabs (CLAUDE.md: vision outputs always show the model's stated confidence).
// tdee-card has a similar-looking map with different variants — deliberately
// separate (statistical confidence, not vision confidence).

export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE: Record<
  Confidence,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  high: { label: "High confidence", variant: "default" },
  medium: { label: "Medium confidence", variant: "secondary" },
  low: { label: "Low confidence", variant: "destructive" },
};
