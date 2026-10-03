import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import EnvironmentBanner from './components/EnvironmentBanner';
import RouteAnnouncer from './components/RouteAnnouncer';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import VaultDetail from './pages/VaultDetail';
import Positions from './pages/Positions';
import NotFound from './pages/NotFound';

/**
 * Wrap a page in a route-level boundary so a failed page remounts independently
 * while the shell (banner / navbar / footer) stays interactive.
 * @param {string} feature
 * @param {import('react').ReactNode} element
 * @param {string} pathname
 */
function withRouteBoundary(feature, element, pathname) {
  return (
    <ErrorBoundary level="route" feature={feature} resetKeys={[pathname]}>
      {element}
    </ErrorBoundary>
  );
}

/**
 * Root layout: persistent navbar/footer with routed page content.
 * Route boundaries isolate page failures; feature boundaries inside pages
 * keep sibling widgets alive when one section crashes.
 */
export default function App() {
  const { pathname } = useLocation();

  return (
    <div className="app">
      <RouteAnnouncer />
      <EnvironmentBanner />
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={withRouteBoundary('home', <Home />, pathname)}
          />
          <Route
            path="/dashboard"
            element={withRouteBoundary('dashboard', <Dashboard />, pathname)}
          />
          <Route
            path="/vault/:id"
            element={withRouteBoundary('vault-detail', <VaultDetail />, pathname)}
          />
          <Route
            path="/positions"
            element={withRouteBoundary('positions', <Positions />, pathname)}
          />
          <Route
            path="*"
            element={withRouteBoundary('not-found', <NotFound />, pathname)}
          />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
