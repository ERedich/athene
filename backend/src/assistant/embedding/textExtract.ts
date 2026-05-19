import { DOCUMENT_TEXT_MAX_CHARS } from "./embeddingTypes.js";

export function isTextLikeMimeType(mimeType: string): boolean {
  return /^text\//i.test(mimeType) || /json|xml|csv|markdown/i.test(mimeType);
}

export function extractTextFromBuffer(mimeType: string, content: Buffer): string | null {
  if (!isTextLikeMimeType(mimeType)) return null;
  return content.toString("utf8").slice(0, DOCUMENT_TEXT_MAX_CHARS);
}
