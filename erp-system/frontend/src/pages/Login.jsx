import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('admin@erp.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink bg-blueprint-grid bg-grid-md">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="eyebrow mb-1">Enterprise Project Lifecycle</div>
          <h1 className="font-display text-3xl font-semibold text-white">Nexus ERP</h1>
        </div>
        <form onSubmit={handleSubmit} className="panel p-8 space-y-4">
          <div>
            <label className="eyebrow block mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-ink border border-line rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              required
            />
          </div>
          <div>
            <label className="eyebrow block mb-1.5">Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-ink border border-line rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              required
            />
          </div>
          {error && <div className="text-bad text-xs font-mono">{error}</div>}
          <button
            type="submit" disabled={loading}
            className="w-full bg-accent text-ink font-semibold rounded py-2 text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-center text-xs text-slate-500 mt-4 font-mono">
          Seed admin: admin@erp.local / Admin@12345
        </p>
      </div>
    </div>
  );
}
