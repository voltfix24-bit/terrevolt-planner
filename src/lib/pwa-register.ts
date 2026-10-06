// Enige plek waar de app-service-worker wordt geregistreerd.
// Nooit in dev, Lovable-preview, iframes of met ?sw=off — daar worden bestaande registraties opgeruimd.

const SW_PATH = "/sw.js";

export function isServiceWorkerAllowed(loc: { hostname: string; search: string }, opts: { prod: boolean; inIframe: boolean }): boolean {
  if (!opts.prod || opts.inIframe) return false;
  const h = loc.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return false;
  const blocked = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];
  if (blocked.some((d) => h === d || h.endsWith(`.${d}`))) return false;
  if (new URLSearchParams(loc.search).get("sw") === "off") return false;
  return true;
}

async function unregisterAppWorkers() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.filter((r) => [r.active, r.waiting, r.installing].some((w) => w?.scriptURL.endsWith(SW_PATH))).map((r) => r.unregister()));
}

export function registerAppServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  let inIframe = true;
  try { inIframe = window.self !== window.top; } catch { inIframe = true; }
  if (!isServiceWorkerAllowed(window.location, { prod: import.meta.env.PROD, inIframe })) {
    void unregisterAppWorkers().catch(() => undefined);
    return;
  }
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(SW_PATH, { scope: "/" }).catch((error) => console.warn("Service worker niet geregistreerd", error));
  });
}
