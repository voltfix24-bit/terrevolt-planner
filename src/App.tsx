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

const queryClient = new QueryClient();

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