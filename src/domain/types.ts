export type SourceId = string & { readonly __brand: "SourceId" };

export type Rotation = 0 | 90 | 180 | 270;

export type PageRef = {
  sourceId: SourceId;
  pageIndex: number;
  rotation: Rotation;
};

export type Source = {
  id: SourceId;
  path: string;
  pageCount: number;
};

export type SessionSnapshot = {
  sources: Map<SourceId, Source>;
  pages: PageRef[];
  selected: ReadonlySet<number>;
  focused: number | null;
  workspace: "view" | "organize";
};

export type Session = SessionSnapshot & {
  past: SessionSnapshot[];
  future: SessionSnapshot[];
};

export type ExportPage = {
  sourceId: SourceId;
  pageIndex: number;
  rotation: Rotation;
};

export type OpenPdfErrorKind = "encrypted" | "notPdf" | "unreadable";

export type OpenPdfError = {
  kind: OpenPdfErrorKind;
  path: string;
  message: string;
};

export function asSourceId(id: string): SourceId {
  return id as SourceId;
}
