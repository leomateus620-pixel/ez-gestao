import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerAppRecoveryHandlers } from "./lib/app-recovery";
import "./index.css";

function renderFatalFallback(message: string) {
  const el = document.getElementById("root");
  if (!el) return;
  el.innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-family:system-ui,-apple-system,sans-serif;padding:24px;text-align:center;color:#1f2937;background:#fffbf5">
      <div style="font-size:18px;font-weight:600">Não foi possível iniciar o app</div>
      <div style="font-size:13px;color:#6b7280;max-width:420px">${message}</div>
      <button onclick="try{Object.keys(localStorage).filter(k=>k.startsWith('sb-')).forEach(k=>localStorage.removeItem(k))}catch(e){};location.reload()" style="margin-top:8px;padding:10px 18px;border-radius:10px;background:#FA7602;color:#fff;border:none;font-weight:600;cursor:pointer">Recarregar</button>
    </div>`;
}

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    console.error("[boot] #root element not found");
  } else {
    rootEl.setAttribute("data-app-mounted", "1");
    createRoot(rootEl).render(<App />);
  }
} catch (err) {
  console.error("[boot] fatal render error", err);
  renderFatalFallback((err as Error)?.message ?? "Erro inesperado ao carregar a interface.");
}

window.addEventListener("error", (event) => {
  if (!document.getElementById("root")?.children.length) {
    renderFatalFallback(event.message || "Erro inesperado durante o carregamento.");
  }
});
