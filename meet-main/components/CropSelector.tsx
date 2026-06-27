"use client";

import { useEffect, useRef } from "react";

import type { CropArea, CropShape } from "@/lib/partialScreenShare";

type ResizeHandle =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw";

type CropSelectorProps = {
  cropArea: CropArea;
  containerWidth: number;
  containerHeight: number;
  shape: CropShape;
  onChange: (area: CropArea) => void;
};

type Point = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeBounds(
  area: CropArea,
  containerWidth: number,
  containerHeight: number,
): CropArea {
  const maxWidth = Math.max(24, containerWidth);
  const maxHeight = Math.max(24, containerHeight);
  let width = clamp(area.width, 24, maxWidth);
  let height = clamp(area.height, 24, maxHeight);

  if (area.shape === "square" || area.shape === "circle") {
    const size = clamp(Math.max(width, height), 24, Math.min(maxWidth, maxHeight));
    width = size;
    height = size;
  }

  const x = clamp(area.x, 0, Math.max(0, containerWidth - width));
  const y = clamp(area.y, 0, Math.max(0, containerHeight - height));

  return {
    ...area,
    x,
    y,
    width,
    height,
  };
}

function pointerToContainerPoint(
  event: PointerEvent | React.PointerEvent,
  container: HTMLElement,
): Point {
  const rect = container.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function CropSelector({
  cropArea,
  containerWidth,
  containerHeight,
  shape,
  onChange,
}: CropSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<
    | {
        type: "move";
        startPoint: Point;
        startArea: CropArea;
      }
    | {
        type: "create";
        startPoint: Point;
      }
    | {
        type: "resize";
        handle: ResizeHandle;
        startPoint: Point;
        startArea: CropArea;
      }
    | null
  >(null);

  const normalizedArea = normalizeBounds(
    { ...cropArea, shape },
    containerWidth,
    containerHeight,
  );

  useEffect(() => {
    if (
      normalizedArea.x !== cropArea.x ||
      normalizedArea.y !== cropArea.y ||
      normalizedArea.width !== cropArea.width ||
      normalizedArea.height !== cropArea.height ||
      normalizedArea.shape !== cropArea.shape
    ) {
      onChange(normalizedArea);
    }
  }, [cropArea, normalizedArea, onChange]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const container = containerRef.current;
      const operation = operationRef.current;

      if (!container || !operation) {
        return;
      }

      const point = pointerToContainerPoint(event, container);

      if (operation.type === "move") {
        const dx = point.x - operation.startPoint.x;
        const dy = point.y - operation.startPoint.y;

        onChange(
          normalizeBounds(
            {
              ...operation.startArea,
              shape,
              x: operation.startArea.x + dx,
              y: operation.startArea.y + dy,
            },
            containerWidth,
            containerHeight,
          ),
        );
        return;
      }

      if (operation.type === "create") {
        const left = Math.min(operation.startPoint.x, point.x);
        const top = Math.min(operation.startPoint.y, point.y);
        const width = Math.abs(point.x - operation.startPoint.x);
        const height = Math.abs(point.y - operation.startPoint.y);

        if (shape === "rectangle") {
          onChange(
            normalizeBounds(
              {
                x: left,
                y: top,
                width,
                height,
                shape,
              },
              containerWidth,
              containerHeight,
            ),
          );
          return;
        }

        const size = Math.max(width, height);
        const originX = point.x >= operation.startPoint.x
          ? operation.startPoint.x
          : operation.startPoint.x - size;
        const originY = point.y >= operation.startPoint.y
          ? operation.startPoint.y
          : operation.startPoint.y - size;

        onChange(
          normalizeBounds(
            {
              x: originX,
              y: originY,
              width: size,
              height: size,
              shape,
            },
            containerWidth,
            containerHeight,
          ),
        );
        return;
      }

      const dx = point.x - operation.startPoint.x;
      const dy = point.y - operation.startPoint.y;
      const startArea = operation.startArea;

      const nextArea: CropArea = {
        ...startArea,
        shape,
      };

      if (operation.handle.includes("e")) {
        nextArea.width = startArea.width + dx;
      }
      if (operation.handle.includes("s")) {
        nextArea.height = startArea.height + dy;
      }
      if (operation.handle.includes("w")) {
        nextArea.x = startArea.x + dx;
        nextArea.width = startArea.width - dx;
      }
      if (operation.handle.includes("n")) {
        nextArea.y = startArea.y + dy;
        nextArea.height = startArea.height - dy;
      }

      if (shape === "square" || shape === "circle") {
        const size = Math.max(nextArea.width, nextArea.height, 24);
        const right = nextArea.x + nextArea.width;
        const bottom = nextArea.y + nextArea.height;
        const centerX = nextArea.x + nextArea.width / 2;
        const centerY = nextArea.y + nextArea.height / 2;

        nextArea.width = size;
        nextArea.height = size;

        if (operation.handle.includes("w")) {
          nextArea.x = right - size;
        } else if (operation.handle === "n" || operation.handle === "s") {
          nextArea.x = centerX - size / 2;
        }

        if (operation.handle.includes("n")) {
          nextArea.y = bottom - size;
        } else if (operation.handle === "e" || operation.handle === "w") {
          nextArea.y = centerY - size / 2;
        }
      }

      onChange(normalizeBounds(nextArea, containerWidth, containerHeight));
    };

    const handlePointerUp = () => {
      operationRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [containerHeight, containerWidth, onChange, shape]);

  const handleClasses =
    "absolute size-3 rounded-full border border-white bg-primary shadow";

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 touch-none"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget || !containerRef.current) {
          return;
        }

        const startPoint = pointerToContainerPoint(event, containerRef.current);
        operationRef.current = {
          type: "create",
          startPoint,
        };
      }}
    >
      <div
        className="absolute inset-0 bg-black/45"
        style={{
          clipPath:
            shape === "circle"
              ? `path("M0 0H${containerWidth}V${containerHeight}H0V0ZM${normalizedArea.x + normalizedArea.width / 2} ${normalizedArea.y + normalizedArea.height / 2} m-${normalizedArea.width / 2},0 a${normalizedArea.width / 2},${normalizedArea.height / 2} 0 1,0 ${normalizedArea.width},0 a${normalizedArea.width / 2},${normalizedArea.height / 2} 0 1,0 -${normalizedArea.width},0")`
              : `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${normalizedArea.x}px ${normalizedArea.y}px, ${normalizedArea.x}px ${normalizedArea.y + normalizedArea.height}px, ${normalizedArea.x + normalizedArea.width}px ${normalizedArea.y + normalizedArea.height}px, ${normalizedArea.x + normalizedArea.width}px ${normalizedArea.y}px, ${normalizedArea.x}px ${normalizedArea.y}px)`,
        }}
      />

      <div
        className={`absolute border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.2)] ${
          shape === "circle" ? "rounded-full" : "rounded-xl"
        }`}
        style={{
          left: normalizedArea.x,
          top: normalizedArea.y,
          width: normalizedArea.width,
          height: normalizedArea.height,
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (!containerRef.current) {
            return;
          }

          operationRef.current = {
            type: "move",
            startPoint: pointerToContainerPoint(event, containerRef.current),
            startArea: normalizedArea,
          };
        }}
      >
        {(
          [
            ["nw", "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize"],
            ["n", "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize"],
            ["ne", "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize"],
            ["e", "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize"],
            ["se", "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize"],
            ["s", "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize"],
            ["sw", "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize"],
            ["w", "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize"],
          ] as [ResizeHandle, string][]
        ).map(([handle, className]) => (
          <button
            key={handle}
            type="button"
            className={`${handleClasses} ${className}`}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (!containerRef.current) {
                return;
              }

              operationRef.current = {
                type: "resize",
                handle,
                startPoint: pointerToContainerPoint(event, containerRef.current),
                startArea: normalizedArea,
              };
            }}
          />
        ))}
      </div>
    </div>
  );
}
