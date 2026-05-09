import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Home, Package, PlusCircle, TrendingUp, LogOut } from "lucide-react";

const NAV = [
  { to: "/agent", label: "Home", icon: Home, end: true },
  { to: "/agent/catalog", label: "Catalog", icon: Package },
  { to: "/agent/new-order", label: "New", icon: PlusCircle, accent: true },
  { to: "/agent/sales", label: "Sales", icon: TrendingUp },
];

export default function AgentLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col max-w-[480px] mx-auto relative shadow-[0_0_0_1px_var(--border)]">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--primary)] text-white flex items-center justify-center font-display font-bold">
            W
          </div>
          <div>
            <div className="text-sm font-medium leading-none" data-testid="agent-name">{user.name}</div>
            <div className="overline text-[9px] mt-1">Sales Agent · {user.commission_rate}% comm.</div>
          </div>
        </div>
        <button
          onClick={() => {
            logout();
            nav("/login", { replace: true });
          }}
          data-testid="agent-logout"
          className="p-2 rounded-md hover:bg-black/5 text-[var(--text-muted)]"
        >
          <LogOut size={18} />
        </button>
      </header>

      <main className="flex-1 pb-24 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white border-t border-[var(--border)] grid grid-cols-4 z-30">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`agent-nav-${n.label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-3 text-xs ${
                  isActive ? "text-[var(--primary)]" : "text-[var(--text-muted)]"
                } ${n.accent ? "relative" : ""}`
              }
            >
              {n.accent ? (
                <span className="w-11 h-11 -mt-3 bg-[var(--primary)] text-white rounded-full flex items-center justify-center shadow-md">
                  <Icon size={22} />
                </span>
              ) : (
                <Icon size={20} />
              )}
              <span>{n.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
