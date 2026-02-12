export async function analyzeImage(imageUrl) {
  const res = await fetch('/api/analyze-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Analysis failed (${res.status})`);
  }

  return res.json();
}
