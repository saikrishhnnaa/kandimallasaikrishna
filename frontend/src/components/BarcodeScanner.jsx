import React, { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ScanLine, Camera, Keyboard } from "lucide-react";

const SCANNER_ID = "barcode-scanner-region";

/**
 * Reusable barcode scanner dialog.
 * Opens a camera viewfinder, decodes 1D/2D codes via html5-qrcode.
 * Provides a manual entry tab as fallback.
 *
 * @param {boolean} open
 * @param {(open:boolean)=>void} onOpenChange
 * @param {(code:string)=>void} onDetected
 * @param {string} title
 */
export default function BarcodeScanner({ open, onOpenChange, onDetected, title = "Scan barcode" }) {
  const [mode, setMode] = useState("camera"); // camera | manual
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const scannerRef = useRef(null);

  useEffect(() => {
    if (!open || mode !== "camera") return undefined;
    let cancelled = false;
    setError("");

    (async () => {
      try {
        const mod = await import("html5-qrcode");
        if (cancelled) return;
        const Html5Qrcode = mod.Html5Qrcode;

        // Wait a tick for DOM
        await new Promise((r) => setTimeout(r, 50));
        const el = document.getElementById(SCANNER_ID);
        if (!el) return;

        const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
        scannerRef.current = scanner;

        const config = {
          fps: 10,
          qrbox: { width: 260, height: 140 },
          aspectRatio: 1.6,
        };

        await scanner.start(
          { facingMode: "environment" },
          config,
          (decoded) => {
            if (cancelled) return;
            onDetected?.(decoded);
            cleanup(scanner);
            onOpenChange(false);
          },
          () => { /* per-frame failures — ignore */ }
        );
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Camera unavailable");
          setMode("manual");
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup(scannerRef.current);
      scannerRef.current = null;
    };
  }, [open, mode, onDetected, onOpenChange]);

  const cleanup = (scanner) => {
    if (!scanner) return;
    try {
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    } catch (_e) { /* noop */ }
  };

  const submitManual = () => {
    const code = manual.trim();
    if (!code) return;
    onDetected?.(code);
    setManual("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="barcode-scanner-dialog">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight flex items-center gap-2">
            <ScanLine size={18} /> {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setMode("camera")}
            data-testid="scanner-camera-tab"
            className={`flex-1 px-3 py-2 text-xs rounded-md border transition-colors flex items-center justify-center gap-1.5 ${
              mode === "camera"
                ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                : "bg-white border-[var(--border)] hover:bg-black/5"
            }`}
          >
            <Camera size={14} /> Camera
          </button>
          <button
            onClick={() => setMode("manual")}
            data-testid="scanner-manual-tab"
            className={`flex-1 px-3 py-2 text-xs rounded-md border transition-colors flex items-center justify-center gap-1.5 ${
              mode === "manual"
                ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                : "bg-white border-[var(--border)] hover:bg-black/5"
            }`}
          >
            <Keyboard size={14} /> Manual / USB
          </button>
        </div>

        {mode === "camera" ? (
          <div>
            <div
              id={SCANNER_ID}
              className="rounded-md overflow-hidden border border-[var(--border)] bg-black aspect-[1.6/1]"
              data-testid="scanner-camera-region"
            />
            {error && (
              <p className="text-xs text-[var(--danger)] mt-2">{error}</p>
            )}
            <p className="text-xs text-[var(--text-muted)] mt-3">
              Point the camera at a UPC, EAN, Code 128, or QR code.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="overline">Barcode / SKU</Label>
              <Input
                autoFocus
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitManual(); }}
                placeholder="Type or scan with USB device…"
                className="mt-2 h-11 font-mono"
                data-testid="scanner-manual-input"
              />
              <p className="text-xs text-[var(--text-muted)] mt-2">
                A USB barcode scanner will type here automatically — just press Enter to submit.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={submitManual}
                disabled={!manual.trim()}
                className="bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
                data-testid="scanner-manual-submit"
              >
                Use code
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
