export type SourceId = string & { readonly __brand: "SourceId" };
export type StampId = string & { readonly __brand: "StampId" };
export type SignatureId = string & { readonly __brand: "SignatureId" };

export type Rotation = 0 | 90 | 180 | 270;

/** Unit square, top-left origin, after pdf.js page.rotation. Not PDF user space. */
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
  readonly content?: MarkupContent;
  readonly rotation?: Rotation;
  readonly label?: string;
};

export type MarkupTool = "select" | "pencil" | "rectangle" | "ellipse" | "line";
export type MarkupPoint = { readonly x: number; readonly y: number };
export type MarkupContent = {
  readonly width: number;
  readonly height: number;
  readonly color: string;
} & (
  | { readonly kind: "text"; readonly text: string; readonly fontSize: number }
  | { readonly kind: "pencil" | "line"; readonly points: readonly MarkupPoint[]; readonly strokeWidth: number }
  | { readonly kind: "rectangle" | "ellipse"; readonly strokeWidth: number; readonly fill: string }
);

export type PageRef = {
  sourceId: SourceId;
  pageIndex: number;
  rotation: Rotation;
  stamps: Stamp[];
};

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
  content?: MarkupContent;
  rotation?: Rotation;
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
