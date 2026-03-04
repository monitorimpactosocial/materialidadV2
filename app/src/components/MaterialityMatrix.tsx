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
                    size: data.map((d: any) => Math.max(10, (d.score_stakeholders || 1) * 4)),
                    color: data.map((d: any) => {
                        const isImpMat = d.score_impact >= tauImpact;
                        const isFinMat = d.score_fin >= tauFin;
                        const isDouble = ruleDouble === 'AND'
                            ? (isImpMat && isFinMat)
                            : (isImpMat || isFinMat);

                        if (isDouble) return '#10b981'; // emerald-500
                        if (isImpMat) return '#3b82f6'; // blue-500
                        if (isFinMat) return '#f59e0b'; // amber-500
                        return '#525252'; // neutral-600
                    }),
                    line: {
                        color: '#171717', // neutral-900
                        width: 1
                    },
                    opacity: 0.8
                },
                hovertemplate:
                    "<b>%{text}</b><br><br>" +
                    "Impacto: %{y:.2f}<br>" +
                    "Financiero: %{x:.2f}<br>" +
                    "<extra></extra>"
            }
        ];
    }, [data, tauImpact, tauFin, ruleDouble]);

    const layout: Partial<Plotly.Layout> = {
        title: {
            text: 'Matriz de Doble Materialidad',
            font: { color: '#e5e5e5', size: 18 }
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        xaxis: {
            title: { text: 'Impacto Financiero' },
            color: '#a3a3a3', // neutral-400
            gridcolor: '#404040', // neutral-700
            range: [0.5, 5.5],
            zeroline: false
        },
        yaxis: {
            title: { text: 'Evaluación de Impacto' },
            color: '#a3a3a3',
            gridcolor: '#404040',
            range: [0.5, 5.5],
            zeroline: false
        },
        shapes: [
            {
                type: 'line',
                x0: 0,
                x1: 6,
                y0: tauImpact,
                y1: tauImpact,
                line: { color: '#ef4444', width: 1, dash: 'dash' } // red-500
            },
            {
                type: 'line',
                x0: tauFin,
                x1: tauFin,
                y0: 0,
                y1: 6,
                line: { color: '#ef4444', width: 1, dash: 'dash' }
            }
        ],
        margin: { t: 50, r: 50, l: 60, b: 60 },
        hovermode: 'closest'
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
