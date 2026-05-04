import { ensureDir as ensureDirSync, readJson, readText, writeJson, writeText } from "../utils";

export async function ensureDir(targetPath: string): Promise<void> {
  ensureDirSync(targetPath);
}

export function readTextFile(filePath: string): string {
  return readText(filePath);
}

export function writeTextFile(filePath: string, contents: string): void {
  writeText(filePath, contents);
}

export function readJsonFile<T>(filePath: string): T {
  return readJson<T>(filePath);
}

export function writeJsonFile(filePath: string, contents: unknown): void {
  writeJson(filePath, contents);
}
