import type { PartyMember } from '../../types/PartyTypes';
import './PartyMemberOverlay.css';

export function PartyMemberOverlay({ remotePlayers }: { remotePlayers: PartyMember[] }) {
  return (
    <div className="party-overlay">
      <div className="party-overlay-header">⚔ Party</div>
      {remotePlayers.length === 0 ? (
        <div className="party-member-empty">No other players</div>
      ) : (
        remotePlayers.map((member) => (
          <div key={member.user_id} className="party-member-row">
            <div className="party-member-dot" />
            <span className="party-member-name">{member.display_name}</span>
            <span className="party-member-scene">{member.scene?.type ?? 'world'}</span>
          </div>
        ))
      )}
    </div>
  );
}