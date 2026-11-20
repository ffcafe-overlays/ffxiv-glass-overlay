import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

import { Settings } from '../Settings';
import { ErrorBoundary } from '../ErrorBoundary';

import type { Settings as SettingsType } from '../../types';

const STORAGE_KEY = 'glass-overlay-settings-window-geometry';
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 1035;

interface WindowGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

function loadWindowGeometry(): WindowGeometry | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const geo = JSON.parse(stored) as WindowGeometry;
      if (
        typeof geo.left === 'number' &&
        typeof geo.top === 'number' &&
        typeof geo.width === 'number' &&
        typeof geo.height === 'number'
      ) {
        return geo;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function saveWindowGeometry(win: Window): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        left: win.screenX,
        top: win.screenY,
        width: win.outerWidth,
        height: win.outerHeight,
      })
    );
  } catch {
    // Ignore storage errors
  }
}

interface SettingsWindowProps {
  /** Whether the settings window should be open */
  isOpen: boolean;
  /** Current settings */
  settings: SettingsType;
  /** Callback when settings change */
  onSave: (settings: SettingsType) => void;
  /** Callback when the window is closed */
  onClose: () => void;
  /** Auto-detected player name from OverlayPlugin */
  detectedPlayerName: string | null;
}

/**
 * Settings window component that opens settings in a separate browser window
 */
export function SettingsWindow({
  isOpen,
  settings,
  onSave,
  onClose,
  detectedPlayerName,
}: SettingsWindowProps) {
  const windowRef = useRef<Window | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const isResettingRef = useRef(false);
  const resetPositionRef = useRef<{ left: number; top: number } | null>(null);

  // Reset window to default size by closing and reopening
  const handleResetWindowSize = useCallback(() => {
    if (windowRef.current) {
      // Save current position to restore after reset
      resetPositionRef.current = {
        left: windowRef.current.screenX,
        top: windowRef.current.screenY,
      };

      // Update saved geometry with default dimensions but keep position
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            left: windowRef.current.screenX,
            top: windowRef.current.screenY,
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
          })
        );
      } catch {
        // Ignore storage errors
      }

      // Mark that we're resetting so beforeunload doesn't call onClose
      isResettingRef.current = true;
      windowRef.current.close();
    }
  }, []);

  // Copy styles from parent window to popup
  const copyStyles = useCallback((targetDoc: Document) => {
    // Copy all stylesheets
    Array.from(document.styleSheets).forEach((styleSheet) => {
      try {
        if (styleSheet.cssRules) {
          const newStyleEl = targetDoc.createElement('style');
          Array.from(styleSheet.cssRules).forEach((cssRule) => {
            newStyleEl.appendChild(targetDoc.createTextNode(cssRule.cssText));
          });
          targetDoc.head.appendChild(newStyleEl);
        } else if (styleSheet.href) {
          const newLinkEl = targetDoc.createElement('link');
          newLinkEl.rel = 'stylesheet';
          newLinkEl.href = styleSheet.href;
          targetDoc.head.appendChild(newLinkEl);
        }
      } catch (e) {
        // Ignore cross-origin stylesheets
        if (styleSheet.href) {
          const newLinkEl = targetDoc.createElement('link');
          newLinkEl.rel = 'stylesheet';
          newLinkEl.href = styleSheet.href;
          targetDoc.head.appendChild(newLinkEl);
        }
      }
    });
  }, []);

  // Open window helper function
  const openWindow = useCallback(() => {
    const savedGeometry = loadWindowGeometry();
    const width = savedGeometry?.width ?? DEFAULT_WIDTH;
    const height = savedGeometry?.height ?? DEFAULT_HEIGHT;
    let windowFeatures = `width=${width},height=${height},resizable=yes,scrollbars=yes`;

    if (savedGeometry) {
      windowFeatures += `,left=${savedGeometry.left},top=${savedGeometry.top}`;
    }

    const settingsUrl = new URL('settings.html', window.location.href).href;
    const newWindow = window.open(settingsUrl, 'SettingsWindow', windowFeatures);

    if (newWindow) {
      windowRef.current = newWindow;

      // Wait for the declared document; the initial about:blank has no surface authorization.
      const ready = window.setInterval(() => {
        if (newWindow.closed || windowRef.current !== newWindow) {
          window.clearInterval(ready);
          if (windowRef.current === newWindow) {
            windowRef.current = null;
            setContainer(null);
            onClose();
          }
          return;
        }
        if (newWindow.location.href !== settingsUrl || newWindow.document.readyState !== 'complete') return;
        window.clearInterval(ready);
        newWindow.document.body.style.cssText = 'margin:0;padding:0;background:rgba(15,15,20,.98);min-height:100vh';
        copyStyles(newWindow.document);
        const containerDiv = newWindow.document.createElement('div');
        containerDiv.id = 'settings-root';
        containerDiv.className = 'overlay-container theme-default settings-window-container';
        newWindow.document.body.appendChild(containerDiv);
        setContainer(containerDiv);
        newWindow.addEventListener('beforeunload', () => {
          if (!isResettingRef.current) saveWindowGeometry(newWindow);
          windowRef.current = null;
          setContainer(null);
          if (isResettingRef.current) {
            isResettingRef.current = false;
            setTimeout(() => openWindow(), 50);
          } else onClose();
        });
      }, 25);
    }
  }, [copyStyles, onClose]);

  // Open or close the window based on isOpen prop
  useEffect(() => {
    if (isOpen && !windowRef.current) {
      openWindow();
    } else if (!isOpen && windowRef.current) {
      // Save geometry before closing
      saveWindowGeometry(windowRef.current);
      windowRef.current.close();
      windowRef.current = null;
      setContainer(null);
    }

    return () => {
      if (windowRef.current) {
        // Save geometry on cleanup
        saveWindowGeometry(windowRef.current);
        windowRef.current.close();
        windowRef.current = null;
      }
    };
  }, [isOpen, openWindow]);

  // Update theme class when settings change
  useEffect(() => {
    if (container && settings.general.theme) {
      container.className = `overlay-container theme-${settings.general.theme} settings-window-container`;
    }
  }, [container, settings.general.theme]);

  // Don't render anything if window isn't open or container isn't ready
  if (!isOpen || !container) {
    return null;
  }

  // Render Settings into the popup window using portal
  return createPortal(
    <ErrorBoundary>
      <Settings
        settings={settings}
        onSave={onSave}
        detectedPlayerName={detectedPlayerName}
        onResetWindowSize={handleResetWindowSize}
      />
    </ErrorBoundary>,
    container
  );
}
