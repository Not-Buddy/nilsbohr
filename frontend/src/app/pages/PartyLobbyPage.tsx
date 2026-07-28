import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParty } from '../../party/PartyContext';
import Navbar from '../components/hero/navbar';
import Footer from '../components/hero/footer';
import bg from '../../assets/background.png';
import backgroundCard from '../../assets/backgroundcard.svg';
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
      <button
        className="page-back-btn"
        onClick={() => navigate('/home')}
      >
        ← Back
      </button>
      <div className="app">
        <Navbar />
        <div className="lobby-page">
          <div className="lobby-content-wrapper">
            <div
              className="lobby-card-container"
              style={{ '--bg-image': `url(${backgroundCard})` } as React.CSSProperties}
            >
              <div className="lobby-card-content">
                {!party && (
                  <>
                    <div className="lobby-section">
                      <h2 className="lobby-title">Co-op Mode</h2>
                      <p className="lobby-subtitle">Explore a repository together with friends</p>
                    </div>

                    <div className="lobby-section">
                      <h3 className="lobby-section-title">Create a New Party</h3>
                      <div className="lobby-input-wrapper">
                        <input
                          type="text"
                          placeholder="GitHub repo URL..."
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          className="lobby-input"
                        />
                      </div>
                      <button
                        onClick={handleCreate}
                        disabled={loading || !repoUrl}
                        className="lobby-btn"
                      >
                        {loading ? 'Creating...' : 'Create Party'}
                      </button>
                    </div>

                    <div className="lobby-section">
                      <h3 className="lobby-section-title">Join an Existing Party</h3>
                      <div className="lobby-input-wrapper">
                        <input
                          type="text"
                          placeholder="Party ID..."
                          value={partyId}
                          onChange={(e) => setPartyId(e.target.value)}
                          className="lobby-input"
                        />
                      </div>
                      <button
                        onClick={handleJoin}
                        disabled={loading || !partyId}
                        className="lobby-btn"
                      >
                        {loading ? 'Joining...' : 'Join Party'}
                      </button>
                    </div>
                  </>
                )}

                {party && (
                  <>
                    <div className="lobby-section">
                      <h2 className="lobby-title">Party Lobby</h2>
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
                          className="lobby-btn"
                        >
                          Start Exploring
                        </button>
                      )}
                      <button
                        onClick={leaveParty}
                        className="lobby-btn lobby-btn-danger"
                      >
                        Leave Party
                      </button>
                    </div>
                  </>
                )}

                <div className="lobby-section">
                  <button
                    onClick={() => navigate('/home')}
                    className="lobby-btn lobby-btn-small"
                  >
                    ← Back to Home
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}
