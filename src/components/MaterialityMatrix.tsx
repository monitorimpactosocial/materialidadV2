import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';

interface MatrixProps {
    data: any[];
    tauImpact: number;
    tauFin: number;
    ruleDouble: 'AND' | 'OR';
}

export const MaterialityMatrix: React.FC<MatrixProps> = ({ data, tauImpact, tauFin, ruleDouble }) => {
    const plotData = useMemo(() => {
        return [
            {
                x: data.map((d: any) => d.score_fin),
                y: data.map((d: any) => d.score_impact),
                text: data.map((d: any) => d.tema_nombre),
                mode: 'markers+text',
                type: 'scatter',
                textposition: 'top center',
                marker: {
                    size: data.map((d: any) => Math.max(12, (d.score_stakeholders || 1) * 5)),
                    color: data.map((d: any) => {
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
                        color: 'rgba(255, 255, 255, 0.2)', // Soft white border for glass effect
                        width: 1.5
                    },
                    opacity: 0.9
                },
                hovertemplate:
                    "<b>%{text}</b><br><br>" +
                    "Impacto Social: %{y:.2f}<br>" +
                    "Impacto Financiero: %{x:.2f}<br>" +
                    "<extra></extra>"
            }
        ];
    }, [data, tauImpact, tauFin, ruleDouble]);

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
            range: [0.5, 5.5],
            zeroline: false,
            tickfont: { color: '#94a3b8' }
        },
        yaxis: {
            title: { text: 'Evaluación de Impacto (Ambiental/Social)', font: { color: '#cbd5e1', size: 14 } },
            color: '#64748b',
            gridcolor: 'rgba(255, 255, 255, 0.05)',
            range: [0.5, 5.5],
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
                line: { color: 'rgba(239, 68, 68, 0.6)', width: 2, dash: 'dot' } // Red with opacity
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

    return (
        <div className="w-full h-full min-h-[500px] border border-neutral-800 rounded-xl bg-neutral-900/40 p-2 shadow-inner">
            <Plot
                data={plotData as Plotly.Data[]}
                layout={layout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
};
