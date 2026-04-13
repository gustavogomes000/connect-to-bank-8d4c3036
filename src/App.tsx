import { lazy, Suspense, useEffect } from 'react';
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/eleicoes/AppSidebar";
import { GlobalFilters, FilterField } from "@/components/eleicoes/GlobalFilters";
import { PageLoader } from "@/components/eleicoes/PageLoader";
import { queryClient, persister } from "@/lib/queryCache";

// Lazy-load all page components for faster initial load
const Ranking = lazy(() => import('./pages/Ranking'));
const ZonasEleitorais = lazy(() => import('./pages/ZonasEleitorais'));
const EscolasEleitorais = lazy(() => import('./pages/EscolasEleitorais'));
const Mesarios = lazy(() => import('./pages/Mesarios'));
const PerfilCandidatos = lazy(() => import('./pages/PerfilCandidatos'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const Ajuda = lazy(() => import('./pages/Ajuda'));
const ChatEleicoes = lazy(() => import('./pages/ChatEleicoes'));
const NotFound = lazy(() => import('./pages/NotFound'));

const HIDE_FILTERS = ['/ajuda', '/config', '/candidatos', '/candidato', '/perfil-candidatos', '/chat'];

const ROUTE_FILTERS: Record<string, FilterField[]> = {
  '/zonas': ['ano', 'municipio', 'cargo', 'turno'],
};

/** Remove the HTML splash screen once React mounts */
function useSplashRemoval() {
  useEffect(() => {
    const el = document.getElementById('splash-screen');
    if (el) {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 500);
    }
  }, []);
}

function Layout() {
  const location = useLocation();
  useSplashRemoval();

  const hideFilters = HIDE_FILTERS.some(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  );
  const routeFilters = Object.entries(ROUTE_FILTERS).find(
    ([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  );
  const visibleFilters = routeFilters ? routeFilters[1] : undefined;

  return (
    <SidebarProvider>
      <div className="min-h-screen min-h-[100dvh] flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-11 flex items-center border-b border-border/50 bg-card/50 backdrop-blur-sm px-3 sm:px-4 shrink-0 pwa-safe-top">
            <SidebarTrigger />
            <div className="ml-3 flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">EleiçõesGO</span>
              <span className="text-[10px] text-muted-foreground hidden sm:inline">Inteligência Eleitoral</span>
            </div>
          </header>
          {!hideFilters && <GlobalFilters visibleFilters={visibleFilters} />}
          <main className="flex-1 p-2 sm:p-3 md:p-4 overflow-auto pwa-safe-bottom">
            <Suspense fallback={<PageLoader label="Carregando módulo…" />}>
              <Routes>
                <Route path="/" element={<Ranking />} />
                <Route path="/ranking" element={<Ranking />} />
                <Route path="/zonas" element={<ZonasEleitorais />} />
                <Route path="/escolas" element={<EscolasEleitorais />} />
                <Route path="/mesarios" element={<Mesarios />} />
                <Route path="/candidatos" element={<PerfilCandidatos />} />
                <Route path="/candidatos/:id" element={<PerfilCandidatos />} />
                <Route path="/candidatos/:id/:ano" element={<PerfilCandidatos />} />
                <Route path="/config" element={<Configuracoes />} />
                <Route path="/ajuda" element={<Ajuda />} />
                <Route path="/chat" element={<ChatEleicoes />} />
                {/* Legacy redirects */}
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
            </Suspense>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

const App = () => (
  <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;