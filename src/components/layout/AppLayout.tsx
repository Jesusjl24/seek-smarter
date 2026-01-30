import { ReactNode } from "react";

interface AppLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppLayout({ sidebar, children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-80 flex-col border-r bg-card">
        <div className="flex-1 overflow-y-auto p-4">{sidebar}</div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
