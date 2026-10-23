
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  Mail,
} from 'lucide-react'
import { login, getStoredUser } from './authService'
import { getApiErrorMessage } from '../../services/api/client'
import './LoginPage.css'
import cityImage from '../../assets/wms-city-login.png'

export default function LoginPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (localStorage.getItem('wms_access_token') && getStoredUser()) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login({ email: email.trim(), password })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function handleForgotPassword() {
    setError(
      'Password reset is not configured yet. Please contact your administrator.',
    )
  }

  return (
    <main className="wms-auth-page">
      <div className="wms-auth-glow wms-auth-glow-one" />
      <div className="wms-auth-glow wms-auth-glow-two" />
      <div className="wms-auth-stars" />

      <div className="wms-auth-card">
        {/* LEFT: LOGIN FORM */}
        <section className="wms-login-panel">
          <Link to="/" className="wms-auth-brand" aria-label="WMS home">
            <span className="wms-brand-icon">
              <Leaf size={27} fill="currentColor" />
            </span>
            <span>WMS</span>
          </Link>

          <div className="wms-login-content">
            <h1>Welcome Back</h1>

            <p className="wms-auth-subtitle">
              Sign in to continue to a cleaner, greener city.
            </p>

            <form className="wms-auth-form" onSubmit={handleSubmit}>
              <div className="wms-field">
                <label htmlFor="wms-email">Email</label>

                <div className="wms-input-wrap">
                  <Mail size={17} aria-hidden="true" />

                  <input
                    id="wms-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="wms-field">
                <label htmlFor="wms-password">Password</label>

                <div className="wms-input-wrap">
                  <LockKeyhole size={17} aria-hidden="true" />

                  <input
                    id="wms-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                  />

                  <button
                    type="button"
                    className="wms-password-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </div>

              <div className="wms-forgot-row">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="wms-text-link"
                >
                  Forgot password?
                </button>
              </div>

              {error && (
                <div className="wms-auth-error" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="wms-signin-button"
              >
                {loading ? 'Signing in…' : 'Sign In'}
                {!loading && <span aria-hidden="true">→</span>}
              </button>
            </form>

            <p className="wms-register-prompt">
              Don&apos;t have an account?{' '}
              <Link to="/register">Register</Link>
            </p>
          </div>

          <p className="wms-auth-security">
            Secure access to a cleaner city
          </p>
        </section>

        {/* RIGHT: SUSTAINABLE CITY IMAGE */}
        <section
          className="wms-login-visual"
          aria-label="A greener city"
        >
          <img
            className="wms-city-image"
            src={cityImage}
            alt="Sustainable city with skyscrapers, trees, and a waste collection truck"
          />

          <div className="wms-city-shade" />

          <div className="wms-city-caption">
            <span className="wms-city-tag">
              <Leaf size={14} />
              A GREENER TOMORROW
            </span>

            <h2>
              Better Waste
              <br />
              Management
              <br />
              <span>A Healthier City</span>
            </h2>

            <p>
              Smarter collection. Cleaner streets. A better future.
            </p>
          </div>

          <div className="wms-visual-border" />
        </section>
      </div>
    </main>
  )
}
