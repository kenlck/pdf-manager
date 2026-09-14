import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { Command } from "./domain/commands";
import { buildExportPlan } from "./domain/exportPlan";
import { apply, createSession, pagesFromSource } from "./domain/session";
import { aspectFromPixelSize, defaultStampRect, displayNormRect } from "./domain/stampGeometry";
import type { PageRef, SignatureId, Source, SourceId, StampBytes, Stamp, MarkupContent, MarkupTool } from "./domain/types";
import {
  mintStampId,
  selectedPageIndices,
  selectedStamp,
} from "./domain/types";
import { isSupportedDocument, openDocument } from "./pdf/openDocument";
import { clearRenderCache } from "./pdf/render";
import { writePdfFromPlan } from "./pdf/write";
import {
  loadPdfsFromUrls,
  pickImage,
  pickOpenDocuments,
  pickSavePdf,
  type PickedDocument,
  writePdfBytes,
} from "./shell/files";
import {
  addDrawn,
  addImported,
  infoOf,
  loadVault,
  pngOf,
  removeSignature,
  type VaultError,
} from "./signatures/vault";
import { PageGrid } from "./ui/PageGrid";
import { PagePreview } from "./ui/PagePreview";
import { PageRail } from "./ui/PageRail";
import { SignatureMenu } from "./ui/SignatureMenu";
import { DEFAULT_STYLE, textContent } from "./markup/artwork";
import { importOverlayImage } from "./markup/importImage";
import { MarkupToolbar } from "./ui/MarkupToolbar";
import { Toolbar } from "./ui/Toolbar";
import "./App.css";

type SourceBytes = Map<SourceId, Uint8Array>;

