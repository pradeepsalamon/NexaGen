"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scanMediaDevices, type MediaKind } from "../lib/mediaDevices";

/**
 * Live list of one kind of media device. Re-lists by itself whenever something
 * is plugged in or removed (`devicechange`); `scan()` is the user-driven full
 * scan that also asks for permission when the browser is hiding devices.
 */
export function useMediaDeviceList(kind: MediaKind) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(
    async (requestPermission: boolean) => {
      if (requestPermission) setScanning(true);
      const result = await scanMediaDevices(kind, requestPermission);
      if (!mounted.current) return result;
      setDevices(result.devices);
      // A quiet re-list never clears an error the user still has to act on.
      if (requestPermission || result.error) setError(result.error);
      if (requestPermission) {
        setScanning(false);
        setScanned(true);
      }
      return result;
    },
    [kind],
  );

  useEffect(() => {
    mounted.current = true;
    void refresh(false);
    const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    const onChange = () => void refresh(false);
    mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => {
      mounted.current = false;
      mediaDevices?.removeEventListener?.("devicechange", onChange);
    };
  }, [refresh]);

  const scan = useCallback(() => refresh(true), [refresh]);

  /** Devices are listed but the browser hides their names until access is granted. */
  const needsPermission = devices.length === 0 || devices.some((d) => d.label === "");

  return { devices, error, needsPermission, scan, scanned, scanning };
}
