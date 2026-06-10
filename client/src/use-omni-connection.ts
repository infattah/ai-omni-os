import { useEffect, useReducer, useRef, useState } from 'react';
import { serverStateReducer, initialServerState, type ServerState, type ServerMessage } from './server-state';

// Owns the dashboard's connection to the Omni server: the WebSocket lifecycle, the server-state
// reducer, the connection status, and the outbound `send`. The component stays out of socket and
// reducer wiring and just consumes { connection, server, send }.
//
// Two callbacks let the component react without the hook knowing about UI state:
//  - onServerMessage: the non-pure, data-driven UI side-effects (mode changes, modal toggles, the
//    scan-dir follow-up, Dev-edited fields seeded by the server). The hook has already applied the pure
//    data transition via the reducer before calling this.
//  - onConnectionNotice: connection-level user notices (missing/expired token, send-while-closed).
//
// Handlers are kept in a ref so the socket is subscribed once per token, never re-subscribed just
// because the component re-rendered with fresh closures.

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'unauthorized';

export type OmniConnection = {
  connection: ConnectionState;
  server: ServerState;
  send: (payload: Record<string, unknown>) => void;
};

type ConnectionHandlers = {
  onServerMessage: (msg: ServerMessage & Record<string, unknown>) => void;
  onConnectionNotice: (text: string) => void;
};

function websocketUrl(token: string): string {
  const url = new URL(window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  return url.toString();
}

export function useOmniConnection(token: string | null, handlers: ConnectionHandlers): OmniConnection {
  const [server, dispatch] = useReducer(serverStateReducer, initialServerState);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!token) {
      setConnection('unauthorized');
      handlersRef.current.onConnectionNotice(
        'Missing Omni session token. Start Omni from the CLI and open the tokenized local URL.',
      );
      return;
    }

    const socket = new WebSocket(websocketUrl(token));
    socketRef.current = socket;
    setConnection('connecting');

    socket.addEventListener('open', () => setConnection('connected'));
    socket.addEventListener('close', (event) => {
      setConnection(event.code === 1008 ? 'unauthorized' : 'disconnected');
      if (event.code === 1008)
        handlersRef.current.onConnectionNotice('Invalid or expired Omni session token.');
    });
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data) as ServerMessage & Record<string, unknown>;
      dispatch(msg);
      handlersRef.current.onServerMessage(msg);
    });

    return () => socket.close();
  }, [token]);

  function send(payload: Record<string, unknown>) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      handlersRef.current.onConnectionNotice('Omni connection is not open.');
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  return { connection, server, send };
}
