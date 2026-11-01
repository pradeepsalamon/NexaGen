// Runs the recognizer off the main thread, so a long scan doesn't freeze the page.

import { analysePage, analyseSelection } from "./analysis";
import type { RecognizerRequest, RecognizerResponse } from "./recognizer";

self.onmessage = (event: MessageEvent<RecognizerRequest>) => {
  const request = event.data;
  let response: RecognizerResponse;
  try {
    response =
      request.op === "page"
        ? { boards: analysePage(request.image, request.text), id: request.id }
        : { board: analyseSelection(request.image, request.selection, request.text, request.textRect), id: request.id };
  } catch (err) {
    response = { error: err instanceof Error ? err.message : "Recognition failed.", id: request.id };
  }
  self.postMessage(response);
};
