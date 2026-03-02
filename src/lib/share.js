const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPod|Mobile/i;

export function isMobileShareDevice() {
  if (typeof navigator === 'undefined') return false;

  if (navigator.userAgentData?.mobile === true) {
    return true;
  }

  const userAgent = navigator.userAgent || '';
  if (/iPad/i.test(userAgent) || MOBILE_USER_AGENT_PATTERN.test(userAgent)) {
    return true;
  }

  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export async function copyTextToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the legacy textarea path below.
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard unavailable');
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();

  const copied = typeof document.execCommand === 'function'
    ? document.execCommand('copy')
    : false;

  document.body.removeChild(ta);

  if (!copied) {
    throw new Error('Clipboard unavailable');
  }
}

export async function shareOutfitLink({ url, title }) {
  if (
    isMobileShareDevice() &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') {
        return 'shared';
      }
    }
  }

  await copyTextToClipboard(url);
  return 'copied';
}
