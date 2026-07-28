import { useNavigate } from 'react-router-dom';
import Navbar from '../components/hero/navbar';
import Footer from '../components/hero/footer';
import bg from '../../assets/background.png';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || 'Adventurer';

  return (
    <>
      <div className="global-bg" style={{ backgroundImage: `url(${bg})` }} />
      <div className="app">
        <Navbar />
        <div className="home-menu">
          <p className="home-welcome">⚔️ Welcome, {username}</p>
          <div className="menu-cards">
            {/* Solo Quest */}
            <div
              className="menu-card"
              tabIndex={0}
              role="button"
              onClick={() => navigate('/select-repo')}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate('/select-repo') }}
            >
              <div className="menu-card-cursor">&gt;</div>
              <div className="menu-card-icon">🗺️</div>
              <h2 className="menu-card-title">Solo Quest</h2>
              <p className="menu-card-desc">Explore a codebase on your own</p>
            </div>
            {/* Co-op Raid */}
            <div
              className="menu-card"
              tabIndex={0}
              role="button"
              onClick={() => navigate('/lobby')}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate('/lobby') }}
            >
              <div className="menu-card-cursor">&gt;</div>
              <div className="menu-card-icon">⚔️</div>
              <h2 className="menu-card-title">Co-op Raid</h2>
              <p className="menu-card-desc">Explore with other players</p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}