import { useEffect, useRef, useState, type DragEventHandler } from "react";

type DragSession =
  | { source: number; target: number | null }
  | null;

export type PageReorderVisualState = "idle" | "drag-source" | "drop-target";

export type PageReorderItemBinding = {
  draggable: true;
  state: PageReorderVisualState;
  onDragStart: DragEventHandler<HTMLButtonElement>;
  onDragOver: DragEventHandler<HTMLButtonElement>;
  onDrop: DragEventHandler<HTMLButtonElement>;
  onDragEnd: DragEventHandler<HTMLButtonElement>;
};

function visualState(
  session: DragSession,
  index: number,
): PageReorderVisualState {
  if (session === null) {
    return "idle";
  }
  if (index === session.source) {
    return "drag-source";
  }
  if (index === session.target) {
    return "drop-target";
  }
  return "idle";
}

function inRange(index: number, pageCount: number): boolean {
  return index >= 0 && index < pageCount;
}

export function usePageReorder(options: {
  pageCount: number;
  onMove: (from: number, to: number) => void;
}): (index: number) => PageReorderItemBinding {
  const [session, setSession] = useState<DragSession>(null);
  const sessionRef = useRef<DragSession>(null);
  const clickGuards = useRef(new Set<() => void>());
  const pageCountRef = useRef(options.pageCount);
  const onMoveRef = useRef(options.onMove);
  pageCountRef.current = options.pageCount;
  onMoveRef.current = options.onMove;

  useEffect(() => {
    return () => {
      for (const cleanup of clickGuards.current) {
        cleanup();
      }
    };
  }, []);

  const commit = (next: DragSession) => {
    sessionRef.current = next;
    setSession(next);
  };

  const swallowPostDragClick = (source: EventTarget) => {
    if (!(source instanceof HTMLElement)) {
      return;
    }
    const consume = (clickEvent: Event) => {
      clickEvent.preventDefault();
      clickEvent.stopImmediatePropagation();
      cleanup();
    };
    const cleanup = () => {
      source.removeEventListener("click", consume, true);
      window.clearTimeout(timer);
      clickGuards.current.delete(cleanup);
    };
    const timer = window.setTimeout(cleanup, 400);
    source.addEventListener("click", consume, true);
    clickGuards.current.add(cleanup);
  };

  return (index: number): PageReorderItemBinding => ({
    draggable: true,
    state: visualState(session, index),
    onDragStart: (event) => {
      if (!inRange(index, pageCountRef.current)) {
        return;
      }
      const transfer = event.dataTransfer;
      if (transfer) {
        transfer.effectAllowed = "move";
        transfer.setData("text/plain", String(index));
      }
      commit({ source: index, target: null });
    },
    onDragOver: (event) => {
      event.preventDefault();
      const transfer = event.dataTransfer;
      if (transfer) {
        transfer.dropEffect = "move";
      }
      const current = sessionRef.current;
      if (current === null) {
        return;
      }
      if (current.target === index) {
        return;
      }
      commit({ source: current.source, target: index });
    },
    onDrop: (event) => {
      event.preventDefault();
      const current = sessionRef.current;
      commit(null);
      if (current === null) {
        return;
      }
      const source = current.source;
      const dest = index;
      const pageCount = pageCountRef.current;
      if (
        inRange(source, pageCount) &&
        inRange(dest, pageCount) &&
        source !== dest
      ) {
        onMoveRef.current(source, dest);
      }
    },
    onDragEnd: (event) => {
      commit(null);
      swallowPostDragClick(event.currentTarget);
    },
  });
}
