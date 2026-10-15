// @ts-check
import { el } from "./dom.js";
import { t } from "./i18n.js";
import { dropSide } from "./panes.js";

/**
 * Dragging a tab with Pointer Events (no HTML5 drag and drop). A mouse starts after 6 px; touch and pen after a long press of 450 ms (before that the finger scrolls the bar).
 * Over the bar an insertion line shows where the tab goes (= reorder); over the work area five zones show what the drop does (four sides = put beside, centre = show there).
 * Esc cancels. The keyboard and the menu of the tab do the same things without this.
 * @typedef {import("./actions.js").Ctx} Ctx
 * @typedef {import("./panes.js").Side} Side
 * @typedef {{ id: string, btn: HTMLElement, type: string, x0: number, y0: number, x: number, y: number, active: boolean, moved: boolean, timer: number, ghost: HTMLElement | null, line: HTMLElement | null, zones: HTMLElement | null, drop: Drop | null }} Gesture
 * @typedef {{ kind: "bar", index: number } | { kind: "zone", side: Side, target: string | undefined }} Drop
 */

const MOUSE_PX = 6;
const TOUCH_SLOP_PX = 8;
const LONG_PRESS_MS = 450;
const SIDES = /** @type {Side[]} */ (["left", "right", "top", "bottom", "center"]);
const AREAS = { left: [0, 0, 25, 100], right: [75, 0, 25, 100], top: [25, 0, 50, 25], bottom: [25, 75, 50, 25], center: [25, 25, 50, 50] };

/** @param {Side} side @returns {string} */
function zoneText(side) {
  if (side === "left") return t("tabs.split.drop.left");
  if (side === "right") return t("tabs.split.drop.right");
  if (side === "top") return t("tabs.split.drop.top");
  if (side === "bottom") return t("tabs.split.drop.bottom");
  return t("tabs.split.drop.center");
}

/** @param {string} text */
function say(text) {
  const live = document.getElementById("status");
  if (!live) return;
  live.textContent = "";
  setTimeout(() => (live.textContent = text), 50);
}

/** The place a drop at a point would have: a slot of the bar, a zone of the pane under the pointer, or nothing. @param {HTMLElement} list @param {number} x @param {number} y @param {string} id @param {import("./state.js").AppState} s @returns {{ drop: Drop | null, rect: DOMRect | null, slotX: number }} */
function locate(list, x, y, id, s) {
  const bar = /** @type {HTMLElement} */ (list.parentElement).getBoundingClientRect();
  if (y >= bar.top - 8 && y <= bar.bottom + 8 && x >= bar.left && x <= bar.right) {
    const others = [...list.querySelectorAll("button")].filter((b) => b.dataset.tab !== id);
    const index = others.filter((b) => b.getBoundingClientRect().left + b.offsetWidth / 2 < x).length;
    const edge = index === 0 ? others[0]?.getBoundingClientRect().left : others[index - 1].getBoundingClientRect().right;
    return { drop: { kind: "bar", index }, rect: bar, slotX: edge ?? bar.left };
  }
  const host = document.getElementById("panes");
  if (!host) return { drop: null, rect: null, slotX: 0 };
  const boxes = s.split.panes.length >= 2 ? [...host.querySelectorAll(".split-pane:not([hidden])")] : [];
  const box = boxes.find((b) => dropSide(b.getBoundingClientRect(), x, y) !== null);
  const target = /** @type {HTMLElement} */ (box ?? host);
  const rect = target.getBoundingClientRect();
  const side = dropSide(rect, x, y);
  return { drop: side ? { kind: "zone", side, target: box ? /** @type {HTMLElement} */ (box).dataset.tab : undefined } : null, rect, slotX: 0 };
}

