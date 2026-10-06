import { useState } from "react";

export function useMobileSlide() {
  const [transition, setTransition] = useState({ key: 0, direction: 0 });
  return {
    slide: (direction: number) => setTransition((prev) => ({ key: prev.key + 1, direction })),
    transitionKey: transition.key,
    transitionClass: transition.direction === 0 ? "" : `motion-safe:animate-in motion-safe:duration-150 ${transition.direction > 0 ? "motion-safe:slide-in-from-right-4" : "motion-safe:slide-in-from-left-4"}`,
  };
}