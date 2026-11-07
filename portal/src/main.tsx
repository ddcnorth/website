import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AccessPage from "./access/AccessPage";
import ClientHome from "./access/ClientHome";
import "./styles.css";

// Clerk and the admin screens load only on /admin, keeping client links light.
const AdminApp = lazy(() => import("./admin/AdminApp"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="center muted">Loading…</div>}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/access" element={<ClientHome />} />
          <Route path="/access/:token" element={<AccessPage />} />
          <Route path="*" element={<Navigate to="/access" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
