import { useCallback, useEffect, useReducer, useState } from "react";
import type { MouseEvent } from "react";
import type { Command } from "./domain/commands";
import { buildExportPlan } from "./domain/exportPlan";
import { apply, createSession, pagesFromSource } from "./domain/session";
import type { PageRef, Source, SourceId } from "./domain/types";
import { selectedPageIndices } from "./domain/types";
import { openPdf } from "./pdf/openPdf";
import { clearRenderCache } from "./pdf/render";
import { writePdfFromPlan } from "./pdf/write";
import {
  isTauriRuntime,
  loadPdfsFromUrls,
  pickOpenPdfs,
  pickSavePdf,
  type PickedPdf,
  writePdfBytes,
} from "./shell/files";
import { PageGrid } from "./ui/PageGrid";
import { PagePreview } from "./ui/PagePreview";
import { PageRail } from "./ui/PageRail";
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

async function loadSources(picked: PickedPdf[]): Promise<{
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
      const result = await openPdf(item.bytes, item.path);
      if (!result.ok) {
        errors.push(`${basename(item.path)}: ${result.error.message}`);
        continue;
      }
      sources.push(result.source);
      pages.push(...pagesFromSource(result.source));
      bytes.set(result.source.id, result.bytes);
    } catch {
      errors.push(`${basename(item.path)}: This PDF could not be read.`);
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Open a PDF to begin.");
  const [browserNote, setBrowserNote] = useState(false);

  useEffect(() => {
    setBrowserNote(!isTauriRuntime());
  }, []);

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
        setSourceBytes(loaded.bytes);
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
        const picked = await pickOpenPdfs(mode !== "open");
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
        setSourceBytes(loaded.bytes);
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
      const bytes = await writePdfFromPlan(plan.pages, sourceBytes, new Map());
      await writePdfBytes(path, bytes);
      setStatus(
        `Saved ${basename(path)}. Rearranging pages invalidates digital signatures.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }, [session, sourceBytes]);

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
      const pageIndices = selectedPageIndices(session.selection);
      if (event.key === "Delete" || event.key === "Backspace") {
        if (pageIndices.size === 0) {
          return;
        }
        event.preventDefault();
        dispatch({
          type: "delete",
          indices: [...pageIndices],
        });
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session.selection]);

  const focusedPage =
    session.focused !== null ? (session.pages[session.focused] ?? null) : null;
  const focusedBytes = focusedPage
    ? sourceBytes.get(focusedPage.sourceId)
    : undefined;
  const pageIndices = selectedPageIndices(session.selection);

  return (
    <div className="app">
      <Toolbar
        workspace={session.workspace}
        canUndo={session.past.length > 0}
        canRedo={session.future.length > 0}
        canSave={session.pages.length > 0}
        hasSelection={pageIndices.size > 0}
        busy={busy}
        onOpen={() => void runOpen("open")}
        onInsert={() => void runOpen("insert")}
        onCombine={() => void runOpen("combine")}
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
        onDelete={() =>
          dispatch({
            type: "delete",
            indices:
              pageIndices.size > 0
                ? [...pageIndices]
                : session.focused !== null
                  ? [session.focused]
                  : [],
          })
        }
        onWorkspace={(workspace) =>
          dispatch({ type: "setWorkspace", workspace })
        }
      />
      {(error || browserNote) && (
        <div className="banner" role="status">
          {error ??
            "Browser mode. Open/Insert/Combine use the file picker. Save as downloads a PDF."}
        </div>
      )}
      <main className="workspace">
        {session.workspace === "view" ? (
          <div className="view-layout">
            <PageRail
              pages={session.pages}
              sources={session.sources}
              sourceBytes={sourceBytes}
              focused={session.focused}
              selected={pageIndices}
              onFocus={(index) => dispatch({ type: "focus", index })}
              onSelect={onSelect}
              onMove={(from, to) => dispatch({ type: "move", from, to })}
            />
            <PagePreview
              page={focusedPage}
              bytes={focusedBytes}
              pageNumber={session.focused !== null ? session.focused + 1 : null}
              total={session.pages.length}
            />
          </div>
        ) : (
          <PageGrid
            pages={session.pages}
            sources={session.sources}
            sourceBytes={sourceBytes}
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
