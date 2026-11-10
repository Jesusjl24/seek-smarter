import { apiGet, apiPost } from "./client";
export const fetchLatestBriefing = () => apiGet<any>("/api/briefings/latest");
export const fetchBriefings = () => apiGet<any[]>("/api/briefings");
export const fetchBriefing = (id: string) => apiGet<any>(`/api/briefings/${id}`);
export const sendJobFeedback = (id: string, action: string, reason?: string) => apiPost(`/api/jobs/${id}/feedback`, { action, reason });
export const restoreJob = (id: string) => apiPost(`/api/jobs/${id}/restore`);
