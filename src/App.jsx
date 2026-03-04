import React, { useState, useMemo } from 'react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, 
  ResponsiveContainer, LabelList, Cell, ReferenceLine
} from 'recharts';
import { 
  Settings, Users, Filter, TrendingUp, LayoutDashboard, Download, Leaf, HeartHandshake
} from 'lucide-react';

const INITIAL_TOPICS = [
  { id: 1, name: "Rendición de Cuentas", cat: "Gobernanza", impact: 4.42, financial: 3.8, desc: "Impacto de la transparencia." },
  { id: 2, name: "Transparencia", cat: "Gobernanza", impact: 4.51, financial: 4.1, desc: "Acceso a información." },
  { id: 3, name: "Comportamiento Ético", cat: "Gobernanza", impact: 4.72, financial: 4.8, desc: "Prevención de riesgos." },
  { id: 5, name: "Cumplimiento de la Ley", cat: "Gobernanza", impact: 4.81, financial: 4.9, desc: "Base legal." },
  { id: 6, name: "Derechos Humanos", cat: "Social", impact: 4.76, financial: 4.5, desc: "Gestión en cadena." },
  { id: 10, name: "Salud y Seguridad", cat: "Social", impact: 4.92, financial: 4.7, desc: "Bienestar laboral." },
  { id: 12, name: "Prevención Contaminación", cat: "Ambiental", impact: 4.65, financial: 4.4, desc: "Costos ambientales." },
  { id: 13, name: "Uso de Recursos", cat: "Ambiental", impact: 4.55, financial: 4.6, desc: "Eficiencia hídrica." },
  { id: 17, name: "Empleo Local", cat: "Social", impact: 4.60, financial: 3.5, desc: "Licencia social." },
];

const App = () => {
  const [selectedGI, setSelectedGI] = useState("Todos");
  const [financialWeight, setFinancialWeight] = useState(1.0);
  const [impactWeight, setImpactWeight] = useState(1.0);

  const processedData = useMemo(() => {
    return INITIAL_TOPICS.map(t => ({
      ...t,
      x: Math.min(5, t.financial * financialWeight),
      y: Math.min(5, t.impact * impactWeight),
      score: (t.impact * impactWeight + t.financial * financialWeight) / 2
    })).sort((a, b) => b.score - a.score);
  }, [financialWeight, impactWeight]);

  const getColor = (cat) => {
    if (cat === 'Ambiental') return '#059669';
    if (cat === 'Social') return '#2563eb';
    return '#7c3aed';
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <header className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 p-2 rounded-lg"><LayoutDashboard size={24} /></div>
          <h1 className="text-xl font-bold">Paracel: Doble Materialidad</h1>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 bg-white border-r p-6 overflow-y-auto">
          <div className="space-y-8">
            <section>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 block">Filtro GI</label>
              <select className="w-full p-2 border rounded-lg" value={selectedGI} onChange={(e) => setSelectedGI(e.target.value)}>
                <option>Todos</option>
                <option>Colaboradores</option>
                <option>Comunidad Indígena</option>
              </select>
            </section>
            <section className="space-y-4">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase block mb-2">Importancia Financiera</span>
                <input type="range" min="0.5" max="2" step="0.1" value={financialWeight} onChange={(e) => setFinancialWeight(parseFloat(e.target.value))} className="w-full accent-emerald-600" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase block mb-2">Impacto Social</span>
                <input type="range" min="0.5" max="2" step="0.1" value={impactWeight} onChange={(e) => setImpactWeight(parseFloat(e.target.value))} className="w-full accent-blue-600" />
              </div>
            </section>
          </div>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto bg-white">
          <div className="h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <XAxis type="number" dataKey="x" domain={[0, 6]} stroke="#e2e8f0" />
                <YAxis type="number" dataKey="y" domain={[0, 6]} stroke="#e2e8f0" />
                <ZAxis type="number" dataKey="score" range={[100, 500]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <ReferenceLine x={3} stroke="#f1f5f9" />
                <ReferenceLine y={3} stroke="#f1f5f9" />
                <Scatter data={processedData}>
                  {processedData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getColor(entry.cat)} />
                  ))}
                  <LabelList dataKey="name" position="top" style={{fontSize: '10px', fill: '#64748b'}} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;