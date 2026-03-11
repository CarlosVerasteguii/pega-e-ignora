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
    await page.evaluate(() => {
      const textarea = document.querySelector("#json-text-editor");
      if (!(textarea instanceof HTMLTextAreaElement)) {
        throw new Error("No pude cargar el editor de texto JSON.");
      }
      textarea.value = JSON.stringify(
        {
          id: "demo",
          meta: {
            title: "Documento",
            tags: ["a", "b"],
          },
          sections: [
            { kind: "hero", title: "Inicio" },
            { kind: "body", title: "Detalle" },
          ],
        },
        null,
        2,
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(240);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "sidebar-json-format-visible-success.png"),
      fullPage: true,
    });

    const jsonFormatState = await page.evaluate(() => {
      const outlineSection = document.querySelector('.sidebar-section[data-section="outline"]');
      const formatSection = document.querySelector('.sidebar-section[data-section="format"]');
      const spacingLabel = document.querySelector("#typography-spacing-label");
      const contextNote = document.querySelector("#format-context-note");
      if (
        !(outlineSection instanceof HTMLElement) ||
        !(formatSection instanceof HTMLElement) ||
        !(spacingLabel instanceof HTMLElement) ||
        !(contextNote instanceof HTMLElement)
      ) {
        throw new Error("No pude leer el panel Formato en modo JSON.");
      }
      return {
        outlineHidden: outlineSection.hidden,
        outlineVisibility: outlineSection.dataset.visibility ?? null,
        format: {
          hidden: formatSection.hidden,
          display: window.getComputedStyle(formatSection).display,
          height: formatSection.getBoundingClientRect().height,
          visibility: formatSection.dataset.visibility ?? null,
        },
        spacingLabel: spacingLabel.textContent?.trim() ?? "",
        contextNote: contextNote.textContent?.trim() ?? "",
      };
    });

    assert.equal(jsonFormatState.outlineHidden, true);
    assert.equal(jsonFormatState.outlineVisibility, "hidden-by-mode");
    assert.deepEqual(jsonFormatState.format, {
      hidden: false,
      display: "flex",
      height: jsonFormatState.format.height,
      visibility: "visible",
    });
    assert.ok(
      jsonFormatState.format.height > 0,
      `Esperaba que Formato siguiera visible en JSON. Altura actual: ${jsonFormatState.format.height}px`,
    );
    assert.equal(jsonFormatState.spacingLabel, "Separación entre bloques");
    assert.match(jsonFormatState.contextNote, /editor, el árbol y la estructura lateral/i);

    await page.click("#btn-json-tree-toggle");
    await page.waitForTimeout(240);
    const jsonTypographyBaseline = await page.evaluate(() => {
      const jsonEditor = document.querySelector(".json-text-editor");
      const jsonTree = document.querySelector(".json-tree");
      const jsonSplitter = document.querySelector("#json-splitter");
      const treePane = document.querySelector("#json-tree-pane");
      if (
        !(jsonEditor instanceof HTMLElement) ||
        !(jsonTree instanceof HTMLElement) ||
        !(jsonSplitter instanceof HTMLElement) ||
        !(treePane instanceof HTMLElement)
      ) {
        throw new Error("No pude leer la tipografía base de JSON.");
      }
      return {
        editorFontSize: window.getComputedStyle(jsonEditor).fontSize,
        treeFontSize: window.getComputedStyle(jsonTree).fontSize,
        treeGap: window.getComputedStyle(jsonTree).gap,
        splitterHidden: jsonSplitter.hidden,
        splitterRole: jsonSplitter.getAttribute("role"),
        splitterValue: jsonSplitter.getAttribute("aria-valuenow"),
        treeWidth: treePane.getBoundingClientRect().width,
      };
    });
    assert.equal(jsonTypographyBaseline.splitterHidden, false);
    assert.equal(jsonTypographyBaseline.splitterRole, "separator");
    assert.ok(
      Number(jsonTypographyBaseline.splitterValue) >= 25 && Number(jsonTypographyBaseline.splitterValue) <= 60,
      `Esperaba un valor inicial válido para el splitter JSON. Actual: ${jsonTypographyBaseline.splitterValue}`,
    );

    await page.focus("#json-splitter");
    await page.keyboard.press("Home");
    await page.waitForTimeout(120);

    const splitterAfterHome = await page.evaluate(() => {
      const treePane = document.querySelector("#json-tree-pane");
      const jsonSplitter = document.querySelector("#json-splitter");
      if (!(treePane instanceof HTMLElement) || !(jsonSplitter instanceof HTMLElement)) {
        throw new Error("No pude validar el resize del splitter JSON.");
      }
      return {
        splitterValue: jsonSplitter.getAttribute("aria-valuenow"),
        treeWidth: treePane.getBoundingClientRect().width,
      };
    });
    assert.equal(splitterAfterHome.splitterValue, "25");

    await page.keyboard.press("End");
    await page.waitForTimeout(120);

    const splitterAfterKeyboard = await page.evaluate(() => {
      const treePane = document.querySelector("#json-tree-pane");
      const jsonSplitter = document.querySelector("#json-splitter");
      if (!(treePane instanceof HTMLElement) || !(jsonSplitter instanceof HTMLElement)) {
        throw new Error("No pude validar el resize del splitter JSON.");
      }
      return {
        splitterValue: jsonSplitter.getAttribute("aria-valuenow"),
        treeWidth: treePane.getBoundingClientRect().width,
      };
    });
    assert.ok(
      Number(splitterAfterKeyboard.splitterValue) > Number(splitterAfterHome.splitterValue),
      `Esperaba que End ampliara el árbol JSON. Antes: ${splitterAfterHome.splitterValue}, después: ${splitterAfterKeyboard.splitterValue}`,
    );
    assert.ok(
      splitterAfterKeyboard.treeWidth > splitterAfterHome.treeWidth,
      `Esperaba más ancho en el panel Árbol JSON. Antes: ${splitterAfterHome.treeWidth}, después: ${splitterAfterKeyboard.treeWidth}`,
    );

    await page.evaluate(() => {
      const textarea = document.querySelector("#json-text-editor");
      if (!(textarea instanceof HTMLTextAreaElement)) {
        throw new Error("No pude actualizar el JSON tras mostrar Árbol.");
      }
      textarea.value = JSON.stringify(
        {
          id: "demo",
          meta: {
            title: "Documento",
            tags: ["a", "b"],
            owner: "qa",
          },
          sections: [
            { kind: "hero", title: "Inicio" },
            { kind: "body", title: "Detalle" },
          ],
        },
        null,
        2,
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(420);
    await page.locator("#typography-font-size").evaluate((input) => {
      input.value = "18";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#typography-line-height").evaluate((input) => {
      input.value = "1.9";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#typography-paragraph-spacing").evaluate((input) => {
      input.value = "0.4";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.evaluate(() => {
      const toggle = document.querySelector("#sidebar-outline-toggle");
      if (toggle instanceof HTMLButtonElement && toggle.getAttribute("aria-expanded") === "false") {
        toggle.click();
      }
    });
    await page.waitForTimeout(360);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "sidebar-json-typography-success.png"),
      fullPage: true,
    });

    const jsonState = await page.evaluate(() => {
      const outlineSection = document.querySelector('.sidebar-section[data-section="outline"]');
      const outlineBody = document.querySelector("#sidebar-outline-content");
      const formatSection = document.querySelector('.sidebar-section[data-section="format"]');
      const jsonEditor = document.querySelector(".json-text-editor");
      const jsonTree = document.querySelector(".json-tree");
      if (
        !(outlineSection instanceof HTMLElement) ||
        !(outlineBody instanceof HTMLElement) ||
        !(formatSection instanceof HTMLElement) ||
        !(jsonEditor instanceof HTMLElement) ||
        !(jsonTree instanceof HTMLElement)
      ) {
        throw new Error("No pude leer las superficies tipográficas en modo JSON.");
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
        jsonEditor: {
          fontSize: window.getComputedStyle(jsonEditor).fontSize,
          lineHeight: window.getComputedStyle(jsonEditor).lineHeight,
          paddingTop: window.getComputedStyle(jsonEditor).paddingTop,
        },
        jsonTree: {
          fontSize: window.getComputedStyle(jsonTree).fontSize,
          gap: window.getComputedStyle(jsonTree).gap,
        },
        outlineBody: {
          hidden: outlineBody.hidden,
          height: outlineBody.getBoundingClientRect().height,
        },
      };
    });

    assert.deepEqual(jsonState.outline, {
      hidden: false,
      display: "flex",
      height: jsonState.outline.height,
      visibility: "visible",
    });
    assert.ok(jsonState.outline.height > 0, "Esperaba la Estructura JSON visible tras activar Árbol.");
    assert.equal(jsonState.outlineBody.hidden, false);
    assert.ok(jsonState.outlineBody.height > 0, "Esperaba el body de Estructura JSON visible tras activar Árbol.");
    assert.deepEqual(jsonState.format, {
      hidden: false,
      display: "flex",
      height: jsonState.format.height,
      visibility: "visible",
    });
    assert.ok(
      parseFloat(jsonState.jsonEditor.fontSize) > parseFloat(jsonTypographyBaseline.editorFontSize),
      `Esperaba aumento de font-size en el editor JSON. Antes: ${jsonTypographyBaseline.editorFontSize}, después: ${jsonState.jsonEditor.fontSize}`,
    );
    assert.ok(
      parseFloat(jsonState.jsonEditor.paddingTop) >= 13,
      `Esperaba mayor separación visual en el editor JSON. padding-top actual: ${jsonState.jsonEditor.paddingTop}`,
    );
    assert.ok(
      parseFloat(jsonState.jsonTree.fontSize) > parseFloat(jsonTypographyBaseline.treeFontSize),
      `Esperaba aumento de font-size en el árbol JSON. Antes: ${jsonTypographyBaseline.treeFontSize}, después: ${jsonState.jsonTree.fontSize}`,
    );
    assert.ok(
      parseFloat(jsonState.jsonTree.gap) > parseFloat(jsonTypographyBaseline.treeGap),
      `Esperaba mayor separación en el árbol JSON. Antes: ${jsonTypographyBaseline.treeGap}, después: ${jsonState.jsonTree.gap}`,
    );

    await page.evaluate(() => {
      const target = Array.from(document.querySelectorAll(".json-row")).find(
        (node) => node instanceof HTMLElement && node.dataset.jsonPath === "$.meta",
      );
      if (!(target instanceof HTMLElement)) {
        throw new Error("No encontré la fila $.meta en el árbol JSON.");
      }
      target.click();
    });
    await page.waitForTimeout(220);

    const treeToOutlineSync = await page.evaluate(() => {
      const activeTree = Array.from(document.querySelectorAll(".json-row.is-selected")).find(
        (node) => node instanceof HTMLElement && node.dataset.jsonPath === "$.meta",
      );
      const rootTree = Array.from(document.querySelectorAll(".json-row")).find(
        (node) => node instanceof HTMLElement && node.dataset.jsonPath === "$",
      );
      const status = document.querySelector("#status");
      if (!(activeTree instanceof HTMLElement) || !(rootTree instanceof HTMLElement) || !(status instanceof HTMLElement)) {
        throw new Error("No pude validar la sincronización tree -> status.");
      }
      return {
        status: status.textContent?.trim() ?? "",
        treePath: activeTree.dataset.jsonPath ?? null,
        isContainer: activeTree.classList.contains("json-row--container"),
        rootAncestor: rootTree.classList.contains("json-row--active-ancestor"),
      };
    });

    assert.equal(treeToOutlineSync.treePath, "$.meta");
    assert.equal(treeToOutlineSync.status, "Nodo: $.meta");
    assert.equal(treeToOutlineSync.isContainer, true);
    assert.equal(treeToOutlineSync.rootAncestor, true);

    await page.evaluate(() => {
      const textarea = document.querySelector("#json-text-editor");
      if (!(textarea instanceof HTMLTextAreaElement)) {
        throw new Error("No pude mover el caret del editor JSON.");
      }
      const text = textarea.value;
      const caret = text.indexOf('"owner": "qa"') + 3;
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
      textarea.dispatchEvent(new Event("select", { bubbles: true }));
    });
    await page.waitForTimeout(260);

    const editorToAllSync = await page.evaluate(() => {
      const activeTree = Array.from(document.querySelectorAll(".json-row.is-selected")).find(
        (node) => node instanceof HTMLElement && node.dataset.jsonPath === "$.meta.owner",
      );
      const status = document.querySelector("#status");
      if (!(activeTree instanceof HTMLElement) || !(status instanceof HTMLElement)) {
        throw new Error("No pude validar la sincronización editor -> tree.");
      }
      return {
        treePath: activeTree.dataset.jsonPath ?? null,
        status: status.textContent?.trim() ?? "",
        isLeaf: activeTree.classList.contains("json-row--leaf"),
        hasValueInput: Boolean(activeTree.querySelector(".json-row-editor .json-value-input")),
      };
    });

    assert.equal(editorToAllSync.treePath, "$.meta.owner");
    assert.equal(editorToAllSync.status, "Nodo: $.meta.owner");
    assert.equal(editorToAllSync.isLeaf, true);
    assert.equal(editorToAllSync.hasValueInput, true);

    await page.evaluate(() => {
      const textarea = document.querySelector("#json-text-editor");
      if (!(textarea instanceof HTMLTextAreaElement)) {
        throw new Error("No pude preparar el caso readonly del árbol JSON.");
      }
      const bigPayload = Array.from({ length: 12000 }, (_, index) => ({ index, value: `node-${index}` }));
      textarea.value = JSON.stringify(bigPayload);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(1400);

    const readonlyState = await page.evaluate(() => {
      const parseStatus = document.querySelector("#json-parse-status");
      const status = document.querySelector("#status");
      if (!(parseStatus instanceof HTMLElement) || !(status instanceof HTMLElement)) {
        throw new Error("No pude leer el estado readonly del árbol JSON.");
      }
      return {
        parseStatus: parseStatus.textContent?.trim() ?? "",
        appStatus: status.textContent?.trim() ?? "",
      };
    });

    assert.match(readonlyState.parseStatus, /árbol solo lectura/i);
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
