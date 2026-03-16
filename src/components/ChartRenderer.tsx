import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { ChartPoint, SettingsData, ProjectionData, WeightEntry } from '../lib/types';
import { SNAP_THRESHOLD, WEEKLY_TUNNEL_WIDTH, DAILY_TUNNEL_WIDTH } from '../lib/constants';
import { interpolateColor, formatDate } from '../lib/utils';

interface ChartRendererProps {
  data: ChartPoint[]; // ignored now, we use allData
  allData: ChartPoint[];
  mode: 'weekly' | 'daily';
  filterRange: '1M' | '3M' | 'ALL';
  height: number;
  width: number;
  settings: SettingsData | null;
  projection: ProjectionData | null;
  isDragging: boolean;
  onSelectEntry?: (entry: WeightEntry) => void;
}

export function ChartRenderer({ allData, mode, filterRange, height, width, settings, projection, isDragging, onSelectEntry }: ChartRendererProps) {
  const [activeDateStr, setActiveDateStr] = useState<string | null>(null);
  const [viewOffset, setViewOffset] = useState<number>(0);  // float offset from the right edge

  const svgRef = useRef<SVGSVGElement>(null);

  // Touch tracking refs
  const lastTouchXRef = useRef(0);
  const lastTouchYRef = useRef(0);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const isSwiping = useRef(false);
  const gestureDecided = useRef(false);

  // Default window size based on filterRange. We approximate 1M ≈ 30, 3M ≈ 90, ALL = allData.length
  // But wait, the previous logic used actual date filtering.
  // Instead of fixed counts, we can count how many points are in the default window.
  const defaultWindowSize = useMemo(() => {
    if (allData.length === 0) return 0;
    const latestDate = allData[allData.length - 1].dateObj;
    let startDate = new Date(latestDate);
    if (filterRange === '1M') startDate.setMonth(latestDate.getMonth() - 1);
    else if (filterRange === '3M') startDate.setMonth(latestDate.getMonth() - 3);
    else return allData.length;

    let count = 0;
    for (let i = allData.length - 1; i >= 0; i--) {
      if (allData[i].dateObj >= startDate) count++;
      else break;
    }
    return Math.max(count, 5); // At least 5 points
  }, [allData, filterRange]);

  // Reset viewOffset when filterRange changes
  useEffect(() => {
    setViewOffset(0);
    setActiveDateStr(null);
  }, [filterRange]);

  const N = allData.length;
  const W = Math.max(2, defaultWindowSize);
  const maxOffset = Math.max(0, N - W);
  const clampedOffset = Math.max(0, Math.min(maxOffset, viewOffset));

  const currLeft = Math.max(0, N - W - clampedOffset);
  const currRight = currLeft + (W - 1);

  const renderWidth = width > 0 ? width : 100;
  const padding = { top: 20, bottom: 24, left: 32, right: 16 };
  const availableWidth = renderWidth - padding.left - padding.right;
  const pxPerPoint = availableWidth / Math.max(1, W - 1);

  const getX = useCallback((i: number) => padding.left + (i - currLeft) * pxPerPoint, [currLeft, pxPerPoint, padding.left]);

  // Visible data slice for rendering and Y-axis min/max
  const visibleDataIndices = useMemo(() => {
    const start = Math.max(0, Math.floor(currLeft));
    const end = Math.min(N, Math.ceil(currRight) + 1);
    return { start, end };
  }, [currLeft, currRight, N]);

  const visibleData = allData.slice(visibleDataIndices.start, visibleDataIndices.end);

  const findNearestDateStr = useCallback((clientX: number) => {
    if (!svgRef.current || visibleData.length === 0) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * renderWidth;

    let closestLabel: string | null = null;
    let closestDist = Infinity;

    for (let i = visibleDataIndices.start; i < visibleDataIndices.end; i++) {
      const dist = Math.abs(getX(i) - svgX);
      if (dist < closestDist) {
        closestDist = dist;
        closestLabel = allData[i].label;
      }
    }
    return closestLabel;
  }, [allData, visibleData.length, visibleDataIndices, renderWidth, getX]);

  // --- Touch interaction ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    lastTouchXRef.current = touch.clientX;
    lastTouchYRef.current = touch.clientY;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchStartTimeRef.current = Date.now();
    isSwiping.current = false;
    gestureDecided.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = touch.clientX - lastTouchXRef.current;
    
    if (!gestureDecided.current) {
      const totalDx = Math.abs(touch.clientX - touchStartXRef.current);
      const totalDy = Math.abs(touch.clientY - touchStartYRef.current);
      if (totalDx < 5 && totalDy < 5) return;
      gestureDecided.current = true;
      if (totalDx > totalDy) {
        isSwiping.current = true;
      } else {
        isSwiping.current = false;
        return; // vertical scroll
      }
    }

    if (!isSwiping.current) return;
    if (e.cancelable) e.preventDefault();

    const deltaPoints = dx / pxPerPoint;
    setViewOffset(prev => Math.max(0, Math.min(maxOffset, prev + deltaPoints)));

    lastTouchXRef.current = touch.clientX;
    lastTouchYRef.current = touch.clientY;
  }, [pxPerPoint, maxOffset]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!gestureDecided.current || !isSwiping.current) {
      const touchDuration = Date.now() - touchStartTimeRef.current;
      if (touchDuration < 300) {
        const clientX = e.changedTouches[0].clientX;
        const totalDx = Math.abs(clientX - touchStartXRef.current);
        const totalDy = Math.abs(e.changedTouches[0].clientY - touchStartYRef.current);
        if (totalDx < 10 && totalDy < 10) {
          handleTap(clientX);
        }
      }
    }
    isSwiping.current = false;
    gestureDecided.current = false;
  }, [touchStartXRef, touchStartYRef, touchStartTimeRef]);

  const handleTap = useCallback((clientX: number) => {
    const label = findNearestDateStr(clientX);
    setActiveDateStr(prev => prev === label ? null : label);
  }, [findNearestDateStr]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    handleTap(e.clientX);
  }, [handleTap]);

  const handleTooltipClick = useCallback(() => {
    if (!activeDateStr || !onSelectEntry) return;
    const point = allData.find(d => d.label === activeDateStr);
    if (!point) return;

    if (mode === 'weekly') {
      const entry: WeightEntry = {
        id: `weekly-${point.label}`,
        weight: point.actual ?? point.trend ?? 0,
        date: point.weekLabel || point.label,
        createdAt: null,
      };
      onSelectEntry(entry);
    } else {
      const entry: WeightEntry = {
        id: `daily-${point.label}`,
        weight: point.actual ?? point.trend ?? 0,
        date: point.label,
        createdAt: null,
      };
      onSelectEntry(entry);
    }
  }, [activeDateStr, allData, mode, onSelectEntry]);

  // --- Gradients and visual computations ---
  const stops = useMemo(() => {
    if (visibleData.length < 2 || !settings) return [];
    const stopList: React.ReactElement[] = [];

    // The gradient runs across the entire availableWidth.
    // For fractional offset, we have to map points correctly, or just use visibleData roughly.
    // Given the gradient is just color blending, mapping roughly to screen % is fine.

    for (let i = 0; i < visibleData.length - 1; i++) {
      const startPoint = visibleData[i];
      const endPoint = visibleData[i + 1];

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
      const absIndex = visibleDataIndices.start + i;
      
      // Calculate where `absIndex + 0.5` falls on the screen as a %
      const xPixel = getX(absIndex + 0.5) - padding.left;
      const offsetPercent = Math.max(0, Math.min(100, (xPixel / availableWidth) * 100));

      if (stopList.length === 0) stopList.push(<stop key="start" offset="0%" stopColor={color} />);
      stopList.push(<stop key={`mid-${i}`} offset={`${offsetPercent}%`} stopColor={color} />);
      if (i === visibleData.length - 2) stopList.push(<stop key="end" offset="100%" stopColor={color} />);
    }
    return stopList;
  }, [visibleData, settings, mode, getX, availableWidth, padding.left, visibleDataIndices.start]);



  const expanded = height > SNAP_THRESHOLD;
  const tunnelTolerance = mode === 'weekly' ? WEEKLY_TUNNEL_WIDTH : DAILY_TUNNEL_WIDTH;

  const validValues = visibleData.flatMap<number>(d => {
    const vals: number[] = [];
    if (d.actual !== null) vals.push(d.actual);
    if (d.trend !== null) vals.push(d.trend);

    if (projection && settings) {
      const msPerDay = 86400000;
      const diffDays = (d.dateObj.getTime() - projection.anchorDate.getTime()) / msPerDay;
      const idealY = projection.anchorVal + (diffDays * projection.dailySlope);
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

  const getY = useCallback((val: number) => (height - padding.bottom) - ((val - minVal) / range) * (height - padding.top - padding.bottom), [height, padding.bottom, padding.top, minVal, range]);

  if (!allData || allData.length === 0) return (
    <div className="flex items-center justify-center text-slate-500 bg-slate-900/50 rounded-xl border border-dashed border-slate-800" style={{ height: height }}>
      <p className="text-sm">Log data to see trend</p>
    </div>
  );
  
  
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
  const niceStep = computeNiceStep(range / (gridCount - 1));
  const gridMin = Math.floor(minVal / niceStep) * niceStep;
  const gridMax = Math.ceil(maxVal / niceStep) * niceStep;
  const gridStops: number[] = [];
  for (let val = gridMin; val <= gridMax + niceStep / 2; val += niceStep) {
    gridStops.push(parseFloat(val.toFixed(3)));
  }

  let trendPath = '';
  if (visibleData.length > 1) {
    let lastValidAbs = -1;
    for (let i = visibleDataIndices.start; i < visibleDataIndices.end; i++) {
      const d = allData[i];
      if (d.trend === null) continue;
      const x = getX(i);
      const y = getY(d.trend);
      if (lastValidAbs === -1) trendPath += `M ${x},${y} `;
      else trendPath += `L ${x},${y} `;
      lastValidAbs = i;
    }
  }

  let projectionPath = '';
  let tunnelPath = '';

  if (projection && visibleData.length > 0) {
    const msPerDay = 86400000;
    const upperPoints: [number, number][] = [];
    const lowerPoints: [number, number][] = [];

    for (let i = visibleDataIndices.start; i < visibleDataIndices.end; i++) {
      const d = allData[i];
      const diffDays = (d.dateObj.getTime() - projection.anchorDate.getTime()) / msPerDay;
      const idealY = projection.anchorVal + (diffDays * projection.dailySlope);
      const x = getX(i);
      const y = getY(idealY);

      if (i === visibleDataIndices.start) projectionPath += `M ${x},${y} `;
      else projectionPath += `L ${x},${y} `;

      const yUpper = clampToAxis(getY(idealY + tunnelTolerance));
      const yLower = clampToAxis(getY(idealY - tunnelTolerance));
      upperPoints.push([x, yUpper]);
      lowerPoints.push([x, yLower]);
    }

    if (upperPoints.length > 0) {
      tunnelPath = `M ${upperPoints[0][0]},${upperPoints[0][1]}`;
      for (let k = 1; k < upperPoints.length; k++) tunnelPath += ` L ${upperPoints[k][0]},${upperPoints[k][1]}`;
      for (let k = lowerPoints.length - 1; k >= 0; k--) tunnelPath += ` L ${lowerPoints[k][0]},${lowerPoints[k][1]}`;
      tunnelPath += ' Z';
    }
  }

  const activeIndex = activeDateStr ? allData.findIndex(d => d.label === activeDateStr) : -1;
  const activePoint = activeIndex >= 0 ? allData[activeIndex] : null;
  const activeXPos = activeIndex >= 0 ? getX(activeIndex) : -100;
  
  // Only show tooltip if it's within the visible bounds padded slightly
  const isTooltipVisible = activePoint && activeXPos >= padding.left - 5 && activeXPos <= renderWidth - padding.right + 5;

  return (
    <div
      className={`w-full overflow-hidden rounded-t-xl bg-slate-900 border-x border-t border-slate-800 shadow-sm select-none ${isDragging ? '' : 'transition-[height] duration-300 ease-out'}`}
      style={{ height: height }}
    >
      <svg
        ref={svgRef}
        width="100%" height="100%"
        /* Using viewBox ensures responsive scaling without glitching */
        viewBox={`0 0 ${renderWidth} ${height}`}
        className="block touch-none"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <defs>
          <clipPath id="chartClip">
            <rect x={padding.left} y={0} width={availableWidth} height={height} />
          </clipPath>
          {stops.length > 0 && (
            <linearGradient id="trendGradient" x1="0" y1="0" x2="100%" y2="0">
              {stops}
            </linearGradient>
          )}
        </defs>

        {/* GRID & AXIS */}
        {gridStops.map((val, idx) => {
          const yPos = getY(val);
          // Clamp grid lines so they don't appear out of bounds during fast resizes
          if (yPos < padding.top - 5 || yPos > height - padding.bottom + 5) return null;
          return (
            <g key={idx}>
              <line x1={padding.left} y1={yPos} x2={renderWidth - padding.right} y2={yPos} stroke="#1e293b" strokeWidth="1" />
              <text x={padding.left - 6} y={yPos + 3} fontSize="9" fill="#64748b" textAnchor="end">{val.toFixed(1)}</text>
            </g>
          );
        })}

        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#334155" strokeWidth="1" />
        <line x1={padding.left} y1={height - padding.bottom} x2={renderWidth - padding.right} y2={height - padding.bottom} stroke="#334155" strokeWidth="1" />

        <g clipPath="url(#chartClip)">
          {/* TUNNEL */}
          {tunnelPath && <path d={tunnelPath} fill="#10b981" opacity="0.1" stroke="none" />}

          {/* PROJECTION */}
          {projectionPath && <path d={projectionPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />}

          {/* TREND LINE */}
          {trendPath && (
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
          {visibleData.map((d) => {
            if (d.actual === null) return null;
            const idx = allData.indexOf(d);
            const px = getX(idx);
            const py = getY(d.actual);
            const isActive = activeDateStr === d.label;

            return (
              <circle
                key={idx}
                cx={px}
                cy={py}
                r={isActive ? 5 : (expanded ? 3.5 : 2)}
                fill={isActive ? "#ffffff" : "#10b981"}
                opacity={isActive ? "1" : (expanded ? "0.9" : "0.6")}
              />
            );
          })}

          {/* X-AXIS LABELS */}
          {(() => {
            const minLabelSpacing = 35;
            let lastRenderedX = -999;
            return visibleData.map((d) => {
              const idx = allData.indexOf(d);
              const px = getX(idx);
              if (px < padding.left || px > renderWidth - padding.right) return null;

              if (px - lastRenderedX > minLabelSpacing) {
                lastRenderedX = px;
                
                // Adjust text anchor if too close to edges to prevent cutoff
                let anchor: "middle" | "start" | "end" = "middle";
                if (px < padding.left + 15) anchor = "start";
                else if (px > renderWidth - padding.right - 15) anchor = "end";

                return (
                  <text key={idx} x={px} y={height - 6} fontSize="9" fill="#64748b" textAnchor={anchor} fontWeight="bold">
                    {mode === 'weekly' ? d.weekLabel : formatDate(d.label)}
                  </text>
                );
              }
              return null;
            });
          })()}

          {/* INTERACTIVE CROSSHAIR & TOOLTIP */}
          {isTooltipVisible && activePoint && (
            <g>
              <line
                x1={activeXPos}
                y1={padding.top}
                x2={activeXPos}
                y2={height - padding.bottom}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="4 3"
                opacity="0.7"
              />

              {/* Redesigned Button-like Tooltip */}
              {(() => {
                const tooltipWeight = activePoint.actual !== null
                  ? activePoint.actual.toFixed(1)
                  : (activePoint.trend !== null ? activePoint.trend.toFixed(1) : '--');
                const tooltipDate = mode === 'weekly'
                  ? (activePoint.weekLabel || activePoint.label)
                  : formatDate(activePoint.label);
                
                // Extra space for arrow padding
                const tooltipText = `${tooltipWeight} kg · ${tooltipDate}`;
                const baseWidth = tooltipText.length * 5.5 + 16;
                const totalWidth = onSelectEntry ? baseWidth + 16 : baseWidth; // +16 for the > icon
                const tooltipHeight = 28; // slightly taller for better clickability

                let tooltipX = activeXPos - totalWidth / 2;
                if (tooltipX < padding.left) tooltipX = padding.left;
                if (tooltipX + totalWidth > renderWidth - padding.right) {
                  tooltipX = renderWidth - padding.right - totalWidth;
                }
                
                // Place tooltip exactly at the top of the SVG canvas to avoid being cut off by padding
                const tooltipY = Math.max(0, padding.top - tooltipHeight - 4); 

                return (
                  <g
                    style={{ cursor: onSelectEntry ? 'pointer' : 'default' }}
                    onClick={(e) => { e.stopPropagation(); handleTooltipClick(); }}
                    onTouchStart={(e) => e.stopPropagation()} // Stop chart from panning
                    onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); handleTooltipClick(); }}
                    className="group" // allows for hover styles if we use css over svg properties, but standard svg is more cross-platform
                  >
                    {/* Shadow/Backdrop */}
                    <rect
                      x={tooltipX}
                      y={tooltipY}
                      width={totalWidth}
                      height={tooltipHeight}
                      rx="6"
                      fill="#0f172a"
                      stroke="#334155"
                      strokeWidth="1"
                      className="transition-colors group-hover:fill-slate-800"
                    />
                    <text
                      x={tooltipX + (onSelectEntry ? 8 : totalWidth / 2)}
                      y={tooltipY + 18}
                      fontSize="10"
                      fill="#f8fafc" // clean white text instead of blue
                      textAnchor={onSelectEntry ? "start" : "middle"}
                      fontWeight="bold"
                    >
                      {tooltipText}
                    </text>
                    
                    {/* Chevron Icon indicating action */}
                    {onSelectEntry && (
                      <path
                        d="M0 0 L4 4 L0 8"
                        transform={`translate(${tooltipX + totalWidth - 14}, ${tooltipY + 10})`}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-colors group-hover:stroke-blue-400"
                      />
                    )}
                  </g>
                );
              })()}
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
