"use client";

/**
 * useScrollLock — freeze background scrolling while a modal / sheet is open.
 *
 * Locks every scroll container that can actually move behind an overlay:
 *   • the document scroller (html/body) via the position:fixed technique,
 *     which also keeps the visible scroll position and restores it on close;
 *   • the nearest scrollable ancestor of the mounting node (the dashboard
 *     shell scrolls in an inner `overflow-y-auto` div, so locking only
 *     body/html would leave the page behind the modal scrolling on
 *     desktop wheel / keyboard input).
 *
 * Pair with `overscroll-contain` on the modal's own scroll area so the
 * background can't be dragged along when the sheet hits its scroll bounds.
 */

import { useEffect, useRef } from "react";

export function useScrollLock(active = true) {
  // Ref (not state) so callers can invoke the hook unconditionally and
  // toggle `active` freely without re-plumbing render logic.
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;

    const restoreY = window.scrollY;
    const { documentElement: html, body } = document;
    const prev = {
      position: html.style.position,
      top: html.style.top,
      left: html.style.left,
      right: html.style.right,
      width: html.style.width,
      overflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
    };
    html.style.position = "fixed";
    html.style.top = `-${restoreY}px`;
    html.style.left = "0";
    html.style.right = "0";
    html.style.width = "100%";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    // Walk up from the modal's mount point and lock any scrollable ancestor
    // (the dashboard content wrapper is `flex-1 overflow-y-auto`). Fixed/
    // absolute nodes are part of the overlay itself — skip past them.
    const locked: Array<{ el: HTMLElement; prevOverflow: string }> = [];
    let node = nodeRef.current?.parentElement ?? null;
    while (node) {
      const pos = getComputedStyle(node).position;
      if (pos === "fixed" || pos === "absolute") {
        node = node.parentElement;
        continue;
      }
      if (node.scrollHeight > node.clientHeight + 1) {
        const style = getComputedStyle(node);
        if (/auto|scroll/.test(style.overflowY)) {
          locked.push({ el: node, prevOverflow: node.style.overflowY });
          node.style.overflowY = "hidden";
        }
      }
      node = node.parentElement;
    }

    return () => {
      html.style.position = prev.position;
      html.style.top = prev.top;
      html.style.left = prev.left;
      html.style.right = prev.right;
      html.style.width = prev.width;
      html.style.overflow = prev.overflow;
      body.style.overflow = prev.bodyOverflow;
      window.scrollTo(0, restoreY);
      for (const { el, prevOverflow } of locked) el.style.overflowY = prevOverflow;
    };
  }, [active]);

  return nodeRef;
}
