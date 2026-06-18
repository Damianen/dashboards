// Client-only image helpers. Browser globals (FileReader, Image, canvas) — only
// call these from "use client" components, never on the server.

/** Read a File into a `data:<mime>;base64,…` URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read file"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

/** Decode a data URL into an <img> ready to draw. */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("could not decode image"));
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });
}

/**
 * Downscale a picked image to a JPEG data URL whose longest side is ≤ maxPx,
 * keeping the upload small (the vision client rejects anything over a few MB).
 * Images already within bounds are still re-encoded as JPEG at `quality` to shed
 * EXIF bulk. Falls back to the original data URL if a 2D canvas isn't available.
 */
export async function fileToDownscaledDataUrl(
  file: File,
  maxPx = 1024,
  quality = 0.7,
): Promise<string> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);

  const longest = Math.max(img.width, img.height);
  const scale = longest > maxPx ? maxPx / longest : 1;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}
