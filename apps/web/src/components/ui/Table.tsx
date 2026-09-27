import {
  forwardRef,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes
} from "react";
import { cn } from "@/lib/utils";

const Table = forwardRef<
  HTMLTableElement,
  TableHTMLAttributes<HTMLTableElement>
>(function Table({ className, ...props }, ref) {
  return (
    <div className="w-full overflow-auto">
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        ref={ref}
        {...props}
      />
    </div>
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

const TableHead = forwardRef<
  HTMLTableCellElement,
  ThHTMLAttributes<HTMLTableCellElement>
>(function TableHead({ className, ...props }, ref) {
  return (
    <th
      className={cn(
        "h-12 bg-[color-mix(in_srgb,var(--color-primary)_96%,white)] px-3 text-center align-middle text-xs font-bold uppercase tracking-wide text-white [&:has([role=checkbox])]:pr-0",
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
  TdHTMLAttributes<HTMLTableCellElement>
>(function TableCell({ className, ...props }, ref) {
  return (
    <td
      className={cn("p-3 text-center align-middle [&:has([role=checkbox])]:pr-0", className)}
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
