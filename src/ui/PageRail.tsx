import type { MouseEvent } from "react";
import type { PageRef, Source, SourceId, StampBytes } from "../domain/types";
import { PageThumb } from "./PageThumb";
import { usePageReorder } from "./usePageReorder";

type PageRailProps = {
  pages: PageRef[];
  sources: Map<SourceId, Source>;
  sourceBytes: Map<SourceId, Uint8Array>;
  stampBytes: StampBytes;
  focused: number | null;
  selected: ReadonlySet<number>;
  onFocus: (index: number) => void;
  onSelect: (index: number, event: MouseEvent) => void;
  onMove: (from: number, to: number) => void;
};

export function PageRail(props: PageRailProps) {
  const bind = usePageReorder({
    pageCount: props.pages.length,
    onMove: props.onMove,
  });

  return (
    <aside className="page-rail" aria-label="Page thumbnails">
      {props.pages.map((page, index) => (
        <PageThumb
          key={`${page.sourceId}-${page.pageIndex}-${index}`}
          page={page}
          source={props.sources.get(page.sourceId)}
          bytes={props.sourceBytes.get(page.sourceId)}
          stampBytes={props.stampBytes}
          label={`${index + 1}`}
          selected={props.selected.has(index) || props.focused === index}
          scale={0.15}
          reorder={bind(index)}
          onClick={(event) => {
            props.onSelect(index, event);
            props.onFocus(index);
          }}
        />
      ))}
    </aside>
  );
}
