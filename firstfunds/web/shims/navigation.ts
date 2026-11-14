import { useSyncExternalStore } from "react";
import { currentPath, toHash } from "./routes";

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function usePathname() {
  return useSyncExternalStore(subscribe, currentPath, () => "/");
}

export function navigate(path: string) {
  window.location.hash = toHash(path);
  window.scrollTo({ top: 0 });
}

export function useRouter() {
  return { push: navigate, replace: navigate, back: () => history.back(), refresh: () => {}, prefetch: () => {} };
}
