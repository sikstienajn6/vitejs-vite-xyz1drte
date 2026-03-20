import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { ChartPoint, SettingsData, ProjectionData, WeightEntry } from '../lib/types';
import { SNAP_THRESHOLD, WEEKLY_TUNNEL_WIDTH, DAILY_TUNNEL_WIDTH } from '../lib/constants';
import { interpolateColor, formatDate, mixWithGray } from '../lib/utils';

interface ChartRendererProps {
  data: ChartPoint[]; // ignored now, we use allData
  allData: ChartPoint[];
  mode: 'weekly' | 'daily';
  filterRange: '1M' | '3M' | 'ALL';
  height: number;
  width: number;
  settings: SettingsData | null;
  projection: ProjectionData | null;
  onSelectEntry?: (entry: WeightEntry) => void;
}

export function ChartRenderer({ allData, mode, filterRange, height, width, settings, projection, onSelectEntry }: ChartRendererProps) {
  const [activeDateStr, setActiveDateStr] = useState<string | null>(null);
  const [viewOffset, setViewOffset] = useState<number>(0);  // float offset from the right edge

  const svgRef = useRef<SVGSVGElement>(null);

  // Tooltip scrubbing refs
  const isScrubbing = useRef(false);
  const scrubStartPosRef = useRef({ x: 0, y: 0, time: 0 });
  const scrubOffsetRef = useRef(0);
  const textGroupRef = useRef<SVGGElement>(null);
  const targetWasTextRef = useRef(false);

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

  // Keep points 10px away from the clipping edges so they don't get cut off
  const usableWidth = Math.max(10, availableWidth - 20);
  const pxPerPoint = usableWidth / Math.max(1, W - 1);

  const getX = useCallback((i: number) => padding.left + 10 + (i - currLeft) * pxPerPoint, [currLeft, pxPerPoint, padding.left]);

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
      if (allData[i].actual === null) continue; // Only allow selecting dates with actual entries

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
    if (isScrubbing.current) return;
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
    if (isScrubbing.current) return;
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

  const handleTap = useCallback((clientX: number) => {
    const label = findNearestDateStr(clientX);
    setActiveDateStr(prev => prev === label ? null : label);
  }, [findNearestDateStr]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!gestureDecided.current || !isSwiping.current) {
      const touchDuration = Date.now() - touchStartTimeRef.current;
      if (touchDuration < 500) {
        const clientX = e.changedTouches[0].clientX;
        const totalDx = Math.abs(clientX - touchStartXRef.current);
        const totalDy = Math.abs(e.changedTouches[0].clientY - touchStartYRef.current);
        if (totalDx < 30 && totalDy < 30) {
          handleTap(clientX);
          if (e.cancelable) e.preventDefault();
        }
      }
    }
    isSwiping.current = false;
    gestureDecided.current = false;
  }, [touchStartXRef, touchStartYRef, touchStartTimeRef, handleTap]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    handleTap(e.clientX);
  }, [handleTap]);

  const handleTooltipPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    
    // targetWasTextRef.current is set by the child hitbox inline handlers during the bubble phase!
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err) {}
    isScrubbing.current = true;
    scrubStartPosRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    
    const activeIndex = activeDateStr ? allData.findIndex(d => d.label === activeDateStr) : -1;
    const activeX = activeIndex >= 0 ? getX(activeIndex) : e.clientX;
    scrubOffsetRef.current = activeX - e.clientX;
  }, [activeDateStr, allData, getX]);

  const handleTooltipPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isScrubbing.current) return;
    
    const dx = Math.abs(e.clientX - scrubStartPosRef.current.x);
    // Give a 10px deadzone to prevent jittering when actively touching the text box to click
    if (dx < 10 && targetWasTextRef.current) return;

    const virtualX = e.clientX + scrubOffsetRef.current;
    const label = findNearestDateStr(virtualX);
    if (label && label !== activeDateStr) {
      setActiveDateStr(label);
    }
  }, [findNearestDateStr, activeDateStr, textGroupRef, scrubOffsetRef]);

  const openModalForPoint = useCallback((point: ChartPoint) => {
    if (!onSelectEntry) return;

    if (mode === 'daily') {
      if (point.originalEntry) {
        onSelectEntry(point.originalEntry);
      } else {
        const entry: WeightEntry = {
          id: `daily-${point.label}`,
          weight: point.actual ?? point.trend ?? 0,
          date: point.label,
          createdAt: null,
        };
        onSelectEntry(entry);
      }
    } else {
      let weeklyComment = "";
      if (point.entries) {
        const comments = point.entries
          .filter(e => e.comment)
          .map(e => ({ date: e.date, weight: e.weight, text: e.comment }));
        if (comments.length > 0) {
           weeklyComment = JSON.stringify(comments);
        }
      }

      const entry: WeightEntry = {
        id: `weekly-${point.label}`,
        weight: point.actual ?? point.trend ?? 0,
        date: point.weekLabel || point.label,
        comment: weeklyComment || undefined,
        createdAt: null,
      };
      onSelectEntry(entry);
    }
  }, [mode, onSelectEntry]);

  const handleTooltipClick = useCallback(() => {
    if (!activeDateStr) return;
    const point = allData.find(d => d.label === activeDateStr);
    if (!point) return;
    openModalForPoint(point);
  }, [activeDateStr, allData, openModalForPoint]);

  const handleTooltipPointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err) {}
    isScrubbing.current = false;
    
    const dx = Math.abs(e.clientX - scrubStartPosRef.current.x);
    const dy = Math.abs(e.clientY - scrubStartPosRef.current.y);
    const dt = Date.now() - scrubStartPosRef.current.time;
    
    if (dx < 40 && dy < 40 && dt < 1000) {
      if (targetWasTextRef.current) {
        handleTooltipClick();
      }
    }
  }, [handleTooltipClick]);

  // --- Gradients and visual computations ---
  const stops = useMemo(() => {
    const startIdx = Math.max(0, visibleDataIndices.start - 1);
    const endIdx = Math.min(allData.length, visibleDataIndices.end + 1);
    const visibleCount = endIdx - startIdx;
    if (visibleCount < 2 || !settings) return [];

    const stopList: React.ReactElement[] = [];
    const windowSize = mode === 'daily' ? 4 : 1; // Look up up to 1 or 4 points backwards and forwards
    let lastColor = '';

    for (let i = 0; i < visibleCount; i++) {
      const absIndex = startIdx + i;
      const currentPoint = allData[absIndex];

      if (!currentPoint || currentPoint.trend === null) continue;

      let slopeSum = 0;
      let scoreCount = 0;

      for (let offset = -windowSize; offset <= windowSize; offset++) {
        if (offset === 0) continue;

        const neighborIdx = absIndex + offset;
        if (neighborIdx >= 0 && neighborIdx < allData.length) {
          const neighborPoint = allData[neighborIdx];
          if (neighborPoint.trend === null) continue;

          // Calculate slope per step
          const slope = (neighborPoint.trend - currentPoint.trend) / offset;
          slopeSum += slope;
          scoreCount++;
        }
      }

      if (scoreCount > 0) {
        let averageSlope = slopeSum / scoreCount;
        if (mode === 'daily') {
          averageSlope *= 7;
        }

        const diff = Math.abs(averageSlope - settings.weeklyRate);
        let color = interpolateColor(diff);

        // Fade tail to gray if not enough points right of current point
        const pointsToRight = allData.length - 1 - absIndex;
        if (pointsToRight < windowSize) {
           const grayFactor = 1.0 - (pointsToRight / windowSize);
           color = mixWithGray(color, grayFactor);
        }

        lastColor = color;

        // Calculate offset percentage relative to available width
        const xPixel = getX(absIndex) - padding.left;
        const offsetPercent = Math.max(0, Math.min(100, (xPixel / availableWidth) * 100));

        if (stopList.length === 0) stopList.push(<stop key="start" offset="0%" stopColor={color} />);
        stopList.push(<stop key={`point-${i}`} offset={`${offsetPercent}%`} stopColor={color} />);
      }
    }

    if (stopList.length > 0 && lastColor !== '') {
      stopList.push(<stop key="end" offset="100%" stopColor={lastColor} />);
    }

    return stopList;
  }, [visibleDataIndices.start, visibleDataIndices.end, settings, mode, getX, availableWidth, padding.left, allData]);



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
  if (allData.length > 1) {
    const startIdx = Math.max(0, visibleDataIndices.start - 1);
    const endIdx = Math.min(allData.length, visibleDataIndices.end + 1);

    if (startIdx === 0) {
      const p0 = allData[0];
      const p1 = allData[1];
      if (p0 && p0.trend !== null && p1 && p1.trend !== null) {
        const x0 = getX(0), y0 = getY(p0.trend);
        const x1 = getX(1), y1 = getY(p1.trend);
        if (x1 !== x0) {
          const m = (y1 - y0) / (x1 - x0);
          const yEdge = y0 - m * (x0 - padding.left);
          trendPath += `M ${padding.left},${yEdge} `;
        }
      }
    }
       for (let i = startIdx; i < endIdx; i++) {
      const d = allData[i];
      if (d.trend === null) continue;
      const x = getX(i);
      const y = getY(d.trend);
      if (trendPath === '') trendPath += `M ${x},${y} `;
      else trendPath += `L ${x},${y} `;
    }
  }

  let projectionPath = ''; '';
  let tunnelPath = '';

  if (projection && visibleData.length > 0) {
    const msPerDay = 86400000;
    const upperPoints: [number, number][] = [];
    const lowerPoints: [number, number][] = [];

    const extendTunnel = (px: number) => {
      const virtualI = currLeft + (px - padding.left - 10) / pxPerPoint;
      let dateMs: number;

      if (N <= 1) {
        dateMs = N === 1 ? allData[0].dateObj.getTime() : new Date().getTime();
      } else if (virtualI < 0) {
        const dt = allData[1].dateObj.getTime() - allData[0].dateObj.getTime();
        dateMs = allData[0].dateObj.getTime() + virtualI * dt;
      } else if (virtualI > N - 1) {
        const dt = allData[N - 1].dateObj.getTime() - allData[N - 2].dateObj.getTime();
        dateMs = allData[N - 1].dateObj.getTime() + (virtualI - (N - 1)) * dt;
      } else {
        const i0 = Math.floor(virtualI);
        const i1 = Math.ceil(virtualI);
        if (i0 === i1) {
          dateMs = allData[i0].dateObj.getTime();
        } else {
          const t = virtualI - i0;
          dateMs = allData[i0].dateObj.getTime() * (1 - t) + allData[i1].dateObj.getTime() * t;
        }
      }

      const diffDays = (dateMs - projection.anchorDate.getTime()) / msPerDay;
      const idealY = projection.anchorVal + (diffDays * projection.dailySlope);

      return {
        x: px,
        y: getY(idealY),
        yUpper: clampToAxis(getY(idealY + tunnelTolerance)),
        yLower: clampToAxis(getY(idealY - tunnelTolerance))
      };
    };

    const leftEdge = extendTunnel(padding.left);
    projectionPath += `M ${leftEdge.x},${leftEdge.y} `;
    upperPoints.push([leftEdge.x, leftEdge.yUpper]);
    lowerPoints.push([leftEdge.x, leftEdge.yLower]);

    for (let i = visibleDataIndices.start; i < visibleDataIndices.end; i++) {
      const d = allData[i];
      const diffDays = (d.dateObj.getTime() - projection.anchorDate.getTime()) / msPerDay;
      const idealY = projection.anchorVal + (diffDays * projection.dailySlope);
      const x = getX(i);
      const y = getY(idealY);

      projectionPath += `L ${x},${y} `;

      const yUpper = clampToAxis(getY(idealY + tunnelTolerance));
      const yLower = clampToAxis(getY(idealY - tunnelTolerance));
      upperPoints.push([x, yUpper]);
      lowerPoints.push([x, yLower]);
    }

    const rightEdge = extendTunnel(renderWidth - padding.right);
    projectionPath += `L ${rightEdge.x},${rightEdge.y} `;
    upperPoints.push([rightEdge.x, rightEdge.yUpper]);
    lowerPoints.push([rightEdge.x, rightEdge.yLower]);

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
      className={`w-full overflow-hidden select-none`}
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
            <linearGradient id="trendGradient" x1={padding.left} y1="0" x2={renderWidth - padding.right} y2="0" gradientUnits="userSpaceOnUse">
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

          {/* CROSSHAIR LINE (behind data points) */}
          {isTooltipVisible && activePoint && (
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
          )}

          {/* DATA POINTS */}
          {visibleData.map((d) => {
            if (d.actual === null) return null;
            const idx = allData.indexOf(d);
            const px = getX(idx);
            const py = getY(d.actual);
            const isActive = activeDateStr === d.label;

            const hasComment = mode === 'daily'
              ? !!d.originalEntry?.comment
              : !!d.entries?.some(e => e.comment);

            return (
              <g key={idx}>
                <circle
                  cx={px}
                  cy={py}
                  r={isActive ? 5 : (expanded ? 3.5 : 2)}
                  fill={isActive ? "#ffffff" : "#10b981"}
                  opacity={isActive ? "1" : (expanded ? "0.9" : "0.6")}
                  stroke={hasComment ? "#3b82f6" : undefined}
                  strokeWidth={hasComment ? 1 : undefined}
                />
                <circle
                  cx={px}
                  cy={py}
                  r={15}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onPointerUp={(e) => {
                    if (isSwiping.current || isScrubbing.current) return;
                    e.stopPropagation();
                    const point = allData[idx];
                    setActiveDateStr(point.label);
                  }}
                />
              </g>
            );
          })}

          {/* X-AXIS LABELS */}
          {(() => {
            // Calculate total available width and minimum spacing required
            const totalWidth = renderWidth - padding.left - padding.right;
            const minSpacing = 60; // minimum pixels between label centers
            const maxLabels = Math.max(2, Math.floor(totalWidth / minSpacing));

            // To ensure even spacing, we select points at regular intervals
            const labelIndices: number[] = [];

            if (visibleData.length <= maxLabels) {
              // If we have fewer points than max labels, show all of them
              for (let i = 0; i < visibleData.length; i++) {
                labelIndices.push(i);
              }
            } else {
              // Otherwise, evenly distribute the indices
              const step = (visibleData.length - 1) / (maxLabels - 1);
              for (let i = 0; i < maxLabels; i++) {
                // Ensure the exact first and last points are included
                if (i === 0) labelIndices.push(0);
                else if (i === maxLabels - 1) labelIndices.push(visibleData.length - 1);
                else labelIndices.push(Math.round(i * step));
              }
            }

            return labelIndices.map((datasetIdx) => {
              const d = visibleData[datasetIdx];
              const idx = allData.indexOf(d);

              // This shouldn't happen, but just in case
              if (idx === -1) return null;

              const px = getX(idx);
              if (px < padding.left || px > renderWidth - padding.right) return null;

              const textStr = mode === 'weekly' ? d.weekLabel : formatDate(d.label);
              if (!textStr) return null;

              const approxTextWidth = textStr.length * 5.5 + 5;

              let anchor: "middle" | "start" | "end" = "middle";
              if (px < padding.left + approxTextWidth / 2) anchor = "start";
              else if (px > renderWidth - padding.right - approxTextWidth / 2) anchor = "end";

              return (
                <text key={idx} x={px} y={height - 6} fontSize="9" fill="#64748b" textAnchor={anchor} fontWeight="bold">
                  {textStr}
                </text>
              );
            });
          })()}

          {/* INTERACTIVE CROSSHAIR & TOOLTIP */}
          {isTooltipVisible && activePoint && (
            <g>
              {/* Redesigned Button-like Tooltip */}
              {(() => {
                const tooltipWeight = activePoint.actual !== null
                  ? activePoint.actual.toFixed(1)
                  : (activePoint.trend !== null ? activePoint.trend.toFixed(1) : '--');
                const tooltipDate = mode === 'weekly'
                  ? (activePoint.weekLabel || activePoint.label)
                  : formatDate(activePoint.label);

                const hasComment = mode === 'daily'
                  ? !!activePoint.originalEntry?.comment
                  : !!activePoint.entries?.some(e => e.comment);

                const tooltipText = `${tooltipWeight} kg · ${tooltipDate}`;
                const stringWidth = tooltipText.length * 5.5;
                const commentIconWidth = hasComment ? 16 : 0;
                const totalWidth = onSelectEntry ? stringWidth + 32 + commentIconWidth : stringWidth + 24 + commentIconWidth;
                const tooltipHeight = 28;

                let tooltipX = activeXPos - totalWidth / 2;
                if (tooltipX < padding.left) tooltipX = padding.left;
                if (tooltipX + totalWidth > renderWidth - padding.right) {
                  tooltipX = renderWidth - padding.right - totalWidth;
                }

                const tooltipY = Math.max(0, padding.top - tooltipHeight - 4);

                const textCenterX = tooltipX + totalWidth / 2 - (onSelectEntry ? 6 : 0) + (hasComment ? 6 : 0);
                const iconX = textCenterX - stringWidth / 2 - 14;

                return (
                  <g
                    style={{ cursor: onSelectEntry ? 'pointer' : 'default', touchAction: 'none' }}
                    onPointerDown={handleTooltipPointerDown}
                    onPointerMove={handleTooltipPointerMove}
                    onPointerUp={handleTooltipPointerUp}
                    onPointerCancel={handleTooltipPointerUp}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="group"
                  >
                    {/* Invisible hit area covering the entire vertical dashed line height */}
                    <rect
                      x={activeXPos - 20}
                      y={padding.top}
                      width={40}
                      height={height - padding.top - padding.bottom}
                      fill="transparent"
                      className="cursor-ew-resize"
                      onPointerDown={() => { targetWasTextRef.current = false; }}
                    />

                    <g>
                      <rect
                        x={tooltipX}
                        y={tooltipY}
                        width={totalWidth}
                      height={tooltipHeight}
                      rx="6"
                      fill="#0f172a"
                      stroke="#334155"
                      strokeWidth="1"
                      className="transition-colors"
                    />

                    {hasComment && (
                      <path
                        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                        transform={`translate(${iconX}, ${tooltipY + 7}) scale(0.55)`}
                        fill="none"
                        stroke="#60a5fa"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    <text
                      x={textCenterX}
                      y={tooltipY + 18}
                      fontSize="10"
                      fill="#f8fafc"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {tooltipText}
                    </text>

                    {onSelectEntry && (
                      <path
                        d="M0 0 L4 4 L0 8"
                        transform={`translate(${tooltipX + totalWidth - 14}, ${tooltipY + 10})`}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-colors"
                      />
                    )}

                    {/* FOOLPROOF HITBOX OVERLAY */}
                    {/* opacity 1% to force strict hit-testing in WebKit, overriding transparent-fill skips */}
                    <rect
                      x={tooltipX}
                      y={tooltipY}
                      width={totalWidth}
                      height={tooltipHeight}
                      rx="6"
                      fill="rgba(0,0,0,0.01)"
                      pointerEvents="all"
                      onPointerDown={() => { targetWasTextRef.current = true; }}
                      onClick={(e) => {
                         e.stopPropagation();
                         handleTooltipClick();
                      }}
                      style={{ touchAction: 'none', cursor: 'pointer' }}
                    />
                    </g>
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
