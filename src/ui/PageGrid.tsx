import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { PageRef, Source, SourceId } from "../domain/types";
import { PageThumb } from "./PageThumb";

const ROW_ESTIMATE = 180;
const BUFFER = 4;

type PageGridProps = {
  pages: PageRef[];
  sources: Map<SourceId, Source>;
  sourceBytes: Map<SourceId, Uint8Array>;
  selected: ReadonlySet<number>;
  focused: number | null;
  onSelect: (index: number, event: MouseEvent) => void;
  onFocus: (index: number) => void;
  onMove: (from: number, to: number) => void;
};

export function PageGrid(props: PageGridProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 24 });
  const dragFrom = useRef<number | null>(null);

  const columns = 4;
  const rowCount = Math.ceil(props.pages.length / columns);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    const update = () => {
      const startRow = Math.max(
        0,
        Math.floor(el.scrollTop / ROW_ESTIMATE) - BUFFER,
      );
      const visibleRows =
        Math.ceil(el.clientHeight / ROW_ESTIMATE) + BUFFER * 2;
      const start = startRow * columns;
      const end = Math.min(
        props.pages.length,
        (startRow + visibleRows) * columns,
      );
      setRange({ start, end });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [props.pages.length, columns]);

  const visible = useMemo(
    () =>
      props.pages
        .slice(range.start, range.end)
        .map((page, offset) => ({ page, index: range.start + offset })),
    [props.pages, range.start, range.end],
  );

  return (
    <div className="page-grid-scroller" ref={scrollerRef}>
      <div
        className="page-grid-spacer"
        style={{ height: rowCount * ROW_ESTIMATE }}
      >
        <div
          className="page-grid"
          style={{
            transform: `translateY(${Math.floor(range.start / columns) * ROW_ESTIMATE}px)`,
          }}
        >
          {visible.map(({ page, index }) => (
            <PageThumb
              key={`${page.sourceId}-${page.pageIndex}-${index}`}
              page={page}
              source={props.sources.get(page.sourceId)}
              bytes={props.sourceBytes.get(page.sourceId)}
              label={`${index + 1}`}
              selected={props.selected.has(index) || props.focused === index}
              scale={0.25}
              draggable
              onClick={(event) => {
                props.onSelect(index, event);
                props.onFocus(index);
              }}
              onDragStart={() => {
                dragFrom.current = index;
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFrom.current === null) {
                  return;
                }
                props.onMove(dragFrom.current, index);
                dragFrom.current = null;
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
