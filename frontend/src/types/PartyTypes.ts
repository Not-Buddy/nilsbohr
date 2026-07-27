export interface PartyMember {
  user_id: number;
  display_name: string;
  x: number;
  y: number;
  direction?: string;
  scene: SceneRef;
}

export interface SceneRef {
  type: string;
  id: string;
}

export interface Party {
  id: string;
  host_id: number;
  repo_url: string;
  members: PartyMember[];
  created_at: string;
}

export interface CreatePartyResponse {
  party_id: string;
}

export type PartyMessage =
  | { type: 'Join'; user_id: number; display_name: string }
  | { type: 'Leave'; user_id: number }
  | { type: 'PlayerMove'; user_id: number; x: number; y: number; direction: string }
  | { type: 'PlayerEnteredScene'; user_id: number; scene: SceneRef }
  | { type: 'PartyState'; members: PartyMember[] };
