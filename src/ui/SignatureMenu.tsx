import { useEffect, useRef, useState } from "react";
import type { SignatureId } from "../domain/types";
import {
  pngOf,
  type Vault,
} from "../signatures/vault";
import { SignaturePad } from "./SignaturePad";

type SignatureMenuProps = {
  vault: Vault;
  busy: boolean;
  onPlace: (id: SignatureId) => void;
  onDrawn: (png: Uint8Array, pixelSize: { width: number; height: number }) => void;
  onImport: () => void;
  onRemove: (id: SignatureId) => void;
};

export function SignatureMenu(props: SignatureMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [thumbs, setThumbs] = useState<Map<SignatureId, string>>(() => new Map());

  useEffect(() => {
    const next = new Map<SignatureId, string>();
    for (const entry of props.vault.entries) {
      const png = pngOf(props.vault, entry.id);
      if (png) {
        next.set(entry.id, URL.createObjectURL(new Blob([png], { type: "image/png" })));
      }
    }
    setThumbs(next);
    return () => {
      for (const url of next.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, [props.vault]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDoc(event: MouseEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setDrawing(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="signature-menu" ref={rootRef}>
      <button
        type="button"
        className="pill blue"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((value) => !value);
          setDrawing(false);
        }}
        disabled={props.busy}
      >
        Sign
      </button>
      {open ? (
        <div className="signature-menu-panel">
          {drawing ? (
            <SignaturePad
              onSave={(png, pixelSize) => {
                props.onDrawn(png, pixelSize);
                setDrawing(false);
              }}
              onCancel={() => setDrawing(false)}
            />
          ) : (
            <>
              <h3 className="signature-menu-heading">Signatures</h3>
              {props.vault.entries.length === 0 ? (
                <p className="signature-menu-empty">No saved signatures.</p>
              ) : (
                <ul className="signature-menu-list">
                  {props.vault.entries.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className="signature-menu-item"
                        onClick={() => {
                          props.onPlace(entry.id);
                          setOpen(false);
                        }}
                      >
                        {thumbs.get(entry.id) ? (
                          <img src={thumbs.get(entry.id)} alt="" />
                        ) : null}
                        <span>{entry.kind === "drawn" ? "Drawn" : "Imported"}</span>
                      </button>
                      <button
                        type="button"
                        className="signature-menu-delete"
                        aria-label="Delete signature"
                        onClick={() => props.onRemove(entry.id)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="signature-menu-actions">
                <button type="button" onClick={() => setDrawing(true)}>
                  Draw
                </button>
                <button type="button" onClick={() => void props.onImport()}>
                  Import
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
