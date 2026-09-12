import type { MouseEvent } from "react";
import type { PageRef, Source, SourceId } from "../domain/types";
import { PageThumb } from "./PageThumb";

type PageRailProps = {
  pages: PageRef[];
  sources: Map<SourceId, Source>;
  sourceBytes: Map<SourceId, Uint8Array>;
  focused: number | null;
  selected: ReadonlySet<number>;
  onFocus: (index: number) => void;
  onSelect: (index: number, event: MouseEvent) => void;
};

export function PageRail(props: PageRailProps) {
  return (
    <aside className="page-rail" aria-label="Page thumbnails">
      {props.pages.map((page, index) => (
        <PageThumb
          key={`${page.sourceId}-${page.pageIndex}-${index}`}
          page={page}
          source={props.sources.get(page.sourceId)}
          bytes={props.sourceBytes.get(page.sourceId)}
          label={`${index + 1}`}
          selected={props.selected.has(index) || props.focused === index}
          scale={0.15}
          onClick={(event) => {
            props.onSelect(index, event);
            props.onFocus(index);
          }}
        />
      ))}
    </aside>
  );
}
