import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParty } from '../../party/PartyContext';
import Navbar from '../components/hero/navbar';
import Footer from '../components/hero/footer';
import bg from '../../assets/background.png';
import '../ui/game-ui.css';
import './Home.css';
import './PartyLobbyPage.css';

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
      <div className="global-bg" style={{ backgroundImage: `url(${bg})` }} />
      <div className="app">
        <Navbar />
        <div className="home-menu">
          <div className="game-panel lobby-panel">
            {!party && (
              <>
                <div className="plaque-title plaque-title-center lobby-title-wrapper">
                  <h2>Co-op Mode</h2>
                </div>

                <div className="lobby-section">
                  <h3 className="lobby-section-title">Create a New Party</h3>
                  <input
                    type="text"
                    placeholder="GitHub repo URL..."
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    className="game-input"
                  />
                  <button
                    onClick={handleCreate}
                    disabled={loading || !repoUrl}
                    className="game-btn game-btn--gold lobby-btn-full"
                  >
                    {loading ? 'Creating...' : 'Create Party'}
                  </button>
                </div>

                <div className="lobby-divider" />

                <div className="lobby-section">
                  <h3 className="lobby-section-title">Join an Existing Party</h3>
                  <input
                    type="text"
                    placeholder="Party ID..."
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value)}
                    className="game-input"
                  />
                  <button
                    onClick={handleJoin}
                    disabled={loading || !partyId}
                    className="game-btn game-btn--gold lobby-btn-full"
                  >
                    {loading ? 'Joining...' : 'Join Party'}
                  </button>
                </div>
              </>
            )}

            {party && (
              <>
                <div className="plaque-title plaque-title-center lobby-title-wrapper">
                  <h2>Party Lobby</h2>
                </div>

                <div className="lobby-section">
                  <p className="lobby-party-id">
                    Party ID: <code>{party.id}</code>
                  </p>
                </div>

                <div className="lobby-section">
                  <h3 className="lobby-section-title">Members ({party.members.length})</h3>
                  <ul className="lobby-member-list">
                    {party.members.map((m) => (
                      <li key={m.user_id}>
                        {m.display_name} {m.user_id === party.host_id ? '(Host)' : ''}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="lobby-section">
                  {isHost && (
                    <button
                      onClick={() => navigate('/game', { state: { partyId: party.id } })}
                      className="game-btn game-btn--gold lobby-btn-full"
                    >
                      Start Exploring
                    </button>
                  )}
                  <button
                    onClick={leaveParty}
                    className="game-btn game-btn--danger lobby-btn-full"
                  >
                    Leave Party
                  </button>
                </div>
              </>
            )}

            <div className="lobby-section">
              <button
                onClick={() => navigate('/home')}
                className="game-btn game-btn--small lobby-btn-full"
              >
                ← Back to Home
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}
