import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard,
  Package,
  Users as UsersIcon,
  Receipt,
  ShoppingCart,
  Shield,
  BarChart3,
  LogOut,
} from "lucide-react";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true, roles: ["admin", "employee"] },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart, roles: ["admin", "employee"] },
  { to: "/admin/products", label: "Products", icon: Package, roles: ["admin", "employee"] },
  { to: "/admin/customers", label: "Customers", icon: UsersIcon, roles: ["admin", "employee"] },
  { to: "/admin/users", label: "Team", icon: Shield, roles: ["admin"] },
  { to: "/admin/reports", label: "Reports", icon: BarChart3, roles: ["admin"] },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const items = NAV.filter((n) => n.roles.includes(user.role));

  const handleLogout = () => {
    logout();
    nav("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-[var(--border)] bg-white flex flex-col" data-testid="admin-sidebar">
        <div className="p-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--primary)] text-white flex items-center justify-center font-display font-bold">
              W
            </div>
            <div>
              <div className="font-display tracking-tight text-base leading-none">Wholesale</div>
              <div className="overline text-[10px] mt-1">POS · v1.0</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {items.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                data-testid={`nav-${n.label.toLowerCase()}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--text)] hover:bg-black/5"
                  }`
                }
              >
                <Icon size={16} />
                {n.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-[var(--border)]">
          <div className="px-3 py-2">
            <div className="text-sm font-medium truncate" data-testid="user-name">{user.name}</div>
            <div className="overline text-[10px] mt-0.5">{user.role.replace("_", " ")}</div>
          </div>
          <button
            onClick={handleLogout}
            data-testid="logout-button"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text)]"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
