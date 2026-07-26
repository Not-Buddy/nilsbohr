// PixiApp.tsx
import { extend, Application } from '@pixi/react';
import { useRef, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from './auth/api';
import { Container } from 'pixi.js';
import { SceneManager } from '../engine/SceneManager';
import { WorldScene } from '../scenes/WorldScene';
import type { WorldSeed } from '../types/SeedTypes';
import type { RootResponse } from '../types/SeedTypes';
import '@pixi/tilemap';

import SampleData from '../assets/sample.json';
import './PixiApp.css';
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

          const response = await api.post(
            '/parse',
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

  const navigate = useNavigate();

  return (
    <>
      <Application resizeTo={window} background="#000000">
        <pixiContainer ref={setRoot} />
      </Application>

      {/* Home Button Overlay - only show when not loading to avoid clutter */}
      {!isLoading && !error && (
        <button
          onClick={() => navigate('/')}
          className="home-btn"
          title="Return to Home"
        >
          🏠
        </button>
      )}

      {isLoading && !error && (
        <div className="overlay">
          <div className="loading-card">
            <div className="title">
              {repoUrl ? '🌍 Generating World' : '🌍 Loading World'}
            </div>

            {repoUrl && (
              <div className="repo-label">
                {repoUrl.replace(/https?:\/\/(github\.com\/)?/, '').replace(/\.git$/, '')}
              </div>
            )}

            {/* Progress bar container */}
            <div className="bar-container">
              <div className="bar-fill" style={{ width: `${progress}%` }}>
                <div className="bar-shimmer" />
              </div>
            </div>

            {/* Percentage + phase */}
            <div className="info-row">
              <span className="percent">{progress}%</span>
              <span className="phase">{PHASE_LABELS[phase]}</span>
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
        <div className="overlay">
          <div className="loading-card error">
            <div className="title error">❌ Error</div>
            <div className="phase">{error}</div>

            <button
              onClick={() => navigate('/')}
              className="home-btn back-to-home-btn"
            >
              Back to Home
            </button>
          </div>
        </div>
      )}
    </>
  );
}
