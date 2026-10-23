import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Eye, EyeOff } from 'lucide-react';
import api from '../lib/axios';
import { formatApiErrorDetail } from '../utils/formatError';

const DEMO_ROLES = [
  { role: 'employee',   label: 'Employee',    email: 'james.wu@creativesolutions.com', password: 'JamesWu123!' },
  { role: 'team_lead',  label: 'Team Lead',   email: 'sarah@creativesolutions.com',    password: 'SarahLead123!' },
  { role: 'manager',    label: 'Manager',     email: 'michael@creativesolutions.com',  password: 'MichaelMgr456!' },
  { role: 'hr',         label: 'HR Director', email: 'lisa@creativesolutions.com',     password: 'LisaHR789!' },
  { role: 'accounting', label: 'Accounting',  email: 'robert@creativesolutions.com',   password: 'RobertAcct789!' },
  { role: 'admin',      label: 'Admin',       email: 'admin@happen.com',               password: 'Admin2026!' },
];

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleLogin = async (e, demoEmail = null, demoPassword = null) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    const loginEmail = demoEmail || email;
    const loginPassword = demoPassword || password;

    try {
      const { data } = await api.post('/auth/login', {
        email: loginEmail,
        password: loginPassword,
      });
      login(data.user, data.token);
      navigate('/dashboard');
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.error;
      setError(detail ? formatApiErrorDetail(detail) : (err.message || 'Unable to sign in.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen" data-testid="login-page">
      {/* Left Panel - Brand */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-center px-12 text-white"
        style={{
          background: 'linear-gradient(135deg, var(--orange) 0%, var(--orange-dark) 100%)',
        }}
      >
        <h1 className="text-5xl font-bold mb-4">Happen</h1>
        <p className="text-2xl mb-8 opacity-90">The Human-Centered Workplaces</p>
        <ul className="space-y-4 text-lg">
          <li className="flex items-start gap-3">
            <span className="text-2xl">✓</span>
            <span>Fair leave management powered by intelligent queuing</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-2xl">✓</span>
            <span>Real-time workload monitoring to prevent burnout</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-2xl">✓</span>
            <span>Built-in bias detection and compliance tracking</span>
          </li>
        </ul>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16 bg-white">
        <div className="w-full max-w-md mx-auto">
          {/* Back to Home */}
          <a
            href="/home"
            className="inline-flex items-center gap-2 text-sm font-medium mb-8 transition-colors hover:-translate-x-0.5 transition-transform"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back to Home
          </a>

          <h2 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Sign In
          </h2>
          <p className="text-gray-600 mb-8">Welcome back! Please enter your credentials.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }}
                placeholder="you@example.com"
                required
                data-testid="email-input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }}
                  placeholder="••••••••"
                  required
                  data-testid="password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  data-testid="toggle-password-visibility"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm" data-testid="error-message">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--orange)' }}
              data-testid="login-submit-button"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: 'var(--border)' }}></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">Or try a demo account</span>
            </div>
          </div>

          {/* Demo Login Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {DEMO_ROLES.map((demo) => (
              <button
                key={demo.role}
                onClick={(e) => handleLogin(e, demo.email, demo.password)}
                disabled={loading}
                className="px-4 py-3 rounded-lg border-2 font-medium transition-all duration-200 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  borderColor: 'var(--orange)',
                  color: 'var(--orange)',
                  background: 'white',
                }}
                data-testid={`demo-login-${demo.role}`}
              >
                {demo.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
