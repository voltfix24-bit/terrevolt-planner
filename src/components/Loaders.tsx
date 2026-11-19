import { useState, type ImgHTMLAttributes } from "react";
import TerreVoltLoader from "@/components/TerreVoltLoader";

/** Hele pagina/route: 80px, gecentreerd, transparante achtergrond. */
export function PageLoader({ label }: { label?: string }) {
  return <div className="flex min-h-[60vh] w-full items-center justify-center"><TerreVoltLoader size={80} label={label} /></div>;
}

/** Blok of kaart: 48px, gecentreerd in het blok. */
export function BlockLoader({ label, className = "py-12" }: { label?: string; className?: string }) {
  return <div className={`flex w-full items-center justify-center ${className}`}><TerreVoltLoader size={48} label={label} /></div>;
}

/** Knop tijdens versturen: 20px. */
export function ButtonLoader({ label }: { label?: string }) {
  return <TerreVoltLoader size={20} label={label} className="shrink-0" />;
}

/** Afbeelding met neutrale placeholder en 40px-loader tot hij geladen is. */
export function LoadingImage({ className, style, onLoad, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  return <span className="relative block" style={{ minHeight: loaded ? undefined : 80 }}>
    {!loaded && <span className="absolute inset-0 flex items-center justify-center rounded bg-muted/40"><TerreVoltLoader size={40} /></span>}
    <img {...props} className={className} style={{ ...style, opacity: loaded ? 1 : 0 }}
      onLoad={(e) => { setLoaded(true); onLoad?.(e); }} onError={(e) => { setLoaded(true); onError?.(e); }} />
  </span>;
}
