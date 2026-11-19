"use client";

import { useRef, type ReactNode, Children, isValidElement, cloneElement } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, SplitText, initGsap } from "@/lib/gsap";

type Props = {
  children: ReactNode;
  /** Reveal on scroll (default) or immediately on mount. */
  animateOnScroll?: boolean;
  delay?: number;
};

export function Copy({ children, animateOnScroll = true, delay = 0 }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const splits = useRef<SplitText[]>([]);

  useGSAP(
    () => {
      initGsap();
      const el = container.current;
      if (!el) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      let cancelled = false;

      const run = async () => {
        try {
          await document.fonts.ready;
        } catch {
          /* fonts API unavailable, proceed anyway */
        }
        await new Promise((r) => setTimeout(r, 60));
        if (cancelled || !container.current) return;

        splits.current = [];
        const lines: Element[] = [];

        const targets = container.current.hasAttribute("data-copy-wrapper")
          ? Array.from(container.current.children)
          : [container.current];

        targets.forEach((target) => {
          const split = SplitText.create(target as HTMLElement, {
            type: "lines",
            mask: "lines",
            linesClass: "line++",
          });
          splits.current.push(split);
          lines.push(...split.lines);
        });

        gsap.set(lines, { y: "100%" });

        const vars: gsap.TweenVars = {
          y: "0%",
          duration: 1,
          stagger: 0.1,
          ease: "power4.out",
          delay,
        };

        if (animateOnScroll) {
          gsap.to(lines, {
            ...vars,
            scrollTrigger: { trigger: container.current, start: "top 90%", once: true },
          });
        } else {
          gsap.to(lines, vars);
        }
      };

      run();

      return () => {
        cancelled = true;
        splits.current.forEach((s) => s.revert());
        splits.current = [];
      };
    },
    { scope: container, dependencies: [animateOnScroll, delay] },
  );

  const items = Children.toArray(children);
  if (items.length === 1 && isValidElement(items[0])) {
    return cloneElement(items[0] as React.ReactElement<{ ref?: unknown }>, { ref: container });
  }

  return (
    <div ref={container} data-copy-wrapper="true">
      {children}
    </div>
  );
}
