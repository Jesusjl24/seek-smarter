import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { enableGuest } from "@/lib/guest";

export default function GuestEntry() {
  useEffect(() => {
    enableGuest();
  }, []);
  return <Navigate to="/" replace />;
}
