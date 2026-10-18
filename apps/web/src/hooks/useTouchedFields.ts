"use client";

import { useCallback, useState } from "react";

export function useTouchedFields<TValues extends Record<string, unknown>>() {
  const [touched, setTouched] = useState<Partial<Record<keyof TValues, boolean>>>(
    {}
  );

  const touchField = useCallback((field: keyof TValues) => {
    setTouched((currentTouched) => ({ ...currentTouched, [field]: true }));
  }, []);

  const touchAll = useCallback((values: TValues) => {
    setTouched(
      Object.keys(values).reduce<Partial<Record<keyof TValues, boolean>>>(
        (nextTouched, key) => ({
          ...nextTouched,
          [key as keyof TValues]: true
        }),
        {}
      )
    );
  }, []);

  return { touched, touchAll, touchField };
}
