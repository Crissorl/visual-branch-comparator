'use client';
import { useState, useEffect, useRef, type RefObject } from 'react';

interface NavSyncState {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  paths: Record<string, string>; // sourceId → current path
}

// Accept a map of sourceId → RefObject so the hook reads .current only inside
// effects (not during render, which would violate the react-hooks/refs rule).
export function useNavSync(
  iframeRefs: Record<string, RefObject<HTMLIFrameElement | null>>,
): NavSyncState {
  const [enabled, setEnabled] = useState(true);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const isForwardingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    function handleMessage(event: MessageEvent) {
      if (!event.data || event.data.type !== 'vbc-nav' || typeof event.data.path !== 'string') {
        return;
      }

      if (isForwardingRef.current) return;

      // Find which iframe sent this message
      const senderFrame = event.source;
      let senderId: string | null = null;

      for (const [id, ref] of Object.entries(iframeRefs)) {
        if (ref.current?.contentWindow === senderFrame) {
          senderId = id;
          break;
        }
      }

      if (!senderId) return;

      const path: string = event.data.path;

      // Update paths state
      setPaths((prev) => ({ ...prev, [senderId!]: path }));

      // Forward to all other iframes
      isForwardingRef.current = true;
      for (const [id, ref] of Object.entries(iframeRefs)) {
        if (id !== senderId && ref.current?.contentWindow) {
          ref.current.contentWindow.postMessage({ type: 'vbc-nav', path }, '*');
        }
      }
      // Reset forwarding guard after a tick to avoid echo loops
      setTimeout(() => {
        isForwardingRef.current = false;
      }, 100);
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [enabled, iframeRefs]);

  return { enabled, setEnabled, paths };
}
