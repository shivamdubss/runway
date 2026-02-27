import { useState, useEffect } from 'react';

export default function SharedOutfitPage({ token }) {
  const [outfit, setOutfit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Outfit not found');
        return res.json();
      })
      .then(data => { setOutfit(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [token]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FAFAF8',
        fontFamily: "'Instrument Serif', serif",
        fontSize: 32,
        color: '#1A1A1A',
      }}>
        Runway
      </div>
    );
  }

  if (error || !outfit) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FAFAF8',
        fontFamily: "'DM Sans', sans-serif",
        padding: 24,
      }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <h1 style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 48,
            fontWeight: 400,
            color: '#1A1A1A',
            margin: '0 0 8px',
          }}>
            Runway
          </h1>
          <p style={{ fontSize: 15, color: '#888', margin: '0 0 32px', lineHeight: 1.5 }}>
            This outfit link is no longer available.
          </p>
          <a
            href="/"
            style={{
              display: 'block',
              width: '100%',
              padding: '14px 24px',
              background: '#1A1A1A',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              borderRadius: 14,
              textDecoration: 'none',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            Try Runway for free
          </a>
        </div>
      </div>
    );
  }

  const vizUrl = outfit.visualizationUrls?.front || null;

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#FAFAF8',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <a href="/" style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: 24,
          color: '#1A1A1A',
          textDecoration: 'none',
        }}>
          Runway
        </a>
        <a
          href="/"
          style={{
            padding: '8px 16px',
            background: '#1A1A1A',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            borderRadius: 10,
            textDecoration: 'none',
          }}
        >
          Sign up free
        </a>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: 480,
        margin: '0 auto',
        padding: '24px 20px 40px',
      }}>
        {/* Vibe title */}
        <h1 style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: 32,
          fontWeight: 400,
          color: '#1A1A1A',
          margin: '0 0 8px',
        }}>
          {outfit.vibe}
        </h1>

        {/* Reasoning */}
        {outfit.reasoning && (
          <p style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: '#777',
            margin: '0 0 24px',
          }}>
            {outfit.reasoning}
          </p>
        )}

        {/* Visualization preview */}
        {vizUrl && (
          <div style={{
            marginBottom: 24,
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(0,0,0,0.06)',
          }}>
            <img
              src={vizUrl}
              alt="Outfit visualization"
              style={{
                width: '100%',
                display: 'block',
              }}
            />
          </div>
        )}

        {/* Items grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          marginBottom: 32,
        }}>
          {outfit.items.map((item, i) => (
            <div key={item.id || i} style={{
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid rgba(0,0,0,0.06)',
              background: '#fff',
            }}>
              <div style={{
                aspectRatio: '3 / 4',
                background: '#F3F2F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 40 }}>{item.emoji}</span>
                )}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#b0b0b0',
                  marginBottom: 2,
                }}>
                  {item.label}
                </div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#1A1A1A',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {item.name}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <a
          href="/"
          style={{
            display: 'block',
            width: '100%',
            padding: '14px 24px',
            background: '#1A1A1A',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            borderRadius: 14,
            textDecoration: 'none',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          Get your own outfit recommendations
        </a>
        <p style={{
          textAlign: 'center',
          fontSize: 13,
          color: '#aaa',
          marginTop: 12,
        }}>
          Powered by Runway
        </p>
      </div>
    </div>
  );
}
