import { BottomNav } from "@/components/shell/bottom-nav";
import { QuickLogFab } from "@/components/shell/quick-log-fab";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      {/* Bottom padding clears the fixed nav + floating FAB. */}
      <main className="mx-auto w-full max-w-md px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-28">
        {children}
      </main>
      <QuickLogFab />
      <BottomNav />
    </div>
  );
}
