import { useLayoutEffect, useRef, useState } from "react";
import { buildRoundedRectPerimeterPath } from "./node-run-path";

const BORDER_INSET = 3;
const BORDER_RADIUS = 18;
const DOT_DURATION_S = 2.2;
const TRAIL_OFFSET_S = DOT_DURATION_S / 3;

export function NodeRunOverlay() {
  const overlayRef = useRef<HTMLSpanElement>(null);
  const pathId = useRef(`ef-node-run-${Math.random().toString(36).slice(2)}`).current;
  const [dims, setDims] = useState({ w: 230, h: 102 });

  useLayoutEffect(() => {
    const node = overlayRef.current?.parentElement;
    if (!node) return;

    const measure = () => {
      setDims({
        w: node.offsetWidth + BORDER_INSET * 2,
        h: node.offsetHeight + BORDER_INSET * 2,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const innerW = dims.w - BORDER_INSET * 2;
  const innerH = dims.h - BORDER_INSET * 2;
  const path = buildRoundedRectPerimeterPath(
    BORDER_INSET,
    BORDER_INSET,
    innerW,
    innerH,
    BORDER_RADIUS,
  );

  return (
    <span ref={overlayRef} className="ef-workflow-node__run-overlay" aria-hidden>
      <svg
        width={dims.w}
        height={dims.h}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="ef-workflow-node__run-svg"
      >
        <path
          id={pathId}
          d={path}
          fill="none"
          stroke="rgba(59, 130, 246, 0.22)"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle r={4.5} className="ef-node-runner-dot">
          <animateMotion
            dur={`${DOT_DURATION_S}s`}
            repeatCount="indefinite"
            path={path}
          />
        </circle>
        <circle r={3} className="ef-node-runner-dot ef-node-runner-dot--trail">
          <animateMotion
            dur={`${DOT_DURATION_S}s`}
            repeatCount="indefinite"
            path={path}
            begin={`${TRAIL_OFFSET_S}s`}
          />
        </circle>
      </svg>
    </span>
  );
}
