"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger, initGsap } from "@/lib/gsap";

/**
 * Pinned card stack from the source motion system, scoped to short, bounded
 * lists (e.g. a top-5 fixes list) read top to bottom — not used on anything
 * of arbitrary length, where pinning would fight scanning/scrolling.
 */
export function PinnedStack({ children }: { children: ReactNode[] }) {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      initGsap();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const el = container.current;
      if (!el) return;

      const cards = Array.from(el.children) as HTMLElement[];
      if (cards.length < 2) return;

      cards.forEach((card, i) => {
        card.style.transformOrigin = "top center";
        if (i === cards.length - 1) return;

        ScrollTrigger.create({
          trigger: card,
          start: "top top+=72",
          endTrigger: cards[cards.length - 1],
          end: "top top+=72",
          pin: card,
          pinSpacing: false,
        });

        gsap.to(card, {
          scale: 0.94,
          filter: "brightness(0.85)",
          ease: "none",
          scrollTrigger: { trigger: cards[i + 1], start: "top top+=72", end: "top top-=40", scrub: true },
        });
      });
    },
    { scope: container },
  );

  return (
    <div ref={container} className="flex flex-col gap-3">
      {children}
    </div>
  );
}
