import { AppError } from "@platform/core/errors";
import type { ObjectStorage, PutObjectInput, StoredObject } from "./index";

type SupabaseStorageConfig = {
  baseUrl: string;
  serviceRoleKey: string;
  bucket: string;
};

function encodedKey(key: string): string {
  if (!key || key.includes("..") || key.startsWith("/") || key.endsWith("/")) {
    throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
  }
  return key.split("/").map(encodeURIComponent).join("/");
}

function headers(config: SupabaseStorageConfig, contentType?: string): HeadersInit {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    ...(contentType ? { "Content-Type": contentType } : { "Content-Type": "application/json" }),
  };
}

async function requireSuccess(response: Response): Promise<void> {
  if (!response.ok) {
    throw new AppError("INFRASTRUCTURE", "storage.provider-unavailable", "Image storage is unavailable. Try again later.");
  }
}

export function createSupabaseObjectStorage(config: SupabaseStorageConfig): ObjectStorage {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const bucket = encodeURIComponent(config.bucket);
  return {
    async put(input: PutObjectInput): Promise<StoredObject> {
      const uploadBody = Uint8Array.from(input.body).buffer;
      const response = await fetch(`${baseUrl}/storage/v1/object/${bucket}/${encodedKey(input.key)}`, {
        method: "POST",
        headers: { ...headers(config, input.contentType), "x-upsert": "false" },
        body: uploadBody,
      });
      await requireSuccess(response);
      return { key: input.key, contentType: input.contentType, bytes: input.bytes };
    },

    async remove(key: string): Promise<void> {
      const response = await fetch(`${baseUrl}/storage/v1/object/${bucket}/${encodedKey(key)}`, {
        method: "DELETE",
        headers: headers(config),
      });
      await requireSuccess(response);
    },

    async createSignedReadUrl(key: string, expiresInSeconds: number): Promise<string> {
      const response = await fetch(`${baseUrl}/storage/v1/object/sign/${bucket}/${encodedKey(key)}`, {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      });
      await requireSuccess(response);
      const payload = await response.json() as { signedURL?: unknown };
      if (typeof payload.signedURL !== "string") {
        throw new AppError("INFRASTRUCTURE", "storage.invalid-provider-response", "Image storage is unavailable. Try again later.");
      }
      return payload.signedURL.startsWith("http") ? payload.signedURL : `${baseUrl}/storage/v1${payload.signedURL}`;
    },
  };
}

export function createConfiguredObjectStorage(): ObjectStorage {
  const baseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !serviceRoleKey) {
    const unavailable = async (): Promise<never> => {
      throw new AppError("INFRASTRUCTURE", "storage.not-configured", "Image storage is not configured on this environment.");
    };
    return { put: unavailable, remove: unavailable, createSignedReadUrl: unavailable };
  }
  return createSupabaseObjectStorage({ baseUrl, serviceRoleKey, bucket: "platform-assets" });
}
