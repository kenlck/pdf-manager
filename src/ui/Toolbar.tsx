import type { ReactNode } from "react";

type ToolbarProps = {
  workspace: "view" | "organize";
  documentTitle: string;
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  canPrint: boolean;
  hasSelection: boolean;
  busy: boolean;
  signatureMenu: ReactNode;
  onOpen: () => void;
  onInsert: () => void;
  onCombine: () => void;
  onPrint: () => void;
  onSaveLive: () => void;
  onSaveOutlined: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRotate: (delta: 90 | -90) => void;
  onDelete: () => void;
  onWorkspace: (workspace: "view" | "organize") => void;
};

const icon: Record<string, string> = {
  Open: "M3.5 18.5V7.5A1.5 1.5 0 0 1 5 6h5l2 2h7a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5Z",
  Insert: "M12 5v14M5 12h14",
  Combine: "M3.5 4h10v13H3.5ZM10.5 7h10v13h-10Z",
  Undo: "M8 7H5v3M5.5 10a7 7 0 1 0 1.2-4.2",
  Redo: "M16 7h3v3M18.5 10a7 7 0 1 1-1.2-4.2",
  "Rotate left": "M4 12a8 8 0 1 0 3-6.3M4 4v6h6",
  "Rotate right": "M20 12a8 8 0 1 1-3-6.3M20 4v6h-6",
  Delete: "M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12",
};

function Tool(props: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={props.danger ? "tool danger" : "tool"}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={icon[props.label]} />
      </svg>
      <span className="sr-only">{props.label}</span>
    </button>
  );
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-leading">
        <p className="doc-title">{props.documentTitle}</p>
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
      <div className="toolbar-trailing">
        <div className="toolbar-group">
          <Tool label="Open" disabled={props.busy} onClick={props.onOpen} />
          <Tool label="Insert" disabled={props.busy} onClick={props.onInsert} />
          <Tool label="Combine" disabled={props.busy} onClick={props.onCombine} />
        </div>
        <div className="toolbar-group">
          <Tool
            label="Undo"
            disabled={!props.canUndo || props.busy}
            onClick={props.onUndo}
          />
          <Tool
            label="Redo"
            disabled={!props.canRedo || props.busy}
            onClick={props.onRedo}
          />
          <Tool
            label="Rotate left"
            disabled={!props.hasSelection || props.busy}
            onClick={() => props.onRotate(-90)}
          />
          <Tool
            label="Rotate right"
            disabled={!props.hasSelection || props.busy}
            onClick={() => props.onRotate(90)}
          />
          {props.signatureMenu}
          <Tool
            label="Delete"
            danger
            disabled={!props.hasSelection || props.busy}
            onClick={props.onDelete}
          />
        </div>
        <button
          type="button"
          className="pill"
          onClick={props.onPrint}
          disabled={props.busy || !props.canPrint}
        >
          Print
        </button>
        <button
          type="button"
          className="pill"
          title="Save a copy. Page text stays searchable and selectable."
          onClick={props.onSaveLive}
          disabled={props.busy || !props.canSave}
        >
          Save as
        </button>
        <button
          type="button"
          className="pill"
          title="Save a copy with page text converted to outlines for Illustrator. The copy is not searchable."
          onClick={props.onSaveOutlined}
          disabled={props.busy || !props.canSave}
        >
          Outline & Save as
        </button>
      </div>
    </header>
  );
}
