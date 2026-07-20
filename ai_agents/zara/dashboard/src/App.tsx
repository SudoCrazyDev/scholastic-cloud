import { useCallback, useState } from 'react';

import {
  BarVisualizer,
  LiveKitRoom,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useVoiceAssistant,
} from '@livekit/components-react';
import '@livekit/components-styles';

type ConnectionDetails = {
  url: string;
  token: string;
};

const STATE_LABELS: Record<string, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  initializing: 'Waking Zara up…',
  listening: 'Listening',
  thinking: 'Thinking…',
  speaking: 'Speaking',
};

function ZaraVisualizer() {
  const { state, audioTrack } = useVoiceAssistant();

  return (
    <div className="visualizer-card">
      <div className={`status-badge status-${state}`}>
        <span className="status-dot" />
        {STATE_LABELS[state] ?? state}
      </div>
      <BarVisualizer
        state={state}
        trackRef={audioTrack}
        barCount={7}
        options={{ minHeight: 12 }}
        className="visualizer"
      />
    </div>
  );
}

export default function App() {
  const [connection, setConnection] = useState<ConnectionDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/token');
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `Token request failed (${res.status})`);
      }
      setConnection(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => setConnection(null), []);

  return (
    <main className="page" data-lk-theme="default">
      <header className="header">
        <h1>Zara</h1>
        <p>LiveKit voice agent dashboard</p>
      </header>

      {connection ? (
        <LiveKitRoom
          serverUrl={connection.url}
          token={connection.token}
          audio={true}
          video={false}
          onDisconnected={disconnect}
          className="room"
        >
          <ZaraVisualizer />
          <VoiceAssistantControlBar />
          <RoomAudioRenderer />
        </LiveKitRoom>
      ) : (
        <div className="lobby">
          <button className="connect-button" onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Talk to Zara'}
          </button>
          {error && <p className="error">{error}</p>}
          <p className="hint">
            Make sure the agent is running: <code>uv run python src/agent.py dev</code>
          </p>
        </div>
      )}
    </main>
  );
}
