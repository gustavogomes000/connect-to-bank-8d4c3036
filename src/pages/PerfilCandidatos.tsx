import { usePerfilCandidatos } from '@/hooks/useEleicoes';
import { formatNumber } from '@/lib/eleicoes';
import { ChartSkeleton } from '@/components/eleicoes/Skeletons';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { Users } from 'lucide-react';

const COLORS = [
  'hsl(338, 72%, 60%)', 'hsl(38, 60%, 58%)', 'hsl(156, 72%, 34%)', 'hsl(45, 93%, 46%)',
  'hsl(0, 79%, 52%)', 'hsl(280, 50%, 55%)', 'hsl(25, 95%, 53%)', 'hsl(340, 82%, 52%)',
  'hsl(180, 70%, 40%)', 'hsl(120, 40%, 45%)', 'hsl(300, 50%, 45%)', 'hsl(60, 70%, 40%)',
];

export default function PerfilCandidatos() {
  const { data: perfil, isLoading } = usePerfilCandidatos();

  if (isLoading) return <ChartSkeleton />;

  const generoData = (perfil?.generos || []).map((g, i) => ({ ...g, fill: COLORS[i % COLORS.length] }));
  const instrucaoData = (perfil?.instrucoes || []).slice(0, 8);
  const ocupacaoData = (perfil?.ocupacoes || []).slice(0, 12);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Users className="w-6 h-6 text-primary" /> Perfil dos Candidatos
      </h1>
      <p className="text-sm text-muted-foreground">Distribuição por gênero, escolaridade e ocupação dos candidatos no filtro atual.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gender */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="text-base font-semibold mb-4">Gênero</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={generoData} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {generoData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatNumber(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {generoData.map((g, i) => (
              <span key={i} className="flex items-center gap-1 text-xs">
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: g.fill }} />
                {g.nome}: {formatNumber(g.total)}
              </span>
            ))}
          </div>
        </div>

        {/* Education */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="text-base font-semibold mb-4">Grau de Instrução</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={instrucaoData} layout="vertical" margin={{ left: 140 }}>
              <XAxis type="number" />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={130} />
              <Tooltip formatter={(v: number) => formatNumber(v)} />
              <Bar dataKey="total" fill="hsl(var(--secondary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Occupation */}
      <div className="bg-card rounded-xl border p-5">
        <h3 className="text-base font-semibold mb-4">Top Ocupações</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={ocupacaoData} layout="vertical" margin={{ left: 180 }}>
            <XAxis type="number" />
            <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={170} />
            <Tooltip formatter={(v: number) => formatNumber(v)} />
            <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
