import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthProvider } from "@/hooks/useAuth";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import Inbox from "./pages/Inbox";
import Today from "./pages/Today";
import Documents from "./pages/Documents";
import AssistantActivity from "./pages/AssistantActivity";

import Shortlist from "./pages/Shortlist";
import NotAFit from "./pages/NotAFit";
import AILab from "./pages/AILab";
import Settings from "./pages/Settings";
import AuthPage from "./pages/Auth";
import Landing from "./pages/Landing";
import GuestEntry from "./pages/GuestEntry";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/landing" element={<Landing />} />
              <Route path="/guest" element={<GuestEntry />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route
                element={
                  <RequireAuth>
                    <MainLayout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<Inbox />} />
                <Route path="/shortlist" element={<Shortlist />} />
                <Route path="/not-a-fit" element={<NotAFit />} />
                <Route path="/ai-lab" element={<AILab />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
