import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/admin")({
  component: () => (
    <ProtectedRoute role="admin">
      <DashboardLayout kind="admin" />
    </ProtectedRoute>
  ),
});
