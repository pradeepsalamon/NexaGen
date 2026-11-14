"use client";

import { lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";

type OpenProps = { open: boolean };
/** Props of export `K` of module `M`, when that export is a dialog component (it takes `open`). */
type DialogProps<M, K extends keyof M> = M[K] extends (props: infer P) => ReactNode
  ? P extends OpenProps
    ? P
    : never
  : never;

/**
 * A dialog whose code is downloaded the first time it opens.
 *
 * `React.lazy` alone would fetch the chunk as soon as the dialog is rendered
 * closed. This renders nothing until `open` has been true once, then keeps the
 * dialog mounted so its closing animation and state behave as before.
 *
 * `lazyOnOpen(() => import("./ShareDialog"), "ShareDialog")`
 */
export function lazyOnOpen<M, K extends keyof M & string>(
  load: () => Promise<M>,
  exportName: K,
): ComponentType<DialogProps<M, K>> {
  type Props = DialogProps<M, K>;
  const Lazy = lazy(() =>
    load().then((m) => ({ default: m[exportName] as unknown as ComponentType<OpenProps> })),
  );

  return function LazyOnOpen(props: Props) {
    const { open } = props as OpenProps;
    const [wanted, setWanted] = useState(open);
    if (open && !wanted) setWanted(true);
    if (!wanted) return null;
    return (
      <Suspense fallback={null}>
        <Lazy {...(props as OpenProps)} />
      </Suspense>
    );
  };
}
