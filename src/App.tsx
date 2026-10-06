import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { AuthProvider } from "@/hooks/use-auth";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import "@/lib/fill-handle-drag-guard";
import "@/lib/toast-error-guard";
import "./styles/overzicht-fixes.css";
import "./styles/mandagenregister-fixes.css";
import "./styles/form-control-fixes.css";
import "./styles/capaciteit-fixes.css";
import Auth from "./pages/Auth";
import Projecten from "./pages/Projecten";
import ProjectDetail from "./pages/ProjectDetail";
import ProjectDossier from "./pages/ProjectDossier";
import Plannen from "./pages/Plannen";
import Activiteiten from "./pages/Activiteiten";
import Capaciteit from "./pages/Capaciteit";
import Instellingen from "./pages/Instellingen";
import Overzicht from "./pages/Overzicht";
import Mandagenregister from "./pages/Mandagenregister";
import NotFound from "./pages/NotFound.tsx";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileToday } from "@/components/mobile/MobileToday";
import { MobileWeekPlanning } from "@/components/mobile/MobileWeekPlanning";
import { MobileCapacity } from "@/components/mobile/MobileCapacity";
import { MobileProjectDetail } from "@/components/mobile/MobileProjectDetail";
import { DesktopOnly } from "@/components/mobile/MobileShared";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

const ResponsivePage = ({ desktop, mobile }: { desktop: React.ReactNode; mobile: React.ReactNode }) =>
  useIsMobile() ? mobile : desktop;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ConfirmProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Navigate to="/overzicht" replace />} />
                  <Route path="/overzicht" element={<ResponsivePage desktop={<Overzicht />} mobile={<MobileToday />} />} />
                  <Route path="/projecten" element={<Projecten />} />
                  <Route path="/projecten/:id" element={<ResponsivePage desktop={<ProjectDetail />} mobile={<MobileProjectDetail />} />} />
                  <Route path="/projecten/:id/dossier" element={<ProjectDossier />} />
                  <Route path="/plannen" element={<ResponsivePage desktop={<Plannen />} mobile={<MobileWeekPlanning />} />} />
                  <Route path="/mandagenregister" element={<ResponsivePage desktop={<Mandagenregister />} mobile={<DesktopOnly title="Mandagenregister" />} />} />
                  <Route path="/activiteiten" element={<ResponsivePage desktop={<Activiteiten />} mobile={<DesktopOnly title="Activiteiten" />} />} />
                  <Route path="/capaciteit" element={<ResponsivePage desktop={<Capaciteit />} mobile={<MobileCapacity />} />} />
                  <Route path="/instellingen" element={<ResponsivePage desktop={<Instellingen />} mobile={<DesktopOnly title="Instellingen" />} />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ConfirmProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
