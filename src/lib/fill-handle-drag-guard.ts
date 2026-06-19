const FILL_HANDLE_TITLE = "Sleep om door te trekken (zoals in Excel)";

let fillHandleActive = false;

function isFillHandleTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(`[title="${FILL_HANDLE_TITLE}"]`));
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "mousedown",
    (event) => {
      fillHandleActive = isFillHandleTarget(event.target);
    },
    true,
  );

  document.addEventListener(
    "touchstart",
    (event) => {
      fillHandleActive = isFillHandleTarget(event.target);
    },
    true,
  );

  document.addEventListener(
    "dragstart",
    (event) => {
      if (!fillHandleActive && !isFillHandleTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  const clearFillHandleActive = () => {
    fillHandleActive = false;
  };

  window.addEventListener("mouseup", clearFillHandleActive, true);
  window.addEventListener("touchend", clearFillHandleActive, true);
  window.addEventListener("touchcancel", clearFillHandleActive, true);
}

export {};
