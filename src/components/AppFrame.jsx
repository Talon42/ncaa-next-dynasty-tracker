import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const DESIGN_WIDTH = 1440;

function clampScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(n, 1);
}

function getViewportWidth() {
  if (typeof window === "undefined") return DESIGN_WIDTH;
  const vv = window.visualViewport?.width;
  if (Number.isFinite(vv) && vv > 0) return vv;
  const cw = document.documentElement?.clientWidth;
  if (Number.isFinite(cw) && cw > 0) return cw;
  return window.innerWidth || DESIGN_WIDTH;
}

function getInitialScale() {
  return clampScale(getViewportWidth() / DESIGN_WIDTH);
}

export default function AppFrame({ children }) {
  const frameRef = useRef(null);
  const [scale, setScale] = useState(getInitialScale);
  const [frameHeight, setFrameHeight] = useState(0);

  const scaledStageStyle = useMemo(() => {
    const s = clampScale(scale);
    return {
      width: `${Math.round(DESIGN_WIDTH * s)}px`,
      height: `${Math.round(Math.max(0, frameHeight) * s)}px`,
    };
  }, [scale, frameHeight]);

  useEffect(() => {
    const updateScale = () => {
      setScale(clampScale(getViewportWidth() / DESIGN_WIDTH));
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateScale);
    }
    return () => {
      window.removeEventListener("resize", updateScale);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateScale);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => {
      // `scrollHeight`/`offsetHeight` are NOT affected by CSS transforms, which is what we want.
      const next = frame.scrollHeight || frame.offsetHeight || 0;
      setFrameHeight(next);
    };

    // Measure after first layout so we don't lock stage height to 0.
    const raf = requestAnimationFrame(measure);

    if (typeof ResizeObserver === "undefined") return () => cancelAnimationFrame(raf);
    const ro = new ResizeObserver(() => measure());
    ro.observe(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scale]);

  return (
    <div className="appFrameOuter">
      <div className="appFrameStage" style={scaledStageStyle}>
        <div
          ref={frameRef}
          className="appFrame"
          data-scaled={clampScale(scale) < 1}
          style={{
            transform: `scale(${clampScale(scale)})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
