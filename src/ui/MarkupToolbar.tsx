import { useState } from "react";
import type { MarkupContent, MarkupTool, Stamp } from "../domain/types";
import { textContent, type MarkupStyle } from "../markup/artwork";

type Props = {
  tool: MarkupTool;
  style: MarkupStyle;
  disabled: boolean;
  selected: Stamp | undefined;
  onTool: (tool: MarkupTool) => void;
  onStyle: (style: MarkupStyle) => void;
  onImage: () => void;
  onText: () => void;
  onEdit: (content: MarkupContent) => void;
};

const tools: { tool: MarkupTool; label: string; path: string }[] = [
  { tool: "select", label: "Select", path: "m5 3 14 10-7 1-3 7Z" },
  { tool: "pencil", label: "Pencil", path: "m4 16-1 5 5-1L20 8l-4-4ZM13 7l4 4" },
  { tool: "rectangle", label: "Rectangle", path: "M4 5h16v14H4Z" },
  { tool: "ellipse", label: "Oval", path: "M21 12a9 7 0 1 1-18 0 9 7 0 1 1 18 0" },
  { tool: "line", label: "Line", path: "M4 20 20 4" },
];

function TextEditor({ content, onEdit }: { content: Extract<MarkupContent, { kind: "text" }>; onEdit: Props["onEdit"] }) {
  const [value, setValue] = useState(content.text);
  return <label className="text-editor">Text
    <textarea aria-label="Edit text" rows={2} value={value} onChange={(event) => setValue(event.target.value)}
      onBlur={() => { if (value !== content.text) onEdit(textContent(value, content.fontSize, content.color)); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) event.currentTarget.blur();
      }} />
    <span>Changes apply when you leave the box. Text you add remains editable in this session.</span>
  </label>;
}

export function MarkupToolbar(props: Props) {
  const content = props.selected?.content;
  const color = content?.color ?? props.style.color;
  const strokeWidth = content && "strokeWidth" in content ? content.strokeWidth : props.style.strokeWidth;
  const fill = content && "fill" in content ? content.fill : props.style.fill;
  const fontSize = content?.kind === "text" ? content.fontSize : props.style.fontSize;
  function changeStyle(patch: Partial<MarkupStyle>) {
    props.onStyle({ ...props.style, ...patch });
    if (!content) return;
    if (content.kind === "text") {
      props.onEdit(textContent(content.text, patch.fontSize ?? content.fontSize, patch.color ?? content.color));
    } else {
      props.onEdit({ ...content, ...patch });
    }
  }
  return <div className="markup-panel">
    <fieldset className="markup-toolbar" disabled={props.disabled} aria-label="Markup tools">
      <legend className="sr-only">Markup tools</legend>
      <span className="markup-label">Markup</span>
      <div className="toolbar-group">
        {tools.slice(0, 1).map(({ tool, label, path }) => <button key={tool} type="button" aria-pressed={props.tool === tool} onClick={() => props.onTool(tool)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>{label}</button>)}
        <button type="button" onClick={props.onImage}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h18v18H3ZM3 18l6-7 5 5 3-3 4 5M15 7h.01" /></svg>Image</button>
        <button type="button" onClick={props.onText}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6V4h14v2M12 4v16M8 20h8" /></svg>Text</button>
        {tools.slice(1).map(({ tool, label, path }) => <button key={tool} type="button" aria-pressed={props.tool === tool} onClick={() => props.onTool(tool)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>{label}</button>)}
      </div>
      <div className="markup-properties">
        <label>Color<input aria-label="Markup color" type="color" value={color} onChange={(e) => changeStyle({ color: e.target.value })} /></label>
        {content?.kind !== "text" && <label>Stroke<select aria-label="Stroke width" value={strokeWidth} onChange={(e) => changeStyle({ strokeWidth: Number(e.target.value) })}>{[1, 2, 3, 5, 8, 12].map((n) => <option key={n} value={n}>{n} px</option>)}</select></label>}
        {(props.tool === "rectangle" || props.tool === "ellipse" || (content && "fill" in content)) && <label>Fill<select aria-label="Shape fill" value={fill === "none" ? "none" : "color"} onChange={(e) => changeStyle({ fill: e.target.value === "none" ? "none" : color })}><option value="none">None</option><option value="color">Solid</option></select>{fill !== "none" && <input aria-label="Fill color" type="color" value={fill} onChange={(e) => changeStyle({ fill: e.target.value })} />}</label>}
        {(content?.kind === "text" || !content) && <label>Text size<select aria-label="Text size" value={fontSize} onChange={(e) => changeStyle({ fontSize: Number(e.target.value) })}>{[12, 16, 20, 24, 32, 48, 64].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>}
      </div>
    </fieldset>
    {content?.kind === "text" && !props.disabled && <TextEditor key={`${props.selected!.id}-${content.text}-${content.fontSize}-${content.color}`} content={content} onEdit={props.onEdit} />}
    <p className="markup-hint">{props.tool === "select" ? "Select an object to move or resize it. Select a text box to edit its text." : "Drag on the page to draw. Press Escape to return to Select."}</p>
  </div>;
}
