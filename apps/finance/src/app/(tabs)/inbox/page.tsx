import { InboxList } from "@/components/inbox/inbox-list";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  return (
    <section className="flex flex-col gap-3 py-4">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      <p className="text-sm text-muted-foreground">
        Uncategorized transactions. Tap one to file it.
      </p>
      <InboxList />
    </section>
  );
}
