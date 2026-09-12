import type { PageRef } from "../domain/types";
import { usePageCanvas } from "./usePageCanvas";

type PagePreviewProps = {
  page: PageRef | null;
  bytes: Uint8Array | undefined;
  pageNumber: number | null;
  total: number;
};

export function PagePreview(props: PagePreviewProps) {
  const canvasRef = usePageCanvas(props.page, props.bytes, 1.2);

  if (!props.page) {
    return (
      <section className="page-preview empty">
        <p>Open a PDF to begin.</p>
      </section>
    );
  }

  return (
    <section className="page-preview">
      <div className="page-preview-stage">
        <canvas ref={canvasRef} />
      </div>
      <p className="page-preview-status">
        Page {props.pageNumber} of {props.total}
      </p>
    </section>
  );
}
