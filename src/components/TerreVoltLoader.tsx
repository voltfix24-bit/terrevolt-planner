// TerreVoltLoader.tsx — plaats in src/components/ en gebruik: <TerreVoltLoader size={64} />
type Props = { size?: number; label?: string; className?: string };

const css = `
.tv-bolt{transform-box:fill-box;transform-origin:50% 50%;animation:tv-strike 4.8s infinite}
.tv-fill{animation:tv-charge 4.8s infinite}
.tv-ground{transform-box:fill-box;transform-origin:50% 0%;animation:tv-sink 4.8s infinite}
.tv-g{opacity:.3;animation:tv-glow 4.8s infinite}
@keyframes tv-charge{0%{transform:translateY(340px);opacity:1;animation-timing-function:cubic-bezier(.65,0,.35,1)}18%{transform:translateY(0);opacity:1}82%{transform:translateY(0);opacity:1}92%{transform:translateY(0);opacity:0}92.1%{transform:translateY(340px);opacity:0}100%{transform:translateY(340px);opacity:1}}
@keyframes tv-strike{0%{transform:none;animation-timing-function:cubic-bezier(.4,0,.6,1)}14%,35%,56%{transform:translateY(-18px) rotate(-4deg) scale(.96,1.03);animation-timing-function:cubic-bezier(.7,0,1,.5)}21%,42%,63%{transform:translateY(10px) rotate(3deg) scale(1.07,.93);animation-timing-function:cubic-bezier(0,.5,.5,1)}25%,46%,67%{transform:translateY(-3px) rotate(-1deg) scale(.98,1.02);animation-timing-function:cubic-bezier(.4,0,.6,1)}28%,49%,70%{transform:none;animation-timing-function:cubic-bezier(.4,0,.6,1)}100%{transform:none}}
@keyframes tv-sink{0%,20.9%{transform:none}22.5%{transform:translateY(25px) scale(1.3,.85)}27%,41.9%{transform:translateY(22px) scaleX(1.15)}43.5%{transform:translateY(47px) scale(1.45,.85)}48%,62.9%{transform:translateY(44px) scaleX(1.3)}64.5%{transform:translateY(69px) scale(1.6,.85)}69%,90%{transform:translateY(66px) scaleX(1.45)}92%,100%{transform:none}}
@keyframes tv-glow{0%,20.9%{opacity:.3}22%,82%{opacity:1}90%,92%{opacity:0}100%{opacity:.3}}
@media (prefers-reduced-motion:reduce){.tv-bolt,.tv-ground{animation:none}}
.tv-stem{stroke-dasharray:21 300;animation:tv-drive 4.8s infinite,tv-glow 4.8s infinite}
@keyframes tv-drive{0%,20.9%{stroke-dasharray:21 300}22.5%{stroke-dasharray:46 300}27%,41.9%{stroke-dasharray:43 300}43.5%{stroke-dasharray:68 300}48%,62.9%{stroke-dasharray:65 300}64.5%{stroke-dasharray:90 300}69%,90%{stroke-dasharray:87 300}92%,100%{stroke-dasharray:21 300}}
@media (prefers-reduced-motion:reduce){.tv-stem{animation:none}}
`;

const BOLT =
  "M235 166 L244 167 L252 173 L255 187 L224 280 L331 282 L340 288 L344 296 L344 308 L338 319 L240 418 L181 477 L175 480 L163 479 L155 472 L153 461 L187 357 L87 356 L76 348 L72 338 L77 320 L227 169 L234 167 Z M217 216 L196 281 L198 296 L204 303 L214 308 L312 308 L203 419 L191 429 L215 359 L215 345 L207 334 L197 330 L104 330 L216 217 Z";

export default function TerreVoltLoader({ size = 64, label = "Laden…", className }: Props) {
  return (
    <div role="status" aria-label={label} className={className} style={{ display: "inline-flex" }}>
      <style>{css}</style>
      <svg width={size} height={size} viewBox="27 125 400 450" style={{ overflow: "visible" }} aria-hidden="true">
        <defs>
          <clipPath id="tv-clip">
            <path d={BOLT} clipRule="evenodd" />
          </clipPath>
        </defs>
        <g className="tv-bolt">
          <path d={BOLT} fillRule="evenodd" fill="#18A84A" opacity={0.2} />
          <g clipPath="url(#tv-clip)">
            <rect className="tv-fill" x={47} y={160} width={360} height={330} fill="#18A84A" />
          </g>
        </g>
        <path className="tv-stem" d="M334 385 L334 480" stroke="#F5B400" strokeLinecap="round" fill="none" strokeWidth={19} />
        <g className="tv-ground" stroke="#F5B400" strokeLinecap="round" fill="none">
                    <path className="tv-g" d="M295 424 L373 424" strokeWidth={18} />
          <path className="tv-g" d="M310 450 L358 450" strokeWidth={18} />
          <path className="tv-g" d="M331 477 L337 477" strokeWidth={18} />
        </g>
      </svg>
    </div>
  );
}
