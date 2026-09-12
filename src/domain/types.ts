export type SourceId = string & { readonly __brand: "SourceId" };
export type StampId = string & { readonly __brand: "StampId" };
export type SignatureId = string & { readonly __brand: "SignatureId" };

export type Rotation = 0 | 90 | 180 | 270;

/** Normalized displayed viewport after pdf.js page.rotation. Origin top-left. */
export type DisplayNormRect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly __brand: "DisplayNormRect";
};

export type Stamp = {
  readonly id: StampId;
  readonly rect: DisplayNormRect;
};

export type PageRef = {
  sourceId: SourceId;
  pageIndex: number;
  rotation: Rotation;
  stamps: Stamp[];
};

/**
 * Page multi-select or exactly one stamp. Empty page set is "nothing selected".
 * Stamp selection implies focused === pageIndex (enforced in apply).
 */
export type Selection =
  | { kind: "pages"; indices: ReadonlySet<number> }
  | { kind: "stamp"; pageIndex: number; stampId: StampId };

export type Source = {
  id: SourceId;
  path: string;
  pageCount: number;
};

export type SessionSnapshot = {
  sources: Map<SourceId, Source>;
  pages: PageRef[];
  selection: Selection;
  focused: number | null;
  workspace: "view" | "organize";
};

export type Session = SessionSnapshot & {
  past: SessionSnapshot[];
  future: SessionSnapshot[];
};

export type ExportStamp = {
  stampId: StampId;
  rect: DisplayNormRect;
};

export type ExportPage = {
  sourceId: SourceId;
  pageIndex: number;
  rotation: Rotation;
  stamps: ExportStamp[];
};

export type StampBytes = Map<StampId, Uint8Array>;

export type OpenPdfErrorKind = "encrypted" | "notPdf" | "unreadable";

export type OpenPdfError = {
  kind: OpenPdfErrorKind;
  path: string;
  message: string;
};

export function asSourceId(id: string): SourceId {
  return id as SourceId;
}

export function asStampId(id: string): StampId {
  return id as StampId;
}

export function asSignatureId(id: string): SignatureId {
  return id as SignatureId;
}

export function mintStampId(): StampId {
  return asStampId(`stamp-${crypto.randomUUID()}`);
}

export function selectedPageIndices(selection: Selection): ReadonlySet<number> {
  if (selection.kind === "pages") {
    return selection.indices;
  }
  return new Set();
}

export function selectedStamp(
  selection: Selection,
): { pageIndex: number; stampId: StampId } | null {
  if (selection.kind === "stamp") {
    return { pageIndex: selection.pageIndex, stampId: selection.stampId };
  }
  return null;
}
