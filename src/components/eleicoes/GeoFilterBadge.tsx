import { useFilterStore } from '@/stores/filterStore';
import { MapPin, Hash, School } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/** Renders a contextual badge showing active geographic filters */
export function GeoFilterBadge() {
  const { zona, bairro, escola } = useFilterStore();
  if (!zona && !bairro && !escola) return null;

  const parts: { icon: React.ElementType; label: string }[] = [];
  if (zona) parts.push({ icon: Hash, label: `Zona ${zona}` });
  if (bairro) parts.push({ icon: MapPin, label: bairro });
  if (escola) parts.push({ icon: School, label: escola });

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-muted-foreground">📍 Filtro geográfico:</span>
      {parts.map((p, i) => (
        <Badge key={i} variant="secondary" className="text-[10px] h-5 px-1.5 gap-1 font-normal bg-primary/10 text-primary border-primary/20">
          <p.icon className="w-3 h-3" />
          {p.label}
        </Badge>
      ))}
    </div>
  );
}
