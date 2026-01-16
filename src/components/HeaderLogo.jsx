import { useEffect, useMemo, useState } from "react";

export default function HeaderLogo({
  src,
  alt,
  size = 180,
  fallbackSrc,
  className = "",
  style,
  loading = "lazy",
  referrerPolicy = "no-referrer",
} = {}) {
  const resolvedFallback = String(fallbackSrc ?? "").trim() || null;
  const resolvedSrc = String(src ?? "").trim() || resolvedFallback || "";
  const [currentSrc, setCurrentSrc] = useState(resolvedSrc);

  useEffect(() => {
    setCurrentSrc(resolvedSrc);
  }, [resolvedSrc]);

  const mergedStyle = useMemo(() => {
    const n = Number(size);
    const px = Number.isFinite(n) && n > 0 ? n : 180;
    return {
      width: px,
      height: px,
      objectFit: "contain",
      ...style,
    };
  }, [size, style]);

  return (
    <img
      src={currentSrc}
      alt={alt || "Logo"}
      className={`headerLogoImg${className ? ` ${className}` : ""}`}
      style={mergedStyle}
      loading={loading}
      referrerPolicy={referrerPolicy}
      onError={(e) => {
        if (!resolvedFallback) return;
        if (currentSrc === resolvedFallback) return;
        e.currentTarget.src = resolvedFallback;
        setCurrentSrc(resolvedFallback);
      }}
    />
  );
}
