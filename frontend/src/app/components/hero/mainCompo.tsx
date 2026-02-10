import { useState } from 'react';
import backgroundCard from '../../../assets/backgroundcard.svg';
import { useNavigate } from 'react-router-dom';
import './mainCompo.css';

export default function MainCompo() {
  const [repoUrl, setRepoUrl] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const navigate = useNavigate();

  const exampleRepos = [
    { name: 'CodeVedas_SIH', url: 'https://github.com/Not-Buddy/CodeVedas_SIH.git' },
    { name: 'VulnerabilityReportCompiler', url: 'https://github.com/Not-Buddy/VulnerabilityReportCompiler.git' },
    { name: 'Many Files cpp', url: 'https://github.com/Not-Buddy/C-plus-plus-Brainstorming.git' },
    { name: 'gauss-render', url: 'https://github.com/Not-Buddy/gauss-render.git' },
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
    </div>
  );
}