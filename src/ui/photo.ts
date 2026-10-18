import { MAX_PHOTO_BYTES } from "../arkiv/journal";

const SIZES = [1280, 1024, 800, 640];
const QUALITIES = [0.8, 0.7, 0.6, 0.5, 0.4];

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
}

/**
 * Redraws the picture on a canvas (which drops EXIF and GPS), shrinks it and re-encodes as JPEG
 * until it fits. Throws a plain message if it cannot be made small enough.
 */
export async function preparePhoto(file: File): Promise<{ bytes: Uint8Array; mime: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error("That file could not be read as a picture. Try a JPEG or PNG photo.");
    }
    const limit = MAX_PHOTO_BYTES - 1000;
    for (const side of SIZES) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser cannot prepare photos.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of QUALITIES) {
        const blob = await toBlob(canvas, q);
        if (blob && blob.size <= limit) {
          return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/jpeg" };
        }
      }
    }
    throw new Error("This photo is too detailed to fit. Try a simpler photo or a screenshot.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
