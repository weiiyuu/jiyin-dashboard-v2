"use client";

import { useCallback, useEffect, useRef } from "react";

export const LOCAL_REFRESH_INTERVAL_MS = 30_000;

export function useLocalRefresh(refresh: (signal: AbortSignal) => Promise<void>) {
  const controllerRef = useRef<AbortController | null>(null);
  const run = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      await refresh(controller.signal);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [refresh]);

  useEffect(() => {
    void run();
    const interval = window.setInterval(() => void run(), LOCAL_REFRESH_INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && void run();
    const onFocus = () => void run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      controllerRef.current?.abort();
    };
  }, [run]);
}
