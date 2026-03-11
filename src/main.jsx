import React from 'react'
import ReactDOM from 'react-dom/client'
import { Agentation } from 'agentation'
import './runway.css'
import { AuthProvider, useAuth } from './lib/auth'
import OutfitRecommendations from './outfit-recommendations'
import AuthScreen from './components/AuthScreen'

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
    <AuthProvider>
      <App />
    </AuthProvider>
    {import.meta.env.DEV && <Agentation />}
  </React.StrictMode>
)
