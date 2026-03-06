import { useEffect, useState } from 'react';
import api from '../../auth/api';
import './RepoList.css';

type Repo = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  private: boolean;
};

type Props = {
  onSelect: (url: string) => void;
};

export default function RepoList({ onSelect }: Props) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/auth/repos')
      .then((res) => {
        if (!cancelled) setRepos(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load repos');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="repo-list-section">
        <p className="repo-list-label">Your Repositories</p>
        <div className="repo-list-skeletons">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="repo-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="repo-list-section">
        <p className="repo-list-label">Your Repositories</p>
        <p className="repo-list-error">{error}</p>
      </div>
    );
  }

  if (repos.length === 0) {
    return null;
  }

  return (
    <div className="repo-list-section">
      <p className="repo-list-label">Your Repositories</p>
      <div className="repo-list-scroll">
        {repos.map((repo) => (
          <button
            key={repo.full_name}
            className="repo-card"
            onClick={() => onSelect(repo.html_url)}
            title={repo.description || repo.full_name}
          >
            <div className="repo-card-header">
              <span className="repo-card-name">{repo.name}</span>
              {repo.private && <span className="repo-card-badge">Private</span>}
            </div>

            {repo.description && (
              <p className="repo-card-desc">{repo.description}</p>
            )}

            <div className="repo-card-meta">
              {repo.language && (
                <span className="repo-card-lang">
                  <span className="lang-dot" /> {repo.language}
                </span>
              )}
              {repo.stargazers_count > 0 && (
                <span className="repo-card-stars">⭐ {repo.stargazers_count}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