/** The five zones over a rectangle, the one the drop would use marked. @param {HTMLElement} zones @param {DOMRect} rect @param {Side | null} on */
function paintZones(zones, rect, on) {
  Object.assign(zones.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  if (zones.childElementCount === 0) {
    for (const side of SIDES) {
      const [l, tp, w, h] = AREAS[side];
      zones.append(el("div", { class: "drop-zone", "data-side": side, style: `left:${l}%;top:${tp}%;width:${w}%;height:${h}%` }, [el("span", { class: "drop-label" }, [zoneText(side)])]));
    }
  }
  for (const z of /** @type {HTMLElement[]} */ ([...zones.children])) z.toggleAttribute("data-active", z.dataset.side === on);
}

const blockScroll = (/** @type {Event} */ e) => e.cancelable && e.preventDefault();

/** Shows the ghost and the place the drop would have at the pointer. @param {HTMLElement} list @param {Ctx} ctx @param {Gesture} gesture */
function over(list, ctx, gesture) {
  const { x, y } = gesture;
  if (gesture.ghost) Object.assign(gesture.ghost.style, { left: `${x + 12}px`, top: `${y + 12}px` });
  const at = locate(list, x, y, gesture.id, ctx.getState());
  gesture.drop = at.drop;
  if (at.drop?.kind === "bar") {
    gesture.zones?.remove();
    gesture.zones = null;
    gesture.line ??= document.body.appendChild(el("div", { class: "tab-insert", "aria-hidden": "true" }));
    Object.assign(gesture.line.style, { left: `${at.slotX - 1}px`, top: `${at.rect?.top}px`, height: `${at.rect?.height}px` });
    return;
  }
  gesture.line?.remove();
  gesture.line = null;
  if (!at.rect) return void (gesture.zones?.remove(), (gesture.zones = null));
  gesture.zones ??= document.body.appendChild(el("div", { class: "drop-zones", "aria-hidden": "true" }));
  paintZones(gesture.zones, at.rect, at.drop?.kind === "zone" ? at.drop.side : null);
}

/** The drag starts: capture the pointer, make the ghost. @param {HTMLElement} list @param {Ctx} ctx @param {Gesture} gesture @param {number} pointerId */
function begin(list, ctx, gesture, pointerId) {
  gesture.active = true;
  try {
    list.setPointerCapture(pointerId);
  } catch {
    // a synthetic pointer cannot be captured: the document listeners still get its events
  }
  const label = gesture.btn.querySelector(".tab-code")?.textContent ?? gesture.id;
  gesture.ghost = el("div", { class: "tab-ghost", "aria-hidden": "true" }, [label]);
  document.body.append(gesture.ghost);
  document.body.dataset.tabDrag = "1";
  document.addEventListener("touchmove", blockScroll, { passive: false });
  over(list, ctx, gesture);
}

/** Stops the click that ends a drag and the context menu of a touch gesture. @param {HTMLElement} list @param {() => boolean} touching @returns {() => void} `hold`: the next click is the end of a drag, swallow it */
function guardEvents(list, touching) {
  let suppress = false;
  list.addEventListener("click", (e) => {
    if (!suppress) return;
    e.stopPropagation();
    e.preventDefault();
    suppress = false;
  }, true);
  list.addEventListener("contextmenu", (e) => {
    if (touching()) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  return () => {
    suppress = true;
    setTimeout(() => (suppress = false), 80);
  };
}

/** @param {HTMLElement} btn @param {string} id @param {PointerEvent} e @returns {Gesture} */
function newGesture(btn, id, e) {
  return { id, btn, type: e.pointerType, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, moved: false, timer: 0, ghost: null, line: null, zones: null, drop: null };
}

/**
 * @param {HTMLElement} list the tab list
 * @param {Ctx} ctx
 * @param {(id: string, x: number, y: number) => void} menu opens the menu of a tab (a long press that does not move)
 */
export function attachTabDrag(list, ctx, menu) {
  /** @type {Gesture | null} */
  let g = null;
  let pointerId = 0;
  const hold = guardEvents(list, () => g !== null && g.type !== "mouse");

  /** @param {Gesture} gesture */
  const clean = (gesture) => {
    clearTimeout(gesture.timer);
    gesture.ghost?.remove();
    gesture.line?.remove();
    gesture.zones?.remove();
    delete document.body.dataset.tabDrag;
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("pointercancel", cancel, true);
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("touchmove", blockScroll);
    g = null;
  };

  /** @param {PointerEvent} e */
  function move(e) {
    if (!g || e.pointerId !== pointerId) return;
    g.x = e.clientX;
    g.y = e.clientY;
    const far = Math.hypot(g.x - g.x0, g.y - g.y0);
    if (!g.active) {
      if (g.type === "mouse" && far >= MOUSE_PX) begin(list, ctx, g, pointerId);
      else if (g.type !== "mouse" && far > TOUCH_SLOP_PX) return clean(g);
      if (!g?.active) return;
    }
    g.moved = g.moved || far >= MOUSE_PX;
    e.preventDefault();
    over(list, ctx, g);
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (!g || e.pointerId !== pointerId) return;
    const gesture = g;
    if (!gesture.active) return clean(gesture);
    hold();
    const { drop, id, moved, x, y } = gesture;
    clean(gesture);
    if (!moved && gesture.type !== "mouse") return menu(id, x, y);
    if (drop?.kind === "bar") ctx.moveTab(id, drop.index);
    else if (drop?.kind === "zone") ctx.splitTab(id, drop.side, drop.target);
  }

  function cancel() {
    if (!g) return;
    const wasActive = g.active;
    clean(g);
    if (wasActive) say(t("tabs.split.drag_cancelled"));
  }

  /** @param {KeyboardEvent} e */
  function key(e) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    cancel(), hold();
  }

  list.addEventListener("pointerdown", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const btn = target.closest("button");
    if (g || !btn || target.closest(".tab-close") || (e.pointerType === "mouse" && e.button !== 0) || !btn.dataset.tab) return;
    pointerId = e.pointerId;
    g = newGesture(btn, btn.dataset.tab, e);
    const started = g;
    if (e.pointerType !== "mouse") started.timer = window.setTimeout(() => g === started && begin(list, ctx, started, pointerId), LONG_PRESS_MS);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("keydown", key, true);
  });
}
