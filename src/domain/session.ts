import type { Command } from "./commands";
import type {
  PageRef,
  Rotation,
  Session,
  SessionSnapshot,
  Source,
  SourceId,
} from "./types";

const MAX_HISTORY = 100;

function cloneSources(sources: Map<SourceId, Source>): Map<SourceId, Source> {
  return new Map(
    [...sources.entries()].map(([id, source]) => [id, { ...source }]),
  );
}

function snapshotOf(session: SessionSnapshot): SessionSnapshot {
  return {
    sources: cloneSources(session.sources),
    pages: session.pages.map((page) => ({ ...page })),
    selected: new Set(session.selected),
    focused: session.focused,
    workspace: session.workspace,
  };
}

function pushHistory(session: Session): Session {
  const past = [...session.past, snapshotOf(session)];
  if (past.length > MAX_HISTORY) {
    past.shift();
  }
  return { ...session, past, future: [] };
}

function remappedSelection(
  selected: ReadonlySet<number>,
  mapIndex: (index: number) => number | null,
): Set<number> {
  const next = new Set<number>();
  for (const index of selected) {
    const mapped = mapIndex(index);
    if (mapped !== null) {
      next.add(mapped);
    }
  }
  return next;
}

function clampFocus(
  focused: number | null,
  pageCount: number,
): number | null {
  if (pageCount === 0) {
    return null;
  }
  if (focused === null) {
    return 0;
  }
  return Math.max(0, Math.min(focused, pageCount - 1));
}

function mergeSources(
  existing: Map<SourceId, Source>,
  incoming: Source[],
): Map<SourceId, Source> {
  const next = cloneSources(existing);
  for (const source of incoming) {
    next.set(source.id, { ...source });
  }
  return next;
}

function normalizeRotation(value: number): Rotation {
  const normalized = ((value % 360) + 360) % 360;
  if (
    normalized === 0 ||
    normalized === 90 ||
    normalized === 180 ||
    normalized === 270
  ) {
    return normalized;
  }
  return 0;
}

function applyMutating(session: Session, command: Command): Session {
  switch (command.type) {
    case "open": {
      return {
        ...session,
        sources: mergeSources(new Map(), command.sources),
        pages: command.pages.map((page) => ({ ...page })),
        selected: new Set(),
        focused: command.pages.length > 0 ? 0 : null,
      };
    }
    case "insert": {
      const insertAt =
        command.afterIndex === null
          ? session.pages.length
          : Math.max(0, Math.min(command.afterIndex + 1, session.pages.length));
      const pages = [
        ...session.pages.slice(0, insertAt),
        ...command.pages.map((page) => ({ ...page })),
        ...session.pages.slice(insertAt),
      ];
      const shift = command.pages.length;
      const selected = remappedSelection(session.selected, (index) =>
        index >= insertAt ? index + shift : index,
      );
      const focused =
        session.focused === null
          ? null
          : session.focused >= insertAt
            ? session.focused + shift
            : session.focused;
      return {
        ...session,
        sources: mergeSources(session.sources, command.sources),
        pages,
        selected,
        focused: clampFocus(focused, pages.length),
      };
    }
    case "combine": {
      const pages = [
        ...session.pages,
        ...command.pages.map((page) => ({ ...page })),
      ];
      return {
        ...session,
        sources: mergeSources(session.sources, command.sources),
        pages,
        focused: clampFocus(session.focused, pages.length),
      };
    }
    case "move": {
      const { from, to } = command;
      if (
        from < 0 ||
        from >= session.pages.length ||
        to < 0 ||
        to >= session.pages.length ||
        from === to
      ) {
        return session;
      }
      const pages = [...session.pages];
      const [moved] = pages.splice(from, 1);
      pages.splice(to, 0, moved);
      const selected = remappedSelection(session.selected, (index) => {
        if (index === from) {
          return to;
        }
        if (from < to) {
          if (index > from && index <= to) {
            return index - 1;
          }
        } else if (index >= to && index < from) {
          return index + 1;
        }
        return index;
      });
      const focused =
        session.focused === null
          ? null
          : session.focused === from
            ? to
            : from < to &&
                session.focused > from &&
                session.focused <= to
              ? session.focused - 1
              : from > to &&
                  session.focused >= to &&
                  session.focused < from
                ? session.focused + 1
                : session.focused;
      return { ...session, pages, selected, focused };
    }
    case "rotate": {
      const indices = new Set(command.indices);
      const pages = session.pages.map((page, index) => {
        if (!indices.has(index)) {
          return page;
        }
        return {
          ...page,
          rotation: normalizeRotation(page.rotation + command.delta),
        };
      });
      return { ...session, pages };
    }
    case "delete": {
      const remove = new Set(command.indices);
      if (remove.size === 0) {
        return session;
      }
      const pages: PageRef[] = [];
      const indexMap = new Map<number, number>();
      session.pages.forEach((page, index) => {
        if (remove.has(index)) {
          return;
        }
        indexMap.set(index, pages.length);
        pages.push(page);
      });
      const selected = remappedSelection(
        session.selected,
        (index) => indexMap.get(index) ?? null,
      );
      let focused: number | null = null;
      if (session.focused !== null) {
        if (indexMap.has(session.focused)) {
          focused = indexMap.get(session.focused)!;
        } else {
          const next = [...indexMap.entries()]
            .filter(([old]) => old > session.focused!)
            .sort((a, b) => a[0] - b[0])[0];
          const prev = [...indexMap.entries()]
            .filter(([old]) => old < session.focused!)
            .sort((a, b) => b[0] - a[0])[0];
          focused = next?.[1] ?? prev?.[1] ?? null;
        }
      }
      return {
        ...session,
        pages,
        selected,
        focused: clampFocus(focused, pages.length),
      };
    }
    case "select": {
      const next = new Set(
        command.mode === "replace" ? [] : session.selected,
      );
      for (const index of command.indices) {
        if (index < 0 || index >= session.pages.length) {
          continue;
        }
        if (command.mode === "toggle" && next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
      }
      return { ...session, selected: next };
    }
    case "focus": {
      return {
        ...session,
        focused: clampFocus(command.index, session.pages.length),
      };
    }
    case "setWorkspace": {
      return { ...session, workspace: command.workspace };
    }
    case "undo":
    case "redo":
      return session;
  }
}

export function createSession(): Session {
  return {
    sources: new Map(),
    pages: [],
    selected: new Set(),
    focused: null,
    workspace: "view",
    past: [],
    future: [],
  };
}

export function apply(session: Session, command: Command): Session {
  if (command.type === "undo") {
    if (session.past.length === 0) {
      return session;
    }
    const past = [...session.past];
    const previous = past.pop()!;
    return {
      ...previous,
      past,
      future: [snapshotOf(session), ...session.future],
    };
  }

  if (command.type === "redo") {
    if (session.future.length === 0) {
      return session;
    }
    const [next, ...future] = session.future;
    return {
      ...next,
      past: [...session.past, snapshotOf(session)],
      future,
    };
  }

  const next = applyMutating(session, command);
  if (next === session) {
    return session;
  }

  const historyCommands = new Set([
    "open",
    "insert",
    "combine",
    "move",
    "rotate",
    "delete",
  ]);
  if (!historyCommands.has(command.type)) {
    return next;
  }

  const recorded = pushHistory(session);
  return { ...next, past: recorded.past, future: recorded.future };
}

export function pagesFromSource(source: Source): PageRef[] {
  return Array.from({ length: source.pageCount }, (_, pageIndex) => ({
    sourceId: source.id,
    pageIndex,
    rotation: 0 as Rotation,
  }));
}
