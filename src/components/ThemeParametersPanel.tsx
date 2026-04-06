import React, { useState, useEffect } from 'react';
import { Save, Copy, Sliders } from 'lucide-react';

export interface ThemeWeights {
  severidad: number;
  alcance: number;
  irremediabilidad: number;
  probabilidad: number;
}

export interface ThemeParameterConfig {
  [temaId: string]: ThemeWeights;
}

interface ThemeParametersPanelProps {
  themes: any[];
  onWeightsChange: (config: ThemeParameterConfig) => void;
  selectedTema?: string;
  onSelectedTemaChange?: (temaId: string) => void;
}

const DEFAULT_WEIGHTS: ThemeWeights = {
  severidad: 0.25,
  alcance: 0.25,
  irremediabilidad: 0.25,
  probabilidad: 0.25
};

const STORAGE_KEY = 'materialidad_theme_weights';

export const ThemeParametersPanel: React.FC<ThemeParametersPanelProps> = ({
  themes,
  onWeightsChange,
  selectedTema = '',
  onSelectedTemaChange
}) => {
  const [selectedTheme, setSelectedTheme] = useState(selectedTema || (themes[0]?.tema_id || 'P01'));
  const [weights, setWeights] = useState<ThemeParameterConfig>({});
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Cargar configuraciones desde localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setWeights(JSON.parse(stored));
      } else {
        // Inicializar con valores por defecto para todos los temas
        const newWeights: ThemeParameterConfig = {};
        themes.forEach(theme => {
          newWeights[theme.tema_id] = { ...DEFAULT_WEIGHTS };
        });
        setWeights(newWeights);
      }
    } catch (e) {
      console.error('Error cargando pesos desde localStorage:', e);
    }
  }, [themes]);

  // Guardar a localStorage y notificar cambios
  const saveWeights = (newWeights: ThemeParameterConfig) => {
    setWeights(newWeights);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newWeights));
    onWeightsChange(newWeights);
  };

  // Actualizar peso individual
  const updateWeight = (temaId: string, key: keyof ThemeWeights, value: number) => {
    const updated = { ...weights };
    if (!updated[temaId]) {
      updated[temaId] = { ...DEFAULT_WEIGHTS };
    }
    updated[temaId][key] = value;

    // Normalizar si es necesario (opcional)
    const sum = updated[temaId].severidad + updated[temaId].alcance + 
                updated[temaId].irremediabilidad + updated[temaId].probabilidad;
    if (Math.abs(sum - 1) > 0.01) {
      // Los pesos pueden no sumar 1, está bem
    }

    saveWeights(updated);
  };

  // Aplicar mismo peso a todos los temas
  const applyToAll = () => {
    const currentWeights = weights[selectedTheme] || DEFAULT_WEIGHTS;
    const newWeights: ThemeParameterConfig = {};
    themes.forEach(theme => {
      newWeights[theme.tema_id] = { ...currentWeights };
    });
    saveWeights(newWeights);
  };

  // Resetear a valores por defecto
  const resetToDefaults = () => {
    const newWeights: ThemeParameterConfig = {};
    themes.forEach(theme => {
      newWeights[theme.tema_id] = { ...DEFAULT_WEIGHTS };
    });
    saveWeights(newWeights);
  };

  const currentWeights = weights[selectedTheme] || DEFAULT_WEIGHTS;
  const selectedThemeData = themes.find(t => t.tema_id === selectedTheme);
  const totalWeight = currentWeights.severidad + currentWeights.alcance + 
                      currentWeights.irremediabilidad + currentWeights.probabilidad;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-neutral-800/50 transition-colors border-b border-neutral-800"
      >
        <div className="flex items-center gap-2">
          <Sliders size={18} className="text-emerald-500" />
          <h3 className="font-medium text-base">Parámetros por Tema</h3>
        </div>
        <span className="text-xs text-neutral-400">{isCollapsed ? '▼' : '▲'}</span>
      </button>

      {!isCollapsed && (
        <div className="p-6 space-y-6">
          {/* Selector de Tema */}
          <div>
            <label className="text-sm font-medium text-neutral-300 mb-3 block uppercase tracking-wider">
              Selecciona Tema
            </label>
            <select
              value={selectedTheme}
              onChange={(e) => {
                setSelectedTheme(e.target.value);
                onSelectedTemaChange?.(e.target.value);
              }}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-emerald-500 transition-colors appearance-none cursor-pointer"
            >
              {themes.map(theme => (
                <option key={theme.tema_id} value={theme.tema_id}>
                  {theme.tema_id} - {theme.tema_nombre}
                </option>
              ))}
            </select>
            {selectedThemeData && (
              <p className="text-xs text-neutral-400 mt-2">{selectedThemeData.tema_nombre}</p>
            )}
          </div>

          {/* Sliders */}
          <div className="space-y-5">
            <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
              Ponderadores (P, S, A, Ir)
            </h4>

            {/* Severidad */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-neutral-300">Severidad</label>
                <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">
                  {currentWeights.severidad.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={currentWeights.severidad}
                onChange={(e) => updateWeight(selectedTheme, 'severidad', parseFloat(e.target.value))}
                className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            {/* Alcance */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-neutral-300">Alcance</label>
                <span className="text-xs font-mono bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded">
                  {currentWeights.alcance.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={currentWeights.alcance}
                onChange={(e) => updateWeight(selectedTheme, 'alcance', parseFloat(e.target.value))}
                className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            {/* Irremediabilidad */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-neutral-300">Irremediabilidad</label>
                <span className="text-xs font-mono bg-amber-500/10 text-amber-400 px-2 py-1 rounded">
                  {currentWeights.irremediabilidad.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={currentWeights.irremediabilidad}
                onChange={(e) => updateWeight(selectedTheme, 'irremediabilidad', parseFloat(e.target.value))}
                className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* Probabilidad */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-neutral-300">Probabilidad</label>
                <span className="text-xs font-mono bg-purple-500/10 text-purple-400 px-2 py-1 rounded">
                  {currentWeights.probabilidad.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={currentWeights.probabilidad}
                onChange={(e) => updateWeight(selectedTheme, 'probabilidad', parseFloat(e.target.value))}
                className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
          </div>

          {/* Total Weight Info */}
          <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-400">Suma de peso:</span>
              <span className={`font-mono font-semibold ${Math.abs(totalWeight - 1) < 0.01 ? 'text-emerald-400' : 'text-neutral-400'}`}>
                {totalWeight.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Acciones */}
          <div className="pt-2 space-y-3 border-t border-neutral-800">
            <button
              onClick={applyToAll}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30 transition-all text-sm font-medium"
            >
              <Copy size={16} />
              Aplicar a todos los temas
            </button>

            <button
              onClick={resetToDefaults}
              className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg border border-white/10 transition-all text-sm font-medium"
            >
              Restaurar Valores Por Defecto
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
