import React, { useEffect, useState } from 'react';
import './MobileControls.css';

export const MobileControls: React.FC = () => {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // Check if the device supports touch
    const checkTouch = () => {
      setIsTouchDevice(
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches
      );
    };
    
    checkTouch();
    // Re-check on resize just in case (e.g., div devtools toggling)
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  if (!isTouchDevice) {
    return null;
  }

  const dispatchKey = (code: string, type: 'keydown' | 'keyup') => {
    window.dispatchEvent(new KeyboardEvent(type, { code, key: code }));
  };

  const handleTouchStart = (code: string) => (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling/zooming
    dispatchKey(code, 'keydown');
  };

  const handleTouchEnd = (code: string) => (e: React.TouchEvent) => {
    e.preventDefault();
    dispatchKey(code, 'keyup');
  };

  // Prevent default context menu on long press
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className="mobile-controls" onContextMenu={handleContextMenu}>
      {/* D-Pad Container */}
      <div className="d-pad">
        <div className="d-pad-row">
          <button
            className="d-pad-btn up"
            onTouchStart={handleTouchStart('KeyW')}
            onTouchEnd={handleTouchEnd('KeyW')}
            onTouchCancel={handleTouchEnd('KeyW')}
          >
            ▲
          </button>
        </div>
        <div className="d-pad-row center">
          <button
            className="d-pad-btn left"
            onTouchStart={handleTouchStart('KeyA')}
            onTouchEnd={handleTouchEnd('KeyA')}
            onTouchCancel={handleTouchEnd('KeyA')}
          >
            ◀
          </button>
          <div className="d-pad-center" />
          <button
            className="d-pad-btn right"
            onTouchStart={handleTouchStart('KeyD')}
            onTouchEnd={handleTouchEnd('KeyD')}
            onTouchCancel={handleTouchEnd('KeyD')}
          >
            ▶
          </button>
        </div>
        <div className="d-pad-row">
          <button
            className="d-pad-btn down"
            onTouchStart={handleTouchStart('KeyS')}
            onTouchEnd={handleTouchEnd('KeyS')}
            onTouchCancel={handleTouchEnd('KeyS')}
          >
            ▼
          </button>
        </div>
      </div>

      {/* Action Buttons Container */}
      <div className="action-buttons">
        <button
          className="action-btn interact"
          onTouchStart={handleTouchStart('KeyJ')}
          onTouchEnd={handleTouchEnd('KeyJ')}
          onTouchCancel={handleTouchEnd('KeyJ')}
        >
          J
        </button>
      </div>
    </div>
  );
};
