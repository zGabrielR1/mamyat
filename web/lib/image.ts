const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"])

/**
 * Resize to 1600 px on the longest side and encode WebP in the browser.
 * The server validates the result anyway; this only keeps uploads small.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (!ALLOWED.has(file.type)) {
    throw new Error("Envie uma foto JPEG, PNG ou WebP.")
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("A foto original deve ter no máximo 15 MB.")
  }
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return file
  }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) {
      bitmap.close()
      return file
    }
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const compressed = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.85)
    })
    return compressed && compressed.size < file.size ? compressed : file
  } catch {
    return file
  }
}
