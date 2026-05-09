import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

const heroImg = "https://images.pexels.com/photos/4487363/pexels-photo-4487363.jpeg";

export default function Login() {
  const { user, login, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@wholesalepos.com");
  const [password, setPassword] = useState("admin123");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      const dest =
        user.role === "admin" ? "/admin" : user.role === "employee" ? "/admin/orders" : "/agent";
      nav(dest, { replace: true });
    }
  }, [user, nav]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await login(email.trim(), password);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error || "Login failed");
      return;
    }
    toast.success(`Welcome, ${res.user.name}`);
  };

  if (loading) return null;

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-[var(--bg)]">
      {/* Left: Brand + image */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 text-white overflow-hidden">
        <img
          src={heroImg}
          alt="Warehouse"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,10,0.55),rgba(156,70,44,0.78))]" />
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white text-[var(--primary)] flex items-center justify-center font-display font-bold text-lg">
              W
            </div>
            <span className="font-display tracking-tight text-xl">Wholesale POS</span>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <p className="overline text-white/80 mb-3">B2B Operations Suite</p>
          <h1 className="font-display text-4xl xl:text-5xl tracking-tighter leading-[0.95]">
            Run your wholesale floor with surgical precision.
          </h1>
          <p className="mt-5 text-white/80 text-base leading-relaxed">
            Quotes, orders, invoices, agent commissions, and outstanding balances — all in one
            unflinching command center built for B2B trade.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-6 max-w-md">
          {[
            { k: "Roles", v: "3" },
            { k: "Workflows", v: "Q→O→I" },
            { k: "Channels", v: "Web · Onsite" },
          ].map((s) => (
            <div key={s.k}>
              <div className="overline text-white/70">{s.k}</div>
              <div className="font-display text-xl mt-1">{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-8 h-8 bg-[var(--primary)] text-white flex items-center justify-center font-display font-bold text-lg">
              W
            </div>
            <span className="font-display tracking-tight text-xl">Wholesale POS</span>
          </div>
          <p className="overline mb-2">Sign in</p>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tighter">Welcome back.</h2>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            Use your assigned credentials to access the floor.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="login-form">
            <div>
              <Label htmlFor="email" className="overline">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 h-11 rounded-md border-[var(--border)]"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <Label htmlFor="password" className="overline">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                required
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 h-11 rounded-md border-[var(--border)]"
                data-testid="login-password-input"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-md bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-medium tracking-tight"
              data-testid="login-submit-button"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-10 surface-card p-4">
            <p className="overline mb-3">Demo credentials</p>
            <ul className="text-xs space-y-1.5 font-mono">
              <li>admin@wholesalepos.com / admin123</li>
              <li>employee@wholesalepos.com / password123</li>
              <li>agent@wholesalepos.com / password123</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
