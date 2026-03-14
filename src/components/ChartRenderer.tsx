import React, { useMemo } from 'react';
import type { ChartPoint, SettingsData, ProjectionData } from '../lib/types';
import { SNAP_THRESHOLD, WEEKLY_TUNNEL_WIDTH, DAILY_TUNNEL_WIDTH } from '../lib/constants';
import { interpolateColor, formatDate } from '../lib/utils';

interface ChartRendererProps {
  data: ChartPoint[];
  mode: 'weekly' | 'daily';
  height: number;
  width: number;
  settings: SettingsData | null;
  projection: ProjectionData | null;
  isDragging: boolean;
  onPointClick: (point: ChartPoint) => void;
}

export function ChartRenderer({ data, mode, height, width, settings, projection, isDragging, onPointClick }: ChartRendererProps) {
  if (!data || data.length === 0) return (
    <div className="flex items-center justify-center text-slate-500 bg-slate-900/50 rounded-xl border border-dashed border-slate-800" style={{ height: height }}>
      <p className="text-sm">Log data to see trend</p>
    </div>
  );

  const renderWidth = width > 0 ? width : 100;
  const expanded = height > SNAP_THRESHOLD;
  const padding = { top: 20, bottom: 24, left: 32, right: 16 };

  const tunnelTolerance = mode === 'weekly' ? WEEKLY_TUNNEL_WIDTH : DAILY_TUNNEL_WIDTH;

  const validValues = data.flatMap<number>(d => {
    const vals: number[] = [];
    if (d.actual !== null) vals.push(d.actual);
    if (d.trend !== null) vals.push(d.trend);

    if (projection && settings) {
      const msPerDay = 86400000;
      let idealY = 0;

      if (mode === 'weekly') {
        const diffDays = (d.dateObj.getTime() - projection.anchorDate.getTime()) / msPerDay;
        const diffWeeks = Math.round(diffDays / 7);
        idealY = projection.anchorVal + (diffWeeks * projection.weeklySlope);
      } else {
        const diffDays = (d.dateObj.getTime() - projection.anchorDate.getTime()) / msPerDay;
        idealY = projection.anchorVal + (diffDays * projection.dailySlope);
      }

      vals.push(idealY + tunnelTolerance);
      vals.push(idealY - tunnelTolerance);
    }

    return vals;
  });

  const rawMin = Math.min(...validValues);
  const rawMax = Math.max(...validValues);
  const rawRange = rawMax - rawMin;

  const effectiveRange = Math.max(rawRange, 0.5);
  const buffer = effectiveRange * 0.05;
  const midPoint = (rawMax + rawMin) / 2;

  const minVal = midPoint - (effectiveRange / 2) - buffer;
  const maxVal = midPoint + (effectiveRange / 2) + buffer;
  const range = maxVal - minVal;

  const availableWidth = renderWidth - padding.left - padding.right;
  const count = data.length;
  const denominator = count > 1 ? count - 1 : 1;

  const getX = (i: number) => padding.left + (i / denominator) * availableWidth;
  const getY = (val: number) => (height - padding.bottom) - ((val - minVal) / range) * (height - padding.top - padding.bottom);
  const axisLineY = height - padding.bottom;
  const clampToAxis = (val: number) => Math.min(val, axisLineY);

  const gridCount = 5;
  const computeNiceStep = (targetStep: number) => {
    if (targetStep <= 0) return 0.1;
    const exponent = Math.floor(Math.log10(targetStep));
    const base = Math.pow(10, exponent);
    const candidates = [1, 2, 2.5, 5, 10];
    for (const mult of candidates) {
      const step = mult * base;
      if (targetStep <= step) return step;
    }
    return 10 * base;
  };
  const desiredStep = range / (gridCount - 1);
  const niceStep = computeNiceStep(desiredStep);
  const gridMin = Math.floor(minVal / niceStep) * niceStep;
  const gridMax = Math.ceil(maxVal / niceStep) * niceStep;
  const gridStops: number[] = [];
  for (let val = gridMin; val <= gridMax + niceStep / 2; val += niceStep) {
    gridStops.push(parseFloat(val.toFixed(3)));
  }

  const stops = useMemo(() => {
    if (data.length < 2 || !settings) return [];

    const stopList: React.ReactElement[] = [];

    for (let i = 0; i < data.length - 1; i++) {
      const startPoint = data[i];
      const endPoint = data[i + 1];

      if (startPoint.trend === null || endPoint.trend === null) continue;

      let diff: number;

      if (mode === 'weekly') {
        const currentSlope = endPoint.trend - startPoint.trend;
        const targetSlope = settings.weeklyRate;
        diff = Math.abs(currentSlope - targetSlope);
      } else {
        const dailySlope = endPoint.trend - startPoint.trend;
        const weeklyEquivalentSlope = dailySlope * 7;
        diff = Math.abs(weeklyEquivalentSlope - settings.weeklyRate);
      }

      const color = interpolateColor(diff);

      const offsetVal = (i + 0.5) / denominator;
      const offsetPercent = offsetVal * 100;

      if (stopList.length === 0) {
        stopList.push(<stop key="start" offset="0%" stopColor={color} />);
      }

      stopList.push(<stop key={`mid-${i}`} offset={`${offsetPercent}%`} stopColor={color} />);

      if (i === data.length - 2) {
        stopList.push(<stop key="end" offset="100%" stopColor={color} />);
      }
    }

    return stopList;
  }, [data, settings, mode, denominator]);

  let trendPath = '';
  if (count > 1) {
    let lastValidT = -1;
    data.forEach((d, i) => {
      if (d.trend === null) return;
      const x = getX(i);
      const y = getY(d.trend);
      if (lastValidT === -1) trendPath += `M ${x},${y} `;
      else trendPath += `L ${x},${y} `;
      lastValidT = i;
    });
  }

  let projectionPath = '';
  let tunnelPath = '';

  if (projection && data.length > 0) {
    const msPerDay = 86400000;
    const upperPoints: [number, number][] = [];
    const lowerPoints: [number, number][] = [];

    data.forEach((d, i) => {
      let idealY = 0;
      const diffDays = (d.dateObj.getTime() - projection.anchorDate.getTime()) / msPerDay;

      if (mode === 'weekly') {
        const diffWeeks = Math.round(diffDays / 7);
        idealY = projection.anchorVal + (diffWeeks * projection.weeklySlope);
      } else {
        idealY = projection.anchorVal + (diffDays * projection.dailySlope);
      }

      const x = getX(i);
      const y = getY(idealY);

      if (i === 0) projectionPath += `M ${x},${y} `;
      else projectionPath += `L ${x},${y} `;

      const yUpper = clampToAxis(getY(idealY + tunnelTolerance));
      const yLower = clampToAxis(getY(idealY - tunnelTolerance));

      upperPoints.push([x, yUpper]);
      lowerPoints.push([x, yLower]);
    });

    if (upperPoints.length > 0) {
      tunnelPath = `M ${upperPoints[0][0]},${upperPoints[0][1]}`;
      for (let k = 1; k < upperPoints.length; k++) {
        tunnelPath += ` L ${upperPoints[k][0]},${upperPoints[k][1]}`;
      }
      for (let k = lowerPoints.length - 1; k >= 0; k--) {
        tunnelPath += ` L ${lowerPoints[k][0]},${lowerPoints[k][1]}`;
      }
      tunnelPath += ' Z';
    }
  }

  const minLabelSpacing = 35;
  let lastRenderedX = -999;
  const lastPointX = getX(data.length - 1);

  return (
    <div
      className={`w-full overflow-hidden rounded-t-xl bg-slate-900 border-x border-t border-slate-800 shadow-sm select-none ${isDragging ? '' : 'transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]'}`}
      style={{ height: height }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${renderWidth} ${height}`} className="block">

        <defs>
          {stops.length > 0 && (
            <linearGradient id="trendGradient" x1="0" y1="0" x2="100%" y2="0">
              {stops}
            </linearGradient>
          )}
        </defs>

        {/* GRID & AXIS */}
        {gridStops.map((val, idx) => (
          <g key={idx}>
            <line x1={padding.left} y1={getY(val)} x2={renderWidth - padding.right} y2={getY(val)} stroke="#1e293b" strokeWidth="1" />
            <text x={padding.left - 6} y={getY(val) + 3} fontSize="9" fill="#64748b" textAnchor="end">{val.toFixed(1)}</text>
          </g>
        ))}

        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#334155" strokeWidth="1" />
        <line x1={padding.left} y1={height - padding.bottom} x2={renderWidth - padding.right} y2={height - padding.bottom} stroke="#334155" strokeWidth="1" />

        {/* TUNNEL */}
        {tunnelPath && (
          <path d={tunnelPath} fill="#10b981" opacity="0.1" stroke="none" />
        )}

        {/* PROJECTION */}
        {projectionPath && (
          <path d={projectionPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
        )}

        {/* TREND LINE */}
        {count > 1 && (
          <path
            d={trendPath}
            fill="none"
            stroke={stops.length > 0 ? "url(#trendGradient)" : "#10b981"}
            strokeWidth={expanded ? "3" : "2"}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* DATA POINTS */}
        {data.map((d, i) => {
          if (d.actual === null) return null;
          const px = getX(i);
          const py = getY(d.actual);

          return (
            <g key={i} onClick={() => onPointClick(d)} className="cursor-pointer">
              <circle cx={px} cy={py} r={10} fill="transparent" />
              <circle
                cx={px}
                cy={py}
                r={expanded ? 3.5 : 2}
                fill="#10b981"
                opacity={expanded ? "0.9" : "0.6"}
              />
              {expanded && (
                <text x={px} y={py - 12} fontSize="10" fill="#cbd5e1" textAnchor="middle" fontWeight="bold">
                  {d.actual.toFixed(1)}
                </text>
              )}
            </g>
          );
        })}

        {/* LABELS */}
        {data.map((d, i) => {
          const xPos = getX(i);
          const isFirst = i === 0;
          const isLast = i === data.length - 1;
          let shouldRender = false;
          let anchor: "start" | "middle" | "end" = "middle";

          if (isFirst) { shouldRender = true; anchor = "start"; }
          else if (isLast) { shouldRender = true; anchor = "end"; }
          else {
            const distToLast = lastPointX - xPos;
            const distToPrev = xPos - lastRenderedX;
            if (distToLast > minLabelSpacing && distToPrev > minLabelSpacing) {
              shouldRender = true;
            }
          }

          if (!shouldRender) return null;
          lastRenderedX = xPos;

          return (
            <text key={i} x={xPos} y={height - 6} fontSize="9" fill="#64748b" textAnchor={anchor} fontWeight="bold">
              {mode === 'weekly' ? d.weekLabel : formatDate(d.label)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
