"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FORMATS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A];

/**
 * Live barcode scanner (EAN-13/EAN-8/UPC-A, rear camera). The camera needs a
 * secure context, so over plain http on the LAN it won't start — a manual
 * barcode input is ALWAYS rendered as the fallback. Decoding stops the reader and
 * hands the code to the sheet, which looks it up.
 */
export function ScanTab({
  active,
  onBarcode,
}: {
  active: boolean;
  onBarcode: (barcode: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onBarcodeRef = useRef(onBarcode);
  useEffect(() => {
    onBarcodeRef.current = onBarcode;
  });

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!active) return;
    let controls: IScannerControls | undefined;
    let done = false;

    const start = async () => {
      // getUserMedia is gated to secure contexts: over plain http on the LAN it's
      // absent, so the camera can't start. That's a deployment fact (serve over
      // https), not something to work around — the manual input below always works.
      if (
        typeof window === "undefined" ||
        !window.isSecureContext ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setCameraError(
          "Camera needs a secure (https) connection — enter the barcode below instead.",
        );
        return;
      }
      const hints = new Map<DecodeHintType, BarcodeFormat[]>([
        [DecodeHintType.POSSIBLE_FORMATS, FORMATS],
      ]);
      const reader = new BrowserMultiFormatReader(hints);
      try {
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current ?? undefined,
          (result, _err, ctrl) => {
            if (result && !done) {
              done = true;
              ctrl.stop();
              onBarcodeRef.current(result.getText());
            }
          },
        );
        if (done) controls.stop();
      } catch (err) {
        // Distinguish a denied permission / missing camera from a generic failure so
        // the message is actionable; the manual input below is the fallback either way.
        const name = err instanceof DOMException ? err.name : "";
        setCameraError(
          name === "NotAllowedError"
            ? "Camera permission denied — enter the barcode below instead."
            : name === "NotFoundError"
              ? "No camera found — enter the barcode below instead."
              : "Couldn't start the camera — enter the barcode below instead.",
        );
      }
    };

    void start();

    return () => {
      done = true;
      controls?.stop();
    };
  }, [active]);

  const manualValid = /^\d{6,14}$/.test(manual.trim());

  return (
    <div className="space-y-3">
      <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-xl">
        <video
          ref={videoRef}
          muted
          playsInline
          className="size-full object-cover"
        />
        {cameraError && (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center p-4 text-center text-sm">
            {cameraError}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/70" />
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manualValid) onBarcode(manual.trim());
        }}
      >
        <div className="flex-1 space-y-1.5">
          <label
            htmlFor="manual-barcode"
            className="text-sm leading-none font-medium"
          >
            Enter barcode
          </label>
          <Input
            id="manual-barcode"
            type="text"
            inputMode="numeric"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="e.g. 5449000000996"
          />
        </div>
        <Button type="submit" className="h-9" disabled={!manualValid}>
          Look up
        </Button>
      </form>
    </div>
  );
}
