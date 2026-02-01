import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { fetchResumeProfile } from "@/lib/api/resume";
import { fetchPipelineCounts } from "@/lib/api/jobs";
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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar 
          profile={profile} 
          onProfileUpdate={setProfile} 
          counts={counts} 
        />
        <SidebarInset className="flex-1">
          <header className="h-12 flex items-center border-b px-4 md:hidden">
            <SidebarTrigger />
            <span className="ml-2 font-semibold">JS-Searcher</span>
          </header>
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto p-6">
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
