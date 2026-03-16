import { useState, useRef, useEffect } from 'react';
import { HEIGHT_COMPRESSED, HEIGHT_EXPANDED, SNAP_THRESHOLD } from '../lib/constants';

export function useChartDrag() {
  const [chartHeight, setChartHeightState] = useState(HEIGHT_COMPRESSED);
  const currentHeightRef = useRef(HEIGHT_COMPRESSED);

  const setChartHeight = (val: number | ((prev: number) => number)) => {
    if (typeof val === 'function') {
      setChartHeightState(prev => {
        const next = val(prev);
        currentHeightRef.current = next;
        return next;
      });
    } else {
      currentHeightRef.current = val;
      setChartHeightState(val);
    }
  };

  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const pendingRef = useRef(false);
  const decidedRef = useRef(false);
  
  const animationRef = useRef<number | null>(null);

  const stopAnimation = () => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopAnimation();
      cleanupListeners();
    };
  }, []);

  const cleanupListeners = () => {
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    window.removeEventListener('touchmove', handleDragMove);
    window.removeEventListener('touchend', handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent | TouchEvent) => {
    const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    const delta = clientY - startYRef.current;

    if (pendingRef.current && !decidedRef.current) {
      if (Math.abs(delta) < 3) return;

      decidedRef.current = true;
      const isExpanded = startHeightRef.current > SNAP_THRESHOLD;
      const swipingDown = delta > 0;
      const swipingUp = delta < 0;

      const shouldCapture =
        (!isExpanded && swipingDown) || 
        (isExpanded && swipingUp);

      if (!shouldCapture) {
        pendingRef.current = false;
        cleanupListeners();
        return;
      }

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
    stopAnimation();
    startYRef.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startHeightRef.current = currentHeightRef.current;
    decidedRef.current = false;

    if ('touches' in e) {
      pendingRef.current = true;
    } else {
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
      stopAnimation();
      
      const startHeight = currentHeightRef.current;
      const targetHeight = startHeight > SNAP_THRESHOLD ? HEIGHT_COMPRESSED : HEIGHT_EXPANDED;
      
      const duration = 250;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // easeInOutQuad
        const ease = progress < 0.5 
          ? 2 * progress * progress 
          : -1 + (4 - 2 * progress) * progress;

        const nextHeight = startHeight + (targetHeight - startHeight) * ease;
        setChartHeight(nextHeight);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          animationRef.current = null;
        }
      };
      
      animationRef.current = requestAnimationFrame(animate);
    }
  };

  return { chartHeight, handleDragStart, toggleExpand };
}
