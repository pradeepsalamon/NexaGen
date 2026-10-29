import {
  forwardRef,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes
} from "react";
import { ScrollShadow } from "@/components/ui/ScrollShadow";
import { cn } from "@/lib/utils";

const Table = forwardRef<
  HTMLTableElement,
  TableHTMLAttributes<HTMLTableElement>
>(function Table({ className, ...props }, ref) {
  return (
    <ScrollShadow className="rounded-[16px]">
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        ref={ref}
        {...props}
      />
    </ScrollShadow>
  );
});
Table.displayName = "Table";

const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableHeader({ className, ...props }, ref) {
  return (
    <thead
      className={cn("[&_tr]:border-0 [&_tr]:hover:bg-transparent", className)}
      ref={ref}
      {...props}
    />
  );
});
TableHeader.displayName = "TableHeader";

const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableBody({ className, ...props }, ref) {
  return (
    <tbody
      className={cn("[&>tr:last-child]:border-0 [&>tr:nth-child(even)]:bg-app-soft/50", className)}
      ref={ref}
      {...props}
    />
  );
});
TableBody.displayName = "TableBody";

const TableFooter = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableFooter({ className, ...props }, ref) {
  return (
    <tfoot
      className={cn(
        "border-t border-app-border bg-app-soft/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
TableFooter.displayName = "TableFooter";

const TableRow = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement>
>(function TableRow({ className, ...props }, ref) {
  return (
    <tr
      className={cn(
        "border-b border-app-border transition-colors hover:bg-primary/5 data-[state=selected]:bg-primary/10",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
TableRow.displayName = "TableRow";

// Below `lg`, `pin="end"` keeps a row's actions column on screen while the
// rest of a wide table scrolls under it.
const PIN_END = "max-lg:sticky max-lg:right-0 max-lg:z-[1] max-lg:shadow-[-12px_0_12px_-12px_var(--color-scroll-shade)]";
const PIN_END_CELL =
  "max-lg:bg-app-surface max-lg:[tr:nth-child(even)>&]:bg-[color-mix(in_srgb,var(--color-surface-soft)_50%,var(--color-surface))]";

type PinProps = { pin?: "end" };

const TableHead = forwardRef<
  HTMLTableCellElement,
  ThHTMLAttributes<HTMLTableCellElement> & PinProps
>(function TableHead({ className, pin, ...props }, ref) {
  return (
    <th
      className={cn(
        pin === "end" && PIN_END,
        "h-12 bg-[color-mix(in_srgb,var(--color-primary)_96%,white)] px-3 text-center align-middle text-sm font-bold normal-case tracking-normal text-on-primary [&:has([role=checkbox])]:pr-0",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
TableHead.displayName = "TableHead";

const TableCell = forwardRef<
  HTMLTableCellElement,
  TdHTMLAttributes<HTMLTableCellElement> & PinProps
>(function TableCell({ className, pin, ...props }, ref) {
  return (
    <td
      className={cn(
        "p-3 text-center align-middle [&:has([role=checkbox])]:pr-0",
        pin === "end" && cn(PIN_END, PIN_END_CELL),
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
TableCell.displayName = "TableCell";

const TableCaption = forwardRef<
  HTMLTableCaptionElement,
  HTMLAttributes<HTMLTableCaptionElement>
>(function TableCaption({ className, ...props }, ref) {
  return (
    <caption
      className={cn("mt-4 text-sm text-app-muted", className)}
      ref={ref}
      {...props}
    />
  );
});
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
};
