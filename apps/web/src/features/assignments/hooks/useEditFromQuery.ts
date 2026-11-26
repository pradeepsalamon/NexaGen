import type { AssignmentLibraryItem } from "@nexa-chess/types";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useRouter } from "@/lib/navigation";

/**
 * Opens the editor for `?edit=<assignmentId>` once that item is in the library
 * (Make homework on the Weak spots tab lands here), then drops the parameter
 * so a reload doesn't open it again.
 */
export function useEditFromQuery(library: AssignmentLibraryItem[], openEdit: (item: AssignmentLibraryItem) => void) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wanted = params.get("edit");
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!wanted || done.current === wanted) return;
    const item = library.find((a) => a.id === wanted);
    if (!item) return;
    done.current = wanted;
    openEdit(item);
    router.replace(pathname, { scroll: false });
  }, [library, openEdit, pathname, router, wanted]);
}
