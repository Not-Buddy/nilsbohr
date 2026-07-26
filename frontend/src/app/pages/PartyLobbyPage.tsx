import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParty } from '../../party/PartyContext';
import bg from '../../assets/background.png';

export default function PartyLobbyPage() {
  const { party, isHost, createParty, joinParty, leaveParty } = useParty();
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState('');
  const [partyId, setPartyId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!repoUrl) return;
    setLoading(true);
    try {
      const id = await createParty(repoUrl);
      setPartyId(id);
      navigate('/game', { state: { repoUrl, partyId: id } });
    } catch (e) {
      console.error('Failed to create party', e);
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!partyId) return;
    setLoading(true);
    try {
      await joinParty(partyId);
      navigate('/game', { state: { partyId } });
    } catch (e) {
      console.error('Failed to join party', e);
    }
    setLoading(false);
  };

  return (
    <>
      <div
        className="landing-bg"
        style={{ backgroundImage: `url(${bg})` }}
      />
      <div className="landing-container">
        <div className="landing-card" style={{ background: '#1a1a2e', borderRadius: 12, padding: 40 }}>
          <div className="landing-content">
            <h2 className="landing-title" style={{ fontSize: 24, color: '#fff' }}>
              {party ? 'Party Lobby' : 'Co-op Mode'}
            </h2>

            {!party && (
              <>
                <div style={{ marginBottom: 32 }}>
                  <h3 style={{ color: '#94a3b8', marginBottom: 12, fontFamily: 'monospace', fontSize: 14 }}>
                    Create a New Party
                  </h3>
                  <input
                    type="text"
                    placeholder="GitHub repo URL..."
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: '2px solid #334155',
                      background: '#0f172a',
                      color: '#fff',
                      fontFamily: 'monospace',
                      marginBottom: 12,
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={handleCreate}
                    disabled={loading || !repoUrl}
                    className="landing-login-btn"
                    style={{ width: '100%' }}
                  >
                    {loading ? 'Creating...' : 'Create Party'}
                  </button>
                </div>

                <div style={{ borderTop: '1px solid #334155', paddingTop: 32 }}>
                  <h3 style={{ color: '#94a3b8', marginBottom: 12, fontFamily: 'monospace', fontSize: 14 }}>
                    Join an Existing Party
                  </h3>
                  <input
                    type="text"
                    placeholder="Party ID..."
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: '2px solid #334155',
                      background: '#0f172a',
                      color: '#fff',
                      fontFamily: 'monospace',
                      marginBottom: 12,
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={handleJoin}
                    disabled={loading || !partyId}
                    className="landing-login-btn"
                    style={{ width: '100%' }}
                  >
                    {loading ? 'Joining...' : 'Join Party'}
                  </button>
                </div>
              </>
            )}

            {party && (
              <div>
                <p style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12, marginBottom: 16 }}>
                  Party ID: <code style={{ color: '#00ff88' }}>{party.id}</code>
                </p>
                <h3 style={{ color: '#fff', fontFamily: 'monospace', fontSize: 14, marginBottom: 8 }}>
                  Members ({party.members.length})
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
                  {party.members.map((m) => (
                    <li key={m.user_id} style={{
                      color: '#cbd5e1',
                      fontFamily: 'monospace',
                      fontSize: 12,
                      padding: '4px 0',
                    }}>
                      {m.display_name} {m.user_id === party.host_id ? '(Host)' : ''}
                    </li>
                  ))}
                </ul>
                {isHost && (
                  <button
                    onClick={() => navigate('/game', { state: { partyId: party.id } })}
                    className="landing-login-btn"
                    style={{ width: '100%', marginBottom: 12 }}
                  >
                    Start Exploring
                  </button>
                )}
                <button
                  onClick={leaveParty}
                  className="landing-login-btn"
                  style={{ width: '100%', background: '#ef4444', color: '#fff' }}
                >
                  Leave Party
                </button>
              </div>
            )}

            <button
              onClick={() => navigate('/home')}
              className="landing-login-btn"
              style={{ width: '100%', marginTop: 16 }}
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
