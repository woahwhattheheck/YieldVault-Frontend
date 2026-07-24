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
 * Root layout: persistent navbar/footer with routed page content.
 */
export default function App() {
  return (
    <div className="app">
      <RouteAnnouncer />
      <EnvironmentBanner />
      <Navbar />
      <main className="app-main">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/vault/:id" element={<VaultDetail />} />
            <Route path="/positions" element={<Positions />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
