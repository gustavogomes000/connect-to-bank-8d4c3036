import { Link, useLocation } from 'react-router-dom';
import {
  Trophy, HelpCircle, MessageSquare, Settings, School, Hash, User, Sparkles, Users,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const mainItems = [
  { title: 'Dados Eleitorais', url: '/', icon: Trophy },
  { title: 'Perfil de Candidatos', url: '/candidatos', icon: User },
  { title: 'Zonas Eleitorais', url: '/zonas', icon: Hash },
  { title: 'Escolas Eleitorais', url: '/escolas', icon: School },
  { title: 'Mesários', url: '/mesarios', icon: Users },
];


export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  const MenuItem = ({ item }: { item: typeof mainItems[0] }) => {
    const isActive = location.pathname === item.url || 
      (item.url !== '/' && location.pathname.startsWith(item.url));
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
            <Trophy className="w-4 h-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-foreground tracking-tight">EleiçõesGO</span>
              <span className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest">Inteligência Eleitoral</span>
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/30 uppercase tracking-widest px-3 mb-1">Módulos</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{mainItems.map(item => <MenuItem key={item.url} item={item} />)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
