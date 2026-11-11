import { apiGet } from "./client";

export const fetchLatestTrace = () => apiGet<{ schema_version: string; trace: any }>("/api/runs/latest/trace");
export const fetchJobDecisionTrail = (jobId: string) => apiGet<any>(`/api/jobs/${jobId}/decision-trail`);
