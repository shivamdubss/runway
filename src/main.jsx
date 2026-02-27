import React from 'react'
import ReactDOM from 'react-dom/client'
import './runway.css'
import { AuthProvider, useAuth } from './lib/auth'
import OutfitRecommendations from './outfit-recommendations'
import AuthScreen from './components/AuthScreen'
import SharedOutfitPage from './components/SharedOutfitPage'

const SHARE_PATTERN = /^\/s\/([a-zA-Z0-9_-]{12})$/

function ShareRouteGuard({ children }) {
  const match = window.location.pathname.match(SHARE_PATTERN)
  if (match) {
    return <SharedOutfitPage token={match[1]} />
  }
  return children
}

function App() {
  const { user, loading } = useAuth()

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
    )
  }

  if (!user) {
    return <AuthScreen />
  }

  return <OutfitRecommendations />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ShareRouteGuard>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ShareRouteGuard>
  </React.StrictMode>
)
