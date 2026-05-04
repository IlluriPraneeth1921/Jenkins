import fs from "node:fs";
import path from "node:path";

export const projectRoot = path.resolve(__dirname, "..");

export function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

export function resolveProjectPath(...segments: string[]): string {
  return path.resolve(projectRoot, ...segments);
}

export function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

export function writeJson(filePath: string, data: unknown): void {
  writeText(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(readText(filePath)) as T;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "generated"
  );
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function timestampLabel(): string {
  return new Date().toISOString();
}

export function toAbsolute(root: string, value: string): string {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(root, value);
}

export function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
