import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Trophy, Users, Building2, Target, Download, HelpCircle, Vote } from 'lucide-react';
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
        <Link to="/" className="flex items-center gap-2">
          <Vote className="w-7 h-7 text-sidebar-primary-foreground" />
          {!collapsed && (
            <span className="text-lg font-bold text-sidebar-foreground tracking-tight">
              EleiçõesGO
            </span>
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
                            ? 'bg-sidebar-accent text-sidebar-primary-foreground font-semibold'
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
