/**
 * Bhoomi — Application Router
 * Wires auth screens and protected routes.
 * Auth context is provided by AuthProvider (wraps this in App.tsx).
 */
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";
import { ProfileScreen } from "../screens/auth/ProfileScreen";
import { VerificationScreen } from "../screens/verification/VerificationScreen";
import { MyFarmsScreen } from "../screens/farms/MyFarmsScreen";
import { FarmDetailsScreen } from "../screens/farms/FarmDetailsScreen";
import { PlotDetailsScreen } from "../screens/farms/PlotDetailsScreen";
import { CropCyclesScreen } from "../screens/crop-cycles/CropCyclesScreen";
import { CropCycleDetailScreen } from "../screens/crop-cycles/CropCycleDetailScreen";
import { ActivitiesScreen } from "../screens/activities/ActivitiesScreen";
import { WeatherScreen } from "../screens/weather/WeatherScreen";
import { DashboardScreen } from "../screens/dashboard/DashboardScreen";
import { AdminDashboardScreen } from "../screens/admin/AdminDashboardScreen";
import { StyleGuidePage } from "../screens/style-guide/StyleGuidePage";

// ─── Guards ───────────────────────────────────────────────────────────────────

/**
 * ProtectedRoute — redirects to /login if not authenticated.
 * Waits for session initialization before making any decision.
 */
function ProtectedRoute() {
  const { isAuthenticated, isInitialized, isLoading } = useAuth();

  if (!isInitialized || isLoading) {
    // Render a minimal full-screen loading state while session is being restored
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#F7F3E8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label="Loading…"
        aria-busy="true"
      >
        <div style={{ textAlign: "center", color: "#5B6E60" }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid #D8DFD2",
              borderTopColor: "#2F5D3A",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
              margin: "0 auto 1rem",
            }}
          />
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.9rem" }}>Loading…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

/**
 * PublicRoute — redirects authenticated users away from login/register.
 */
function PublicRoute() {
  const { isAuthenticated, isInitialized } = useAuth();
  if (!isInitialized) return null;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

// ─── Placeholder ──────────────────────────────────────────────────────────────

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "Inter, system-ui, sans-serif",
        background: "#F7F3E8",
        color: "#263229",
        gap: "1rem",
      }}
    >
      <div
        style={{
          background: "#2F5D3A",
          color: "#fff",
          padding: "2rem 3rem",
          borderRadius: "1rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>🌱 Bhoomi</h1>
        <p style={{ margin: "0.5rem 0 0", opacity: 0.85 }}>{title}</p>
      </div>
      <p style={{ color: "#79563D", fontSize: "0.9rem" }}>
        This screen is built in a later prompt.
      </p>
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public-only routes (redirect if already authenticated) */}
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/register" element={<RegisterScreen />} />
        </Route>

        {/* Protected routes (redirect to /login if not authenticated) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/farms" element={<MyFarmsScreen />} />
          <Route path="/farms/:farmId" element={<FarmDetailsScreen />} />
          <Route path="/farms/:farmId/plots/:plotId" element={<PlotDetailsScreen />} />
          <Route path="/crop-cycles" element={<CropCyclesScreen />} />
          <Route path="/crop-cycles/:cycleId" element={<CropCycleDetailScreen />} />
          <Route path="/activities" element={<ActivitiesScreen />} />
          <Route path="/weather" element={<WeatherScreen />} />
          <Route path="/verification" element={<VerificationScreen />} />
          {/* Admin routes — Prompt 18 */}
          <Route path="/admin" element={<AdminDashboardScreen />} />
          <Route path="/admin/*" element={<AdminDashboardScreen />} />
          {/* Super Admin routes — Prompt 19 */}
          <Route path="/super-admin" element={<PlaceholderPage title="Super Admin Panel — Prompt 19" />} />
          <Route path="/super-admin/*" element={<PlaceholderPage title="Super Admin — Prompt 19" />} />
        </Route>

        {/* Dev tool — not protected */}
        <Route path="/style-guide" element={<StyleGuidePage />} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<PlaceholderPage title="404 — Page not found" />} />
      </Routes>
    </BrowserRouter>
  );
}