function sessionReducer(
  session: ReturnType<typeof createSession>,
  command: Command,
) {
  return apply(session, command);
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function vaultMessage(error: VaultError): string {
  switch (error.kind) {
    case "tooLarge":
      return "Signature is too large.";
    case "undecodable":
      return "Could not read that image.";
    case "unsupportedType":
      return "Use a PNG or JPEG.";
    case "quota":
      return "Signature library is full.";
  }
}

async function loadSources(picked: PickedDocument[]): Promise<{
  sources: Source[];
  pages: PageRef[];
  bytes: SourceBytes;
  errors: string[];
}> {
  const sources: Source[] = [];
  const pages: PageRef[] = [];
  const bytes: SourceBytes = new Map();
  const errors: string[] = [];

  for (const item of picked) {
    try {
      const result = await openDocument(item.bytes, item.path);
      if (!result.ok) {
        errors.push(`${basename(item.path)}: ${result.error.message}`);
        continue;
      }
      sources.push(result.source);
      pages.push(...pagesFromSource(result.source));
      bytes.set(result.source.id, result.bytes);
    } catch {
      errors.push(`${basename(item.path)}: This file could not be read.`);
    }
  }

  return { sources, pages, bytes, errors };
}

export default function App() {
  const [session, dispatch] = useReducer(
    sessionReducer,
    undefined,
    createSession,
  );
  const [sourceBytes, setSourceBytes] = useState<SourceBytes>(() => new Map());
  const [stampBytes, setStampBytes] = useState<StampBytes>(() => new Map());
  const [tool, setTool] = useState<MarkupTool>("select");
  const [markupStyle, setMarkupStyle] = useState(DEFAULT_STYLE);
  const [vault, setVault] = useState(loadVault);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Open a PDF or image to begin.");
  const dropInProgress = useRef(false);

  const mergeBytes = useCallback((incoming: SourceBytes) => {
    setSourceBytes((prev) => {
      const next = new Map(prev);
      for (const [id, value] of incoming) {
        next.set(id, value);
      }
      return next;
    });
  }, []);

  const applyLoaded = useCallback(
    (
      mode: "open" | "insert" | "combine",
      loaded: Awaited<ReturnType<typeof loadSources>>,
    ) => {
      if (loaded.errors.length > 0) {
        setError(loaded.errors.join(" "));
      }
      if (loaded.sources.length === 0) {
        return;
      }
      if (mode === "open") {
        clearRenderCache();
        setTool("select");
        mergeBytes(loaded.bytes);
        dispatch({
          type: "open",
          sources: loaded.sources,
          pages: loaded.pages,
        });
        setStatus(
          `Opened ${loaded.sources.map((s) => basename(s.path)).join(", ")}.`,
        );
        return;
      }
      mergeBytes(loaded.bytes);
      if (mode === "insert") {
        const afterIndex =
          selectedPageIndices(session.selection).size > 0
            ? Math.max(...selectedPageIndices(session.selection))
            : session.focused;
        dispatch({
          type: "insert",
          sources: loaded.sources,
          pages: loaded.pages,
          afterIndex,
        });
        setStatus(`Inserted ${loaded.pages.length} page(s).`);
        return;
      }
      dispatch({
        type: "combine",
        sources: loaded.sources,
        pages: loaded.pages,
      });
      setStatus(`Combined ${loaded.sources.length} file(s).`);
    },
    [mergeBytes, session.focused, session.selection],
  );

  const runOpen = useCallback(
    async (mode: "open" | "insert" | "combine") => {
      setError(null);
      setBusy(true);
      try {
        const picked = await pickOpenDocuments(mode !== "open");
        if (!picked || picked.length === 0) {
          setStatus("Cancelled.");
          return;
        }
        applyLoaded(mode, await loadSources(picked));
      } finally {
        setBusy(false);
      }
    },
    [applyLoaded],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fixtures = params.get("fixtures");
    if (!fixtures) {
      return;
    }
    const names = fixtures
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        const picked = await loadPdfsFromUrls(
          names.map((name) => `/fixtures/${name}.pdf`),
        );
        if (cancelled) {
          return;
        }
        const loaded = await loadSources(picked);
        if (loaded.errors.length > 0) {
          setError(loaded.errors.join(" "));
        }
        if (loaded.sources.length === 0) {
          return;
        }
        clearRenderCache();
        setTool("select");
        mergeBytes(loaded.bytes);
        dispatch({
          type: "open",
          sources: loaded.sources,
          pages: loaded.pages,
        });
        setStatus(
          `Opened ${loaded.sources.map((s) => basename(s.path)).join(", ")}.`,
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Fixture load failed.");
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Bootstrap once from the URL. Do not re-run when session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSave = useCallback(async () => {
    setError(null);
    const plan = buildExportPlan(session);
    if (!plan.ok) {
      setError("Nothing to save. Add at least one page.");
      return;
    }
    setBusy(true);
    try {
      const path = await pickSavePdf("composed.pdf");
      if (!path) {
        setStatus("Save cancelled.");
        return;
      }
      const bytes = await writePdfFromPlan(plan.pages, sourceBytes, stampBytes);
      await writePdfBytes(path, bytes);
      setStatus(
        `Saved ${basename(path)}. Rearranging pages invalidates digital signatures.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }, [session, sourceBytes, stampBytes]);

  const placeFromLibrary = useCallback(
    (signatureId: SignatureId) => {
      const pageIndex = session.focused;
      if (pageIndex === null) {
        setStatus("Select a page first.");
        return;
      }
      const png = pngOf(vault, signatureId);
      if (!png) {
        return;
      }
      const info = infoOf(vault, signatureId);
      const stampId = mintStampId();
      setStampBytes((prev) => new Map(prev).set(stampId, png.slice()));
      dispatch({
        type: "placeStamp",
        pageIndex,
        stamp: {
          id: stampId,
          rect: defaultStampRect(
            aspectFromPixelSize(info.pixelSize) / pageAspect(),
          ),
        },
      });
      setTool("select");
      dispatch({ type: "setWorkspace", workspace: "view" });
      setStatus("Signature placed.");
    },
    [session.focused, vault],
  );

  const onSelect = useCallback(
    (index: number, event: MouseEvent) => {
      if (event.metaKey || event.ctrlKey) {
        dispatch({ type: "select", indices: [index], mode: "toggle" });
        return;
      }
      if (event.shiftKey && session.focused !== null) {
        const start = Math.min(session.focused, index);
        const end = Math.max(session.focused, index);
        const indices = Array.from(
          { length: end - start + 1 },
          (_, offset) => start + offset,
        );
        dispatch({ type: "select", indices, mode: "replace" });
        return;
      }
      dispatch({ type: "select", indices: [index], mode: "replace" });
    },
    [session.focused],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTool("select");
      if (busy) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        event.target instanceof HTMLElement &&
        event.target.closest(".signature-pad")
      ) {
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const stamp = selectedStamp(session.selection);
        if (stamp) {
          event.preventDefault();
          dispatch({
            type: "removeStamp",
            pageIndex: stamp.pageIndex,
            stampId: stamp.stampId,
          });
          setStatus("Object removed.");
          return;
        }
        const indices = [...selectedPageIndices(session.selection)];
        if (indices.length === 0) {
          return;
        }
        event.preventDefault();
        dispatch({ type: "delete", indices });
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session.selection, busy]);

  const focusedPage =
    session.focused !== null ? (session.pages[session.focused] ?? null) : null;
  const pageIndices = selectedPageIndices(session.selection);
  const stampSel = selectedStamp(session.selection);

  const selectedObject = stampSel ? session.pages[stampSel.pageIndex]?.stamps.find((stamp) => stamp.id === stampSel.stampId) : undefined;

  function pageAspect() {
    const focusedStack =
      session.focused !== null
        ? document.querySelector(`.page-preview [data-page-index="${session.focused}"] .page-stack`)
        : null;
    const bounds = (focusedStack ?? document.querySelector(".page-preview .page-stack"))?.getBoundingClientRect();
    return bounds && bounds.width > 0 && bounds.height > 0 ? bounds.width / bounds.height : 0.8;
  }

  function placeObject(pageIndex: number, stamp: Stamp) {
    if (busy) return;
    dispatch({ type: "placeStamp", pageIndex, stamp });
    setStatus(`${stamp.label ?? stamp.content?.kind ?? "Object"} added.`);
  }

  function addText() {
    if (session.focused === null) return;
    setTool("select");
    const content = textContent("Text", markupStyle.fontSize, markupStyle.color);
    const w = Math.min(0.8, content.width / 800);
    const h = Math.min(0.8, content.height / 800 * pageAspect());
    placeObject(session.focused, { id: mintStampId(), content, rect: displayNormRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h }) });
  }

  function runPrint() {
    if (session.pages.length === 0) return;
    window.print();
    setStatus("Print dialog opened.");
  }

  async function addImage() {
    if (session.focused === null) return;
    const pageIndex = session.focused;
    const aspect = pageAspect();
    setBusy(true);
    setError(null);
    try {
      const picked = await pickImage("Choose an image to overlay");
      if (!picked) return;
      const image = await importOverlayImage(picked.bytes);
      const id = mintStampId();
      setStampBytes((previous) => new Map(previous).set(id, image.bytes));
      dispatch({ type: "placeStamp", pageIndex, stamp: { id, label: basename(picked.path), rect: defaultStampRect(image.width / image.height / aspect) } });
      setTool("select");
      setStatus("Image added. Drag it to move; use a corner to resize.");
    } catch {
      setError("Could not insert that image. Choose a valid PNG or JPEG.");
    } finally {
      setBusy(false);
    }
  }

  function editObject(content: MarkupContent) {
    if (!selectedObject || !stampSel) return;
    let rect = selectedObject.rect;
    const previous = selectedObject.content;
    if (previous?.kind === "text" && content.kind === "text") {
      const swapped = selectedObject.rotation === 90 || selectedObject.rotation === 270;
      const scaleW = swapped ? content.height / previous.height : content.width / previous.width;
      const scaleH = swapped ? content.width / previous.width : content.height / previous.height;
      rect = displayNormRect({ ...rect, w: rect.w * scaleW, h: rect.h * scaleH });
    }
    dispatch({ type: "editStamp", pageIndex: stampSel.pageIndex, stamp: { ...selectedObject, rect, content } });
  }

  function onDelete() {
    if (stampSel) {
      dispatch({
        type: "removeStamp",
        pageIndex: stampSel.pageIndex,
        stampId: stampSel.stampId,
      });
      setStatus("Object removed.");
      return;
    }
    dispatch({
      type: "delete",
      indices:
        pageIndices.size > 0
          ? [...pageIndices]
          : session.focused !== null
            ? [session.focused]
            : [],
    });
  }

  return (
    <div
      className="app"
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = busy ? "none" : "copy";
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer.files);
        if (files.length === 0) return;
        event.preventDefault();
        if (busy || dropInProgress.current) return;
        const documents = files.filter(isSupportedDocument);
        if (documents.length === 0) {
          setError("Drop PDF, PNG, or JPEG files to add pages.");
          return;
        }
        dropInProgress.current = true;
        setBusy(true);
        setError(null);
        void (async () => {
          try {
            const picked = await Promise.all(documents.map(async (file) => ({
              path: file.name,
              bytes: new Uint8Array(await file.arrayBuffer()),
            })));
            applyLoaded(session.pages.length === 0 ? "open" : "combine", await loadSources(picked));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not read dropped files.");
          } finally {
            dropInProgress.current = false;
            setBusy(false);
          }
        })();
      }}
    >
      <Toolbar
        workspace={session.workspace}
        documentTitle={
          session.pages.length === 0
            ? "PDF Manager"
            : basename(
                [...session.sources.values()][0]?.path ?? "Untitled",
              )
        }
        canUndo={session.past.length > 0}
        canRedo={session.future.length > 0}
        canSave={session.pages.length > 0}
        hasSelection={stampSel !== null || pageIndices.size > 0}
        busy={busy}
        signatureMenu={
          <SignatureMenu
            vault={vault}
            busy={busy}
            onPlace={placeFromLibrary}
            onDrawn={(png, pixelSize) => {
              const result = addDrawn(png, pixelSize);
              if (!result.ok) {
                setError(vaultMessage(result.error));
                return;
              }
              setVault(loadVault());
              setStatus("Signature saved.");
            }}
            onImport={() => {
              void (async () => {
                const picked = await pickImage();
                if (!picked) {
                  setStatus("Cancelled.");
                  return;
                }
                const result = await addImported(picked.bytes, picked.mime);
                if (!result.ok) {
                  setError(vaultMessage(result.error));
                  return;
                }
                setVault(loadVault());
                setStatus("Signature imported.");
              })();
            }}
            onRemove={(id) => {
              setVault(removeSignature(id));
              setStatus("Signature deleted.");
            }}
          />
        }
        onOpen={() => void runOpen("open")}
        onInsert={() => void runOpen("insert")}
        onCombine={() => void runOpen("combine")}
        onPrint={runPrint}
        canPrint={session.pages.length > 0}
        onSave={() => void runSave()}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onRotate={(delta) =>
          dispatch({
            type: "rotate",
            indices:
              pageIndices.size > 0
                ? [...pageIndices]
                : session.focused !== null
                  ? [session.focused]
                  : [],
            delta,
          })
        }
        onDelete={onDelete}
        onWorkspace={(workspace) => { setTool("select"); dispatch({ type: "setWorkspace", workspace }); }}
      />
      {error ? (
        <div className="banner" role="status">
          {error}
        </div>
      ) : null}
      <main className="workspace">
        {session.workspace === "view" ? (
          <div className="editor-layout">
            {focusedPage ? (
            <MarkupToolbar tool={tool} style={markupStyle} disabled={busy || !focusedPage} selected={tool === "select" ? selectedObject : undefined}
              onTool={(next) => { setTool(next); if (next !== "select" && session.focused !== null) dispatch({ type: "select", indices: [], mode: "replace" }); }}
              onStyle={setMarkupStyle} onImage={() => void addImage()} onText={addText} onEdit={editObject} />
            ) : null}
          <div className="view-layout">
            {session.pages.length > 0 ? (
            <PageRail
              pages={session.pages}
              sources={session.sources}
              sourceBytes={sourceBytes}
              stampBytes={stampBytes}
              focused={session.focused}
              selected={pageIndices}
              onFocus={(index) => dispatch({ type: "focus", index })}
              onSelect={onSelect}
              onMove={(from, to) => dispatch({ type: "move", from, to })}
            />
            ) : null}
            <PagePreview
              pages={session.pages}
              sourceBytes={sourceBytes}
              focused={session.focused}
              tool={tool}
              markupStyle={markupStyle}
              onPlace={placeObject}
              busy={busy}
              onOpen={() => void runOpen("open")}
              onCombine={() => void runOpen("combine")}
              stampBytes={stampBytes}
              selectedStampId={stampSel?.stampId ?? null}
              selectedStampPage={stampSel?.pageIndex ?? null}
              onSelectStamp={(pageIndex, stampId) => {
                dispatch({
                  type: "selectStamp",
                  pageIndex,
                  stampId,
                });
              }}
              onCommitStamp={(pageIndex, stampId, rect) => {
                dispatch({
                  type: "transformStamp",
                  pageIndex,
                  stampId,
                  rect,
                });
              }}
              onSelectPage={(pageIndex) => {
                dispatch({
                  type: "select",
                  indices: [pageIndex],
                  mode: "replace",
                });
              }}
              onFocus={(index) => dispatch({ type: "focus", index })}
            />
          </div>
          </div>
        ) : (
          <PageGrid
            pages={session.pages}
            sources={session.sources}
            sourceBytes={sourceBytes}
            stampBytes={stampBytes}
            selected={pageIndices}
            focused={session.focused}
            onSelect={onSelect}
            onFocus={(index) => dispatch({ type: "focus", index })}
            onMove={(from, to) => dispatch({ type: "move", from, to })}
          />
        )}
      </main>
      <footer className="status-bar" data-testid="status-bar">
        {status}
      </footer>
    </div>
  );
}
