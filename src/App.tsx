import React, { useState, useEffect } from 'react';
import {
    BarChart3,
    Settings,
    Table as TableIcon,
    Download,
    RefreshCw,
    LayoutDashboard
} from 'lucide-react';
import { useData } from './lib/DataContext';
import { MaterialityMatrix } from './components/MaterialityMatrix';
import { SettingsPanel } from './components/SettingsPanel';
import { ThemeParametersPanel, ThemeParameterConfig } from './components/ThemeParametersPanel';

const App = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const { isLoaded, conn, error } = useData();

    // Escenario
    const [tauImpact, setTauImpact] = useState<number>(3.0);
    const [tauFin, setTauFin] = useState<number>(3.0);
    const [ruleDouble, setRuleDouble] = useState<'AND' | 'OR'>('OR');

    // Temas y pesos dinámicos
    const [themes, setThemes] = useState<any[]>([]);
    const [themeWeights, setThemeWeights] = useState<ThemeParameterConfig>({});
    const [selectedThema, setSelectedThema] = useState<string>('');

    // Data
    const [matrixData, setMatrixData] = useState<any[]>([]);
    const [loadingQuery, setLoadingQuery] = useState(false);

    // Cargar temas y configurar pesos
    useEffect(() => {
        if (!isLoaded || !conn) return;

        const loadThemes = async () => {
            try {
                const result = await conn.query(`SELECT DISTINCT tema_id, tema_nombre FROM dim ORDER BY tema_id`);
                const themesData = result.toArray().map((row: any) => row.toJSON());
                setThemes(themesData);
                if (themesData.length > 0) {
                    setSelectedThema(themesData[0].tema_id);
                }
            } catch (e) {
                console.error("Error cargando temas:", e);
            }
        };

        loadThemes();
    }, [isLoaded, conn]);

    // Query principal: obtener datos RAW (sin ponderar) y aplicar pesos dinámicos
    useEffect(() => {
        if (!isLoaded || !conn) return;

        const runQuery = async () => {
            setLoadingQuery(true);
            try {
                // Query que devuelve valores RAW sin ponderar
                const sql = `
          WITH stakeholders_agg AS (
            SELECT tema_id, AVG(relevancia_num) as score_stakeholders
            FROM res 
            WHERE relevancia_num IS NOT NULL 
            GROUP BY tema_id
          ),
          impact_raw AS (
            SELECT tema_id, 
                   AVG(CAST(severidad AS FLOAT)) as severidad,
                   AVG(CAST(alcance AS FLOAT)) as alcance,
                   AVG(CAST(irremediabilidad AS FLOAT)) as irremediabilidad,
                   AVG(CAST(probabilidad AS FLOAT)) as probabilidad
            FROM imp
            GROUP BY tema_id
          ),
          fin_raw AS (
            SELECT tema_id, 
                   AVG(CAST(impacto_financiero AS FLOAT)) as impacto_financiero,
                   AVG(CAST(probabilidad_financiera AS FLOAT)) as probabilidad_financiera
            FROM fin
            GROUP BY tema_id
          )
          SELECT 
            d.tema_id, 
            d.tema_nombre,
            s.score_stakeholders,
            ir.severidad,
            ir.alcance,
            ir.irremediabilidad,
            ir.probabilidad,
            fr.impacto_financiero,
            fr.probabilidad_financiera
          FROM dim d
          LEFT JOIN stakeholders_agg s ON d.tema_id = s.tema_id
          LEFT JOIN impact_raw ir ON d.tema_id = ir.tema_id
          LEFT JOIN fin_raw fr ON d.tema_id = fr.tema_id
        `;

                const result = await conn.query(sql);
                const rawData = result.toArray().map((row: any) => row.toJSON());
                
                // Aplicar pesos dinámicos a los datos RAW
                const processedData = rawData.map(row => {
                    const tema_id = row.tema_id;
                    const weights = themeWeights[tema_id] || {
                        severidad: 0.25,
                        alcance: 0.25,
                        irremediabilidad: 0.25,
                        probabilidad: 0.25
                    };

                    const score_impact =
                        (weights.severidad * (row.severidad || 0)) +
                        (weights.alcance * (row.alcance || 0)) +
                        (weights.irremediabilidad * (row.irremediabilidad || 0)) +
                        (weights.probabilidad * (row.probabilidad || 0));

                    const score_fin =
                        (0.5 * (row.impacto_financiero || 0)) +
                        (0.5 * (row.probabilidad_financiera || 0));

                    return {
                        ...row,
                        score_impact,
                        score_fin
                    };
                });

                setMatrixData(processedData);
            } catch (e) {
                console.error("Query Error", e);
            } finally {
                setLoadingQuery(false);
            }
        };

        runQuery();
    }, [isLoaded, conn, themeWeights]);

    const handleWeightsChange = (config: ThemeParameterConfig) => {
        setThemeWeights(config);
        // Redibujar la matriz automáticamente
    };

    return (
        <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans relative">
            {/* Background Orbs */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-emerald-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob"></div>
                <div className="absolute top-[20%] right-[-5%] w-96 h-96 bg-cyan-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-2000"></div>
                <div className="absolute bottom-[-20%] left-[20%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full mix-blend-screen filter blur-[120px] animate-blob animation-delay-4000"></div>
            </div>

            {/* Sidebar / Navigation */}
            <aside className="w-72 bg-slate-900/60 backdrop-blur-xl border-r border-white/5 flex flex-col z-20 shadow-2xl overflow-y-auto">
                <div className="p-8 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-3 text-emerald-400 font-bold text-xl mb-1 mt-2">
                        <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                            <LayoutDashboard size={22} className="text-emerald-400" />
                        </div>
                        <h2>Materialidad</h2>
                    </div>
                    <p className="text-xs text-slate-400 tracking-wide font-medium mt-3 ml-2">Doble Materialidad 2026</p>
                </div>

                <nav className="flex-1 p-6 space-y-3 shrink-0">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-300 ${activeTab === 'dashboard' ? 'bg-gradient-to-r from-emerald-500/20 to-transparent text-emerald-300 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
                    >
                        <BarChart3 size={18} />
                        <span className="font-medium text-sm">Matriz & Dashboard</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('table')}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-300 ${activeTab === 'table' ? 'bg-gradient-to-r from-emerald-500/20 to-transparent text-emerald-300 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
                    >
                        <TableIcon size={18} />
                        <span className="font-medium text-sm">Ranking & Tablas</span>
                    </button>
                </nav>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-6 space-y-6 pb-6">
                    {/* Theme Parameters Panel */}
                    <ThemeParametersPanel
                        themes={themes}
                        onWeightsChange={handleWeightsChange}
                        selectedTema={selectedThema}
                        onSelectedTemaChange={setSelectedThema}
                    />

                    {/* Settings Panel */}
                    <SettingsPanel
                        tauImpact={tauImpact} setTauImpact={setTauImpact}
                        tauFin={tauFin} setTauFin={setTauFin}
                        ruleDouble={ruleDouble} setRuleDouble={setRuleDouble}
                        weights={{}} setWeights={() => { }}
                    />
                </div>

                <div className="p-5 bg-slate-950/80 border-t border-white/5 text-xs text-slate-500 text-center tracking-[0.2em] font-bold shrink-0">
                    PARACEL S.A.
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col relative overflow-hidden z-10">
                {/* Header */}
                <header className="h-20 shrink-0 flex items-center justify-between px-10 border-b border-white/5 bg-slate-900/40 backdrop-blur-md">
                    <h1 className="text-xl font-semibold text-white tracking-tight">
                        {activeTab === 'dashboard' && 'Matriz de Doble Materialidad'}
                        {activeTab === 'table' && 'Ranking General de Temas'}
                    </h1>

                    <div className="flex items-center gap-4">
                        <button className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-all bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl border border-white/10 shadow-sm backdrop-blur-sm">
                            <RefreshCw size={16} className={loadingQuery ? "animate-spin" : ""} />
                            <span className="font-medium">Recalcular</span>
                        </button>
                        <button className="flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200 transition-all bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2 rounded-xl border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)] backdrop-blur-sm">
                            <Download size={16} />
                            <span className="font-medium">Exportar</span>
                        </button>
                    </div>
                </header>

                {/* Dynamic Canvas */}
                <div className="flex-1 overflow-auto p-8 relative">

                    {error && (
                        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                            Error cargando datos: {error}
                        </div>
                    )}

                    {!isLoaded ? (
                        <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
                            <div className="text-center space-y-4 animate-pulse">
                                <BarChart3 size={48} className="mx-auto text-neutral-700" />
                                <p>Iniciando Motor Analítico (DuckDB-WASM)...</p>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full max-w-6xl mx-auto flex flex-col gap-6">

                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                                <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-5 shadow-sm">
                                    <p className="text-xs font-semibold text-neutral-400 mb-1 uppercase tracking-wider">Temas Evaluados</p>
                                    <h4 className="text-3xl font-light text-white">{matrixData.length}</h4>
                                </div>
                                <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-xl p-5 shadow-sm">
                                    <p className="text-xs font-semibold text-emerald-400/80 mb-1 uppercase tracking-wider">Temas Materiales</p>
                                    <h4 className="text-3xl font-light text-emerald-400">
                                        {matrixData.filter(d =>
                                            ruleDouble === 'AND'
                                                ? (d.score_impact >= tauImpact && d.score_fin >= tauFin)
                                                : (d.score_impact >= tauImpact || d.score_fin >= tauFin)
                                        ).length}
                                    </h4>
                                </div>
                                <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-5 shadow-sm">
                                    <p className="text-xs font-semibold text-neutral-400 mb-1 uppercase tracking-wider">Regla Activa</p>
                                    <h4 className="text-xl font-medium text-white flex items-center h-full pb-1">
                                        {ruleDouble === 'OR' ? 'Cualitativa (OR)' : 'Estricta (AND)'}
                                    </h4>
                                </div>
                            </div>

                            {/* Main Views */}
                            {activeTab === 'dashboard' && (
                                <div className="flex-1 min-h-0 bg-neutral-950/50 border border-neutral-800 rounded-xl p-6 shadow-sm overflow-hidden flex flex-col">
                                    <MaterialityMatrix
                                        data={matrixData}
                                        tauImpact={tauImpact}
                                        tauFin={tauFin}
                                        ruleDouble={ruleDouble}
                                        themeWeights={themeWeights}
                                    />
                                </div>
                            )}

                            {activeTab === 'table' && (
                                <div className="flex-1 min-h-0 bg-neutral-900 border border-neutral-800 rounded-xl shadow-sm overflow-hidden flex flex-col">
                                    <div className="overflow-auto bg-neutral-950">
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-neutral-900 sticky top-0 z-10 text-neutral-400 font-medium">
                                                <tr>
                                                    <th className="px-6 py-4 border-b border-neutral-800">Tema</th>
                                                    <th className="px-6 py-4 border-b border-neutral-800">Impacto</th>
                                                    <th className="px-6 py-4 border-b border-neutral-800">Financiero</th>
                                                    <th className="px-6 py-4 border-b border-neutral-800">Grupos de Interés</th>
                                                    <th className="px-6 py-4 border-b border-neutral-800">Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-neutral-800">
                                                {matrixData.sort((a, b) => ((b.score_impact || 0) + (b.score_fin || 0)) - ((a.score_impact || 0) + (a.score_fin || 0))).map((row, i) => {
                                                    const isImp = (row.score_impact || 0) >= tauImpact;
                                                    const isFin = (row.score_fin || 0) >= tauFin;
                                                    const isDouble = ruleDouble === 'AND' ? (isImp && isFin) : (isImp || isFin);

                                                    return (
                                                        <tr key={i} className="hover:bg-neutral-900/50 transition-colors">
                                                            <td className="px-6 py-4 text-neutral-200">{row.tema_nombre}</td>
                                                            <td className="px-6 py-4">
                                                                <span className={`inline-block px-2 py-1 rounded text-xs font-mono font-medium ${isImp ? 'bg-blue-500/10 text-blue-400' : 'text-neutral-500'}`}>
                                                                    {typeof row.score_impact === 'number' ? row.score_impact.toFixed(2) : '0.00'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className={`inline-block px-2 py-1 rounded text-xs font-mono font-medium ${isFin ? 'bg-amber-500/10 text-amber-400' : 'text-neutral-500'}`}>
                                                                    {typeof row.score_fin === 'number' ? row.score_fin.toFixed(2) : '0.00'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 font-mono text-neutral-400">{typeof row.score_stakeholders === 'number' ? row.score_stakeholders.toFixed(2) : 'N/A'}</td>
                                                            <td className="px-6 py-4">
                                                                {isDouble ? (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                                        Material
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-600"></span>
                                                                        No Material
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </main>

        </div>
    );
};

export default App;
