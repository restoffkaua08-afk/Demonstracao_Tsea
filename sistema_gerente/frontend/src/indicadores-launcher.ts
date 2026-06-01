import "./indicadores-launcher.css";

function createIndicatorsButton() {
  if (document.getElementById("tsea-indicadores-launcher")) return;

  const link = document.createElement("a");
  link.id = "tsea-indicadores-launcher";
  link.href = "/indicadores.html";
  link.textContent = "INDICADORES E GRÁFICOS";
  link.title = "Abrir análise estatística, gráficos e rampa de vácuo";
  document.body.appendChild(link);
}

function tryAttachToTraceabilityMenu() {
  const candidates = Array.from(document.querySelectorAll("button, a, [role='button'], nav *"));

  const rastreabilidadeItem = candidates.find((element) => {
    const text = (element.textContent || "").toUpperCase();
    return text.includes("RASTREABILIDADE") || text.includes("HISTÓRICO") || text.includes("HISTORICO");
  });

  if (!rastreabilidadeItem) return;

  const parent = rastreabilidadeItem.parentElement;

  if (!parent || parent.querySelector("[data-tsea-indicadores-menu='true']")) return;

  const item = document.createElement("a");
  item.dataset.tseaIndicadoresMenu = "true";
  item.href = "/indicadores.html";
  item.textContent = "Indicadores e Gráficos";
  item.className = "tsea-indicadores-menu-item";
  parent.appendChild(item);
}

function boot() {
  createIndicatorsButton();
  tryAttachToTraceabilityMenu();

  const observer = new MutationObserver(() => {
    createIndicatorsButton();
    tryAttachToTraceabilityMenu();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}