import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/eleicoes/AppSidebar";
import { GlobalFilters } from "@/components/eleicoes/GlobalFilters";
import Dashboard from "./pages/Dashboard";
import Ranking from "./pages/Ranking";
import CandidatoPerfil from "./pages/CandidatoPerfil";
import PorMunicipio from "./pages/PorMunicipio";
import PorPartido from "./pages/PorPartido";
import AnaliseBairro from "./pages/AnaliseBairro";
import Patrimonio from "./pages/Patrimonio";
import PerfilCandidatos from "./pages/PerfilCandidatos";
import ImportarDados from "./pages/ImportarDados";
import Ajuda from "./pages/Ajuda";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function Layout() {
  const location = useLocation();
  const hideFilters = location.pathname === '/importar' || location.pathname === '/ajuda' || location.pathname === '/bairro' || location.pathname === '/patrimonio';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b bg-card px-4 shrink-0">
            <SidebarTrigger />
            <span className="ml-3 text-sm font-medium text-muted-foreground">EleiçõesGO — Inteligência Eleitoral</span>
          </header>
          {!hideFilters && <GlobalFilters />}
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/candidatos" element={<Ranking />} />
              <Route path="/candidato/:id" element={<CandidatoPerfil />} />
              <Route path="/municipio" element={<PorMunicipio />} />
              <Route path="/partido" element={<PorPartido />} />
              <Route path="/importar" element={<ImportarDados />} />
              <Route path="/ajuda" element={<Ajuda />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
