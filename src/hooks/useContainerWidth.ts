import { useState, useRef, useLayoutEffect } from 'react';

export function useContainerWidth(deps: any[] = []) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, deps);

  return { containerRef, containerWidth };
}
