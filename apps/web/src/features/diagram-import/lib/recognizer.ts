// The recognizer's main-thread face. Work goes to a Web Worker; if one can't start
// or dies, the same code runs here instead: slower to paint, never a lost scan.

import type { DiagramRect, DiagramTextItem, GrayImage } from "@nexa-chess/types";
import { analysePage, analyseSelection, type BoardAnalysis } from "./analysis";

export type RecognizerRequest =
  | { id: number; op: "page"; image: GrayImage; text: DiagramTextItem[] }
  | { id: number; op: "selection"; image: GrayImage; selection: DiagramRect; text: DiagramTextItem[]; textRect?: DiagramRect };

export type RecognizerResponse =
  | { id: number; boards: BoardAnalysis[] }
  | { id: number; board: BoardAnalysis | null }
  | { id: number; error: string };

type Pending = { resolve: (response: RecognizerResponse) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./recognizer.worker.ts", import.meta.url));
  } catch {
    workerFailed = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<RecognizerResponse>) => {
    const entry = pending.get(event.data.id);
    pending.delete(event.data.id);
    entry?.resolve(event.data);
  };
  worker.onerror = () => {
    workerFailed = true;
    worker?.terminate();
    worker = null;
    for (const entry of pending.values()) entry.reject(new Error("The recognizer worker stopped."));
    pending.clear();
  };
  return worker;
}

function send(request: RecognizerRequest): Promise<RecognizerResponse> {
  const target = getWorker();
  if (!target) return Promise.reject(new Error("No recognizer worker."));
  return new Promise((resolve, reject) => {
    pending.set(request.id, { reject, resolve });
    target.postMessage(request);
  });
}

export async function recognizePage(image: GrayImage, text: DiagramTextItem[]): Promise<BoardAnalysis[]> {
  try {
    const response = await send({ id: nextId++, image, op: "page", text });
    if ("boards" in response) return response.boards;
  } catch {
    // Falls through to the main thread.
  }
  return analysePage(image, text);
}

export async function recognizeSelection(
  image: GrayImage,
  selection: DiagramRect,
  text: DiagramTextItem[],
  textRect?: DiagramRect,
): Promise<BoardAnalysis | null> {
  try {
    const response = await send({ id: nextId++, image, op: "selection", selection, text, textRect });
    if ("board" in response) return response.board;
  } catch {
    // Falls through to the main thread.
  }
  return analyseSelection(image, selection, text, textRect);
}
