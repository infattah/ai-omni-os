export interface MessageTransportPort {
  broadcast(type: string, payload?: Record<string, unknown>): void;
}
