/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { usePageReorder } from "./usePageReorder";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

class FakeDataTransfer {
  effectAllowed = "none";
  dropEffect = "none";
  private readonly store = new Map<string, string>();

  setData(type: string, value: string) {
    this.store.set(type, value);
  }

  getData(type: string) {
    return this.store.get(type) ?? "";
  }
}

function dragEvent(type: string, transfer: FakeDataTransfer): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: transfer,
    configurable: true,
  });
  return event;
}

function ReorderList(props: {
  pageCount: number;
  onMove: (from: number, to: number) => void;
  onItemClick: (index: number) => void;
}) {
  const bind = usePageReorder({
    pageCount: props.pageCount,
    onMove: props.onMove,
  });

  return createElement(
    "div",
    null,
    Array.from({ length: props.pageCount }, (_, index) => {
      const reorder = bind(index);
      return createElement(
        "button",
        {
          key: index,
          type: "button",
          "data-index": String(index),
          draggable: reorder.draggable,
          "data-reorder-state":
            reorder.state === "idle" ? undefined : reorder.state,
          onDragStart: reorder.onDragStart,
          onDragOver: reorder.onDragOver,
          onDrop: reorder.onDrop,
          onDragEnd: reorder.onDragEnd,
          onClick: () => {
            props.onItemClick(index);
          },
        },
        String(index),
      );
    }),
  );
}

function mountList(
  onMove: (from: number, to: number) => void,
  onItemClick: (index: number) => void,
  pageCount = 3,
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      createElement(ReorderList, { pageCount, onMove, onItemClick }),
    );
  });
  return {
    button(index: number) {
      const el = host.querySelector(`[data-index="${index}"]`);
      if (!(el instanceof HTMLButtonElement)) {
        throw new Error(`missing button ${index}`);
      }
      return el;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("usePageReorder", () => {
  it("dragstart calls setData with the source index", () => {
    const transfer = new FakeDataTransfer();
    const moves: Array<[number, number]> = [];
    const list = mountList((from, to) => {
      moves.push([from, to]);
    }, () => {});

    act(() => {
      list.button(0).dispatchEvent(dragEvent("dragstart", transfer));
    });

    expect(transfer.getData("text/plain")).toBe("0");
    expect(transfer.effectAllowed).toBe("move");
    expect(moves).toEqual([]);
    list.unmount();
  });

  it("dragover does not call onMove", () => {
    const transfer = new FakeDataTransfer();
    const moves: Array<[number, number]> = [];
    const list = mountList((from, to) => {
      moves.push([from, to]);
    }, () => {});

    act(() => {
      list.button(0).dispatchEvent(dragEvent("dragstart", transfer));
    });
    act(() => {
      list.button(2).dispatchEvent(dragEvent("dragover", transfer));
    });

    expect(moves).toEqual([]);
    list.unmount();
  });

  it("drop on another index calls onMove once with (from, to)", () => {
    const transfer = new FakeDataTransfer();
    const moves: Array<[number, number]> = [];
    const list = mountList((from, to) => {
      moves.push([from, to]);
    }, () => {});

    act(() => {
      list.button(0).dispatchEvent(dragEvent("dragstart", transfer));
    });
    act(() => {
      list.button(2).dispatchEvent(dragEvent("dragover", transfer));
    });
    act(() => {
      list.button(2).dispatchEvent(dragEvent("drop", transfer));
    });

    expect(moves).toEqual([[0, 2]]);
    list.unmount();
  });

  it("drop on self does not call onMove", () => {
    const transfer = new FakeDataTransfer();
    const moves: Array<[number, number]> = [];
    const list = mountList((from, to) => {
      moves.push([from, to]);
    }, () => {});

    act(() => {
      list.button(1).dispatchEvent(dragEvent("dragstart", transfer));
    });
    act(() => {
      list.button(1).dispatchEvent(dragEvent("drop", transfer));
    });

    expect(moves).toEqual([]);
    list.unmount();
  });

  it("dragend then click does not propagate to the click handler", () => {
    const transfer = new FakeDataTransfer();
    const clicks: number[] = [];
    const list = mountList(
      () => {},
      (index) => {
        clicks.push(index);
      },
    );

    act(() => {
      list.button(0).dispatchEvent(dragEvent("dragstart", transfer));
    });
    act(() => {
      list.button(0).dispatchEvent(dragEvent("dragend", transfer));
    });
    act(() => {
      list.button(0).click();
    });

    expect(clicks).toEqual([]);
    list.unmount();
  });

  it("a click without a drag still fires onClick", () => {
    const clicks: number[] = [];
    const list = mountList(
      () => {},
      (index) => {
        clicks.push(index);
      },
    );

    act(() => {
      list.button(1).click();
    });

    expect(clicks).toEqual([1]);
    list.unmount();
  });
});
