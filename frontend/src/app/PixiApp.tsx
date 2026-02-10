// PixiApp.tsx
import { extend, Application } from '@pixi/react';
import { useRef, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { Container } from 'pixi.js';
import { SceneManager } from '../engine/SceneManager';
import { WorldScene } from '../scenes/WorldScene';
import type { WorldSeed } from '../types/SeedTypes';
import type { RootResponse } from '../types/SeedTypes';

import SampleData from '../assets/sample.json';
extend({ Container });

type LoadingPhase = 'connecting' | 'parsing' | 'downloading' | 'building' | 'done';

const PHASE_LABELS: Record<LoadingPhase, string> = {
  connecting: 'Connecting to server…',
  parsing: 'Parsing repository…',
  downloading: 'Downloading world seed…',
  building: 'Building world…',
  done: 'Ready!',
};

export default function PixiApp() {
  const managerRef = useRef<SceneManager | null>(null);
  const location = useLocation();
  const repoUrl = location.state?.repoUrl;

  const [seed, setSeed] = useState<WorldSeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [root, setRoot] = useState<Container | null>(null);

  // Loading progress state
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<LoadingPhase>('connecting');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchSeed() {
      try {
        let data: RootResponse;

        if (repoUrl) {
          setPhase('connecting');
          setProgress(0);

          // Small delay to show connecting phase
          await new Promise(r => setTimeout(r, 300));
          if (cancelled) return;

          setPhase('parsing');
          setProgress(5);

          const response = await axios.post(
            import.meta.env.VITE_BACKEND_URL + '/parse',
            { url: repoUrl },
            {
              onDownloadProgress: (progressEvent) => {
                if (cancelled) return;
                setPhase('downloading');

                if (progressEvent.total) {
                  // Known total — real percentage (mapped to 10-90 range)
                  const pct = Math.round((progressEvent.loaded / progressEvent.total) * 80) + 10;
                  setProgress(Math.min(pct, 90));
                } else {
                  // Unknown total — estimate based on bytes received
                  const loaded = progressEvent.loaded;
                  const estimatedTotal = 500_000; // ~500KB estimate
                  const pct = Math.min(Math.round((loaded / estimatedTotal) * 80) + 10, 85);
                  setProgress(pct);
                }
              },
            }
          );
          data = response.data;
        } else {
          setPhase('building');
          setProgress(50);
          await new Promise(r => setTimeout(r, 200));
          data = SampleData as unknown as RootResponse;
        }

        if (!cancelled) {
          setPhase('building');
          setProgress(92);

          // Brief pause to show building phase
          await new Promise(r => setTimeout(r, 400));
          if (cancelled) return;

          setProgress(100);
          setPhase('done');

          // Let user see 100% briefly
          await new Promise(r => setTimeout(r, 500));
          if (cancelled) return;

          setSeed(data.seed);
          setIsLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('Failed to load world');
          setIsLoading(false);
        }
      }
    }

    fetchSeed();
    return () => { cancelled = true };
  }, []);

  useEffect(() => {
    if (!root || managerRef.current) return;
    managerRef.current = new SceneManager(root);
  }, [root]);

  useEffect(() => {
    if (!seed || !managerRef.current) return;
    managerRef.current.switch(
      new WorldScene(seed, managerRef.current)
    );
  }, [seed, root]);

  return (
    <>
      <Application resizeTo={window} background="#000000">
        <pixiContainer ref={setRoot} />
      </Application>

      {isLoading && !error && (
        <div style={overlayStyle}>
          <div style={loadingCardStyle}>
            <div style={titleStyle}>
              {repoUrl ? '🌍 Generating World' : '🌍 Loading World'}
            </div>

            {repoUrl && (
              <div style={repoLabelStyle}>
                {repoUrl.replace(/https?:\/\/(github\.com\/)?/, '').replace(/\.git$/, '')}
              </div>
            )}

            {/* Progress bar container */}
            <div style={barContainerStyle}>
              <div style={{ ...barFillStyle, width: `${progress}%` }}>
                <div style={barShimmerStyle} />
              </div>
            </div>

            {/* Percentage + phase */}
            <div style={infoRowStyle}>
              <span style={percentStyle}>{progress}%</span>
              <span style={phaseStyle}>{PHASE_LABELS[phase]}</span>
            </div>
          </div>

          <style>{`
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(200%); }
            }
            @keyframes pulse {
              0%, 100% { opacity: 0.7; }
              50% { opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {error && (
        <div style={overlayStyle}>
          <div style={{ ...loadingCardStyle, borderColor: '#ef4444' }}>
            <div style={{ ...titleStyle, color: '#ef4444' }}>❌ Error</div>
            <div style={phaseStyle}>{error}</div>
          </div>
        </div>
      )}
    </>
  );
}

// --- Styles ---
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.92)',
  zIndex: 9999,
};

const loadingCardStyle: React.CSSProperties = {
  width: '420px',
  maxWidth: '90vw',
  padding: '36px 32px',
  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  border: '1px solid #334155',
  borderRadius: '16px',
  boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(59, 130, 246, 0.1)',
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'Press Start 2P', monospace",
  fontSize: '16px',
  color: '#f1f5f9',
  textAlign: 'center',
  marginBottom: '8px',
};

const repoLabelStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '12px',
  color: '#64748b',
  textAlign: 'center',
  marginBottom: '24px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const barContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '14px',
  background: '#1e293b',
  borderRadius: '7px',
  border: '1px solid #334155',
  overflow: 'hidden',
  marginBottom: '14px',
};

const barFillStyle: React.CSSProperties = {
  height: '100%',
  background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #3b82f6)',
  backgroundSize: '200% 100%',
  borderRadius: '7px',
  transition: 'width 0.4s ease-out',
  position: 'relative',
  overflow: 'hidden',
  minWidth: '0%',
};

const barShimmerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
  animation: 'shimmer 1.5s infinite',
};

const infoRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const percentStyle: React.CSSProperties = {
  fontFamily: "'Press Start 2P', monospace",
  fontSize: '14px',
  color: '#3b82f6',
  fontWeight: 'bold',
};

const phaseStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '12px',
  color: '#94a3b8',
  animation: 'pulse 2s infinite',
};
