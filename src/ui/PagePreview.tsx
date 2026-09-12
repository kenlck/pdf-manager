import { useEffect, useRef } from "react";
import type { PageRef } from "../domain/types";
import { renderPageToCanvas } from "../pdf/render";

type PagePreviewProps = {
  page: PageRef | null;
  bytes: Uint8Array | undefined;
  pageNumber: number | null;
  total: number;
};

export function PagePreview(props: PagePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !props.page || !props.bytes) {
      return;
    }
    let cancelled = false;
    void renderPageToCanvas(
      props.page.sourceId,
      props.bytes,
      props.page.pageIndex,
      canvas,
      { scale: 1.2, rotation: props.page.rotation },
    ).catch(() => {
      if (!cancelled) {
        // leave blank on render failure
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.page, props.bytes]);

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
