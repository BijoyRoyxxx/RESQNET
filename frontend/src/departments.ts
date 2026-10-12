export const departments = [
  { id: "women_safety", label: "Women’s Safety", categories: "Women’s safety" },
  { id: "fire", label: "Fire & Rescue", categories: "Fire" },
  { id: "health", label: "Health Services", categories: "Medical emergencies" },
  { id: "police", label: "Police", categories: "Crime, theft and uncategorized reports" },
  { id: "disaster", label: "Disaster Management", categories: "Floods" },
  { id: "municipal", label: "Municipal Services", categories: "Infrastructure" },
] as const;

export type DepartmentId = (typeof departments)[number]["id"];

export function departmentLabel(id: string | null | undefined) {
  return departments.find((department) => department.id === id)?.label ?? "Unassigned";
}
