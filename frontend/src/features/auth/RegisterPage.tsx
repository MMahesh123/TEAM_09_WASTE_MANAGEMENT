
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react'
import { getStoredUser, register } from './authService'
import { getApiErrorMessage } from '../../services/api/client'
import './RegisterPage.css'
import cityImage from '../../assets/wms-city-login.png'

export default function RegisterPage() {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (localStorage.getItem('wms_access_token') && getStoredUser()) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setLoading(true)

    try {
      await register({
        username: username.trim(),
        email: email.trim(),
        password,
      })
      setSuccess(true)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="wms-register-page">
      <div className="wms-register-glow wms-register-glow-one" />
      <div className="wms-register-glow wms-register-glow-two" />
      <div className="wms-register-stars" />

      <div className={`wms-register-card${success ? ' wms-register-card-success' : ''}`}>
        {/* LEFT: REGISTRATION FORM / SUCCESS MESSAGE */}
        <section className="wms-register-panel">
          <Link to="/" className="wms-register-brand" aria-label="WMS home">
            <span className="wms-register-brand-icon">
              <Leaf size={27} fill="currentColor" />
            </span>
            <span>WMS</span>
          </Link>

          {success ? (
            <div className="wms-register-content wms-register-success">
              <div className="wms-success-icon">
                <CheckCircle2 size={31} />
              </div>

              <p className="wms-register-eyebrow">REGISTRATION COMPLETE</p>
              <h1>Account Created!</h1>

              <p className="wms-register-subtitle">
                Your citizen account has been registered successfully.
                You can now sign in using your new credentials.
              </p>

              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="wms-register-submit"
              >
                Continue to Sign In
                <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <div className="wms-register-content">
              <p className="wms-register-eyebrow">JOIN YOUR CITY</p>
              <h1>Create Your Account</h1>

              <p className="wms-register-subtitle">
                Join us in building a cleaner, greener city.
              </p>

              <form
                onSubmit={handleSubmit}
                className="wms-register-form"
              >
                <div className="wms-register-field">
                  <label htmlFor="register-username">Full name</label>

                  <div className="wms-register-input">
                    <UserRound size={17} aria-hidden="true" />
                    <input
                      id="register-username"
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      required
                      maxLength={100}
                      autoComplete="name"
                      placeholder="Enter your full name"
                    />
                  </div>
                </div>

                <div className="wms-register-field">
                  <label htmlFor="register-email">Email address</label>

                  <div className="wms-register-input">
                    <Mail size={17} aria-hidden="true" />
                    <input
                      id="register-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoComplete="email"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div className="wms-register-field">
                  <label htmlFor="register-password">Password</label>

                  <div className="wms-register-input">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                    />

                    <button
                      type="button"
                      className="wms-register-password-toggle"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <div className="wms-register-field">
                  <label htmlFor="confirm-password">Confirm password</label>

                  <div className="wms-register-input">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                    />

                    <button
                      type="button"
                      className="wms-register-password-toggle"
                      onClick={() =>
                        setShowConfirmPassword((value) => !value)
                      }
                      aria-label={
                        showConfirmPassword
                          ? 'Hide confirm password'
                          : 'Show confirm password'
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={17} />
                      ) : (
                        <Eye size={17} />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="wms-register-error" role="alert">
                    {error}
                  </div>
                )}

                <div className="wms-register-notice">
                  Public registration creates a{' '}
                  <strong>Citizen</strong> account. Staff permissions are
                  assigned and enforced by the backend.
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="wms-register-submit"
                >
                  {loading ? 'Creating account…' : 'Create Account'}
                  {!loading && <ArrowRight size={17} />}
                </button>
              </form>

              <p className="wms-register-login-prompt">
                Already have an account?{' '}
                <Link to="/login">Sign In</Link>
              </p>
            </div>
          )}

          <p className="wms-register-footer">
            Together for a cleaner, healthier city
          </p>
        </section>

        {/* RIGHT: SAME CITY IMAGE AS LOGIN */}
        <section
          className="wms-register-visual"
          aria-label="Better waste management for a healthier city"
        >
          <img
            className="wms-register-city-image"
            src={cityImage}
            alt="Sustainable green city with skyscrapers, trees, and a waste collection truck"
          />

          <div className="wms-register-city-shade" />

          <div className="wms-register-city-caption">
            <span className="wms-register-city-tag">
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

          <div className="wms-register-visual-border" />
        </section>
      </div>
    </main>
  )
}
