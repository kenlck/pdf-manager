import type {
  DisplayNormRect,
  PageRef,
  Rotation,
  Source,
  SourceId,
  Stamp,
  StampId,
} from "./types";

export type Command =
  | { type: "open"; sources: Source[]; pages: PageRef[] }
  | { type: "insert"; sources: Source[]; pages: PageRef[]; afterIndex: number | null }
  | { type: "combine"; sources: Source[]; pages: PageRef[] }
  | { type: "move"; from: number; to: number }
  | { type: "rotate"; indices: number[]; delta: 90 | -90 }
  | { type: "delete"; indices: number[] }
  | { type: "select"; indices: number[]; mode: "replace" | "add" | "toggle" }
  | { type: "focus"; index: number | null }
  | { type: "setWorkspace"; workspace: "view" | "organize" }
  | { type: "placeStamp"; pageIndex: number; stamp: Stamp }
  | { type: "transformStamp"; pageIndex: number; stampId: StampId; rect: DisplayNormRect }
  | { type: "removeStamp"; pageIndex: number; stampId: StampId }
  | { type: "selectStamp"; pageIndex: number; stampId: StampId }
  | { type: "undo" }
  | { type: "redo" };

export type { PageRef, Rotation, Source, SourceId };
