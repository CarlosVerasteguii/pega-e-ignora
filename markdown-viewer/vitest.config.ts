import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

const projectRoot = fs.realpathSync.native(process.cwd());
const testIncludePattern = path.join(projectRoot, "tests", "**", "*.test.ts").replaceAll("\\", "/");

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [testIncludePattern],
  },
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
});
