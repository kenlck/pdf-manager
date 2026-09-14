import { useEffect, useRef } from "react";
import type { DisplayNormRect, PageRef, SourceId, StampBytes, StampId, Stamp, MarkupTool } from "../domain/types";
import { DrawingLayer } from "./DrawingLayer";
import type { MarkupStyle } from "../markup/artwork";
import { StampLayer } from "./StampLayer";
import { usePageCanvas } from "./usePageCanvas";

type PagePreviewProps = {
  pages: PageRef[];
  sourceBytes: Map<SourceId, Uint8Array>;
  focused: number | null;
  stampBytes: StampBytes;
  selectedStampId: StampId | null;
  selectedStampPage: number | null;
  onSelectStamp: (pageIndex: number, stampId: StampId) => void;
  onCommitStamp: (pageIndex: number, stampId: StampId, rect: DisplayNormRect) => void;
  onSelectPage: (pageIndex: number) => void;
  onFocus: (pageIndex: number) => void;
  tool: MarkupTool;
  markupStyle: MarkupStyle;
  onPlace: (pageIndex: number, stamp: Stamp) => void;
  busy: boolean;
  onOpen: () => void;
  onCombine: () => void;
};

type PreviewPageProps = {
  page: PageRef;
  index: number;
  bytes: Uint8Array | undefined;
  focused: boolean;
  stampBytes: StampBytes;
  selectedStampId: StampId | null;
  onSelectStamp: (pageIndex: number, stampId: StampId) => void;
  onCommitStamp: (pageIndex: number, stampId: StampId, rect: DisplayNormRect) => void;
  onSelectPage: (pageIndex: number) => void;
  onFocus: (pageIndex: number) => void;
  tool: MarkupTool;
  markupStyle: MarkupStyle;
  onPlace: (pageIndex: number, stamp: Stamp) => void;
  busy: boolean;
};

function PreviewPage(props: PreviewPageProps) {
  const { page, index } = props;
  const canvasRef = usePageCanvas(page, props.bytes, 1.2);

  return (
    <figure
      data-page-index={index}
      className={props.focused ? "focused" : undefined}
      onPointerDown={() => props.onFocus(index)}
    >
      <div className="page-stack">
        <canvas ref={canvasRef} />
        <StampLayer
          stamps={page.stamps}
          stampBytes={props.stampBytes}
          selectedStampId={props.selectedStampId}
          interactive={!props.busy && props.tool === "select"}
          onSelect={(stampId) => props.onSelectStamp(index, stampId)}
          onCommit={(stampId, rect) => props.onCommitStamp(index, stampId, rect)}
          onSelectPage={() => props.onSelectPage(index)}
        />
        {!props.busy && props.tool !== "select" && (
          <DrawingLayer
            key={`${page.sourceId}-${page.pageIndex}-${page.rotation}-${props.tool}`}
            tool={props.tool}
            style={props.markupStyle}
            onPlace={(stamp) => props.onPlace(index, stamp)}
          />
        )}
      </div>
      <figcaption className="page-label">{index + 1}</figcaption>
    </figure>
  );
}

export function PagePreview(props: PagePreviewProps) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (props.focused === null) return;
    const node = rootRef.current?.querySelector(`[data-page-index="${props.focused}"]`);
    node?.scrollIntoView?.({ block: "nearest" });
  }, [props.focused]);

  if (props.pages.length === 0) {
    return (
      <section className="page-preview empty">
        <div className="empty-hero">
          <h2>Open a PDF</h2>
          <p>Drop a file here, or choose Open. Insert and Combine stay available after the first document.</p>
          <div className="empty-actions">
            <button type="button" className="pill blue" onClick={props.onOpen} disabled={props.busy}>
              Open
            </button>
            <button type="button" className="pill" onClick={props.onCombine} disabled={props.busy}>
              Combine
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={rootRef} className="page-preview">
      <div className="page-preview-stage">
        {props.pages.map((page, index) => (
          <PreviewPage
            key={`${page.sourceId}-${page.pageIndex}-${index}`}
            page={page}
            index={index}
            bytes={props.sourceBytes.get(page.sourceId)}
            focused={props.focused === index}
            stampBytes={props.stampBytes}
            selectedStampId={props.selectedStampPage === index ? props.selectedStampId : null}
            onSelectStamp={props.onSelectStamp}
            onCommitStamp={props.onCommitStamp}
            onSelectPage={props.onSelectPage}
            onFocus={props.onFocus}
            tool={props.tool}
            markupStyle={props.markupStyle}
            onPlace={props.onPlace}
            busy={props.busy}
          />
        ))}
      </div>
    </section>
  );
}
