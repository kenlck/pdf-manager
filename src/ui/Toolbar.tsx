import type { ReactNode } from "react";

type ToolbarProps = {
  workspace: "view" | "organize";
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  hasSelection: boolean;
  busy: boolean;
  signatureMenu: ReactNode;
  onOpen: () => void;
  onInsert: () => void;
  onCombine: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRotate: (delta: 90 | -90) => void;
  onDelete: () => void;
  onWorkspace: (workspace: "view" | "organize") => void;
};

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button type="button" onClick={props.onOpen} disabled={props.busy}>
          Open
        </button>
        <button type="button" onClick={props.onInsert} disabled={props.busy}>
          Insert
        </button>
        <button type="button" onClick={props.onCombine} disabled={props.busy}>
          Combine
        </button>
        <button
          type="button"
          onClick={props.onSave}
          disabled={props.busy || !props.canSave}
        >
          Save as
        </button>
      </div>
      <div className="toolbar-group workspace-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={props.workspace === "view"}
          className={props.workspace === "view" ? "active" : ""}
          onClick={() => props.onWorkspace("view")}
        >
          View
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.workspace === "organize"}
          className={props.workspace === "organize" ? "active" : ""}
          onClick={() => props.onWorkspace("organize")}
        >
          Organize
        </button>
      </div>
      <div className="toolbar-group">
        <button
          type="button"
          onClick={props.onUndo}
          disabled={!props.canUndo || props.busy}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={props.onRedo}
          disabled={!props.canRedo || props.busy}
        >
          Redo
        </button>
        <button
          type="button"
          onClick={() => props.onRotate(-90)}
          disabled={!props.hasSelection || props.busy}
        >
          Rotate left
        </button>
        <button
          type="button"
          onClick={() => props.onRotate(90)}
          disabled={!props.hasSelection || props.busy}
        >
          Rotate right
        </button>
        {props.signatureMenu}
        <button
          type="button"
          onClick={props.onDelete}
          disabled={!props.hasSelection || props.busy}
        >
          Delete
        </button>
      </div>
    </header>
  );
}
