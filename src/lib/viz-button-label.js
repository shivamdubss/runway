export function getVizButtonLabel(vizStatus, hasReferencePhoto) {
  if (vizStatus === 'generating') return 'generating';
  if (vizStatus === 'queued') return 'Hang tight...';
  if (vizStatus === 'ready') return 'View your look';
  if (vizStatus === 'error') return 'Try again';
  if (hasReferencePhoto) return 'See this on you 😎';
  return 'Add a photo to try things on';
}
