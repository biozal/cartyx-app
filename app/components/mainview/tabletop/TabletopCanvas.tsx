import { useEffect, useState, type RefObject } from 'react';
import { DefaultGrid } from './DefaultGrid';
import type { TabletopScreenDetailData } from '~/types/tabletop';

interface TabletopCanvasProps {
  screen: TabletopScreenDetailData | null;
  containerRef: RefObject<HTMLDivElement | null>;
}

export function TabletopCanvas({ screen, containerRef }: TabletopCanvasProps) {
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateDimensions = () => {
      setDimensions({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };

    updateDimensions();

    const observer = new ResizeObserver(() => {
      updateDimensions();
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  const gridStyle = screen?.gridStyle ?? 'dark';
  const gridSize = screen?.gridSize ?? 50;
  const gridVisible = screen?.gridVisible ?? true;

  return (
    <div className="absolute inset-0" data-testid="tabletop-canvas">
      <DefaultGrid
        width={dimensions.width}
        height={dimensions.height}
        gridStyle={gridStyle}
        gridSize={gridSize}
        gridVisible={gridVisible}
      />
    </div>
  );
}
