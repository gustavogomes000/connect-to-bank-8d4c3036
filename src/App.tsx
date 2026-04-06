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
import Explorador from "./pages/Explorador";
import ConsultaIA from "./pages/ConsultaIA";
import ChatEleicoes from "./pages/ChatEleicoes";
import CandidatoPerfil from "./pages/CandidatoPerfil";
import PorMunicipio from "./pages/PorMunicipio";
import PorPartido from "./pages/PorPartido";
import AnaliseBairro from "./pages/AnaliseBairro";
import Patrimonio from "./pages/Patrimonio";
import PerfilCandidatos from "./pages/PerfilCandidatos";
import ImportarDados from "./pages/ImportarDados";
import Configuracoes from "./pages/Configuracoes";
import Ajuda from "./pages/Ajuda";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function Layout() {
  const location = useLocation();
  const hideFilters = ['/importar', '/ajuda', '/consulta', '/explorador', '/chat', '/config'].includes(location.pathname);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-11 flex items-center border-b border-border/50 bg-card/50 backdrop-blur-sm px-4 shrink-0">
            <SidebarTrigger />
            <div className="ml-3 flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">EleiçõesGO</span>
              <span className="text-[10px] text-muted-foreground">Inteligência de Dados Eleitorais</span>
            </div>
          </header>
          {!hideFilters && <GlobalFilters />}
          <main className="flex-1 p-3 md:p-4 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/explorador" element={<Explorador />} />
              <Route path="/consulta" element={<ConsultaIA />} />
              <Route path="/chat" element={<ChatEleicoes />} />
              <Route path="/candidatos" element={<Ranking />} />
              <Route path="/candidato/:id" element={<CandidatoPerfil />} />
              <Route path="/municipio" element={<PorMunicipio />} />
              <Route path="/partido" element={<PorPartido />} />
              <Route path="/bairro" element={<AnaliseBairro />} />
              <Route path="/patrimonio" element={<Patrimonio />} />
              <Route path="/perfil-candidatos" element={<PerfilCandidatos />} />
              <Route path="/importar" element={<ImportarDados />} />
              <Route path="/config" element={<Configuracoes />} />
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
