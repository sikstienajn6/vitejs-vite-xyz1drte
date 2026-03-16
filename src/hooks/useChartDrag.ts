import { useState, useRef } from 'react';
import { HEIGHT_COMPRESSED, HEIGHT_EXPANDED, SNAP_THRESHOLD } from '../lib/constants';

export function useChartDrag() {
  const [chartHeight, setChartHeight] = useState(HEIGHT_COMPRESSED);

  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  // Track whether we've committed to dragging vs letting scroll through
  const pendingRef = useRef(false);
  const decidedRef = useRef(false);

  const cleanupListeners = () => {
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    window.removeEventListener('touchmove', handleDragMove);
    window.removeEventListener('touchend', handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent | TouchEvent) => {
    const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    const delta = clientY - startYRef.current;

    // On the first move, decide whether to capture the drag or let the browser scroll
    if (pendingRef.current && !decidedRef.current) {
      // Need a small threshold to reliably detect direction
      if (Math.abs(delta) < 3) return;

      decidedRef.current = true;
      const isExpanded = startHeightRef.current > SNAP_THRESHOLD;
      const swipingDown = delta > 0;
      const swipingUp = delta < 0;

      // Only capture drag in the meaningful direction:
      // - Minimized + swipe down → expand (capture)
      // - Expanded + swipe up → collapse (capture)
      // Otherwise let the browser handle the scroll
      const shouldCapture =
        (!isExpanded && swipingDown) ||  // minimized, pulling down to expand
        (isExpanded && swipingUp);        // expanded, pulling up to collapse

      if (!shouldCapture) {
        // Release — let native scroll happen
        pendingRef.current = false;
        cleanupListeners();
        return;
      }

      // Commit to dragging
      pendingRef.current = false;
      isDraggingRef.current = true;
      document.body.style.userSelect = 'none';
    }

    if (!isDraggingRef.current) return;

    if (e.cancelable) e.preventDefault();
    if (e.type === 'touchmove') e.stopImmediatePropagation();

    const newHeight = Math.max(HEIGHT_COMPRESSED, Math.min(HEIGHT_EXPANDED, startHeightRef.current + delta));
    setChartHeight(newHeight);
  };

  const handleDragEnd = () => {
    pendingRef.current = false;
    decidedRef.current = false;

    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      document.body.style.userSelect = '';

      setChartHeight(prev => {
        if (prev > SNAP_THRESHOLD) return HEIGHT_EXPANDED;
        return HEIGHT_COMPRESSED;
      });
    }

    cleanupListeners();
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    startYRef.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startHeightRef.current = chartHeight;
    decidedRef.current = false;

    if ('touches' in e) {
      // Touch: defer the decision until the first move
      pendingRef.current = true;
    } else {
      // Mouse: commit immediately (mouse users can scroll with wheel)
      pendingRef.current = false;
      isDraggingRef.current = true;
      document.body.style.userSelect = 'none';
    }

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

  return { chartHeight, handleDragStart, toggleExpand };
}
