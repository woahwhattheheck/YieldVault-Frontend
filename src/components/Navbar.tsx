import { useState, useEffect, useContext } from "react";
import { NavLink, useInRouterContext } from "react-router-dom";
import AppContext, { AppProvider } from "../context/AppContext";
import WalletButton from "./WalletButton";
import ThemeToggle from "./ThemeToggle";
import TimezoneSelector from "./TimezoneSelector";

/**
 * Top navigation bar with brand, primary links and the wallet control.
 * Navigation can be collapsed/expanded on mobile and the state is persisted to localStorage.
 */
const STORAGE_KEY = "yieldvault:nav-collapsed";

export default function Navbar() {
  const inRouter = useInRouterContext();
  const appContext = useContext(AppContext);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === "true";
      }
    } catch {
      /* storage unavailable — use expanded navigation */
    }
    return false;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isCollapsed));
    } catch {
      /* storage unavailable — ignore */
    }
  }, [isCollapsed]);

  const toggleNav = () => setIsCollapsed((prev) => !prev);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? "nav-link nav-link-active" : "nav-link";

  const link = (to: string, label: string) =>
    inRouter ? (
      <NavLink to={to} className={linkClass}>
        {label}
      </NavLink>
    ) : (
      <a href={to} className="nav-link">
        {label}
      </a>
    );

  const walletControls = (
    <>
      <ThemeToggle />
      <TimezoneSelector />
      <WalletButton />
    </>
  );

  return (
    <nav className="navbar">
      {inRouter ? (
        <NavLink to="/" className="brand">
          <span className="brand-mark">◎</span>
          YieldVault
        </NavLink>
      ) : (
        <a href="/" className="brand">
          <span className="brand-mark">◎</span>
          YieldVault
        </a>
      )}
      <button
        type="button"
        className="nav-toggle"
        onClick={toggleNav}
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isCollapsed ? (
            <>
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          ) : (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          )}
        </svg>
      </button>
      <div className={`nav-links ${isCollapsed ? "nav-links-collapsed" : ""}`}>
        {link("/dashboard", "Dashboard")}
        {link("/positions", "Positions")}
        {link("/wizard-demo", "Wizard")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", maxWidth: "100%" }}>
        {/* Share the routed app's wallet state; retain standalone navigation support. */}
        {appContext ? walletControls : <AppProvider>{walletControls}</AppProvider>}
      </div>
    </nav>
  );
}
