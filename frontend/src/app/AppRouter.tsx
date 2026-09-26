/**
 * Bhoomi — Application Router Shell
 * Sets up React Router with placeholder routes.
 * Each screen is built out in Prompts 10–19.
 */
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Placeholder page component — replaced module by module in Prompts 10–19
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

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<PlaceholderPage title="Login — Prompt 10" />} />
        <Route path="/register" element={<PlaceholderPage title="Register — Prompt 10" />} />

        {/* Farmer routes — built Prompts 12–16 */}
        <Route path="/dashboard" element={<PlaceholderPage title="Dashboard — Prompt 16" />} />
        <Route path="/farms" element={<PlaceholderPage title="My Farms — Prompt 12" />} />
        <Route path="/farms/:farmId" element={<PlaceholderPage title="Farm Detail — Prompt 12" />} />
        <Route path="/farms/:farmId/plots/:plotId" element={<PlaceholderPage title="Plot Detail — Prompt 12" />} />
        <Route path="/crop-cycles" element={<PlaceholderPage title="Crop Cycles — Prompt 13" />} />
        <Route path="/activities" element={<PlaceholderPage title="Activities — Prompt 14" />} />
        <Route path="/weather" element={<PlaceholderPage title="Weather — Prompt 15" />} />
        <Route path="/verification" element={<PlaceholderPage title="Verification — Prompt 11" />} />
        <Route path="/profile" element={<PlaceholderPage title="Profile — Prompt 10" />} />

        {/* Admin routes — built Prompt 18 */}
        <Route path="/admin" element={<PlaceholderPage title="Admin Dashboard — Prompt 18" />} />
        <Route path="/admin/*" element={<PlaceholderPage title="Admin — Prompt 18" />} />

        {/* Super Admin routes — built Prompt 19 */}
        <Route path="/super-admin" element={<PlaceholderPage title="Super Admin Panel — Prompt 19" />} />
        <Route path="/super-admin/*" element={<PlaceholderPage title="Super Admin — Prompt 19" />} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<PlaceholderPage title="404 — Page not found" />} />
      </Routes>
    </BrowserRouter>
  );
}
