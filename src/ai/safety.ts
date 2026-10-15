// Output safety for anything a model writes that Panda then posts.
//
// A model reads member-written text, and member text can be crafted to steer
// it. The worst a steered model should manage in chat is a wrong sentence —
// never a working link in Panda's own voice ("verify here: …"), never a ping.
// So every model-written string Panda posts goes through here: links are
// defanged (shown, not clickable), the way security write-ups quote them.

/** Domains Panda may name as working links — its own and Echoed's. */
const OWN_DOMAINS = /(^|\.)echoed\.gg$/i;

/**
 * Make links unclickable while keeping them readable:
 * "https://disc0rd-gift.store/claim" → "hxxps://disc0rd-gift[.]store/claim".
 * Echoed's own domains are left alone.
 */
export function defangLinks(text: string): string {
  return text
    // The scheme too — except on Echoed's own links, which stay clickable.
    .replace(/\bhttps?:\/\/([a-z0-9.-]+)/gi, (m, host: string) => (OWN_DOMAINS.test(host) ? m : m.replace(/^http/i, 'hxxp')))
    .replace(/\b((?:[a-z0-9-]+\.)+)([a-z]{2,24})\b(?=[/:?#\s)\]"'”’.,!]|$)/gi, (full, labels: string, tld: string) => {
      const host = `${labels}${tld}`;
      if (OWN_DOMAINS.test(host)) return full;
      // Version numbers, decimals and file names aren't hosts.
      if (/^\d+\.$/.test(labels) || /^(js|ts|py|md|png|jpg|gif|json|txt|exe|zip)$/i.test(tld)) return full;
      return `${labels.slice(0, -1).replace(/\./g, '[.]')}[.]${tld}`;
    });
}

/** True when text has something link-shaped in it (for a ⚠️ in previews). */
export function hasLink(text: string): boolean {
  return /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|gg|io|xyz|store|link|ru|cn|top|app|me|co|tk)\b/i.test(text);
}
