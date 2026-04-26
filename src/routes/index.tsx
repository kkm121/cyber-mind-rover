import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Hazard Recon Car — Neural OS" },
      { name: "description", content: "Cyberpunk telemetry & control dashboard for the Hazard Recon Car." },
    ],
  }),
});

function Index() {
  useEffect(() => {
    window.location.replace("/app.html");
  }, []);
  return (
    <div style={{ background: "#05020a", color: "#00f0ff", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "ui-monospace, monospace", letterSpacing: ".15em" }}>
      BOOTING NEURAL OS…
    </div>
  );
}
