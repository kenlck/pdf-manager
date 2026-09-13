import type { DisplayNormRect, PageRef, StampBytes, StampId } from "../domain/types";
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
            interactive
            onSelect={props.onSelectStamp}
            onCommit={props.onCommitStamp}
            onSelectPage={props.onSelectPage}
          />
        </div>
      </div>
      <p className="page-preview-status">
        Page {props.pageNumber} of {props.total}
      </p>
    </section>
  );
}
