import { useEffect, useState } from 'react'
import '../PixiApp.css'

function isTouchOnlyDevice(): boolean {
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches
  return hasTouch && !hasFinePointer
}

export default function DeviceGuard({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    const check = () => setBlocked(isTouchOnlyDevice())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!blocked) return <>{children}</>

  return (
    <div className="overlay">
      <div className="loading-card error">
        <div className="title error">⌨️ Keyboard Required</div>
        <div className="phase backend-error-msg">
          This game requires a physical keyboard. Please open this page on a laptop or desktop computer.
        </div>
      </div>
    </div>
  )
}
