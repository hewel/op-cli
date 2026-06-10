/**
 * Convert an API href like `/api/v3/work_packages/23732` (or with instance
 * prefix `/openproject/api/v3/work_packages/23732`) into a browser-facing URL
 * by stripping the `/api/v3` segment and combining with the instance base URL.
 */
export function apiHrefToBrowserUrl(baseUrl: string, href: string | undefined): string | undefined {
  if (!href) return undefined;
  const apiMarker = "/api/v3/";
  const markerIndex = href.indexOf(apiMarker);
  if (markerIndex === -1) return undefined;
  const afterApi = href.slice(markerIndex + apiMarker.length);
  // Drop query and hash from the remaining path
  const pathAfterApi = afterApi.split("?")[0]!.split("#")[0]!;
  // Determine the base: baseUrl minus any trailing slash
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/${pathAfterApi}`;
}
