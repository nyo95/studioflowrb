import { AppError } from "@platform/core/errors";
import type { ObjectStorage, PutObjectInput, StoredObject } from "@platform/core/storage";

type SupabaseStorageConfig = { baseUrl: string; serviceRoleKey: string; bucket: string };

export type PublicObjectStorage = ObjectStorage & {
  createPublicReadUrl(key: string): string;
};

function encodedKey(key: string): string {
  if (!key || key.includes("..") || key.startsWith("/") || key.endsWith("/")) {
    throw new AppError("VALIDATION", "storage.invalid-key", "The storage object reference is invalid.");
  }
  return key.split("/").map(encodeURIComponent).join("/");
}

function headers(config: SupabaseStorageConfig, contentType?: string): HeadersInit {
  return { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": contentType ?? "application/json" };
}

async function requireSuccess(response: Response): Promise<void> {
  if (!response.ok) throw new AppError("INFRASTRUCTURE", "storage.provider-unavailable", "Image storage is unavailable. Try again later.");
}

export function createSupabaseObjectStorage(config: SupabaseStorageConfig): ObjectStorage {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const bucket = encodeURIComponent(config.bucket);
  return {
    async put(input: PutObjectInput): Promise<StoredObject> {
      const response = await fetch(`${baseUrl}/storage/v1/object/${bucket}/${encodedKey(input.key)}`, { method: "POST", headers: { ...headers(config, input.contentType), "x-upsert": "false" }, body: Uint8Array.from(input.body).buffer });
      await requireSuccess(response);
      return { key: input.key, contentType: input.contentType, bytes: input.bytes };
    },
    async remove(key: string): Promise<void> {
      const response = await fetch(`${baseUrl}/storage/v1/object/${bucket}/${encodedKey(key)}`, { method: "DELETE", headers: headers(config) });
      await requireSuccess(response);
    },
    async createSignedReadUrl(key: string, expiresInSeconds: number): Promise<string> {
      const response = await fetch(`${baseUrl}/storage/v1/object/sign/${bucket}/${encodedKey(key)}`, { method: "POST", headers: headers(config), body: JSON.stringify({ expiresIn: expiresInSeconds }) });
      await requireSuccess(response);
      const payload = await response.json() as { signedURL?: unknown };
      if (typeof payload.signedURL !== "string") throw new AppError("INFRASTRUCTURE", "storage.invalid-provider-response", "Image storage is unavailable. Try again later.");
      return payload.signedURL.startsWith("http") ? payload.signedURL : `${baseUrl}/storage/v1${payload.signedURL}`;
    },
  };
}

function configuredStorage(bucket: string): ObjectStorage | null {
  const baseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return baseUrl && serviceRoleKey ? createSupabaseObjectStorage({ baseUrl, serviceRoleKey, bucket }) : null;
}

function unavailableStorage(): ObjectStorage {
  const unavailable = async (): Promise<never> => { throw new AppError("INFRASTRUCTURE", "storage.not-configured", "Image storage is not configured on this environment."); };
  return { put: unavailable, remove: unavailable, createSignedReadUrl: unavailable };
}

/** Private bucket for MOM and future private assets. Read URLs are signed. */
export function createConfiguredObjectStorage(): ObjectStorage {
  return configuredStorage("platform-assets") ?? unavailableStorage();
}

/** Public bucket for pre-login presentation assets; writes still require server credentials. */
export function createConfiguredPublicObjectStorage(): PublicObjectStorage {
  const configured = configuredStorage("platform-public-assets");
  const baseUrl = process.env.SUPABASE_URL?.trim()?.replace(/\/+$/, "");
  return {
    ...(configured ?? unavailableStorage()),
    createPublicReadUrl(key: string): string {
      if (!baseUrl) throw new AppError("INFRASTRUCTURE", "storage.not-configured", "Image storage is not configured on this environment.");
      return `${baseUrl}/storage/v1/object/public/${encodeURIComponent("platform-public-assets")}/${encodedKey(key)}`;
    },
  };
}
