// Output safety for anything a model writes that Panda then posts.
//
// A model reads member-written text, and member text can be crafted to steer
// it. The worst a steered model should manage in chat is a wrong sentence —
// never a working link in Panda's own voice ("verify here: …"), never a ping.
// So every model-written string Panda posts goes through here: links are
// defanged (shown, not clickable), the way security write-ups quote them.
//
// Every pattern here is linear — this runs on model output, which a member
// can steer, so a backtracking regex would be a way to hang the bot.

/** Hosts Panda may leave as working links — Echoed's own. */
const OWN_HOST = /^(?:[a-z0-9-]+\.)*echoed\.gg$/i;

const defangHost = (host: string) => host.replace(/\./g, '[.]');

/**
 * Make links unclickable while keeping them readable:
 * "https://disc0rd-gift.store/claim" → "hxxps://disc0rd-gift[.]store/claim",
 * "evil.com" (in any punctuation) → "evil[.]com", "1.2.3.4" → "1[.]2[.]3[.]4".
 * A link to Echoed itself stays live — unless it hides another host
 * ("https://echoed.gg@1.2.3.4/"), which is defanged like any other.
 */
export function defangLinks(text: string): string {
  return text
    // 1. Full URLs: decide on the REAL host (URL parsing sees through user@host).
    .replace(/\bhttps?:\/\/[^\s<>"'`]+/gi, (match) => {
      // Punctuation the URL ends a sentence or a bracket with isn't part of it.
      const trail = /[)\]}.,;:!?*_]+$/.exec(match)?.[0] ?? '';
      const url = match.slice(0, match.length - trail.length);
      let own = false;
      try {
        const u = new URL(url);
        own = OWN_HOST.test(u.hostname) && !u.username && !u.password;
      } catch {
        own = false;
      }
      if (own) return match;
      const m = /^(https?):\/\/([^/?#]*)(.*)$/is.exec(url);
      if (!m) return match;
      return `${m[1]!.replace(/^http/i, 'hxxp')}://${defangHost(m[2]!)}${m[3]}${trail}`;
    })
    // 2. Bare IPv4 addresses.
    .replace(/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])/g, defangHost)
    // 3. Bare domains, whatever follows them (markdown, punctuation, end).
    .replace(/(?<![a-z0-9@.[-])[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,8}\.[a-z]{2,24}(?![a-z0-9-])/gi, (host) => {
      if (OWN_HOST.test(host)) return host;
      const tld = host.slice(host.lastIndexOf('.') + 1);
      // File names aren't hosts.
      if (/^(js|ts|py|md|png|jpe?g|gif|webp|json|txt|exe|zip|pdf|mp[34]|csv|log)$/i.test(tld)) return host;
      return defangHost(host);
    });
}

/** True when text has something link-shaped in it (for a ⚠️ in previews). */
export function hasLink(text: string): boolean {
  return /\bhttps?:\/\/|\bwww\.|(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])|[a-z0-9-]\.[a-z]{2,24}(?![a-z0-9-])/i.test(text);
}
