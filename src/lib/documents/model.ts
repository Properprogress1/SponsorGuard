export const documentBucket = "sponsorguard-documents";
export const maxDocumentBytes = 5 * 1024 * 1024;
export const signedDownloadSeconds = 60;

export const documentTypes = {
  right_to_work: "Right to work",
  identity: "Identity",
  sponsorship: "Sponsorship",
  other: "Other",
} as const;

export type DocumentType = keyof typeof documentTypes;

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && Object.hasOwn(documentTypes, value);
}

const signatures = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
} as const;

export type DocumentMime = keyof typeof signatures;
export const allowedDocumentTypes = Object.keys(signatures).join(",");

export const documentDownloadNames: Record<DocumentMime, string> = {
  "application/pdf": "document.pdf",
  "image/jpeg": "document.jpg",
  "image/png": "document.png",
};

export async function validateDocumentFile(file: File) {
  if (file.size < 1 || file.size > maxDocumentBytes) {
    return { error: "Choose a non-empty file no larger than 5 MiB." } as const;
  }
  if (!Object.hasOwn(signatures, file.type)) {
    return { error: "Choose a PDF, JPEG or PNG file." } as const;
  }
  const contentType = file.type as DocumentMime;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (
    bytes.byteLength !== file.size ||
    !signatures[contentType].every((value, index) => bytes[index] === value)
  ) {
    return {
      error: "The file contents do not match the declared file type.",
    } as const;
  }
  return { bytes, contentType } as const;
}
