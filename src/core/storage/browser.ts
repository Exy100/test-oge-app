import { LocalStore } from './store';
import { SessionCache } from './cache';
import { PREFIX } from './schemas';
import { publishAppearance } from '../../lib/preferences-bridge';
let local: LocalStore | undefined;
let session: SessionCache | undefined;
function publish() {
  if (!local) return;
  const messages = local.messages();
  if (session?.notice) messages.push(session.notice);
  if (session?.memoryOnly)
    messages.push(
      'Временное хранилище недоступно. Кэш ИИ останется только в памяти страницы.',
    );
  publishAppearance({ settings: local.read('settings'), messages });
}
export function browserStore() {
  if (!local) {
    const store = new LocalStore(() => window.localStorage);
    local = store;
    let consent = store.read('aiConsent');
    store.subscribe(() => {
      const next = store.read('aiConsent');
      if (
        consent.policy &&
        (!next.enabled ||
          next.policy !== consent.policy ||
          (consent.modes ?? ['stream-feedback']).some(
            (mode) => !(next.modes ?? ['stream-feedback']).includes(mode),
          ))
      )
        session?.clear();
      consent = next;
      publish();
    });
    window.addEventListener('storage', (event) => {
      if (
        event.key === null ||
        event.key.startsWith(PREFIX) ||
        event.key === 'oge.theme'
      )
        store.refresh();
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) store.refresh();
    });
    publish();
  }
  return local;
}
export function browserCache() {
  if (!session) {
    session = new SessionCache(() => window.sessionStorage);
    publish();
  }
  return session;
}
