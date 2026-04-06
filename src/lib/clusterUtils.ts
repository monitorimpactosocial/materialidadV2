/**
 * Utilidades para análisis de clusters y scaling inteligente
 */

export interface Point {
  x: number;
  y: number;
  temaId?: string;
  temaNombre?: string;
}

export interface ClusterInfo {
  clusters: Point[][];
  density: number;
  recommendedZoom: number;
  hasOverlap: boolean;
}

/**
 * Detecta clusters de puntos usando simple grid-based clustering
 */
export const detectClusters = (points: Point[], gridSize: number = 0.3): Point[][] => {
  if (points.length === 0) return [];

  const clusters: Map<string, Point[]> = new Map();

  points.forEach(point => {
    const gridX = Math.floor(point.x / gridSize);
    const gridY = Math.floor(point.y / gridSize);
    const key = `${gridX},${gridY}`;

    if (!clusters.has(key)) {
      clusters.set(key, []);
    }
    clusters.get(key)!.push(point);
  });

  return Array.from(clusters.values());
};

/**
 * Calcula estadísticas de dispersión de puntos
 */
export const calculateDispersion = (points: Point[]): { 
  stdDevX: number; 
  stdDevY: number; 
  meanX: number; 
  meanY: number;
  rangeX: number;
  rangeY: number;
} => {
  if (points.length < 2) {
    return { stdDevX: 0, stdDevY: 0, meanX: 0, meanY: 0, rangeX: 0, rangeY: 0 };
  }

  const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

  const varX = points.reduce((sum, p) => sum + Math.pow(p.x - meanX, 2), 0) / points.length;
  const varY = points.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0) / points.length;

  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));

  return {
    stdDevX: Math.sqrt(varX),
    stdDevY: Math.sqrt(varY),
    meanX,
    meanY,
    rangeX: maxX - minX,
    rangeY: maxY - minY
  };
};

/**
 * Recomienda zoom basado en clustering y dispersión
 */
export const recommendZoom = (points: Point[]): { zoom: number; hasOverlap: boolean } => {
  if (points.length < 2) return { zoom: 1, hasOverlap: false };

  // Detectar clusters
  const clusters = detectClusters(points, 0.2);
  const clusterWithMultiple = clusters.filter(c => c.length > 1).length;
  const overlappingPercentage = clusterWithMultiple / clusters.length;

  // Calcular dispersión
  const { stdDevX, stdDevY, rangeX, rangeY } = calculateDispersion(points);

  // Si hay clusters o baja dispersión → zoom
  if (overlappingPercentage > 0.15 || (stdDevX < 0.5 && stdDevY < 0.5)) {
    return { zoom: 1.8, hasOverlap: true };
  } else if (overlappingPercentage > 0.08 || (stdDevX < 0.8 && stdDevY < 0.8)) {
    return { zoom: 1.4, hasOverlap: true };
  }

  return { zoom: 1, hasOverlap: false };
};

/**
 * Agregar jitter leve a puntos para visualizar superposición
 */
export const addJitter = (point: Point, magnitude: number = 0.05): Point => {
  return {
    ...point,
    x: point.x + (Math.random() - 0.5) * magnitude,
    y: point.y + (Math.random() - 0.5) * magnitude
  };
};

/**
 * Agrupa puntos por proximidad para mostrar en hover
 */
export const groupNearbyPoints = (
  points: Point[],
  threshold: number = 0.15
): Map<string, Point[]> => {
  const groups: Map<string, Point[]> = new Map();
  const processed = new Set<number>();

  points.forEach((point, idx) => {
    if (processed.has(idx)) return;

    const key = `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    const group: Point[] = [point];
    processed.add(idx);

    // Buscar puntos cercanos
    points.forEach((otherPoint, otherIdx) => {
      if (processed.has(otherIdx)) return;

      const distance = Math.sqrt(
        Math.pow(point.x - otherPoint.x, 2) + Math.pow(point.y - otherPoint.y, 2)
      );

      if (distance < threshold) {
        group.push(otherPoint);
        processed.add(otherIdx);
      }
    });

    if (group.length > 0) {
      groups.set(key, group);
    }
  });

  return groups;
};

/**
 * Calcula el rango óptimo de ejes basado en zoom
 */
export const calculateAxisRange = (zoom: number = 1, baseRange: [number, number] = [0.5, 5.5]): [number, number] => {
  const [min, max] = baseRange;
  const mid = (min + max) / 2;
  const halfSpan = (max - min) / 2 / zoom;

  return [
    Math.max(0, mid - halfSpan),
    Math.min(6, mid + halfSpan)
  ];
};
