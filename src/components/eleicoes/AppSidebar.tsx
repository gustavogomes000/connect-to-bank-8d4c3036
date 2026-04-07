import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3, Trophy, Building2, Target, MapPin, DollarSign, UserCheck, Users,
  HelpCircle, TrendingUp, Sparkles, MessageSquare, Settings, Crosshair, Vote,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const analysisItems = [
  { title: 'Consulta por IA', url: '/chat', icon: MessageSquare },
  { title: 'Relatórios Personalizados', url: '/consulta', icon: Sparkles },
  { title: 'Resultado por Eleição', url: '/resultado', icon: Vote },
  { title: 'Micro-Targeting', url: '/micro-targeting', icon: Crosshair },
  { title: 'Goiânia & Aparecida', url: '/territorial', icon: Target },
  { title: 'Explorador', url: '/explorador', icon: TrendingUp },
  { title: 'Dashboard', url: '/', icon: BarChart3 },
  { title: 'Ranking', url: '/ranking', icon: Trophy },
];

const dimensionItems = [
  { title: 'Diretório Candidatos', url: '/diretorio', icon: Users },
  { title: 'Municípios', url: '/municipio', icon: Building2 },
  { title: 'Partidos', url: '/partido', icon: Target },
  { title: 'Bairros', url: '/bairro', icon: MapPin },
  { title: 'Patrimônio', url: '/patrimonio', icon: DollarSign },
  { title: 'Perfil Geral', url: '/perfil-candidatos', icon: UserCheck },
];

const systemItems = [
  { title: 'Configurações', url: '/config', icon: Settings },
  { title: 'Ajuda', url: '/ajuda', icon: HelpCircle },
];

export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  const MenuItem = ({ item }: { item: typeof analysisItems[0] }) => {
    const isActive = location.pathname === item.url;
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild>
          <Link
            to={item.url}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md transition-all text-sm',
              isActive
                ? 'bg-primary/15 text-primary font-semibold border border-primary/20'
                : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
            )}
          >
            <item.icon className={cn('w-4 h-4 shrink-0', isActive && 'text-primary')} />
            {!collapsed && <span>{item.title}</span>}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-foreground tracking-tight">EleiçõesGO</span>
              <span className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest">Inteligência de Dados</span>
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/30 uppercase tracking-widest px-3 mb-1">Análise</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{analysisItems.map(item => <MenuItem key={item.url} item={item} />)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/30 uppercase tracking-widest px-3 mb-1 mt-4">Dimensões</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{dimensionItems.map(item => <MenuItem key={item.url} item={item} />)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/30 uppercase tracking-widest px-3 mb-1 mt-4">Sistema</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{systemItems.map(item => <MenuItem key={item.url} item={item} />)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
