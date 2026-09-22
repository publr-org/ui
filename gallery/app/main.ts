// The gallery entry: icons, the CSS engine, then the shell, re-rendered whole
// on every state update. Demos live in their own frames (see preview.ts).
import { mount } from "publr/dom";
import { component } from "publr-jsx";
import { startEngine } from "./runtime/engine";
import { App } from "./views/App.ptsx";
import { clearHoverPreview } from "./views/Sidebar.ptsx";
import { closeAllPanels, installPanelListeners, positionPanels } from "./views/canvas/Panel.ptsx";
import { installFrameListener } from "./frames/previews";
import { onUpdate, parseRoute, revealComponent, state } from "./state/gallery";

await startEngine("./runtime/jit_engine.wasm");

const root = document.getElementById("gallery")!;
let dispose: (() => void) | null = null;

function render(): void {
  const navigation = root.querySelector<HTMLElement>("[data-gallery-navigation]");
  const main = root.querySelector<HTMLElement>("[data-gallery-main]");
  const navigationScroll = navigation?.scrollTop ?? 0;
  const mainScroll = main?.scrollTop ?? 0;
  clearHoverPreview();
  dispose?.();
  root.replaceChildren();
  dispose = mount(root, () => component(App, {}), {});
  const nextNavigation = root.querySelector<HTMLElement>("[data-gallery-navigation]");
  const nextMain = root.querySelector<HTMLElement>("[data-gallery-main]");
  if (nextNavigation) nextNavigation.scrollTop = navigationScroll;
  if (nextMain) nextMain.scrollTop = mainScroll;
  positionPanels();
}

onUpdate(render);
installPanelListeners();
installFrameListener({
  canvasPointerDown: closeAllPanels,
  apiHtml: (entry, html) => {
    if (state.renderedHtml.get(entry) === html) return;
    state.renderedHtml.set(entry, html);
    const code = root.querySelector<HTMLElement>("[data-api-source-html]");
    if (code && state.route.kind === "component" && state.route.name === entry) code.textContent = html;
  },
});
addEventListener("hashchange", () => {
  state.canvasPanels = [];
  state.route = parseRoute(location.hash);
  if (state.route.kind === "component") revealComponent(state.route.name);
  render();
});
addEventListener("keydown", (event) => {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, textarea, [contenteditable]")) return;
  event.preventDefault();
  document.getElementById("g-search")?.focus();
});
if (state.route.kind === "component") revealComponent(state.route.name);
render();
