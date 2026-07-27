import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { usePartySocket } from './usePartySocket';
import type { Party, PartyMember, PartyMessage, SceneRef } from '../types/PartyTypes';
import api from '../app/auth/api';

interface PartyContextType {
  party: Party | null;
  isHost: boolean;
  createParty: (repoUrl: string) => Promise<string>;
  joinParty: (partyId: string) => Promise<void>;
  leaveParty: () => void;
  sendPosition: (x: number, y: number, direction: string) => void;
  sendSceneTransition: (scene: SceneRef) => void;
  remotePlayers: PartyMember[];
}

const PartyContext = createContext<PartyContextType | null>(null);

export function PartyProvider({ children }: { children: ReactNode }) {
  const [party, setParty] = useState<Party | null>(null);
  const [remotePlayers, setRemotePlayers] = useState<PartyMember[]>([]);
  const userId = Number(localStorage.getItem('github_id'));
  const username = localStorage.getItem('username') || 'Player';

  const handleMessage = useCallback((msg: PartyMessage) => {
    switch (msg.type) {
      case 'PartyState':
        setRemotePlayers(msg.members.filter(m => m.user_id !== userId));
        break;
      case 'PlayerMove':
        setRemotePlayers(prev =>
          prev.map(p => p.user_id === msg.user_id ? { ...p, x: msg.x, y: msg.y, direction: msg.direction } : p)
        );
        break;
      case 'PlayerEnteredScene':
        setRemotePlayers(prev =>
          prev.map(p => p.user_id === msg.user_id ? { ...p, scene: msg.scene } : p)
        );
        break;
      case 'Join':
      case 'Leave':
        break;
    }
  }, [userId]);

  const { send } = usePartySocket(party?.id ?? null, handleMessage);

  const sentJoinRef = useRef(false);

  useEffect(() => {
    if (party && !sentJoinRef.current) {
      sentJoinRef.current = true;
      const timer = setTimeout(() => {
        send({ type: 'Join', user_id: userId, display_name: username });
      }, 300);
      return () => clearTimeout(timer);
    }
    if (!party) {
      sentJoinRef.current = false;
    }
  }, [party, userId, username, send]);

  const createParty = useCallback(async (repoUrl: string): Promise<string> => {
    const res = await api.post('/parties', { repo_url: repoUrl });
    const { party_id } = res.data;
    setParty({
      id: party_id,
      host_id: userId,
      repo_url: repoUrl,
      members: [],
      created_at: new Date().toISOString(),
    });
    return party_id;
  }, [userId]);

  const joinParty = useCallback(async (_partyId: string) => {
    const res = await api.get(`/parties/${_partyId}`);
    setParty(res.data);
    sentJoinRef.current = false;
  }, []);

  const leaveParty = useCallback(() => {
    send({ type: 'Leave', user_id: userId });
    setParty(null);
    setRemotePlayers([]);
  }, [userId, send]);

  const sendPosition = useCallback((x: number, y: number, direction: string) => {
    send({ type: 'PlayerMove', user_id: userId, x, y, direction });
  }, [userId, send]);

  const sendSceneTransition = useCallback((scene: SceneRef) => {
    send({ type: 'PlayerEnteredScene', user_id: userId, scene });
  }, [userId, send]);

  return (
    <PartyContext.Provider
      value={{
        party,
        isHost: party?.host_id === userId,
        createParty,
        joinParty,
        leaveParty,
        sendPosition,
        sendSceneTransition,
        remotePlayers,
      }}
    >
      {children}
    </PartyContext.Provider>
  );
}

export function useParty(): PartyContextType {
  const ctx = useContext(PartyContext);
  if (!ctx) throw new Error('useParty must be used within <PartyProvider>');
  return ctx;
}