"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, initGsap } from "@/lib/gsap";

const SESSION_KEY = "wat:preloader-shown";

export function Preloader() {
  const [visible, setVisible] = useState(false);
  const countRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    initGsap();

    const counter = { value: 0 };
    const tl = gsap.timeline({
      onComplete: () => setVisible(false),
    });

    tl.to(counter, {
      value: 100,
      duration: 1.1,
      ease: "power2.inOut",
      onUpdate: () => {
        if (countRef.current) countRef.current.textContent = String(Math.round(counter.value)).padStart(2, "0");
      },
    })
      .to(rootRef.current, { autoAlpha: 0, duration: 0.3, delay: 0.1 })
      .to(panelRef.current, { scaleY: 0, duration: 0.6, ease: "hop", transformOrigin: "top" }, "<");
  }, [visible]);

  if (!visible) return null;

  return (
    <div ref={rootRef} className="preloader" role="status" aria-label="Loading">
      <span ref={countRef} className="preloader__count">
        00
      </span>
      <div ref={panelRef} className="preloader__panel" />
    </div>
  );
}
