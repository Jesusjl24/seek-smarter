import { Inbox, Star, XCircle, FlaskConical } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NavLink } from "@/components/NavLink";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { ResumeUpload } from "@/components/resume/ResumeUpload";
import { Separator } from "@/components/ui/separator";
import type { ResumeProfile, PipelineCounts } from "@/types/job";

interface AppSidebarProps {
  profile: ResumeProfile | null;
  onProfileUpdate: (profile: ResumeProfile | null) => void;
  counts: PipelineCounts;
}

const navItems = [
  { title: "Inbox", url: "/", icon: Inbox, countKey: "inbox" as const },
  { title: "Shortlist", url: "/shortlist", icon: Star, countKey: "shortlist" as const },
  { title: "Not a Fit", url: "/not-a-fit", icon: XCircle, countKey: "not_fit" as const },
  { title: "AI Lab", url: "/ai-lab", icon: FlaskConical, countKey: null },
];

export function AppSidebar({ profile, onProfileUpdate, counts }: AppSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">JS-Searcher</h1>
            <p className="text-xs text-muted-foreground">
              AI-powered SEEK job matcher
            </p>
          </div>
          <ThemeToggle />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Pipeline</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-sidebar-accent transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1">{item.title}</span>
                      {item.countKey && counts[item.countKey] > 0 && (
                        <Badge variant="secondary" className="text-xs px-2 py-0">
                          {counts[item.countKey]}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-2" />

        <SidebarGroup>
          <SidebarGroupLabel>Resume</SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <ResumeUpload profile={profile} onProfileUpdate={onProfileUpdate} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="font-semibold">{counts.applied}</div>
            <div className="text-muted-foreground">Applied</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="font-semibold">{counts.interview}</div>
            <div className="text-muted-foreground">Interview</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="font-semibold">{counts.offer}</div>
            <div className="text-muted-foreground">Offers</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
