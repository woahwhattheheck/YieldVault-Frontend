import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * RouteAnnouncer: Announces route changes to screen readers using an ARIA live region.
 * This component is invisible to sighted users but provides navigation feedback to
 * users of assistive technologies.
 */
export default function RouteAnnouncer() {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    // Map routes to human-readable announcements
    const routeMessages = {
      '/': 'Home page',
      '/dashboard': 'Dashboard page',
      '/positions': 'Positions page',
    };

    // Handle dynamic routes
    if (location.pathname.startsWith('/vault/')) {
      setAnnouncement('Vault detail page');
    } else if (location.pathname === '/404' || !routeMessages[location.pathname]) {
      setAnnouncement('Page not found');
    } else {
      setAnnouncement(routeMessages[location.pathname] || 'Page loaded');
    }
  }, [location.pathname]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        left: '-10000px',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
      }}
    >
      {announcement}
    </div>
  );
}
