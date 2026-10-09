import { LocalStore } from './store';
import { SessionCache } from './cache';
let local: LocalStore | undefined;
let session: SessionCache | undefined;
export function browserStore() {
  local ??= new LocalStore(() => window.localStorage);
  return local;
}
export function browserCache() {
  session ??= new SessionCache(() => window.sessionStorage);
  return session;
}
