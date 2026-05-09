import { useEffect, useRef } from "react";

/**
 * USB hardware barcode scanner support.
 * Most USB barcode scanners emulate an HID keyboard: they "type" the code
 * very fast and end with Enter. This hook captures keystrokes globally
 * (when no input/textarea is focused) and emits a complete code on Enter
 * or after a short idle timeout.
 *
 * @param {(code: string) => void} onScan - called with the scanned code
 * @param {boolean} enabled - master switch
 * @param {object} opts
 * @param {number} opts.minLength - minimum chars to count as a scan (default 4)
 * @param {number} opts.maxInterval - max ms between keys (default 50)
 * @param {boolean} opts.captureWhileTyping - if true, also captures while typing in inputs (default false)
 */
export function useUsbScanner(onScan, enabled = true, opts = {}) {
  const { minLength = 4, maxInterval = 50, captureWhileTyping = false } = opts;
  const bufferRef = useRef("");
  const lastKeyRef = useRef(0);
  const timerRef = useRef(null);
  const cbRef = useRef(onScan);

  useEffect(() => { cbRef.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!enabled) return undefined;

    const flush = (reason) => {
      const code = bufferRef.current.trim();
      bufferRef.current = "";
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      if (code.length >= minLength) cbRef.current?.(code);
    };

    const handler = (e) => {
      // Ignore when user is actively typing (unless caller wants global capture)
      if (!captureWhileTyping) {
        const tag = (e.target?.tagName || "").toUpperCase();
        const editable = e.target?.isContentEditable;
        if (editable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }

      const now = Date.now();
      const dt = now - lastKeyRef.current;
      lastKeyRef.current = now;

      if (e.key === "Enter") {
        if (bufferRef.current.length > 0) {
          e.preventDefault();
          flush("enter");
        }
        return;
      }

      // If gap is too big, treat as fresh start (human typing)
      if (dt > maxInterval && bufferRef.current.length > 0) bufferRef.current = "";

      if (e.key.length === 1) {
        bufferRef.current += e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => flush("timeout"), 100);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, minLength, maxInterval, captureWhileTyping]);
}
