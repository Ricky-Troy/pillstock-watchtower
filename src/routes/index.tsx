import { createFileRoute, redirect } from "@tanstack/react-router";

// The app has no public landing page: "/" sends staff to their dashboard,
// and the sign-in gate sends signed-out visitors to /auth.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "PharmaStock — Pharmacy Medicine Stock Management" },
      { name: "description", content: "Sign in to manage your pharmacy's medicine stock, sales and alerts." },
      { property: "og:title", content: "PharmaStock — Pharmacy Medicine Stock Management" },
      { property: "og:description", content: "Sign in to manage your pharmacy's medicine stock, sales and alerts." },
    ],
  }),
});
