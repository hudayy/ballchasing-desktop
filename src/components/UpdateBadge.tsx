import React, { useEffect, useState } from "react";

// Small top-bar indicator for auto-update state + a manual check.
export default function UpdateBadge() {
  const [version, setVersion] = useState<string>("");
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    window.api.appVersion().then(setVersion);
    const off = window.api.onUpdateStatus(setStatus);
    return off;
  }, []);

  const label = () => {
    if (!status) return null;
    switch (status.state) {
      case "checking": return "checking for updates…";
      case "downloading": return `downloading update ${status.percent ?? 0}%`;
      case "available": return `update ${status.version} found`;
      case "ready": return `update ${status.version} ready — restart to apply`;
      case "error": return "update check failed";
      default: return null;
    }
  };

  const text = label();
  return (
    <span
      className={"updatebadge" + (status?.state === "ready" ? " ready" : "")}
      title="Check for updates"
      onClick={() => window.api.checkForUpdates()}
    >
      v{version}{text ? ` · ${text}` : ""}
    </span>
  );
}
