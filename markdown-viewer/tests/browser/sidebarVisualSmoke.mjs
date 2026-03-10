import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const PORT = 4173;
const URL = `http://[::1]:${PORT}`;
const ARTIFACTS_DIR = path.resolve(process.cwd(), ".codex-artifacts", "browser-smoke");

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForServer(url, timeoutMs, logs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep polling until the server is ready
    }
    await wait(250);
  }
  throw new Error(`El servidor de Vite no respondió a tiempo.\n${logs.join("")}`);
}

async function launchBrowser() {
  let lastError = null;
  const attempts = [{ channel: "msedge" }, {}];
  for (const attempt of attempts) {
    try {
      return await chromium.launch({ headless: true, ...attempt });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function stopServer(server) {
  if (!server.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }

  server.kill("SIGTERM");
}

async function main() {
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  const serverLogs = [];
  const server = spawn(
    `${getNpmCommand()} run dev -- --host ::1 --port ${PORT} --strictPort`,
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    },
  );

  server.stdout.on("data", (chunk) => {
    serverLogs.push(chunk.toString());
  });
  server.stderr.on("data", (chunk) => {
    serverLogs.push(chunk.toString());
  });

  let browser;
  let page;

  try {
    await waitForServer(URL, 30000, serverLogs);
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.locator('.sidebar-section[data-section="history"] .sidebar-section-toggle').waitFor();

    await page.click('.sidebar-section[data-section="history"] .sidebar-section-toggle');
    await page.waitForTimeout(320);
    await page.click('.sidebar-section[data-section="outline"] .sidebar-section-toggle');
    await page.waitForTimeout(320);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "sidebar-fill-collapsed-success.png"),
      fullPage: true,
    });

    const collapsedFill = await page.evaluate(() => {
      const fillGroup = document.querySelector(".sidebar-fill-group");
      const outlineSection = document.querySelector('.sidebar-section[data-section="outline"]');
      const formatSection = document.querySelector('.sidebar-section[data-section="format"]');
      if (!(fillGroup instanceof HTMLElement) || !(outlineSection instanceof HTMLElement) || !(formatSection instanceof HTMLElement)) {
        throw new Error("No pude leer el layout del sidebar en modo Markdown.");
      }
      const outlineRect = outlineSection.getBoundingClientRect();
      const formatRect = formatSection.getBoundingClientRect();
      return {
        fillLayout: fillGroup.dataset.fillLayout ?? null,
        gapPx: formatRect.top - outlineRect.bottom,
      };
    });

    assert.equal(
      collapsedFill.fillLayout,
      "collapsed",
      `Esperaba que el grupo fill quedara colapsado. Estado actual: ${collapsedFill.fillLayout}`,
    );
    assert.ok(
      collapsedFill.gapPx >= 0 && collapsedFill.gapPx <= 12,
      `Esperaba que Formato quedara pegado al stack de headers. Gap actual: ${collapsedFill.gapPx}px`,
    );

    await page.click("#tab-json");
    await page.waitForTimeout(320);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "sidebar-json-hidden-success.png"),
      fullPage: true,
    });

    const jsonState = await page.evaluate(() => {
      const outlineSection = document.querySelector('.sidebar-section[data-section="outline"]');
      const formatSection = document.querySelector('.sidebar-section[data-section="format"]');
      if (!(outlineSection instanceof HTMLElement) || !(formatSection instanceof HTMLElement)) {
        throw new Error("No pude leer las secciones del sidebar en modo JSON.");
      }
      const readSection = (section) => ({
        hidden: section.hidden,
        display: window.getComputedStyle(section).display,
        height: section.getBoundingClientRect().height,
        visibility: section.dataset.visibility ?? null,
      });
      return {
        outline: readSection(outlineSection),
        format: readSection(formatSection),
      };
    });

    assert.deepEqual(jsonState.outline, {
      hidden: true,
      display: "none",
      height: 0,
      visibility: "hidden-by-mode",
    });
    assert.deepEqual(jsonState.format, {
      hidden: true,
      display: "none",
      height: 0,
      visibility: "hidden-by-mode",
    });
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, "sidebar-visual-failure.png"), fullPage: true });
    }
    throw error;
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
