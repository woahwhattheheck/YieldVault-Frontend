import { Routes, Route } from 'react-router-dom';
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
 */
function withRouteBoundary(feature, element) {
  return (
    <ErrorBoundary level="route" feature={feature}>
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
  return (
    <div className="app">
      <RouteAnnouncer />
      <EnvironmentBanner />
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={withRouteBoundary('home', <Home />)} />
          <Route
            path="/dashboard"
            element={withRouteBoundary('dashboard', <Dashboard />)}
          />
          <Route
            path="/vault/:id"
            element={withRouteBoundary('vault-detail', <VaultDetail />)}
          />
          <Route
            path="/positions"
            element={withRouteBoundary('positions', <Positions />)}
          />
          <Route path="*" element={withRouteBoundary('not-found', <NotFound />)} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
