import { useState, useRef } from 'react';
import { HEIGHT_COMPRESSED, HEIGHT_EXPANDED, SNAP_THRESHOLD } from '../lib/constants';

export function useChartDrag() {
  const [chartHeight, setChartHeight] = useState(HEIGHT_COMPRESSED);
  const [isDragging, setIsDragging] = useState(false);

  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleDragMove = (e: MouseEvent | TouchEvent) => {
    if (!isDraggingRef.current) return;

    if (e.cancelable) e.preventDefault();
    if (e.type === 'touchmove') e.stopImmediatePropagation();

    const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    const delta = clientY - startYRef.current;

    const newHeight = Math.max(HEIGHT_COMPRESSED, Math.min(HEIGHT_EXPANDED, startHeightRef.current + delta));
    setChartHeight(newHeight);
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    document.body.style.userSelect = '';

    setChartHeight(prev => {
      if (prev > SNAP_THRESHOLD) return HEIGHT_EXPANDED;
      return HEIGHT_COMPRESSED;
    });

    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    window.removeEventListener('touchmove', handleDragMove);
    window.removeEventListener('touchend', handleDragEnd);
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    isDraggingRef.current = true;
    startYRef.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startHeightRef.current = chartHeight;

    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('touchend', handleDragEnd);
  };

  const toggleExpand = () => {
    if (!isDraggingRef.current) {
      setChartHeight(prev => prev > SNAP_THRESHOLD ? HEIGHT_COMPRESSED : HEIGHT_EXPANDED);
    }
  };

  return { chartHeight, isDragging, handleDragStart, toggleExpand };
}
