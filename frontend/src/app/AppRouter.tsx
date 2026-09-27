/**
 * Bhoomi — Application Router
 * Wires auth screens and protected routes.
 * Auth context is provided by AuthProvider (wraps this in App.tsx).
 */
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense } from "react";
import { useAuth } from "../context/AuthContext";
const LoginScreen = lazy(() => import("../screens/auth/LoginScreen").then((m) => ({ default: m.LoginScreen })));
const RegisterScreen = lazy(() => import("../screens/auth/RegisterScreen").then((m) => ({ default: m.RegisterScreen })));
const ProfileScreen = lazy(() => import("../screens/auth/ProfileScreen").then((m) => ({ default: m.ProfileScreen })));
const VerificationScreen = lazy(() => import("../screens/verification/VerificationScreen").then((m) => ({ default: m.VerificationScreen })));
const MyFarmsScreen = lazy(() => import("../screens/farms/MyFarmsScreen").then((m) => ({ default: m.MyFarmsScreen })));
const FarmDetailsScreen = lazy(() => import("../screens/farms/FarmDetailsScreen").then((m) => ({ default: m.FarmDetailsScreen })));
const PlotDetailsScreen = lazy(() => import("../screens/farms/PlotDetailsScreen").then((m) => ({ default: m.PlotDetailsScreen })));
const CropCyclesScreen = lazy(() => import("../screens/crop-cycles/CropCyclesScreen").then((m) => ({ default: m.CropCyclesScreen })));
const CropCycleDetailScreen = lazy(() => import("../screens/crop-cycles/CropCycleDetailScreen").then((m) => ({ default: m.CropCycleDetailScreen })));
const ActivitiesScreen = lazy(() => import("../screens/activities/ActivitiesScreen").then((m) => ({ default: m.ActivitiesScreen })));
const WeatherScreen = lazy(() => import("../screens/weather/WeatherScreen").then((m) => ({ default: m.WeatherScreen })));
const DashboardScreen = lazy(() => import("../screens/dashboard/DashboardScreen").then((m) => ({ default: m.DashboardScreen })));
const AdminDashboardScreen = lazy(() => import("../screens/admin/AdminDashboardScreen").then((m) => ({ default: m.AdminDashboardScreen })));
const SuperAdminScreen = lazy(() => import("../screens/super-admin/SuperAdminScreen").then((m) => ({ default: m.SuperAdminScreen })));
const StyleGuidePage = lazy(() => import("../screens/style-guide/StyleGuidePage").then((m) => ({ default: m.StyleGuidePage })));

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

function PlatformRoleRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: Array<"admin" | "super_admin">;
  children: React.ReactNode;
}) {
  const { user, isInitialized, isLoading } = useAuth();
  if (!isInitialized || isLoading) return null;
  return user && allowedRoles.includes(user.platform_role as "admin" | "super_admin")
    ? <>{children}</>
    : <Navigate to="/dashboard" replace />;
}

function FarmerRoute({ children }: { children: React.ReactNode }) {
  const { user, isInitialized, isLoading } = useAuth();
  if (!isInitialized || isLoading) return null;
  return user?.user_type === "farmer" ? <>{children}</> : <Navigate to="/dashboard" replace />;
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
      <Suspense fallback={<div role="status" aria-busy="true" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Loading page…</div>}>
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
          <Route path="/farms" element={<FarmerRoute><MyFarmsScreen /></FarmerRoute>} />
          <Route path="/farms/:farmId" element={<FarmerRoute><FarmDetailsScreen /></FarmerRoute>} />
          <Route path="/farms/:farmId/plots/:plotId" element={<FarmerRoute><PlotDetailsScreen /></FarmerRoute>} />
          <Route path="/crop-cycles" element={<FarmerRoute><CropCyclesScreen /></FarmerRoute>} />
          <Route path="/crop-cycles/:cycleId" element={<FarmerRoute><CropCycleDetailScreen /></FarmerRoute>} />
          <Route path="/activities" element={<FarmerRoute><ActivitiesScreen /></FarmerRoute>} />
          <Route path="/weather" element={<FarmerRoute><WeatherScreen /></FarmerRoute>} />
          <Route path="/verification" element={<FarmerRoute><VerificationScreen /></FarmerRoute>} />
          {/* Admin routes — Prompt 18 */}
          <Route path="/admin" element={<PlatformRoleRoute allowedRoles={["admin", "super_admin"]}><AdminDashboardScreen /></PlatformRoleRoute>} />
          <Route path="/admin/*" element={<PlatformRoleRoute allowedRoles={["admin", "super_admin"]}><AdminDashboardScreen /></PlatformRoleRoute>} />
          {/* Super Admin routes — Prompt 19 */}
          <Route path="/super-admin" element={<PlatformRoleRoute allowedRoles={["super_admin"]}><SuperAdminScreen /></PlatformRoleRoute>} />
          <Route path="/super-admin/*" element={<PlatformRoleRoute allowedRoles={["super_admin"]}><SuperAdminScreen /></PlatformRoleRoute>} />
        </Route>

        {/* Dev tool — not protected */}
        <Route path="/style-guide" element={<StyleGuidePage />} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<PlaceholderPage title="404 — Page not found" />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
