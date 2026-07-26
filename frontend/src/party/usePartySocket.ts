import { useEffect, useRef, useCallback } from 'react';
import type { PartyMessage } from '../types/PartyTypes';

type MessageHandler = (msg: PartyMessage) => void;

export function usePartySocket(
  partyId: string | null,
  onMessage: MessageHandler,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!partyId) return;

    const token = localStorage.getItem('token');
    const baseUrl = import.meta.env.VITE_BACKEND_URL.replace(/^http/, 'ws');
    const url = `${baseUrl}/ws/parties/${partyId}?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Party WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg: PartyMessage = JSON.parse(event.data);
        onMessageRef.current(msg);
      } catch (e) {
        console.error('[Party WS] Invalid message', e);
      }
    };

    ws.onclose = () => {
      console.log('[Party WS] Disconnected, reconnecting in 3s...');
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [partyId]);

  const send = useCallback((msg: PartyMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { send };
}
