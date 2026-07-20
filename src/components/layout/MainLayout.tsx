import { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchResumeProfile } from "@/lib/api/resume";
import { fetchPipelineCounts } from "@/lib/api/jobs";
import { isGuest, exitGuest } from "@/lib/guest";
import type { ResumeProfile, PipelineCounts } from "@/types/job";

export function MainLayout() {
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [counts, setCounts] = useState<PipelineCounts>({
    inbox: 0,
    shortlist: 0,
    not_fit: 0,
    applied: 0,
    interview: 0,
    offer: 0,
  });
  const navigate = useNavigate();
  const guest = isGuest();

  useEffect(() => {
    async function loadData() {
      try {
        const [profileData, countsData] = await Promise.all([
          fetchResumeProfile(),
          fetchPipelineCounts(),
        ]);
        setProfile(profileData);
        setCounts(countsData);
      } catch (error) {
        console.error("Error loading sidebar data:", error);
      }
    }
    loadData();
  }, []);

  const refreshCounts = async () => {
    try {
      const countsData = await fetchPipelineCounts();
      setCounts(countsData);
    } catch (error) {
      console.error("Error refreshing counts:", error);
    }
  };

  const handleExitGuest = () => {
    exitGuest();
    navigate("/landing", { replace: true });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar
          profile={profile}
          onProfileUpdate={setProfile}
          counts={counts}
          isGuest={guest}
          onExitGuest={handleExitGuest}
        />
        <SidebarInset className="flex-1 min-w-0">
          <header className="h-12 flex items-center border-b px-4 gap-3 md:hidden">
            <SidebarTrigger />
            <span className="font-semibold">Seek Smarter</span>
            {guest && <Badge variant="secondary" className="text-[10px]">Demo</Badge>}
          </header>
          {guest && (
            <div className="border-b bg-primary/5 px-4 py-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground truncate">
                <span className="font-medium text-foreground">Guest demo</span> — sample data, no live APIs.
              </span>
              <Button variant="ghost" size="sm" onClick={handleExitGuest}>
                Exit demo
              </Button>
            </div>
          )}
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto p-4 sm:p-6 max-w-none">
              <Outlet context={{ profile, setProfile, refreshCounts }} />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

// Hook to use layout context
import { useOutletContext } from "react-router-dom";

interface LayoutContext {
  profile: ResumeProfile | null;
  setProfile: (profile: ResumeProfile | null) => void;
  refreshCounts: () => Promise<void>;
}

export function useLayoutContext() {
  return useOutletContext<LayoutContext>();
}
