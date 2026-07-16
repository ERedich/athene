import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { apiFetch } from "../lib/api";

function extensionForMime(mimeType: string | null | undefined): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/heic") return "heic";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}

function ensureCacheDir(): Directory {
  const dir = new Directory(Paths.cache, "athene-docs");
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

/**
 * Fetch a work-order document with session/bearer auth and return a displayable local URI.
 * On web: blob object URL (caller should revoke when done).
 * On native: cached file:// URI under Paths.cache.
 */
export async function resolveWorkOrderDocumentUri(
  orderId: string,
  documentId: string,
  mimeType?: string | null,
): Promise<string> {
  if (Platform.OS === "web") {
    const r = await apiFetch(`/api/work-orders/${orderId}/documents/${documentId}/content`);
    if (!r.ok) throw new Error(r.status === 401 ? "unauthorized" : "fetch_document_content");
    const blob = await r.blob();
    return URL.createObjectURL(blob);
  }

  const ext = extensionForMime(mimeType);
  const dir = ensureCacheDir();
  const file = new File(dir, `${documentId}.${ext}`);
  const r = await apiFetch(`/api/work-orders/${orderId}/documents/${documentId}/content`);
  if (!r.ok) throw new Error(r.status === 401 ? "unauthorized" : "fetch_document_content");
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (file.exists) {
    file.delete();
  }
  file.create({ intermediates: true, overwrite: true });
  file.write(bytes);
  return file.uri;
}

export async function resolveAssetDocumentUri(
  assetId: string,
  documentId: string,
  mimeType?: string | null,
): Promise<string> {
  if (Platform.OS === "web") {
    const r = await apiFetch(`/api/assets/${assetId}/documents/${documentId}/content`);
    if (!r.ok) throw new Error(r.status === 401 ? "unauthorized" : "fetch_document_content");
    const blob = await r.blob();
    return URL.createObjectURL(blob);
  }

  const ext = extensionForMime(mimeType);
  const dir = ensureCacheDir();
  const file = new File(dir, `asset-${documentId}.${ext}`);
  const r = await apiFetch(`/api/assets/${assetId}/documents/${documentId}/content`);
  if (!r.ok) throw new Error(r.status === 401 ? "unauthorized" : "fetch_document_content");
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (file.exists) {
    file.delete();
  }
  file.create({ intermediates: true, overwrite: true });
  file.write(bytes);
  return file.uri;
}
