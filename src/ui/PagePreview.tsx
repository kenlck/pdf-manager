import type { DisplayNormRect, PageRef, StampBytes, StampId, Stamp, MarkupTool } from "../domain/types";
import { DrawingLayer } from "./DrawingLayer";
import type { MarkupStyle } from "../markup/artwork";
import { StampLayer } from "./StampLayer";
import { usePageCanvas } from "./usePageCanvas";

type PagePreviewProps = {
  page: PageRef | null;
  bytes: Uint8Array | undefined;
  pageNumber: number | null;
  total: number;
  stampBytes: StampBytes;
  selectedStampId: StampId | null;
  onSelectStamp: (stampId: StampId) => void;
  onCommitStamp: (stampId: StampId, rect: DisplayNormRect) => void;
  onSelectPage: () => void;
  tool: MarkupTool;
  markupStyle: MarkupStyle;
  onPlace: (stamp: Stamp) => void;
  busy: boolean;
};

export function PagePreview(props: PagePreviewProps) {
  const canvasRef = usePageCanvas(props.page, props.bytes, 1.2);

  if (!props.page) {
    return (
      <section className="page-preview empty">
        <p>Open a PDF or image to begin.</p>
      </section>
    );
  }

  return (
    <section className="page-preview">
      <div className="page-preview-stage">
        <div className="page-stack">
          <canvas ref={canvasRef} />
          <StampLayer
            stamps={props.page.stamps}
            stampBytes={props.stampBytes}
            selectedStampId={props.selectedStampId}
            interactive={!props.busy && props.tool === "select"}
            onSelect={props.onSelectStamp}
            onCommit={props.onCommitStamp}
            onSelectPage={props.onSelectPage}
          />
          {!props.busy && props.tool !== "select" && <DrawingLayer key={`${props.page.sourceId}-${props.page.pageIndex}-${props.page.rotation}-${props.tool}`} tool={props.tool} style={props.markupStyle} onPlace={props.onPlace} />}
        </div>
      </div>
      <p className="page-preview-status">
        Page {props.pageNumber} of {props.total}
      </p>
    </section>
  );
}
