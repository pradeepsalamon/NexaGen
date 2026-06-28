"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import {
  Children,
  createContext,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type ComboboxContextValue = {
  disabled: boolean;
  empty: boolean;
  filteredItems: string[];
  inputId: string;
  isOpen: boolean;
  listboxId: string;
  query: string;
  selectItem: (item: string) => void;
  selectedValue: string;
  setIsOpen: (isOpen: boolean) => void;
  setQuery: (query: string) => void;
};

type ComboboxProps = {
  children: ReactNode;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  id?: string;
  items: readonly string[];
  onValueChange?: (value: string) => void;
  value?: string;
};

type ComboboxInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "children" | "onChange" | "onKeyDown" | "value"
>;

type ComboboxContentProps = {
  children: ReactNode;
  className?: string;
};

type ComboboxEmptyProps = {
  children: ReactNode;
  className?: string;
};

type ComboboxListProps = {
  children: (item: string) => ReactNode;
  className?: string;
};

type ComboboxItemProps = {
  children: ReactNode;
  className?: string;
  value: string;
};

const ComboboxContext = createContext<ComboboxContextValue | null>(null);

export function Combobox({
  children,
  className,
  defaultValue = "",
  disabled = false,
  id,
  items,
  onValueChange,
  value
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? `combobox-${generatedId}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedValue = value ?? internalValue;

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [...items];
    }

    return items.filter((item) =>
      item.toLowerCase().includes(normalizedQuery)
    );
  }, [items, query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  const selectItem = useCallback((item: string) => {
    if (value === undefined) {
      setInternalValue(item);
    }

    onValueChange?.(item);
    setIsOpen(false);
  }, [onValueChange, value]);

  const contextValue = useMemo<ComboboxContextValue>(
    () => ({
      disabled,
      empty: filteredItems.length === 0,
      filteredItems,
      inputId,
      isOpen,
      listboxId: `${inputId}-listbox`,
      query,
      selectItem,
      selectedValue,
      setIsOpen,
      setQuery
    }),
    [
      disabled,
      filteredItems,
      inputId,
      isOpen,
      query,
      selectItem,
      selectedValue
    ]
  );

  return (
    <ComboboxContext.Provider value={contextValue}>
      <div className={cn("relative", className)} ref={containerRef}>
        {children}
      </div>
    </ComboboxContext.Provider>
  );
}

export function ComboboxInput({
  className,
  disabled,
  placeholder = "Select option",
  ...props
}: ComboboxInputProps) {
  const {
    disabled: contextDisabled,
    filteredItems,
    inputId,
    isOpen,
    listboxId,
    query,
    selectItem,
    selectedValue,
    setIsOpen,
    setQuery
  } = useComboboxContext("ComboboxInput");
  const inputRef = useRef<HTMLInputElement>(null);
  const isDisabled = disabled ?? contextDisabled;
  const displayValue = isOpen ? query : selectedValue;

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setIsOpen(true);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
    }

    if (event.key === "Enter" && filteredItems[0]) {
      event.preventDefault();
      selectItem(filteredItems[0]);
      inputRef.current?.blur();
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-control border border-app-border bg-app-surface px-3.5 text-sm text-app-text shadow-sm transition hover:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] focus-within:border-primary focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_16%,transparent)]",
        isDisabled && "cursor-not-allowed opacity-60"
      )}
    >
      <input
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          "min-h-10 min-w-0 flex-1 bg-transparent text-sm font-medium text-app-text outline-none placeholder:text-app-muted focus-visible:outline-none",
          className
        )}
        disabled={isDisabled}
        id={inputId}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        ref={inputRef}
        role="combobox"
        value={displayValue}
        {...props}
      />
      <Button
        aria-label={isOpen ? "Close options" : "Open options"}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-control text-app-muted transition hover:bg-app-soft hover:text-app-text"
        disabled={isDisabled}
        onClick={() => {
          setIsOpen(!isOpen);
          inputRef.current?.focus();
        }}
        size="icon"
        tabIndex={-1}
        type="button"
        variant="ghost"
      >
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4"
          strokeWidth={2.5}
        />
      </Button>
    </div>
  );
}

export function ComboboxContent({ children, className }: ComboboxContentProps) {
  const { isOpen } = useComboboxContext("ComboboxContent");

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-app border border-app-border bg-app-surface p-1 text-app-text shadow-soft",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ComboboxEmpty({ children, className }: ComboboxEmptyProps) {
  const { empty } = useComboboxContext("ComboboxEmpty");

  if (!empty) {
    return null;
  }

  return (
    <p className={cn("px-3 py-4 text-sm font-medium text-app-muted", className)}>
      {children}
    </p>
  );
}

export function ComboboxList({ children, className }: ComboboxListProps) {
  const { filteredItems, listboxId } = useComboboxContext("ComboboxList");

  if (!filteredItems.length) {
    return null;
  }

  return (
    <div
      className={cn("max-h-64 overflow-y-auto", className)}
      id={listboxId}
      role="listbox"
    >
      {Children.toArray(filteredItems.map((item) => children(item)))}
    </div>
  );
}

export function ComboboxItem({
  children,
  className,
  value
}: ComboboxItemProps) {
  const { selectItem, selectedValue } = useComboboxContext("ComboboxItem");
  const isSelected = value === selectedValue;

  return (
    <Button
      aria-selected={isSelected}
      className={cn(
        "flex min-h-9 w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-left text-sm font-semibold text-app-text transition hover:bg-app-soft focus:bg-app-soft focus:outline-none",
        isSelected &&
          "bg-[color-mix(in_srgb,var(--color-text)_10%,var(--color-surface))]",
        className
      )}
      onClick={() => selectItem(value)}
      role="option"
      type="button"
      variant="ghost"
    >
      <span className="truncate">{children}</span>
      {isSelected ? (
        <Check
          aria-hidden="true"
          className="size-4 shrink-0 text-primary"
          strokeWidth={3}
        />
      ) : null}
    </Button>
  );
}

function useComboboxContext(componentName: string) {
  const context = useContext(ComboboxContext);

  if (!context) {
    throw new Error(`${componentName} must be used inside Combobox.`);
  }

  return context;
}
