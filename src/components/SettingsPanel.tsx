import React from 'react';
import { Settings, Save, RotateCcw } from 'lucide-react';

interface SettingsPanelProps {
    tauImpact: number;
    setTauImpact: (val: number) => void;
    tauFin: number;
    setTauFin: (val: number) => void;
    ruleDouble: 'AND' | 'OR';
    setRuleDouble: (val: 'AND' | 'OR') => void;
    weights: any;
    setWeights: (val: any) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    tauImpact, setTauImpact,
    tauFin, setTauFin,
    ruleDouble, setRuleDouble,
    weights, setWeights
}) => {
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-lg max-w-sm w-full mx-auto md:mx-0">

            <div className="flex items-center gap-2 mb-6 border-b border-neutral-800 pb-3">
                <Settings size={20} className="text-emerald-500" />
                <h3 className="font-medium text-lg">Parámetros</h3>
            </div>

            <div className="space-y-6">

                {/* Umbrales */}
                <div className="space-y-4">
                    <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Umbrales de Materialidad</h4>

                    <div>
                        <div className="flex justify-between text-sm mb-1">
                            <label>Impacto (tau_impact)</label>
                            <span className="text-emerald-400 font-mono">{tauImpact.toFixed(1)}</span>
                        </div>
                        <input
                            type="range" min="1" max="5" step="0.1"
                            value={tauImpact} onChange={(e) => setTauImpact(parseFloat(e.target.value))}
                            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between text-sm mb-1">
                            <label>Financiero (tau_fin)</label>
                            <span className="text-emerald-400 font-mono">{tauFin.toFixed(1)}</span>
                        </div>
                        <input
                            type="range" min="1" max="5" step="0.1"
                            value={tauFin} onChange={(e) => setTauFin(parseFloat(e.target.value))}
                            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                    </div>
                </div>

                {/* Regla */}
                <div className="space-y-3 pt-4 border-t border-neutral-800">
                    <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Regla de Doble Materialidad</h4>
                    <div className="flex bg-neutral-950 p-1 rounded-lg border border-neutral-800">
                        <button
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${ruleDouble === 'OR' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                            onClick={() => setRuleDouble('OR')}
                        >
                            OR (Cualquiera)
                        </button>
                        <button
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${ruleDouble === 'AND' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                            onClick={() => setRuleDouble('AND')}
                        >
                            AND (Estricto)
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};
