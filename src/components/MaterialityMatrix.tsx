import React, { useMemo, useState, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import { 
    recommendZoom, 
    addJitter, 
    groupNearbyPoints, 
    calculateAxisRange,
    Point
} from '../lib/clusterUtils';

interface MatrixProps {
    data: any[];
    tauImpact: number;
    tauFin: number;
    ruleDouble: 'AND' | 'OR';
    themeWeights?: any;
}

export const MaterialityMatrix: React.FC<MatrixProps> = ({ 
    data, 
    tauImpact, 
    tauFin, 
    ruleDouble,
    themeWeights 
}) => {
    const [zoomLevel, setZoomLevel] = useState<number>(1);
    const [autoZoom, setAutoZoom] = useState<boolean>(true);
    const [hoveredCluster, setHoveredCluster] = useState<string | null>(null);

    // Analizar datos y recomendar zoom
    const zoomInfo = useMemo(() => {
        const points: Point[] = data.map(d => ({
            x: d.score_fin || 0,
            y: d.score_impact || 0,
            temaId: d.tema_id,
            temaNombre: d.tema_nombre
        }));
        return recommendZoom(points);
    }, [data]);

    // Determinar zoom actual
    const effectiveZoom = autoZoom ? zoomInfo.zoom : zoomLevel;

    // Agregar jitter y agrupar datos cercanos
    const processedData = useMemo(() => {
        const withJitter = data.map((d, idx) => {
            const jittered = addJitter({
                x: d.score_fin || 0,
                y: d.score_impact || 0
            }, 0.04);
            return {
                ...d,
                jittered_fin: jittered.x,
                jittered_impact: jittered.y,
                original_fin: d.score_fin || 0,
                original_impact: d.score_impact || 0
            };
        });
        return withJitter;
    }, [data]);

    // Agrupar puntos cercanos para hover
    const nearbyGroups = useMemo(() => {
        const points: Point[] = processedData.map(d => ({
            x: d.jittered_fin,
            y: d.jittered_impact,
            temaId: d.tema_id,
            temaNombre: d.tema_nombre
        }));
        return groupNearbyPoints(points, 0.15);
    }, [processedData]);

    const plotData = useMemo(() => {
        return [
            {
                x: processedData.map((d: any) => d.jittered_fin),
                y: processedData.map((d: any) => d.jittered_impact),
                text: processedData.map((d: any) => d.tema_nombre),
                mode: 'markers+text',
                type: 'scatter',
                textposition: 'top center',
                hovertext: processedData.map((d: any) => d.tema_id),
                marker: {
                    size: processedData.map((d: any) => Math.max(12, (d.score_stakeholders || 1) * 5)),
                    color: processedData.map((d: any) => {
                        const isImpMat = d.score_impact >= tauImpact;
                        const isFinMat = d.score_fin >= tauFin;
                        const isDouble = ruleDouble === 'AND'
                            ? (isImpMat && isFinMat)
                            : (isImpMat || isFinMat);

                        // Vibrant Premium Colors
                        if (isDouble) return '#10b981'; // Vibrant Emerald
                        if (isImpMat) return '#22d3ee'; // Bright Cyan
                        if (isFinMat) return '#fbbf24'; // Bright Amber
                        return '#4b5563'; // Neutral Grey (Non-material)
                    }),
                    line: {
                        color: 'rgba(255, 255, 255, 0.2)',
                        width: 1.5
                    },
                    opacity: 0.9
                },
                customdata: processedData.map((d: any, idx: number) => ({
                    tema_id: d.tema_id,
                    tema_nombre: d.tema_nombre,
                    score_impact: d.score_impact,
                    score_fin: d.score_fin,
                    score_stakeholders: d.score_stakeholders
                })),
                hovertemplate:
                    "<b>%{customdata.tema_id}: %{customdata.tema_nombre}</b><br>" +
                    "Impacto Social: %{customdata.score_impact:.2f}<br>" +
                    "Impacto Financiero: %{customdata.score_fin:.2f}<br>" +
                    "Stakeholders: %{customdata.score_stakeholders:.2f}<br>" +
                    "<extra></extra>"
            }
        ];
    }, [processedData, tauImpact, tauFin, ruleDouble]);

    // Calcular rango de ejes
    const [xRange, yRange] = useMemo(() => {
        return [
            calculateAxisRange(effectiveZoom, [0.5, 5.5]),
            calculateAxisRange(effectiveZoom, [0.5, 5.5])
        ];
    }, [effectiveZoom]);

    const layout: Partial<Plotly.Layout> = {
        title: {
            text: 'Resultados de Doble Materialidad',
            font: { color: '#f8fafc', size: 20, family: 'Inter' }
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        xaxis: {
            title: { text: 'Impacto Financiero', font: { color: '#cbd5e1', size: 14 } },
            color: '#64748b',
            gridcolor: 'rgba(255, 255, 255, 0.05)',
            range: xRange,
            zeroline: false,
            tickfont: { color: '#94a3b8' }
        },
        yaxis: {
            title: { text: 'Evaluación de Impacto (Ambiental/Social)', font: { color: '#cbd5e1', size: 14 } },
            color: '#64748b',
            gridcolor: 'rgba(255, 255, 255, 0.05)',
            range: yRange,
            zeroline: false,
            tickfont: { color: '#94a3b8' }
        },
        shapes: [
            {
                type: 'line',
                x0: 0,
                x1: 6,
                y0: tauImpact,
                y1: tauImpact,
                line: { color: 'rgba(239, 68, 68, 0.6)', width: 2, dash: 'dot' }
            },
            {
                type: 'line',
                x0: tauFin,
                x1: tauFin,
                y0: 0,
                y1: 6,
                line: { color: 'rgba(239, 68, 68, 0.6)', width: 2, dash: 'dot' }
            }
        ],
        margin: { t: 60, r: 40, l: 60, b: 60 },
        hovermode: 'closest',
        font: { family: 'Inter, sans-serif' }
    };

    const handleZoomIn = () => {
        setAutoZoom(false);
        setZoomLevel(prev => Math.min(3, prev + 0.5));
    };

    const handleZoomOut = () => {
        setAutoZoom(false);
        setZoomLevel(prev => Math.max(1, prev - 0.5));
    };

    const handleAutoZoom = () => {
        setAutoZoom(true);
        setZoomLevel(1);
    };

    const handleReset = () => {
        setAutoZoom(true);
        setZoomLevel(1);
    };

    return (
        <div className="w-full h-full flex flex-col">
            {/* Toolbar de Zoom */}
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-neutral-800/50 flex-wrap">
                <div className="flex items-center gap-1 bg-neutral-800/50 border border-neutral-700 rounded-lg p-1">
                    <button
                        onClick={handleZoomOut}
                        disabled={!autoZoom && zoomLevel <= 1}
                        className="p-2 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                        title="Alejar"
                    >
                        <ZoomOut size={16} className="text-neutral-300" />
                    </button>
                    <span className="text-xs text-neutral-400 px-3 py-2 font-mono">
                        {autoZoom ? '🤖 Auto' : `${effectiveZoom.toFixed(1)}x`}
                    </span>
                    <button
                        onClick={handleZoomIn}
                        className="p-2 hover:bg-neutral-700 rounded transition-colors"
                        title="Acercar"
                    >
                        <ZoomIn size={16} className="text-neutral-300" />
                    </button>
                </div>

                <button
                    onClick={handleAutoZoom}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                        autoZoom
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-neutral-800/50 text-neutral-400 border border-neutral-700 hover:bg-neutral-800'
                    }`}
                    title="Escala automática basada en clustering"
                >
                    <Maximize2 size={14} />
                    Auto-escala Inteligente
                </button>

                <button
                    onClick={handleReset}
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-neutral-800/50 text-neutral-400 border border-neutral-700 hover:bg-neutral-800 transition-all flex items-center gap-1.5"
                    title="Resetear a vista original"
                >
                    <RotateCcw size={14} />
                    Resetear
                </button>

                {zoomInfo.hasOverlap && !autoZoom && (
                    <span className="text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded border border-amber-500/20">
                        ℹ️ Se detectaron cluster de puntos
                    </span>
                )}
            </div>

            {/* Plot */}
            <div className="flex-1 min-h-0 border border-neutral-800 rounded-xl bg-neutral-900/40 p-2 shadow-inner">
                <Plot
                        data={plotData as Plotly.Data[]}
                    layout={layout}
                    config={{ responsive: true, displayModeBar: false }}
                    style={{ width: '100%', height: '100%' }}
                />
            </div>
        </div>
    );
};
