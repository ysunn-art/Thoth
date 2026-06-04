import { useEffect, useState } from "react";
import { Outlet, useOutletContext } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { fetchDashboardStats, type DashboardStats } from "./api/client";

type Ctx = {
  stats: DashboardStats | null;
  setSidebarHidden: (hidden: boolean) => void;
};

// Pages read shared dashboard stats / control the sidebar via useOutletContext.
export function useStats() {
  return useOutletContext<Ctx>();
}

export default function Layout() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(false);

  useEffect(() => {
    fetchDashboardStats()
      .then(setStats)
      .catch((err) => {
        console.warn("Could not reach Thoth API; showing placeholders.", err);
      });
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-neutral-900">
      {!sidebarHidden && <Sidebar stats={stats} />}
      <Outlet context={{ stats, setSidebarHidden } satisfies Ctx} />
    </div>
  );
}
