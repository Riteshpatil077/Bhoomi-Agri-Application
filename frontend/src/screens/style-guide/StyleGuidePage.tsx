import React, { useState } from "react";
import {
  AppShell,
  PageHeader,
  StatusBadge,
  FormField,
  EmptyState,
  ConfirmDialog,
  useToast,
  PermissionGate,
} from "../../design-system";
import {
  Plus,
  Trash2,
  Sprout,
  Check,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
} from "lucide-react";
import "./StyleGuidePage.scss";

export const StyleGuidePage: React.FC = () => {
  const { toast } = useToast();

  // State for interactive demo dialogs
  const [isPrimaryDialogOpen, setIsPrimaryDialogOpen] = useState(false);
  const [isDangerDialogOpen, setIsDangerDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // State for FormField showcase
  const [textInput, setTextInput] = useState("");
  const [hasError, setHasError] = useState(false);

  // State for PermissionGate simulation
  const [simulatedRole, setSimulatedRole] = useState<"farmer" | "admin" | "super_admin">("farmer");

  const colors = [
    { name: "Primary Green", hex: "#2F5D3A", role: "Primary actions, headers, navigation brand" },
    { name: "Primary Dark", hex: "#1E4026", role: "Hover/pressed state for primary buttons" },
    { name: "Leaf Green", hex: "#6F965A", role: "Secondary accents, crop indicators" },
    { name: "Warm Cream", hex: "#F7F3E8", role: "App page background with tactile warmth" },
    { name: "Pale Green", hex: "#E8F0E3", role: "Summary cards, selected item highlights" },
    { name: "Soil Brown", hex: "#79563D", role: "Small decorative accents only — never body text" },
    { name: "Main Text", hex: "#263229", role: "High-contrast headings and body typography" },
    { name: "Muted Text", hex: "#5B6E60", role: "Subheadings, helper hints, captions" },
    { name: "Border", hex: "#D8DFD2", role: "Input borders, card dividers" },
    { name: "Deep Forest", hex: "#183420", role: "Desktop sidebar background" },
    { name: "Feedback Error", hex: "#B42318", role: "Validation errors, overdue alerts" },
    { name: "Feedback Warning", hex: "#8A5A00", role: "Due reminders, pending notices" },
  ];

  const handleSimulateAction = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setIsDangerDialogOpen(false);
      setIsPrimaryDialogOpen(false);
      toast.success("Action confirmed and completed successfully!");
    }, 1000);
  };

  return (
    <AppShell
      user={{
        name: "Ritesh Patil",
        role: simulatedRole,
        verificationStatus: "verified",
      }}
      unreadNotificationsCount={2}
    >
      <div className="style-guide">
        <PageHeader
          title="Bhoomi Design System & Style Guide"
          subtitle="Modern Agriculture Skeuomorphism UI System (§12) — Interactive Component & Token Catalog"
          breadcrumbs={[
            { label: "Home", href: "/dashboard" },
            { label: "Design System", href: "/style-guide" },
          ]}
          actions={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => toast.success("Page Header CTA clicked!")}
            >
              <Plus size={16} />
              <span>Header Action</span>
            </button>
          }
        />

        {/* 1. Color Palette Tokens */}
        <section className="style-guide__section">
          <h2 className="style-guide__section-title">1. Color Palette Tokens (§12.1)</h2>
          <p className="style-guide__section-desc">
            Earth-inspired color system reflecting fertile soil, healthy foliage, and tactile warmth.
            Per §12.1, Soil Brown is reserved exclusively for small decorative accents and NEVER used for body text.
          </p>
          <div className="style-guide__color-grid">
            {colors.map((c) => (
              <div key={c.hex} className="style-guide__color-card">
                <div
                  className="style-guide__color-swatch"
                  style={{ backgroundColor: c.hex }}
                />
                <div className="style-guide__color-info">
                  <span className="style-guide__color-name">{c.name}</span>
                  <span className="style-guide__color-hex">{c.hex}</span>
                  <span className="style-guide__color-role">{c.role}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 2. Tactile Button System */}
        <section className="style-guide__section">
          <h2 className="style-guide__section-title">2. Tactile Button System (§12.1)</h2>
          <p className="style-guide__section-desc">
            Buttons feature tactile skeuomorphic depth with distinct hover lift, pressed depression,
            accessible focus rings, and muted disabled states.
          </p>

          <div className="card">
            <h3 style={{ marginBottom: "1rem" }}>Variants & States</h3>
            <div className="style-guide__row" style={{ marginBottom: "1.5rem" }}>
              <div className="style-guide__state-box">
                <span className="style-guide__state-label">Primary</span>
                <button type="button" className="btn btn-primary">
                  <Sprout size={16} />
                  <span>Primary Action</span>
                </button>
              </div>

              <div className="style-guide__state-box">
                <span className="style-guide__state-label">Secondary</span>
                <button type="button" className="btn btn-secondary">
                  <span>Secondary Action</span>
                </button>
              </div>

              <div className="style-guide__state-box">
                <span className="style-guide__state-label">Outline</span>
                <button type="button" className="btn btn-outline">
                  <span>Outline Button</span>
                </button>
              </div>

              <div className="style-guide__state-box">
                <span className="style-guide__state-label">Danger</span>
                <button type="button" className="btn btn-danger">
                  <Trash2 size={16} />
                  <span>Delete Record</span>
                </button>
              </div>

              <div className="style-guide__state-box">
                <span className="style-guide__state-label">Ghost</span>
                <button type="button" className="btn btn-ghost">
                  <span>Cancel / Ghost</span>
                </button>
              </div>

              <div className="style-guide__state-box">
                <span className="style-guide__state-label">Disabled</span>
                <button type="button" className="btn btn-primary" disabled>
                  <span>Disabled State</span>
                </button>
              </div>
            </div>

            <h3 style={{ marginBottom: "1rem" }}>Button Sizes</h3>
            <div className="style-guide__row">
              <button type="button" className="btn btn-primary btn-sm">
                Small (btn-sm)
              </button>
              <button type="button" className="btn btn-primary">
                Default Medium
              </button>
              <button type="button" className="btn btn-primary btn-lg">
                Large (btn-lg)
              </button>
            </div>
          </div>
        </section>

        {/* 3. Labeled Status Badges */}
        <section className="style-guide__section">
          <h2 className="style-guide__section-title">3. Labeled Status Badges (§12.5)</h2>
          <p className="style-guide__section-desc">
            CRITICAL ACCESSIBILITY RULE (§12.5): Statuses MUST NEVER rely on color alone.
            Every badge combines an explicit icon and descriptive text label.
          </p>

          <div className="card">
            <h3 style={{ marginBottom: "1rem" }}>Standard Badges (Medium)</h3>
            <div className="style-guide__row" style={{ marginBottom: "1.5rem" }}>
              <StatusBadge variant="verified" />
              <StatusBadge variant="pending" />
              <StatusBadge variant="rejected" />
              <StatusBadge variant="active" />
              <StatusBadge variant="harvested" />
              <StatusBadge variant="due" />
              <StatusBadge variant="overdue" />
              <StatusBadge variant="official" />
              <StatusBadge variant="failed" />
              <StatusBadge variant="draft" />
            </div>

            <h3 style={{ marginBottom: "1rem" }}>Compact Badges (Small)</h3>
            <div className="style-guide__row">
              <StatusBadge variant="verified" size="sm" />
              <StatusBadge variant="pending" size="sm" />
              <StatusBadge variant="rejected" size="sm" />
              <StatusBadge variant="active" size="sm" />
              <StatusBadge variant="harvested" size="sm" />
              <StatusBadge variant="due" size="sm" />
              <StatusBadge variant="overdue" size="sm" />
              <StatusBadge variant="official" size="sm" />
            </div>
          </div>
        </section>

        {/* 4. Form Fields & Input Controls */}
        <section className="style-guide__section">
          <h2 className="style-guide__section-title">4. Accessible Form Inputs & Fields (§12.1)</h2>
          <p className="style-guide__section-desc">
            Inputs include high-contrast borders, tactile focus rings, required indicators,
            helper hints, and accessible aria-invalid / inline error messaging.
          </p>

          <div className="card">
            <div className="style-guide__grid-2">
              <div>
                <FormField
                  label="Farm Name"
                  required
                  hint="Provide a memorable name for your land parcel"
                >
                  <input
                    type="text"
                    placeholder="e.g. Green Acres North"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                  />
                </FormField>

                <FormField
                  label="Crop Category"
                  hint="Select the agronomic crop classification"
                >
                  <select defaultValue="cereal">
                    <option value="cereal">Cereal / Grain (Rice, Wheat)</option>
                    <option value="pulse">Pulse (Chickpea, Lentil)</option>
                    <option value="oilseed">Oilseed (Soybean, Mustard)</option>
                    <option value="commercial">Commercial (Cotton, Sugarcane)</option>
                  </select>
                </FormField>
              </div>

              <div>
                <FormField
                  label="Soil Notes / Description"
                  hint="Optional observations regarding fertility or slope"
                >
                  <textarea placeholder="Enter soil details..." rows={3} />
                </FormField>

                <div style={{ marginBottom: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setHasError(!hasError)}
                  >
                    Toggle Error State
                  </button>
                </div>

                <FormField
                  label="Acreage / Area"
                  required
                  error={hasError ? "Acreage must be greater than 0.1 acres" : undefined}
                  hint="Enter plot size in acres"
                >
                  <input type="number" defaultValue="0" step="0.1" />
                </FormField>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Flat Data Surface Cards */}
        <section className="style-guide__section">
          <h2 className="style-guide__section-title">5. Flat Data Surfaces (§12.1)</h2>
          <p className="style-guide__section-desc">
            Per §12.1: Data, cards, forms, and tables are presented on pure flat white surfaces (#FFFFFF)
            with subtle border shadows. Never use textured backgrounds behind text or data.
          </p>

          <div className="style-guide__grid-2">
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.875rem", color: "var(--color-muted-text)" }}>
                  Current Weather Provenance
                </span>
                <StatusBadge variant="official" size="sm" />
              </div>
              <h3 style={{ marginTop: "0.5rem", fontSize: "1.5rem" }}>28°C — Sunny</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--color-muted-text)", marginTop: "0.25rem" }}>
                Source: IMD Automated Station #4301. Updated 25 mins ago.
              </p>
            </div>

            <div className="card card--interactive">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.875rem", color: "var(--color-muted-text)" }}>
                  Active Cycle
                </span>
                <StatusBadge variant="active" size="sm" />
              </div>
              <h3 style={{ marginTop: "0.5rem", fontSize: "1.25rem" }}>Basmati Rice — Plot A1</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--color-muted-text)", marginTop: "0.25rem" }}>
                Interactive card hover preview (elevates slightly on hover with tactile shadow).
              </p>
            </div>
          </div>
        </section>

        {/* 6. Empty State Component */}
        <section className="style-guide__section">
          <h2 className="style-guide__section-title">6. Empty State Component (§12.4)</h2>
          <p className="style-guide__section-desc">
            Mandatory zero-data fallback state across lists and tables with actionable primary CTA.
          </p>

          <EmptyState
            icon={Layers}
            title="No Plots Registered Yet"
            description="You haven't partitioned this farm into plots. Add your first plot to track soil conditions and crop cycles."
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => toast.info("Create Plot action triggered")}
              >
                <Plus size={16} />
                <span>Add First Plot</span>
              </button>
            }
          />
        </section>

        {/* 7. Modal Confirmation Dialogs */}
        <section className="style-guide__section">
          <h2 className="style-guide__section-title">7. Accessible Confirmation Dialogs</h2>
          <p className="style-guide__section-desc">
            Tactile modal dialogs for critical or irreversible operations with escape key support,
            modal focus containment, and loading spinners.
          </p>

          <div className="card">
            <div className="style-guide__row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsPrimaryDialogOpen(true)}
              >
                Open Standard Dialog
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setIsDangerDialogOpen(true)}
              >
                <Trash2 size={16} />
                <span>Open Destructive Dialog</span>
              </button>
            </div>
          </div>

          <ConfirmDialog
            isOpen={isPrimaryDialogOpen}
            title="Publish Crop Advisory"
            message="Are you sure you want to publish this advisory broadcast to all verified farmers in this district?"
            confirmText="Publish Advisory"
            isLoading={isProcessing}
            onConfirm={handleSimulateAction}
            onCancel={() => setIsPrimaryDialogOpen(false)}
          />

          <ConfirmDialog
            isOpen={isDangerDialogOpen}
            title="Delete Farm Plot"
            variant="danger"
            message="This action will permanently delete Plot #3 along with all associated historical soil logs and activity records. This cannot be undone."
            confirmText="Delete Plot"
            isLoading={isProcessing}
            onConfirm={handleSimulateAction}
            onCancel={() => setIsDangerDialogOpen(false)}
          />
        </section>

        {/* 8. Toast Feedback System */}
        <section className="style-guide__section">
          <h2 className="style-guide__section-title">8. Toast Notification System</h2>
          <p className="style-guide__section-desc">
            High-visibility floating notifications with auto-dismiss timers and explicit status styling.
          </p>

          <div className="card">
            <div className="style-guide__row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => toast.success("Farm profile saved successfully!", "Record Updated")}
              >
                <Check size={16} />
                <span>Trigger Success Toast</span>
              </button>

              <button
                type="button"
                className="btn btn-danger"
                onClick={() => toast.error("Verification document upload failed. Please retry.", "Upload Error")}
              >
                <AlertTriangle size={16} />
                <span>Trigger Error Toast</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => toast.warning("Plot irrigation activity is due today.", "Reminder")}
              >
                <Calendar size={16} />
                <span>Trigger Warning Toast</span>
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => toast.info("New weather forecast available for your coordinates.", "Advisory")}
              >
                <Info size={16} />
                <span>Trigger Info Toast</span>
              </button>
            </div>
          </div>
        </section>

        {/* 9. PermissionGate Display Layer */}
        <section className="style-guide__section">
          <h2 className="style-guide__section-title">9. PermissionGate Convenience Display Layer (§5 & §7.4)</h2>
          <div className="style-guide__callout">
            <strong>CRITICAL ARCHITECTURAL RULE:</strong> PermissionGate is a display convenience layer only,
            NOT a security boundary. All authorization checks are enforced by backend decorators and ownership rules.
          </div>

          <div className="card">
            <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Simulate User Role:</span>
              <select
                value={simulatedRole}
                onChange={(e) => setSimulatedRole(e.target.value as "farmer" | "admin" | "super_admin")}
                style={{ width: "auto" }}
              >
                <option value="farmer">Farmer (standard)</option>
                <option value="admin">Platform Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <PermissionGate
                userRole={simulatedRole}
                allowedRoles={["admin", "super_admin"]}
                fallback={
                  <div style={{ padding: "0.75rem", background: "#FEE4E2", borderRadius: "8px", color: "#B42318", fontSize: "0.875rem" }}>
                    🔒 Administrative controls hidden for role: <strong>{simulatedRole}</strong>
                  </div>
                }
              >
                <div style={{ padding: "0.75rem", background: "#D1FADF", borderRadius: "8px", color: "#2F5D3A", fontSize: "0.875rem" }}>
                  ✅ <strong>Admin Controls Visible:</strong> You have permission to inspect verification queues and seed catalogs.
                </div>
              </PermissionGate>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
};
