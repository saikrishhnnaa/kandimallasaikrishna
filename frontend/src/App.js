import "@/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Toaster } from "sonner";
import Login from "./pages/Login";
import AdminLayout from "./layouts/AdminLayout";
import AgentLayout from "./layouts/AgentLayout";
import Dashboard from "./pages/admin/Dashboard";
import Products from "./pages/admin/Products";
import Customers from "./pages/admin/Customers";
import Orders from "./pages/admin/Orders";
import OrderDetail from "./pages/admin/OrderDetail";
import OrderNew from "./pages/admin/OrderNew";
import OrderPrint from "./pages/admin/OrderPrint";
import StockMovements from "./pages/admin/StockMovements";
import Integration from "./pages/admin/Integration";
import CustomerStatement from "./pages/admin/CustomerStatement";
import Users from "./pages/admin/Users";
import Reports from "./pages/admin/Reports";
import AgentHome from "./pages/agent/AgentHome";
import AgentCatalog from "./pages/agent/AgentCatalog";
import AgentNewOrder from "./pages/agent/AgentNewOrder";
import AgentSales from "./pages/agent/AgentSales";

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullscreenLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={defaultRouteFor(user.role)} replace />;
  return children;
}

function FullscreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="overline">Loading…</div>
    </div>
  );
}

function defaultRouteFor(role) {
  if (role === "admin") return "/admin";
  if (role === "employee") return "/admin/orders";
  return "/agent";
}

function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullscreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={defaultRouteFor(user.role)} replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleRedirect />} />

          <Route
            path="/admin/orders/:id/print"
            element={
              <ProtectedRoute roles={["admin", "employee"]}>
                <OrderPrint />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/customers/:id/statement"
            element={
              <ProtectedRoute roles={["admin", "employee"]}>
                <CustomerStatement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["admin", "employee"]}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="customers" element={<Customers />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/new" element={<OrderNew />} />
            <Route path="orders/:id/edit" element={<OrderNew />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="stock-movements" element={<StockMovements />} />
            <Route path="users" element={<ProtectedRoute roles={["admin"]}><Users /></ProtectedRoute>} />
            <Route path="reports" element={<ProtectedRoute roles={["admin"]}><Reports /></ProtectedRoute>} />
            <Route path="integration" element={<ProtectedRoute roles={["admin"]}><Integration /></ProtectedRoute>} />
          </Route>

          <Route
            path="/agent"
            element={
              <ProtectedRoute roles={["sales_agent"]}>
                <AgentLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AgentHome />} />
            <Route path="catalog" element={<AgentCatalog />} />
            <Route path="new-order" element={<AgentNewOrder />} />
            <Route path="orders/:id/edit" element={<OrderNew />} />
            <Route path="sales" element={<AgentSales />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
