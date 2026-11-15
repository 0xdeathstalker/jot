// Images are stored inside the note (base64 data URL in the Y.Doc), so they are shrunk on the device
// first. Free, works offline, syncs like text. Limits: docs/plans/editor-blocks.md, step E.
export const MAX_IMAGE_BYTES = 300 * 1024

// A refusal the user should read (shown in the bottom message).
export class ImageError extends Error {}

// Try the next step only while the result is still over MAX_IMAGE_BYTES.
const STEPS: [maxSide: number, quality: number][] = [
  [1280, 0.8],
  [1280, 0.6],
  [1024, 0.6],
]

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function encode(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new ImageError("This image could not be read")
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  const webp = await toBlob(canvas, "image/webp", quality)
  if (webp?.type === "image/webp") return webp
  // Safari may not encode WebP (it returns PNG instead): use JPEG, on white since JPEG has no
  // transparency.
  context.globalCompositeOperation = "destination-over"
  context.fillStyle = "#fff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  const jpeg = await toBlob(canvas, "image/jpeg", quality)
  if (!jpeg) throw new ImageError("This image could not be read")
  return jpeg
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new ImageError("This image could not be read"))
    reader.readAsDataURL(blob)
  })
}

// Long side at most 1280 px, WebP (or JPEG), at most MAX_IMAGE_BYTES. Photos keep their rotation
// (createImageBitmap applies EXIF orientation). Animated GIFs come out as a still image.
export async function shrinkImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new ImageError("Only photos and screenshots can be added")
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ImageError("This image could not be read")
  }
  try {
    for (const [maxSide, quality] of STEPS) {
      const blob = await encode(bitmap, maxSide, quality)
      if (blob.size <= MAX_IMAGE_BYTES) return await toDataUrl(blob)
    }
  } finally {
    bitmap.close()
  }
  throw new ImageError("This image is too large, even after shrinking")
}
