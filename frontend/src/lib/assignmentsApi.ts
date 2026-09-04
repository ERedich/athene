import { apiFetch } from "./api";
import type {
  AssignPayload,
  AssignResult,
  AssignmentCatalogItem,
  AssignmentDirectoryUser,
  AssignmentRecord,
  AssignmentRecordUsers,
  AssignmentTypeId,
  AssignmentUserDetail,
} from "./assignmentTypes";

export async function fetchAssignmentCatalog(): Promise<AssignmentCatalogItem[]> {
  const res = await apiFetch("/api/assignments/catalog");
  if (!res.ok) throw new Error("catalog");
  return (await res.json()) as AssignmentCatalogItem[];
}

export async function fetchAssignmentRecords(
  type: AssignmentTypeId,
): Promise<AssignmentRecord[]> {
  const res = await apiFetch(`/api/assignments/${type}/records`);
  if (!res.ok) throw new Error("records");
  return (await res.json()) as AssignmentRecord[];
}

export async function fetchAssignmentRecordUsers(
  type: AssignmentTypeId,
  recordId: string,
): Promise<AssignmentRecordUsers> {
  const res = await apiFetch(`/api/assignments/${type}/records/${recordId}/users`);
  if (!res.ok) throw new Error("record_users");
  return (await res.json()) as AssignmentRecordUsers;
}

export async function putAssignment(
  type: AssignmentTypeId,
  recordId: string,
  payload: AssignPayload,
): Promise<AssignResult> {
  const res = await apiFetch(`/api/assignments/${type}/records/${recordId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? "assign_failed");
  }
  return (await res.json()) as AssignResult;
}

export async function fetchAssignmentDirectory(): Promise<AssignmentDirectoryUser[]> {
  const res = await apiFetch("/api/assignments/users");
  if (!res.ok) throw new Error("users");
  return (await res.json()) as AssignmentDirectoryUser[];
}

export async function fetchAssignmentUserDetail(
  userId: string,
): Promise<AssignmentUserDetail> {
  const res = await apiFetch(`/api/assignments/users/${userId}`);
  if (!res.ok) throw new Error("user_detail");
  return (await res.json()) as AssignmentUserDetail;
}
