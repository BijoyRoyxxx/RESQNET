let csrfToken = "";
export const setCsrfToken = (value: string) => {
  csrfToken = value;
};

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("resq-session-expired"));
    const issues = data.error?.issues
      ?.map(
        (i: { field: string; message: string }) => `${i.field}: ${i.message}`,
      )
      .join("; ");
    throw new Error(
      issues || data.error?.message || `Request failed (${response.status})`,
    );
  }
  return data as T;
}
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();
export const readable = (text: string) => text.replaceAll("_", " ");
export const localTime = (time: string) =>
  new Date(
    time.endsWith("Z") || /[+-]\d\d:\d\d$/.test(time) ? time : `${time}Z`,
  ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
