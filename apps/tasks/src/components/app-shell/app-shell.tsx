import { SheetProvider } from "@/components/providers/sheet-provider";

import { Fab } from "./fab";
import { TabBar } from "./tab-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SheetProvider>
      <main className="mx-auto w-full max-w-screen-sm px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <Fab />
      <TabBar />
    </SheetProvider>
  );
}
