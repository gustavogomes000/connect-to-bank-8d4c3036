import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/eleicoes/AppSidebar";
import { GlobalFilters } from "@/components/eleicoes/GlobalFilters";
import Ranking from "./pages/Ranking";
import ZonasEleitorais from "./pages/ZonasEleitorais";
import EscolasEleitorais from "./pages/EscolasEleitorais";
import ChatEleicoes from "./pages/ChatEleicoes";
import Configuracoes from "./pages/Configuracoes";
import Ajuda from "./pages/Ajuda";
import Mesarios from "./pages/Mesarios";
import PerfilCandidatos from "./pages/PerfilCandidatos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

const HIDE_FILTERS = ['/ajuda', '/config', '/chat', '/relatorios', '/candidatos', '/candidato', '/perfil-candidatos'];

function Layout() {
  const location = useLocation();
  const hideFilters = HIDE_FILTERS.some(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-11 flex items-center border-b border-border/50 bg-card/50 backdrop-blur-sm px-4 shrink-0">
            <SidebarTrigger />
            <div className="ml-3 flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">EleiçõesGO</span>
              <span className="text-[10px] text-muted-foreground">Inteligência Eleitoral</span>
            </div>
          </header>
          {!hideFilters && <GlobalFilters />}
          <main className="flex-1 p-3 md:p-4 overflow-auto">
            <Routes>
              <Route path="/" element={<Ranking />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/zonas" element={<ZonasEleitorais />} />
              <Route path="/escolas" element={<EscolasEleitorais />} />
              <Route path="/mesarios" element={<Mesarios />} />
              <Route path="/candidatos" element={<PerfilCandidatos />} />
              <Route path="/candidatos/:id" element={<PerfilCandidatos />} />
              <Route path="/candidatos/:id/:ano" element={<PerfilCandidatos />} />
              <Route path="/chat" element={<ChatEleicoes />} />
              <Route path="/relatorios" element={<ChatEleicoes />} />
              <Route path="/config" element={<Configuracoes />} />
              <Route path="/ajuda" element={<Ajuda />} />
              {/* Legacy redirects */}
              <Route path="/consulta" element={<ChatEleicoes />} />
              <Route path="/resultado" element={<Ranking />} />
              <Route path="/explorador" element={<Ranking />} />
              <Route path="/diretorio" element={<Ranking />} />
              <Route path="/municipio" element={<Ranking />} />
              <Route path="/partido" element={<Ranking />} />
              <Route path="/bairro" element={<ZonasEleitorais />} />
              <Route path="/territorial" element={<ZonasEleitorais />} />
              <Route path="/patrimonio" element={<Ranking />} />
              <Route path="/geografica" element={<ZonasEleitorais />} />
              <Route path="/perfil-candidatos" element={<PerfilCandidatos />} />
              <Route path="/candidato/:id" element={<PerfilCandidatos />} />
              <Route path="/candidato/:id/:ano" element={<PerfilCandidatos />} />
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
