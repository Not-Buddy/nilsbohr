import { useNavigate } from 'react-router-dom';
import Footer from '../components/hero/footer';
import bg from '../../assets/background.png';
import backgroundCard from '../../assets/backgroundcard.svg';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || 'Adventurer';

  return (
    <>
      <div className="global-bg" style={{ backgroundImage: `url(${bg})` }} />
      <div className="app">
        <div className="home-page">
          <div className="home-content-wrapper">
            <div
              className="home-card-container"
              style={{ '--bg-image': `url(${backgroundCard})` } as React.CSSProperties}
            >
              <div className="home-card-content">
                <h2 className="home-title">Welcome, {username}</h2>
                <p className="home-subtitle">Choose your adventure</p>

                <div className="home-menu-grid">
                  <button
                    className="home-menu-btn"
                    onClick={() => navigate('/select-repo')}
                  >
                    <div className="home-menu-icon">🗺️</div>
                    <h3>Solo Quest</h3>
                    <p>Explore a codebase on your own</p>
                  </button>

                  <button
                    className="home-menu-btn"
                    onClick={() => navigate('/lobby')}
                  >
                    <div className="home-menu-icon">⚔️</div>
                    <h3>Co-op Raid</h3>
                    <p>Explore with other players</p>
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
