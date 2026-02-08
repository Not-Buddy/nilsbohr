import { useState } from 'react';
import backgroundCard from '../../../assets/backgroundcard.svg';
import { useNavigate } from 'react-router-dom';

export default function MainCompo() {
  const [repoUrl, setRepoUrl] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const navigate = useNavigate();

  const exampleRepos = [
    { name: 'FastAPI', url: 'https://github.com/tiangolo/fastapi' },
    { name: 'Streamlit', url: 'https://github.com/streamlit/streamlit' },
    { name: 'Flask', url: 'https://github.com/pallets/flask' },
    { name: 'api-analytics', url: 'https://github.com/mkdocs/mkdocs' },
    { name: 'Monkeytype', url: 'https://github.com/monkeytypegame/monkeytype' },
  ];

  const handleExampleClick = (url: string) => {
    setRepoUrl(url);
  };

  return (
    <div className="main-container">

      {/*pixi testing*/}
      <button onClick={() => navigate('/game')} className="pixi-btn">
        Pixi
      </button>

      {/* Main Content Card */}
      <div className="content-wrapper">
        <div
          className="card-container"
          style={{
            backgroundImage: `url(${backgroundCard})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
          }}
        >


          {/* Card Content */}
          <div className="card-content">
            {/* Header Section */}
            <div className="header-section">
              <h1 className="title">Repository to Game</h1>
              <p className="subtitle">
                Turn any GitHub repository into an interactive game designed to help you understand complex codebases easily.
              </p>
              <p className="hint-text">
                You can also replace <code className="code-hint">hub</code> with <code className="code-hint">gamefiy</code> in any GitHub URL.
              </p>
            </div>

            {/* Input Section */}
            <div className="input-section">
              <div className={`input-wrapper ${isFocused ? 'focused' : ''}`}>
                <input
                  type="text"
                  placeholder="Enter GitHub repository URL..."
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  className="repo-input"
                />
                <button className="diagram-btn" onClick={() => navigate('/game', { state: { repoUrl } })}>Diagram</button>
              </div>
            </div>

            {/* Examples Section */}
            <div className="examples-section">
              <p className="examples-label">Try these example repositories:</p>
              <div className="examples-grid">
                {exampleRepos.map((r) => (
                  <button
                    key={r.name}
                    onClick={() => handleExampleClick(r.url)}
                    className="example-btn"
                    title={r.url}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .main-container {
          position: relative;
          width: 100%;
          min-height: calc(100vh - 64px - 56px);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

      index: 1;
        }

        .content-wrapper {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .card-container {
          width: 937px;
          height: 650px;
          max-width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          aspect-ratio: 937 / 650;
          overflow: hidden;
          background: transparent;
        }

        .card-content {
          width: 80%;
          height: 80%;
          max-width: 800px;
          max-height: 520px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 2;
        }

        /* Header Section */
        .header-section {
          flex: 0 0 auto;
          margin-bottom: 30px;
          width: 100%;
        }

        .title {
          font-size: clamp(28px, 4vw, 42px);
          font-weight: 700;
          color: #000000;
          margin-bottom: 12px;
          letter-spacing: -0.5px;
          font-family: 'Press Start 2P', monospace;
        }

        .subtitle {
          font-size: clamp(14px, 2vw, 16px);
          color: #000000;
          margin-bottom: 10px;
          line-height: 1.5;
          font-weight: 500;
        }

        .hint-text {
          font-size: clamp(12px, 1.8vw, 14px);
          color: #2e2e2eff;
          line-height: 1.4;
        }

        .code-hint {
          background-color: #f0f0f0;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          color: #451B0B;
          font-weight: 600;
        }

        /* Input Section */
        .input-section {
          flex: 0 0 auto;
          width: 100%;
          max-width: 500px;
          margin-bottom: 30px;
        }

        .input-wrapper {
          display: flex;
          gap: 8px;
          align-items: stretch;
          background: white;
          border: 2px solid #451B0B;
          box-shadow: inset 0 0 0 4px #B47C57;
          border-radius: 8px;
          transition: all 0.3s ease;
          padding: 4px;
        }

        .input-wrapper.focused {
          border-color: #451B0B;
          box-shadow: inset 0 0 0 4px #B47C57, 0 0 0 3px rgba(244, 189, 128, 0.2);
        }

        .repo-input {
          flex: 1;
          border: none;
          outline: none;
          padding: 12px 16px;
          font-size: 14px;
          background: transparent;
          color: #333;
          font-family: 'Press Start 2P', monospace;
        }

        .repo-input::placeholder {
          color: #999;
        }

        .diagram-btn {
          padding: 12px 24px;
          background: #FCBD80;
          color: #451B0B;
          border: 2px solid #451B0B;
          border-radius: 6px;
          font-weight: 600;
          font-size: 14px;
          font-family: 'Press Start 2P', monospace;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .diagram-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(68, 27, 11, 0.2), inset 0 0 0 2px #B47C57;
          background: #FCBD80;
        }

        .diagram-btn:active {
          transform: translateY(0);
        }

        /* Examples Section */
        .examples-section {
          flex: 0 0 auto;
          width: 100%;
        }

        .examples-label {
          font-size: clamp(12px, 1.8vw, 13px);
          color: #000000;
          margin-bottom: 12px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-family: 'Press Start 2P', monospace;
        }

        .examples-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          align-items: center;
        }

        .example-btn {
          padding: 8px 14px;
          background-color: #FCBD80;
          border: 2px solid #451B0B;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          color: #451B0B;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          font-family: 'Press Start 2P', monospace;
        }

        .example-btn:hover {
          background-color: #B47C57;
          color: #FCBD80;
          border-color: #451B0B;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(68, 27, 11, 0.2);
        }

        .example-btn:active {
          transform: translateY(0);
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .card-container {
            width: 95%;
            height: auto;
            aspect-ratio: auto;
          }

          .card-content {
            width: 90%;
            height: auto;
            padding: 30px 20px;
          }

          .header-section {
            margin-bottom: 25px;
          }

          .input-section {
            margin-bottom: 25px;
          }

          .examples-grid {
            gap: 6px;
          }

          .example-btn {
            padding: 7px 12px;
            font-size: 12px;
          }
        }

        @media (max-width: 480px) {
          .input-wrapper {
            flex-direction: column;
          }

          .diagram-btn {
            width: 100%;
            justify-content: center;
          }

          .examples-grid {
            gap: 5px;
          }

          .example-btn {
            flex: 1 0 calc(50% - 3px);
            justify-content: center;
          }
        }

        .pixi-btn {
  position: fixed;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);

  padding: 12px 24px;
  background: #FCBD80;
  color: #451B0B;
  border: 2px solid #451B0B;
  border-radius: 6px;

  font-family: 'Press Start 2P', monospace;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  display: flex;
  align-items: center;
  gap: 6px;

  transition: all 0.2s ease;
  z-index: 100;
}

      `}</style>
    </div>
  );
}