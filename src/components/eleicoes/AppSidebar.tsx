import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Trophy, Users, Building2, Target, Download, HelpCircle, MapPin, DollarSign, UserCheck } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const menuItems = [
  { title: 'Dashboard', url: '/', icon: BarChart3 },
  { title: 'Ranking', url: '/ranking', icon: Trophy },
  { title: 'Candidatos', url: '/candidatos', icon: Users },
  { title: 'Por Município', url: '/municipio', icon: Building2 },
  { title: 'Por Partido', url: '/partido', icon: Target },
  { title: 'Por Bairro', url: '/bairro', icon: MapPin },
  { title: 'Patrimônio', url: '/patrimonio', icon: DollarSign },
  { title: 'Perfil Candidatos', url: '/perfil-candidatos', icon: UserCheck },
  { title: 'Importar Dados', url: '/importar', icon: Download },
  { title: 'Ajuda', url: '/ajuda', icon: HelpCircle },
];

export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-bold text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>S</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-foreground tracking-tight" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Dra. Sarelli
              </span>
              <span className="text-[10px] text-sidebar-foreground/50 uppercase tracking-widest">
                Inteligência Eleitoral
              </span>
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link
                        to={item.url}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm',
                          isActive
                            ? 'bg-primary/20 text-primary font-semibold'
                            : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                        )}
                      >
                        <item.icon className="w-5 h-5 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
