import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/DashboardLayout";

export const Route = createFileRoute("/vendor")({
  component: () => <DashboardLayout kind="vendor" />,
});
