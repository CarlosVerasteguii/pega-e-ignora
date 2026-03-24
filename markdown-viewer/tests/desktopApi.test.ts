import { beforeEach, describe, expect, it } from "vitest";
import {
  documentDir,
  exists,
  join,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from "../src/ui/desktopApi";

describe("desktopApi browser fallback", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists directories and files in browser mode", async () => {
    const docs = await documentDir();
    const vaultDir = await join(docs, "Pega e Ignora");
    const notesDir = await join(vaultDir, "notes");
    await mkdir(notesDir, { recursive: true });

    const filePath = await join(notesDir, "demo.md");
    await writeTextFile(filePath, "# Demo");

    expect(await exists(vaultDir)).toBe(true);
    expect(await exists(notesDir)).toBe(true);
    expect(await exists(filePath)).toBe(true);
    expect(await readTextFile(filePath)).toBe("# Demo");

    const entries = await readDir(notesDir);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "demo.md",
          isFile: true,
          isDirectory: false,
        }),
      ]),
    );
  });

  it("renames folders recursively in browser mode", async () => {
    const docs = await documentDir();
    const legacyVault = await join(docs, "Markdown Viewer");
    const legacyNotes = await join(legacyVault, "notes");
    await mkdir(legacyNotes, { recursive: true });

    const legacyFile = await join(legacyNotes, "legacy.md");
    await writeTextFile(legacyFile, "legacy");

    const nextVault = await join(docs, "Pega e Ignora");
    await rename(legacyVault, nextVault);

    const migratedFile = await join(nextVault, "notes", "legacy.md");
    expect(await exists(legacyVault)).toBe(false);
    expect(await exists(migratedFile)).toBe(true);
    expect(await readTextFile(migratedFile)).toBe("legacy");
  });

  it("removes files cleanly in browser mode", async () => {
    const docs = await documentDir();
    const vaultDir = await join(docs, "Pega e Ignora");
    const notesDir = await join(vaultDir, "notes");
    await mkdir(notesDir, { recursive: true });

    const filePath = await join(notesDir, "temp.md");
    await writeTextFile(filePath, "temp");
    await remove(filePath);

    expect(await exists(filePath)).toBe(false);
    await expect(readTextFile(filePath)).rejects.toThrow(/No existe el archivo/i);
  });
});
