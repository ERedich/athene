/** True when mime or file extension indicates a raster/vector image suitable for hover preview. */
export function isImageDocument(mimeType: string | null | undefined, fileName: string): boolean {
  const mt = (mimeType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (mt.startsWith("image/")) return true;
  const i = fileName.lastIndexOf(".");
  const ext = i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
  return (
    ext === "png" ||
    ext === "jpg" ||
    ext === "jpeg" ||
    ext === "gif" ||
    ext === "webp" ||
    ext === "bmp" ||
    ext === "svg"
  );
}
