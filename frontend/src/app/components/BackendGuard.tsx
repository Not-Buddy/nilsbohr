import { useEffect, useState, useRef, useCallback } from 'react'
import '../PixiApp.css'

const HEALTH_URL = `${import.meta.env.VITE_BACKEND_URL}/health`
const HEALTH_CHECK_TIMEOUT = 5_000
const RETRY_INTERVAL = 5_000

type BackendStatus = 'checking' | 'online' | 'offline'

export default function BackendGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BackendStatus>('checking')
  const [countdown, setCountdown] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkHealth = useCallback(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT)

    try {
      const res = await fetch(HEALTH_URL, { signal: controller.signal })
      const body = await res.json()
      if (res.ok && body?.status === 'healthy') {
        setStatus('online')
        return true
      }
      setStatus('offline')
      return false
    } catch {
      setStatus('offline')
      return false
    } finally {
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  useEffect(() => {
    if (status !== 'offline') return

    let count = Math.ceil(RETRY_INTERVAL / 1000)
    setCountdown(count)

    countdownRef.current = setInterval(() => {
      count--
      if (count <= 0) count = Math.ceil(RETRY_INTERVAL / 1000)
      setCountdown(count)
    }, 1000)

    intervalRef.current = setInterval(() => {
      checkHealth()
    }, RETRY_INTERVAL)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [status, checkHealth])

  const handleRetry = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    setStatus('checking')
    checkHealth()
  }

  if (status === 'online') return <>{children}</>

  return (
    <div className="overlay">
      <div className="loading-card error">
        <div className="title error">🔌 Backend Not Running</div>
        <div className="phase backend-error-msg">
          Cannot connect to the game server. Make sure the backend is running and try again.
        </div>

        {status === 'checking' && (
          <div className="phase backend-countdown">Checking server connection…</div>
        )}

        {status === 'offline' && (
          <>
            <div className="phase backend-countdown">Retrying in {countdown}s…</div>
            <button onClick={handleRetry} className="retry-btn">
              Retry Now
            </button>
          </>
        )}
      </div>
    </div>
  )
}
