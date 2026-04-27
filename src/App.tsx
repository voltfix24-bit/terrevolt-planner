import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Projecten from "./pages/Projecten";
import ProjectDetail from "./pages/ProjectDetail";
import Plannen from "./pages/Plannen";
import Activiteiten from "./pages/Activiteiten";
import Capaciteit from "./pages/Capaciteit";
import Instellingen from "./pages/Instellingen";
import Overzicht from "./pages/Overzicht";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/overzicht" replace />} />
            <Route path="/overzicht" element={<Overzicht />} />
            <Route path="/projecten" element={<Projecten />} />
            <Route path="/projecten/:id" element={<ProjectDetail />} />
            <Route path="/plannen" element={<Plannen />} />
            <Route path="/activiteiten" element={<Activiteiten />} />
            <Route path="/capaciteit" element={<Capaciteit />} />
            <Route path="/instellingen" element={<Instellingen />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
