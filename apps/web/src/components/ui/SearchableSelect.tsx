"use client";

import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

export type SearchableSelectOption = {
  label: string;
  value: string;
};

type SearchableSelectProps = {
  className?: string;
  disabled?: boolean;
  id: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  showSearch?: boolean;
  value: string;
};

export function SearchableSelect({
  className = "",
  disabled = false,
  id,
  onChange,
  options,
  placeholder = "Select an option",
  searchPlaceholder = "Search options",
  showSearch = true,
  value
}: SearchableSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = options.find((option) => option.value === value);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      const searchableText = `${option.label} ${option.value}`.toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [options, query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return undefined;
    }

    if (showSearch) {
      searchInputRef.current?.focus();
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
  }, [isOpen, showSearch]);

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen(true);
    }
  }

  return (
    <div className={`relative ${className}`.trim()} ref={containerRef}>
      <button
        aria-controls={`${id}-listbox`}
        aria-expanded={isOpen}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control border border-app-border bg-app-surface px-3.5 text-left text-sm text-app-text transition hover:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_16%,transparent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
        disabled={disabled}
        id={id}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
        role="combobox"
        type="button"
      >
        <span className={selectedOption ? "truncate" : "truncate text-app-muted"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4 shrink-0 text-app-muted"
          strokeWidth={2.5}
        />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-app border border-app-border bg-app-surface shadow-soft">
          {showSearch ? (
            <div className="relative border-b border-app-border">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted"
                strokeWidth={2.5}
              />
              <input
                aria-label={searchPlaceholder}
                className="min-h-11 w-full bg-app-surface py-2 pl-9 pr-3 text-sm text-app-text outline-none placeholder:text-app-muted/70"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setIsOpen(false);
                  }
                }}
                placeholder={searchPlaceholder}
                ref={searchInputRef}
                value={query}
              />
            </div>
          ) : null}
          <div
            className="max-h-64 overflow-y-auto p-1"
            id={`${id}-listbox`}
            role="listbox"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;

                return (
                  <button
                    aria-selected={isSelected}
                    className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-soft focus:bg-app-soft focus:outline-none ${
                      isSelected
                        ? "bg-[color-mix(in_srgb,var(--color-primary)_14%,var(--color-surface))] font-bold"
                        : ""
                    }`.trim()}
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected ? (
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-app-text">
                        <Check
                          aria-hidden="true"
                          className="size-3.5"
                          strokeWidth={3}
                        />
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-4 text-sm text-app-muted">
                No options found.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
